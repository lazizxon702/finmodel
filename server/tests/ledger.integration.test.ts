/**
 * Pul harakati yadrosi (ledger) va DDS / Moliya routelari uchun INTEGRATSION test.
 *
 * DIQQAT: haqiqiy bazaga yozadi, shuning uchun FAQAT lokal bazada ishlaydi
 * (DATABASE_URL va DATABASE_URL_UNPOOLED — localhost). Aks holda butun to'plam o'tkazib yuboriladi (skip).
 * O'zidan keyin barcha sinov yozuvlarini o'chiradi va hisob qoldiqlari / Trust qoldig'i
 * boshlang'ich holatga qaytganini tekshiradi.
 */
import 'dotenv/config';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Autentifikatsiya o'rniga sinov sarlavhalari: x-test-role (rol) va x-test-user-id (foydalanuvchi ID).
// Maqsad — routelarning o'z mantiqi va rol cheklovlarini tekshirish (JWT / foydalanuvchi keshi boshqa joyda sinaladi).
vi.mock('../src/middleware/auth.middleware', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: "Avtorizatsiya talab qilinadi (Token yo'q)" });
    req.user = {
      id: String(req.headers['x-test-user-id'] || '00000000-0000-0000-0000-000000000000'),
      username: 'ledger_test',
      fullName: 'Ledger Test',
      role,
    };
    next();
  },
  requireRoles: (roles: string[]) => (req: any, res: any, next: any) =>
    req.user && roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: 'Ushbu amalni bajarish uchun huquqingiz yetarli emas' }),
}));

import { prisma } from '../src/lib/prisma';
import { CHECK_EXPENSE_CATEGORY, TRUST_INCOME_CATEGORY } from '../src/services/calculation.service';
import { LedgerError, createDds, deleteDds, getAccountBalances, getTrustLedger } from '../src/services/ledger.service';
import ddsRoutes from '../src/routes/dds.routes';
import financesRoutes from '../src/routes/finances.routes';
import finmodelRoutes from '../src/routes/finmodel.routes';

function isLocalDatabase(): boolean {
  const urls = [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].filter((u): u is string => !!u && !!u.trim());
  if (!urls.length) return false;
  return urls.every((u) => {
    try {
      return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(u).hostname);
    } catch {
      return false;
    }
  });
}

const LOCAL = isLocalDatabase();
const MARK = `__ledger_test__ ${Date.now()}`;
const TEST_CATEGORY = '__ledger_test__ kategoriya';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

describe.skipIf(!LOCAL)('Ledger integratsiyasi (faqat lokal baza)', () => {
  let before: { balances: Record<string, number>; trust: { totalDebt: number; totalPaid: number; balance: number }; count: number };
  let authorId: string | null = null;
  let server: http.Server;
  let baseUrl = '';

  const snapshot = async () => ({
    balances: (await getAccountBalances()) as Record<string, number>,
    trust: (await getTrustLedger()).overall,
    count: await prisma.ddsTransaction.count(),
  });

  const expectBackToStart = async () => {
    const now = await snapshot();
    for (const key of ['CASH', 'BANK_CARD', 'SETTLEMENT_ACCOUNT', 'total']) {
      expect(now.balances[key], `hisob qoldig'i: ${key}`).toBeCloseTo(before.balances[key], 2);
    }
    expect(now.trust.totalDebt).toBeCloseTo(before.trust.totalDebt, 2);
    expect(now.trust.totalPaid).toBeCloseTo(before.trust.totalPaid, 2);
    expect(now.trust.balance).toBeCloseTo(before.trust.balance, 2);
    expect(now.count).toBe(before.count);
  };

  /** Shu test yaratgan (belgi qo'yilgan) va hali o'chirilmagan yozuvlarni ledger orqali o'chiradi */
  const removeLeftovers = async () => {
    const left = await prisma.ddsTransaction.findMany({
      where: { OR: [{ description: { startsWith: MARK } }, { categoryName: TEST_CATEGORY }] },
      select: { id: true },
    });
    for (const row of left) await deleteDds(row.id);
    return left.length;
  };

  const api = async (method: string, path: string, role: string | null, body?: unknown) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (role) headers['x-test-role'] = role;
    if (authorId) headers['x-test-user-id'] = authorId;
    const res = await fetch(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json: any = await res.json().catch(() => null);
    return { status: res.status, body: json };
  };

  /** DDS sahifasidagi forma yuboradigan payload */
  const formPayload = (over: Record<string, unknown> = {}) => ({
    dateTime: '2026-01-15T12:00:00+05:00',
    type: 'EXPENSE',
    account: 'CASH',
    expenseType: 'COGS',
    categoryName: TEST_CATEGORY,
    sourcePerson: 'Hasan',
    amount: 150000,
    description: `${MARK} forma`,
    ...over,
  });

  beforeAll(async () => {
    await removeLeftovers();
    before = await snapshot();
    const author = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true } });
    authorId = author?.id || null;

    const app = express();
    app.use(express.json());
    app.use('/api/dds', ddsRoutes);
    app.use('/api/finances', financesRoutes);
    app.use('/api/finmodel', finmodelRoutes);
    server = app.listen(0, '127.0.0.1'); // tasodifiy bo'sh port (5000 / 5173 band qilinmaydi)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    try {
      await removeLeftovers();
      await expectBackToStart();
    } finally {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      await prisma.$disconnect();
    }
  });

  describe('ledger servis', () => {
    const ids: string[] = [];

    it("chiqim → hisob qoldig'i shu summaga kamayadi", async () => {
      const tx = await createDds({
        type: 'EXPENSE',
        account: 'CASH',
        expenseType: 'OPEX',
        categoryName: TEST_CATEGORY,
        amount: 123_456,
        description: `${MARK} chiqim`,
      });
      ids.push(tx.id);
      const b = (await getAccountBalances()) as Record<string, number>;
      expect(tx.txNumber).toMatch(/^TX-\d+$/);
      expect(tx.source).toBe('MANUAL');
      expect(b.CASH).toBeCloseTo(before.balances.CASH - 123_456, 2);
      expect(b.BANK_CARD).toBeCloseTo(before.balances.BANK_CARD, 2);
      expect(b.total).toBeCloseTo(before.balances.total - 123_456, 2);
    });

    it("kirim → hisob qoldig'i shu summaga ko'payadi", async () => {
      const tx = await createDds({
        type: 'INCOME',
        account: 'BANK_CARD',
        categoryName: TEST_CATEGORY,
        amount: 200_000,
        description: `${MARK} kirim`,
      });
      ids.push(tx.id);
      const b = (await getAccountBalances()) as Record<string, number>;
      expect(tx.expenseType).toBe('INCOME_TRANSFER');
      expect(b.BANK_CARD).toBeCloseTo(before.balances.BANK_CARD + 200_000, 2);
      expect(b.CASH).toBeCloseTo(before.balances.CASH - 123_456, 2);
    });

    it(`"${TRUST_INCOME_CATEGORY}" kirimi → Trust qoldig'i shu summaga kamayadi`, async () => {
      const tx = await createDds({
        type: 'INCOME',
        account: 'CASH',
        categoryName: TRUST_INCOME_CATEGORY,
        amount: 300_000,
        description: `${MARK} trust`,
      });
      ids.push(tx.id);
      expect(tx.source).toBe('TRUST_PAYMENT');

      const trust = (await getTrustLedger()).overall;
      expect(trust.balance).toBeCloseTo(before.trust.balance - 300_000, 2);
      expect(trust.totalPaid).toBeCloseTo(before.trust.totalPaid + 300_000, 2);
      expect(trust.totalDebt).toBeCloseTo(before.trust.totalDebt, 2);

      const entry = await prisma.trustLedgerEntry.findUnique({ where: { ddsTransactionId: tx.id } });
      expect(entry?.type).toBe('PAYMENT');
      expect(Number(entry?.amount)).toBe(300_000);

      const b = (await getAccountBalances()) as Record<string, number>;
      expect(b.CASH).toBeCloseTo(before.balances.CASH - 123_456 + 300_000, 2);
    });

    it("o'chirish → qoldiqlar va Trust qarzi boshlang'ich holatga qaytadi", async () => {
      const trustTxId = ids[2];
      for (const id of ids.splice(0)) await deleteDds(id);
      expect(await prisma.trustLedgerEntry.findUnique({ where: { ddsTransactionId: trustTxId } })).toBeNull();
      await expectBackToStart();
    });

    it("noto'g'ri ma'lumot → LedgerError (400), bazaga hech narsa yozilmaydi", async () => {
      const base = { type: 'EXPENSE', account: 'CASH', categoryName: TEST_CATEGORY, amount: 1000, description: `${MARK} xato` };
      const bad: Record<string, unknown>[] = [
        { amount: 0 },
        { amount: -5000 },
        { amount: 'abc' },
        { account: 'WALLET' },
        { type: 'RASXOD' },
        { categoryName: '   ' },
        { dateTime: 'bugun' },
      ];
      for (const over of bad) {
        const err = await createDds({ ...base, ...over } as any).catch((e) => e);
        expect(err, JSON.stringify(over)).toBeInstanceOf(LedgerError);
        expect((err as LedgerError).status).toBe(400);
      }
      const missing = await deleteDds('00000000-0000-0000-0000-000000000000').catch((e) => e);
      expect(missing).toBeInstanceOf(LedgerError);
      expect((missing as LedgerError).status).toBe(404);
      await expectBackToStart();
    });

    it("bir vaqtda kelgan so'rovlar → TX raqamlari takrorlanmaydi, qoldiq aniq", async () => {
      const amounts = [1001, 1002, 1003, 1004, 1005, 1006];
      const created = await Promise.all(
        amounts.map((amount) =>
          createDds({ type: 'EXPENSE', account: 'CASH', categoryName: TEST_CATEGORY, amount, description: `${MARK} parallel` })
        )
      );
      expect(new Set(created.map((c) => c.txNumber)).size).toBe(amounts.length);
      const b = (await getAccountBalances()) as Record<string, number>;
      expect(b.CASH).toBeCloseTo(before.balances.CASH - amounts.reduce((s, a) => s + a, 0), 2);
      await Promise.all(created.map((c) => deleteDds(c.id)));
      await expectBackToStart();
    });
  });

  describe('DDS routelari', () => {
    it("forma payloadi bilan xarajat → 201, CASH aynan shu summaga kamayadi; o'chirilganda qaytadi", async () => {
      if (!authorId) return;
      const created = await api('POST', '/api/dds', 'CASHIER', formPayload());
      expect(created.status).toBe(201);
      expect(created.body.amount).toBe(150000);
      expect(created.body.type).toBe('EXPENSE');
      expect(created.body.source).toBe('MANUAL');
      expect(created.body.dateTimeLabel).toBe('15.01.2026 12:00');
      expect(created.body.balances.CASH).toBeCloseTo(before.balances.CASH - 150000, 2);

      const list = await api('GET', `/api/dds?search=${encodeURIComponent(MARK)}`, 'CFO');
      expect(list.status).toBe(200);
      const row = list.body.transactions.find((t: any) => t.id === created.body.id);
      expect(row).toMatchObject({ dateTimeLabel: '15.01.2026 12:00', source: 'MANUAL', deal: null, amount: 150000 });

      // Sana filtri — Toshkent kuni bo'yicha
      const sameDay = await api('GET', `/api/dds?startDate=2026-01-15&endDate=2026-01-15&search=${encodeURIComponent(MARK)}`, 'CFO');
      expect(sameDay.body.transactions.some((t: any) => t.id === created.body.id)).toBe(true);
      const nextDay = await api('GET', `/api/dds?startDate=2026-01-16&endDate=2026-01-16&search=${encodeURIComponent(MARK)}`, 'CFO');
      expect(nextDay.body.transactions.some((t: any) => t.id === created.body.id)).toBe(false);

      // Kassir o'chira olmaydi, menejer o'chira oladi
      expect((await api('DELETE', `/api/dds/${created.body.id}`, 'CASHIER')).status).toBe(403);
      const removed = await api('DELETE', `/api/dds/${created.body.id}`, 'MANAGER');
      expect(removed.status).toBe(200);
      expect(removed.body.balances.CASH).toBeCloseTo(before.balances.CASH, 2);
      expect((await api('DELETE', `/api/dds/${created.body.id}`, 'MANAGER')).status).toBe(404);
      await expectBackToStart();
    });

    it('"1 200 000" va "1,200,000" ko\'rinishidagi summalar to\'g\'ri o\'qiladi', async () => {
      if (!authorId) return;
      for (const amount of ['1 200 000', '1,200,000']) {
        const created = await api('POST', '/api/dds', 'ADMIN', formPayload({ amount }));
        expect(created.status, amount).toBe(201);
        expect(created.body.amount).toBe(1_200_000);
        expect(created.body.balances.CASH).toBeCloseTo(before.balances.CASH - 1_200_000, 2);
        expect((await api('DELETE', `/api/dds/${created.body.id}`, 'ADMIN')).status).toBe(200);
      }
      await expectBackToStart();
    });

    it("noto'g'ri so'rov → 400 va tushunarli matn (500 emas), hech narsa yozilmaydi", async () => {
      if (!authorId) return;
      const bad: Record<string, unknown>[] = [
        { amount: 'abc' },
        { amount: '' },
        { amount: 0 },
        { amount: -5000 },
        { amount: 1e30 },
        { expenseType: 'XARAJAT' },
        { account: 'WALLET' },
        { type: 'RASXOD' },
        { categoryName: '   ' },
        { categoryName: 12345 },
        { dateTime: 'bugun' },
        { type: 'EXPENSE', categoryName: TRUST_INCOME_CATEGORY },
      ];
      for (const over of bad) {
        const r = await api('POST', '/api/dds', 'ADMIN', formPayload(over));
        expect(r.status, JSON.stringify(over)).toBe(400);
        expect(typeof r.body.error).toBe('string');
        expect(r.body.error).not.toMatch(/prisma|invocation/i);
      }
      await expectBackToStart();
    });

    it('rollar: OPERATOR / AGENT — 403, tokensiz — 401', async () => {
      for (const role of ['OPERATOR', 'AGENT']) {
        expect((await api('GET', '/api/dds', role)).status, role).toBe(403);
        expect((await api('GET', '/api/dds/summary', role)).status, role).toBe(403);
        expect((await api('GET', '/api/dds/categories', role)).status, role).toBe(403);
        expect((await api('POST', '/api/dds', role, formPayload())).status, role).toBe(403);
        expect((await api('DELETE', '/api/dds/00000000-0000-0000-0000-000000000000', role)).status, role).toBe(403);
      }
      expect((await api('POST', '/api/dds', 'VIEWER', formPayload())).status).toBe(403);
      expect((await api('GET', '/api/dds', null)).status).toBe(401);
      await expectBackToStart();
    });

    it(`"${TRUST_INCOME_CATEGORY}" kirimi forma orqali → Trust qarzi kamayadi, o'chirilganda qaytadi`, async () => {
      if (!authorId) return;
      const created = await api(
        'POST',
        '/api/dds',
        'CFO',
        formPayload({ type: 'INCOME', categoryName: TRUST_INCOME_CATEGORY, amount: 500000, sourcePerson: 'Trust' })
      );
      expect(created.status).toBe(201);
      expect(created.body.source).toBe('TRUST_PAYMENT');
      expect(created.body.expenseType).toBe('INCOME_TRANSFER');
      expect(created.body.trust.balance).toBeCloseTo(before.trust.balance - 500000, 2);
      expect(created.body.balances.CASH).toBeCloseTo(before.balances.CASH + 500000, 2);

      expect((await api('DELETE', `/api/dds/${created.body.id}`, 'CFO')).status).toBe(200);
      await expectBackToStart();
    });

    it("kategoriyalar: tizim kategoriyalari doim bor; summary qoldiqlari AccountBalance bilan bir xil", async () => {
      const cats = await api('GET', '/api/dds/categories', 'CASHIER');
      expect(cats.status).toBe(200);
      expect(cats.body).toContain(TRUST_INCOME_CATEGORY);
      expect(cats.body).toContain(CHECK_EXPENSE_CATEGORY);

      const detailed = await api('GET', '/api/dds/categories?detailed=true', 'CASHIER');
      expect(detailed.body.find((c: any) => c.name === TRUST_INCOME_CATEGORY)).toMatchObject({ type: 'INCOME', system: true });
      expect(detailed.body.find((c: any) => c.name === CHECK_EXPENSE_CATEGORY)).toMatchObject({ type: 'EXPENSE', system: true });

      const summary = await api('GET', '/api/dds/summary', 'CASHIER');
      expect(summary.status).toBe(200);
      expect(summary.body.balances.CASH).toBeCloseTo(before.balances.CASH, 2);
      expect(summary.body.cashBalance).toBe(summary.body.balances.CASH);
      expect(summary.body.cardBalance).toBe(summary.body.balances.BANK_CARD);
      expect(summary.body.settlementBalance).toBe(summary.body.balances.SETTLEMENT_ACCOUNT);
      expect(summary.body.totalLiquidity).toBe(summary.body.balances.total);
      // Saqlangan qoldiq barcha DDS yozuvlari yig'indisiga teng bo'lishi kerak
      expect(summary.body.balancesInSync, JSON.stringify(summary.body.balanceDrift)).toBe(true);
    });
  });

  describe('Moliya hisobotlari', () => {
    it('OPERATOR / AGENT → 403', async () => {
      for (const role of ['OPERATOR', 'AGENT']) {
        expect((await api('GET', '/api/finances/summary', role)).status, role).toBe(403);
        expect((await api('GET', '/api/finmodel', role)).status, role).toBe(403);
      }
    });

    it("P&L: bitimlar bo'yicha foyda = tasdiqlangan bitimlar Σ profit; qatorlar arifmetik yopiladi", async () => {
      const r = await api('GET', '/api/finances/summary', 'CFO');
      expect(r.status).toBe(200);
      const { pnl, cashFlow, balanceSheet, balances, cards } = r.body;

      const agg = await prisma.deal.aggregate({
        where: { approvalStatus: 'APPROVED' },
        _sum: { profit: true, trustDebtAmount: true },
      });
      const dbProfit = Number(agg._sum.profit) || 0;

      // Bitimlar sahifasidagi "Sof foyda" bilan bir xil
      expect(pnl.dealsProfit).toBeCloseTo(dbProfit, 2);
      expect(pnl.reconciliation.dealsNetProfit).toBeCloseTo(dbProfit, 2);
      // Trust daromadi — hisoblash usuli: Σ trustDebtAmount
      expect(pnl.trustIncome).toBeCloseTo(Number(agg._sum.trustDebtAmount) || 0, 2);
      // Tarkib + tuzatish = bitimlar bo'yicha foyda; farq yashirilmaydi
      expect(pnl.reconciliation.pnlDealsProfit).toBeCloseTo(pnl.tradeMargin + pnl.partnerBonus + pnl.trustIncome, 2);
      expect(pnl.dealsProfitComponents + pnl.dealsProfitAdjustment).toBeCloseTo(pnl.dealsProfit, 2);
      expect(pnl.reconciliation.difference).toBeCloseTo(pnl.dealsProfit - pnl.reconciliation.pnlDealsProfit, 2);
      expect(pnl.reconciliation.isReconciled).toBe(Math.abs(pnl.reconciliation.difference) < 1);
      // Sof foyda = bitimlar bo'yicha foyda − operatsion xarajatlar
      expect(pnl.netProfit).toBeCloseTo(pnl.dealsProfit - pnl.totalOpex, 2);
      expect(
        pnl.agentPayouts + pnl.logisticsExpenses + pnl.officeAndAdmin + pnl.payrollExpenses + pnl.marketingExpenses + pnl.otherOpex
      ).toBeCloseTo(pnl.totalOpex, 2);

      // Pul qoldig'i — AccountBalance dan
      expect(balances.total).toBeCloseTo(before.balances.total, 2);
      expect(cashFlow.endingCash).toBeCloseTo(balances.total, 2);
      expect(cards.liquidCash).toBeCloseTo(balances.total, 2);
      expect(balanceSheet.assets.cash).toBeCloseTo(balances.total, 2);
      expect(cashFlow.beginningCash + cashFlow.totalInflows - cashFlow.totalOutflows).toBeCloseTo(cashFlow.endingCash, 2);

      // Balans majburan tenglashtirilmaydi: isBalanced — haqiqiy farq bo'yicha
      const a = balanceSheet.assets;
      const l = balanceSheet.liabilities;
      expect(a.totalAssets).toBeCloseTo(a.cash + a.inventory + a.receivables + a.fixedAssets, 2);
      expect(l.totalLiabilitiesAndEquity).toBeCloseTo(l.payables + l.longTermLoan + l.charterCapital + l.retainedEarnings, 2);
      expect(balanceSheet.difference).toBe(Math.round(a.totalAssets - l.totalLiabilitiesAndEquity));
      expect(balanceSheet.isBalanced).toBe(Math.abs(balanceSheet.difference) < 1);
      expect(balanceSheet.balanceCheck.isBalanced).toBe(balanceSheet.isBalanced);
    });

    it("davr filtri (startDate/endDate): bo'sh davrda bitim foydasi va xarajat 0, pul qoldig'i o'zgarmaydi", async () => {
      const r = await api('GET', '/api/finances/summary?startDate=2001-01-01&endDate=2001-01-31', 'ADMIN');
      expect(r.status).toBe(200);
      expect(r.body.period).toEqual({ startDate: '2001-01-01', endDate: '2001-01-31' });
      expect(r.body.pnl.dealsProfit).toBe(0);
      expect(r.body.pnl.totalOpex).toBe(0);
      expect(r.body.pnl.trustIncome).toBe(0);
      expect(r.body.pnl.reconciliation.difference).toBe(0);
      expect(r.body.cashFlow.totalInflows).toBe(0);
      expect(r.body.cards.liquidCash).toBeCloseTo(before.balances.total, 2);
    });

    it('finmodel: Trust daromadi alohida maydon, haqiqiy oylik ko\'rsatkichlar faqat tasdiqlangan bitimlardan', async () => {
      const r = await api('GET', '/api/finmodel', 'CFO');
      expect(r.status).toBe(200);
      expect(r.body.months).toHaveLength(12);
      expect(r.body.months[0]).toHaveProperty('trustIncome');
      expect(r.body.months[0].yearMonth).toBe('2026-11');

      const agg = await prisma.deal.aggregate({
        where: { approvalStatus: 'APPROVED' },
        _sum: { trustDebtAmount: true, profit: true },
        _count: true,
      });
      expect(r.body.trustIncome.accrued).toBeCloseTo(Number(agg._sum.trustDebtAmount) || 0, 2);
      expect(r.body.actuals.totals.dealsCount).toBe(agg._count);
      expect(r.body.actuals.totals.dealsProfit).toBeCloseTo(Number(agg._sum.profit) || 0, 2);
      expect(r.body.trustIncome.outstanding).toBeCloseTo(before.trust.balance, 2);
    });
  });
});
