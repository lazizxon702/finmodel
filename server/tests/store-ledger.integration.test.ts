/**
 * Do'konlar bilan hisob-kitob (do'kon daftari) va do'konlar hisoboti — INTEGRATSION test.
 *
 * DIQQAT: haqiqiy bazaga yozadi, shuning uchun FAQAT lokal bazada ishlaydi
 * (DATABASE_URL va DATABASE_URL_UNPOOLED — localhost). Aks holda butun to'plam o'tkazib yuboriladi (skip).
 * Sinov bitimlari haqiqiy ma'lumot bilan kesishmaydigan kunlarda yaratiladi:
 *   DAY     (2033-05-06) — daftar boshlangan kundan KEYIN (qarz yoziladi);
 *   OLD_DAY (2001-06-07) — daftar boshlanishidan OLDIN (qarz yozilmaydi).
 * Oxirida DDS yozuvlari ledger.deleteDds orqali o'chiriladi; hisob qoldiqlari, DDS soni, do'kon va Trust daftarlari
 * boshlang'ich holatga qaytgani tekshiriladi.
 */
import 'dotenv/config';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Autentifikatsiya o'rniga sinov sarlavhalari: x-test-role (rol) va x-test-user-id (foydalanuvchi ID)
vi.mock('../src/middleware/auth.middleware', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: "Avtorizatsiya talab qilinadi (Token yo'q)" });
    req.user = {
      id: String(req.headers['x-test-user-id'] || '00000000-0000-0000-0000-000000000000'),
      username: 'store_ledger_test',
      fullName: 'Store Ledger Test',
      role,
    };
    next();
  },
  requireRoles: (roles: string[]) => (req: any, res: any, next: any) =>
    req.user && roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: 'Ushbu amalni bajarish uchun huquqingiz yetarli emas' }),
}));
// Tashqi ta'sirlar o'chirilgan: Google Sheets'ga yozish va Telegram/push bildirishnomalari
vi.mock('../src/services/sheetsSync.service', () => ({
  pushDealToGoogleSheets: vi.fn(async () => ({ success: false, reason: 'test' })),
}));
vi.mock('../src/services/notification.service', () => ({
  notifyDealDecision: vi.fn(async () => undefined),
}));

import { prisma } from '../src/lib/prisma';
import {
  QODIR_PAYMENT_CATEGORY,
  STORE_INCOME_CATEGORY,
  STORE_LEDGER_START_YMD,
} from '../src/services/calculation.service';
import { createDds, deleteDds, getAccountBalances, getStoreLedger, syncStoreDebtForDeal } from '../src/services/ledger.service';
import ddsRoutes from '../src/routes/dds.routes';
import dealsRoutes from '../src/routes/deals.routes';
import financesRoutes from '../src/routes/finances.routes';
import storeReportsRoutes from '../src/routes/storeReports.routes';

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
const TAG = `zz_stl_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const DAY = '2033-05-06';
const OLD_DAY = '2001-06-07';
const DEAL_DATE = new Date(`${DAY}T10:15:00+05:00`);
const OLD_DATE = new Date(`${OLD_DAY}T10:15:00+05:00`);
const NUM_BASE = 1_800_000_000 + Math.floor(Math.random() * 100_000) * 10;
const PERIOD = `startDate=${DAY}&endDate=${DAY}`;
// Qodir aka bitimi (d2): chek 2 000 000 + agent ulushi 1 900 000 + bizning 6% foyda 300 000 (standart qoidalar bo'yicha)
const DEBT_QODIR_D2 = 4_200_000;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe.skipIf(!LOCAL)("Do'kon daftari va do'konlar hisoboti (faqat lokal baza)", () => {
  let server: http.Server;
  let baseUrl = '';
  let adminId = '';
  let balancesBefore: Record<string, number>;
  let counts: { dds: number; storeEntries: number; trustEntries: number };
  let listBefore: any;
  let qodirOverallBefore: { debt: number; paid: number; balance: number };

  const created = { stores: [] as string[], providers: [] as string[] };
  let s1: { id: string; name: string };
  let s2: { id: string; name: string };
  let qodirStore: { id: string; name: string };
  let trustStore: { id: string; name: string };
  let providerId = '';

  let d1: { id: string; dealNumber: number }; // oddiy do'kon, tasdiqlanadi
  let d2: { id: string; dealNumber: number }; // Qodir aka
  let d3: { id: string; dealNumber: number }; // rad etiladi
  let d4: { id: string; dealNumber: number }; // daftar boshlanishidan oldingi sana
  let d5: { id: string; dealNumber: number }; // Trust do'koni
  let storeIncomeTxId = '';

  const api = async (method: string, path: string, role: string | null, body?: unknown) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (role) headers['x-test-role'] = role;
    if (adminId) headers['x-test-user-id'] = adminId;
    const res = await fetch(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json: any = await res.json().catch(() => null);
    return { status: res.status, body: json };
  };

  const ensureStore = async (name: string) => {
    const found = await prisma.store.findUnique({ where: { name } });
    if (found) return found;
    const c = await prisma.store.create({ data: { name } });
    created.stores.push(c.id);
    return c;
  };

  const mkDeal = async (
    offset: number,
    storeId: string,
    calculatedAmount: number,
    over: { date?: Date; profit?: number; approvalStatus?: 'APPROVED' | 'PENDING_APPROVAL' } = {}
  ) => {
    const d = await prisma.deal.create({
      data: {
        dealNumber: NUM_BASE + offset,
        date: over.date || DEAL_DATE,
        createdById: adminId,
        sellerName: `${TAG}_sotuvchi`,
        providerId,
        storeId,
        customerName: `${TAG}_mijoz_${offset}`,
        withdrawnLimit: 5_000_000,
        calculatedAmount,
        profit: over.profit ?? 0,
        approvalStatus: over.approvalStatus || 'PENDING_APPROVAL',
      },
    });
    return { id: d.id, dealNumber: d.dealNumber };
  };

  const debtEntry = (dealId: string) => prisma.storeLedgerEntry.findUnique({ where: { dealId } });
  const myDealIds = async () =>
    (await prisma.deal.findMany({ where: { createdById: adminId }, select: { id: true } })).map((d) => d.id);

  beforeAll(async () => {
    for (const day of [DAY, OLD_DAY]) {
      const stale = await prisma.deal.count({
        where: { date: { gte: new Date(`${day}T00:00:00+05:00`), lte: new Date(`${day}T23:59:59.999+05:00`) } },
      });
      if (stale > 0) throw new Error(`${day} sanasida ${stale} ta bitim bor — sinov kuni bo'sh bo'lishi kerak`);
    }

    balancesBefore = (await getAccountBalances()) as Record<string, number>;
    counts = {
      dds: await prisma.ddsTransaction.count(),
      storeEntries: await prisma.storeLedgerEntry.count(),
      trustEntries: await prisma.trustLedgerEntry.count(),
    };

    const admin = await prisma.user.create({
      data: { username: `${TAG}_admin`, fullName: "Test do'kon admin", passwordHash: 'x', role: 'ADMIN' },
    });
    adminId = admin.id;

    s1 = await ensureStore(`${TAG}_store_1`);
    s2 = await ensureStore(`${TAG}_store_2`);
    qodirStore = await ensureStore('Qodir aka');
    trustStore = await ensureStore('Trust');
    const provider = await prisma.provider.create({ data: { name: `${TAG}_provider` } });
    created.providers.push(provider.id);
    providerId = provider.id;

    const app = express();
    app.use(express.json());
    app.use('/api/dds', ddsRoutes);
    app.use('/api/deals', dealsRoutes);
    app.use('/api/finances', financesRoutes);
    app.use('/api/store-reports', storeReportsRoutes);
    server = app.listen(0, '127.0.0.1'); // tasodifiy bo'sh port
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    listBefore = (await api('GET', '/api/store-reports', 'ADMIN')).body;
    qodirOverallBefore = (await api('GET', '/api/store-reports/qodir', 'ADMIN')).body.ledger.overall;
  });

  afterAll(async () => {
    try {
      const dealIds = adminId ? await myDealIds() : [];
      // DDS yozuvlari yadro orqali o'chiriladi — hisob qoldiqlari va do'kon daftaridagi to'lovlar ham orqaga qaytadi
      const txs = await prisma.ddsTransaction.findMany({
        where: { OR: [{ dealId: { in: dealIds } }, ...(adminId ? [{ createdById: adminId }] : [])] },
        select: { id: true },
      });
      for (const t of txs) await deleteDds(t.id);
      // Bitim o'chsa do'kon daftaridagi DEBT (va Trust daftaridagi qarz) kaskad bilan o'chadi
      await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
      if (adminId) {
        await prisma.auditLog.deleteMany({ where: { OR: [{ userId: adminId }, { entityId: { in: dealIds } }] } });
        await prisma.user.deleteMany({ where: { id: adminId } });
      }
      await prisma.store.deleteMany({ where: { id: { in: created.stores } } });
      await prisma.provider.deleteMany({ where: { id: { in: created.providers } } });

      if (balancesBefore) {
        const now = (await getAccountBalances()) as Record<string, number>;
        for (const key of ['CASH', 'BANK_CARD', 'SETTLEMENT_ACCOUNT', 'total']) {
          expect(now[key], `hisob qoldig'i: ${key}`).toBeCloseTo(balancesBefore[key], 2);
        }
        expect(await prisma.ddsTransaction.count()).toBe(counts.dds);
        expect(await prisma.storeLedgerEntry.count()).toBe(counts.storeEntries);
        expect(await prisma.trustLedgerEntry.count()).toBe(counts.trustEntries);
      }
    } finally {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      await prisma.$disconnect();
    }
  });

  describe('bitim → qarz yozuvi (DEBT)', () => {
    it("oddiy do'kon: tasdiqlanmaguncha yozuv yo'q; tasdiqlanganda DEBT = mijozga berilgan summa", async () => {
      d1 = await mkDeal(1, s1.id, 3_500_000, { profit: 400_000 });
      expect(await debtEntry(d1.id)).toBeNull();

      const r = await api('POST', `/api/deals/${d1.id}/approve`, 'ADMIN', {});
      expect(r.status).toBe(200);

      const e = await debtEntry(d1.id);
      expect(e).toMatchObject({ storeId: s1.id, type: 'DEBT', ddsTransactionId: null });
      expect(Number(e!.amount)).toBe(3_500_000);
      expect(e!.dateTime.getTime()).toBe(DEAL_DATE.getTime());
      expect(e!.note).toContain(`Bitim #${d1.dealNumber}`);

      // Chek xarajati avvalgidek DDS chiqimi bo'ladi (kassa kamayadi)
      expect(r.body.balances.CASH).toBeCloseTo(balancesBefore.CASH - 3_500_000, 2);
    });

    it('Qodir aka: tasdiqlanganda DEBT yoziladi (U bizga qarzdor: chek + agent ulushi + 6% foyda), chek DDS chiqimiga tushmaydi', async () => {
      d2 = await mkDeal(2, qodirStore.id, 2_000_000, { profit: 250_000 });
      const r = await api('POST', `/api/deals/${d2.id}/approve`, 'ADMIN', {});
      expect(r.status).toBe(200);

      // Hisob (standart qoida: Qodir aka 22%, bizniki 6%; bitim: yechilgan 5 000 000, berilgan 2 000 000, diskont 60%):
      //   chek 2 000 000 + agent 5 000 000 × (60% − 22%) = 1 900 000 + foyda 5 000 000 × (22% − 16%) = 300 000 → 4 200 000
      // (Spravochnikda Qodir aka uchun maxsus qoida bo'lsa — lokal bazaga bog'liq — natija boshqacha bo'lishi mumkin)
      const e = await debtEntry(d2.id);
      expect(e).toMatchObject({ storeId: qodirStore.id, type: 'DEBT' });
      expect(Number(e!.amount)).toBe(DEBT_QODIR_D2);
      expect(e!.note).toContain('agent ulushi');
      expect(await prisma.ddsTransaction.count({ where: { dealId: d2.id } })).toBe(0);
      expect(r.body.balances.CASH).toBeCloseTo(balancesBefore.CASH - 3_500_000, 2);
    });

    it("rad etilgan bitimga yozuv yo'q; tasdiq bekor bo'lsa yozuv o'chadi, qayta tasdiqlansa tiklanadi", async () => {
      d3 = await mkDeal(3, s1.id, 1_250_000);
      const r = await api('POST', `/api/deals/${d3.id}/reject`, 'ADMIN', { reason: 'test' });
      expect(r.status).toBe(200);
      expect(await debtEntry(d3.id)).toBeNull();

      // Tasdiq bekor qilindi (masalan bitim qayta ko'rib chiqishga qaytdi) → qarz yozuvi o'chadi
      await prisma.$transaction(async (tx) => {
        await tx.deal.update({ where: { id: d1.id }, data: { approvalStatus: 'PENDING_APPROVAL' } });
        expect(await syncStoreDebtForDeal(tx, d1.id)).toBe(0);
      });
      expect(await debtEntry(d1.id)).toBeNull();

      await prisma.$transaction(async (tx) => {
        await tx.deal.update({ where: { id: d1.id }, data: { approvalStatus: 'APPROVED' } });
        expect(await syncStoreDebtForDeal(tx, d1.id)).toBe(3_500_000);
      });
      expect(Number((await debtEntry(d1.id))!.amount)).toBe(3_500_000);
    });

    it("bitimning do'koni yoki summasi o'zgarsa — yozuv yangi do'konga ko'chadi / summasi yangilanadi (dublikat yo'q)", async () => {
      await prisma.$transaction(async (tx) => {
        await tx.deal.update({ where: { id: d1.id }, data: { storeId: s2.id, calculatedAmount: 3_000_000 } });
        await syncStoreDebtForDeal(tx, d1.id);
      });
      let e = await debtEntry(d1.id);
      expect(e!.storeId).toBe(s2.id);
      expect(Number(e!.amount)).toBe(3_000_000);
      expect(await prisma.storeLedgerEntry.count({ where: { storeId: s1.id } })).toBe(0);

      await prisma.$transaction(async (tx) => {
        await tx.deal.update({ where: { id: d1.id }, data: { storeId: s1.id, calculatedAmount: 3_500_000 } });
        await syncStoreDebtForDeal(tx, d1.id);
      });
      e = await debtEntry(d1.id);
      expect(e!.storeId).toBe(s1.id);
      expect(Number(e!.amount)).toBe(3_500_000);
      expect(await prisma.storeLedgerEntry.count({ where: { storeId: s2.id } })).toBe(0);
    });

    it(`daftar boshlanishidan (${STORE_LEDGER_START_YMD}) oldingi bitim va Trust do'koni bitimi — yozuv yo'q`, async () => {
      d4 = await mkDeal(4, s1.id, 900_000, { date: OLD_DATE, profit: 70_000 });
      expect((await api('POST', `/api/deals/${d4.id}/approve`, 'ADMIN', {})).status).toBe(200);
      expect(await debtEntry(d4.id)).toBeNull();

      d5 = await mkDeal(5, trustStore.id, 1_000_000, { profit: 800_000 });
      expect((await api('POST', `/api/deals/${d5.id}/approve`, 'ADMIN', {})).status).toBe(200);
      expect(await debtEntry(d5.id)).toBeNull();
      // Trust bitimi o'z (Trust) daftariga yoziladi — ikki marta hisoblanmaydi
      expect(await prisma.trustLedgerEntry.count({ where: { dealId: d5.id } })).toBe(1);
      expect(await prisma.storeLedgerEntry.count({ where: { storeId: trustStore.id, dealId: d5.id } })).toBe(0);
    });

    it('ADMIN yaratgan (darhol tasdiqlangan) bitim: POST /api/deals qarz yozuvini ham yaratadi', async () => {
      const r = await api('POST', '/api/deals', 'ADMIN', {
        date: `${DAY}T12:00:00+05:00`,
        storeId: s2.id,
        providerId,
        customerName: `${TAG}_mijoz_post`,
        customerPhone1: '+998900000001',
        customerLimit: 10_000_000,
        withdrawnLimit: 5_000_000,
        calculatedAmount: 1_200_000,
        productName: 'Test telefon',
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.approvalStatus).toBe('APPROVED');
      const e = await debtEntry(r.body.id);
      expect(e).toMatchObject({ storeId: s2.id, type: 'DEBT' });
      expect(Number(e!.amount)).toBe(1_200_000);
    });
  });

  describe("DDS orqali to'lov (PAYMENT)", () => {
    const incomeBody = (over: Record<string, unknown> = {}) => ({
      dateTime: `${DAY}T12:00:00+05:00`,
      type: 'INCOME',
      account: 'BANK_CARD',
      expenseType: 'COGS', // forma standart qiymati — server INCOME_TRANSFER yozadi
      categoryName: STORE_INCOME_CATEGORY,
      sourcePerson: 'Kassir',
      amount: 1_000_000,
      description: `${TAG} do'kondan tushum`,
      ...over,
    });

    it(`"${STORE_INCOME_CATEGORY}": do'kon tanlanmasa / noma'lum / Trust / chiqim → 400, hech narsa yozilmaydi`, async () => {
      const ddsBefore = await prisma.ddsTransaction.count();
      const bad: Record<string, unknown>[] = [
        {},
        { storeId: '' },
        { storeId: '00000000-0000-0000-0000-000000000000' },
        { storeId: trustStore.id },
        { storeId: s1.id, type: 'EXPENSE' },
      ];
      for (const over of bad) {
        const r = await api('POST', '/api/dds', 'CASHIER', incomeBody(over));
        expect(r.status, JSON.stringify(over)).toBe(400);
        expect(typeof r.body.error).toBe('string');
        expect(r.body.error).not.toMatch(/prisma|invocation/i);
      }
      expect(await prisma.ddsTransaction.count()).toBe(ddsBefore);
      expect(await prisma.storeLedgerEntry.count({ where: { storeId: s1.id, type: 'PAYMENT' } })).toBe(0);
    });

    it(`"${STORE_INCOME_CATEGORY}" kirimi (storeId bilan): PAYMENT yoziladi, hisob qoldig'i oshadi; o'chirilsa qaytadi`, async () => {
      const before = (await getAccountBalances()) as Record<string, number>;
      // Kategoriya nomi biroz boshqacha yozilsa ham yagona tizim nomiga keltiriladi
      const r = await api('POST', '/api/dds', 'CASHIER', incomeBody({ storeId: s1.id, categoryName: 'do`kondan  tushum' }));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({
        type: 'INCOME',
        source: 'STORE_PAYMENT',
        expenseType: 'INCOME_TRANSFER',
        categoryName: STORE_INCOME_CATEGORY,
        sourcePerson: s1.name,
        amount: 1_000_000,
      });
      expect(r.body.balances.BANK_CARD).toBeCloseTo(before.BANK_CARD + 1_000_000, 2);
      expect(r.body.balances.CASH).toBeCloseTo(before.CASH, 2);

      const e = await prisma.storeLedgerEntry.findUnique({ where: { ddsTransactionId: r.body.id } });
      expect(e).toMatchObject({ storeId: s1.id, type: 'PAYMENT', dealId: null, createdById: adminId });
      expect(Number(e!.amount)).toBe(1_000_000);

      const del = await api('DELETE', `/api/dds/${r.body.id}`, 'MANAGER');
      expect(del.status).toBe(200);
      expect(del.body.balances.BANK_CARD).toBeCloseTo(before.BANK_CARD, 2);
      expect(await prisma.storeLedgerEntry.findUnique({ where: { ddsTransactionId: r.body.id } })).toBeNull();

      // Hisobot testlari uchun bitta to'lov qoldiriladi
      const again = await api('POST', '/api/dds', 'CASHIER', incomeBody({ storeId: s1.id }));
      expect(again.status).toBe(201);
      storeIncomeTxId = again.body.id;
    });

    it(`"${STORE_INCOME_CATEGORY}": Qodir aka ham do'kon sifatida qabul qilinadi — PAYMENT yoziladi, o'chirilsa qaytadi`, async () => {
      const before = (await getAccountBalances()) as Record<string, number>;
      const r = await api('POST', '/api/dds', 'CASHIER', incomeBody({ storeId: qodirStore.id, amount: 100_000 }));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ type: 'INCOME', source: 'STORE_PAYMENT', categoryName: STORE_INCOME_CATEGORY, sourcePerson: qodirStore.name });
      const e = await prisma.storeLedgerEntry.findUnique({ where: { ddsTransactionId: r.body.id } });
      expect(e).toMatchObject({ storeId: qodirStore.id, type: 'PAYMENT' });
      expect(Number(e!.amount)).toBe(100_000);

      expect((await api('DELETE', `/api/dds/${r.body.id}`, 'ADMIN')).status).toBe(200);
      expect(await prisma.storeLedgerEntry.findUnique({ where: { ddsTransactionId: r.body.id } })).toBeNull();
      const after = (await getAccountBalances()) as Record<string, number>;
      expect(after.BANK_CARD).toBeCloseTo(before.BANK_CARD, 2);
    });

    it(`"${QODIR_PAYMENT_CATEGORY}" faqat KIRIM: Qodir aka daftariga PAYMENT, kassa oshadi (INCOME_TRANSFER); chiqim sifatida → 400`, async () => {
      const finBefore = (await api('GET', `/api/finances/summary?${PERIOD}`, 'CFO')).body;
      const before = (await getAccountBalances()) as Record<string, number>;
      const ddsBefore = await prisma.ddsTransaction.count();

      // Chiqim sifatida yozib bo'lmaydi (Qodir aka endi bizga qarzdor — biz unga to'lamaymiz)
      const wrong = await api('POST', '/api/dds', 'CASHIER', {
        dateTime: `${DAY}T12:00:00+05:00`,
        type: 'EXPENSE',
        account: 'CASH',
        categoryName: QODIR_PAYMENT_CATEGORY,
        amount: 500_000,
        description: `${TAG} xato`,
      });
      expect(wrong.status).toBe(400);
      expect(typeof wrong.body.error).toBe('string');
      expect(await prisma.ddsTransaction.count()).toBe(ddsBefore);

      const r = await api('POST', '/api/dds', 'CASHIER', {
        dateTime: `${DAY}T12:00:00+05:00`,
        type: 'INCOME',
        account: 'CASH',
        expenseType: 'OPEX', // forma nimani yuborsa ham server INCOME_TRANSFER yozadi
        categoryName: QODIR_PAYMENT_CATEGORY,
        sourcePerson: 'Kassir',
        amount: 500_000,
        description: `${TAG} Qodir aka bergan pul`,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({
        type: 'INCOME',
        source: 'QODIR_PAYMENT',
        expenseType: 'INCOME_TRANSFER',
        categoryName: QODIR_PAYMENT_CATEGORY,
        amount: 500_000,
      });
      expect(r.body.balances.CASH).toBeCloseTo(before.CASH + 500_000, 2);

      const e = await prisma.storeLedgerEntry.findUnique({ where: { ddsTransactionId: r.body.id } });
      expect(e).toMatchObject({ storeId: qodirStore.id, type: 'PAYMENT' });
      expect(Number(e!.amount)).toBe(500_000);

      // Qarz qaytishi — daromad ham, xarajat ham emas: P&L o'zgarmaydi
      const finAfter = (await api('GET', `/api/finances/summary?${PERIOD}`, 'CFO')).body;
      expect(finAfter.pnl.totalOpex).toBeCloseTo(finBefore.pnl.totalOpex, 2);
      expect(finAfter.pnl.netProfit).toBeCloseTo(finBefore.pnl.netProfit, 2);
      expect(finAfter.pnl.cogsCashOut).toBeCloseTo(finBefore.pnl.cogsCashOut, 2);
    });

    it("kategoriyalar ro'yxatida ikkala yangi tizim kategoriyasi doim bor", async () => {
      const names = await api('GET', '/api/dds/categories', 'CASHIER');
      expect(names.body).toContain(QODIR_PAYMENT_CATEGORY);
      expect(names.body).toContain(STORE_INCOME_CATEGORY);
      const detailed = (await api('GET', '/api/dds/categories?detailed=true', 'CASHIER')).body;
      expect(detailed.find((c: any) => c.name === QODIR_PAYMENT_CATEGORY)).toMatchObject({
        type: 'INCOME',
        expenseType: 'INCOME_TRANSFER',
        system: true,
      });
      expect(detailed.find((c: any) => c.name === STORE_INCOME_CATEGORY)).toMatchObject({
        type: 'INCOME',
        expenseType: 'INCOME_TRANSFER',
        system: true,
      });
    });
  });

  describe('hisobot endpointlari', () => {
    it('OPERATOR / AGENT → 403, tokensiz → 401; sana noto\'g\'ri → 400; noma\'lum do\'kon → 404', async () => {
      for (const path of ['/api/store-reports', '/api/store-reports/qodir', `/api/store-reports/${s1.id}`]) {
        for (const role of ['OPERATOR', 'AGENT', 'WAREHOUSE']) expect((await api('GET', path, role)).status, `${role} ${path}`).toBe(403);
        for (const role of ['ADMIN', 'MANAGER', 'CFO', 'COO', 'CASHIER', 'VIEWER']) {
          expect((await api('GET', `${path}?${PERIOD}`, role)).status, `${role} ${path}`).toBe(200);
        }
        expect((await api('GET', path, null)).status).toBe(401);
        for (const q of ['startDate=06.05.2033', 'endDate=2033-13-40', 'startDate=abc', `startDate=${DAY}&endDate=2033-05-05`]) {
          const r = await api('GET', `${path}?${q}`, 'ADMIN');
          expect(r.status, `${path}?${q}`).toBe(400);
          expect(typeof r.body.error).toBe('string');
        }
      }
      const missing = await api('GET', '/api/store-reports/00000000-0000-0000-0000-000000000000', 'ADMIN');
      expect(missing.status).toBe(404);
      expect(typeof missing.body.error).toBe('string');
    });

    it("bitta do'kon (batafsil): yig'ma, daftar, bitimlar, xarajatlar va yozuvlar to'g'ri", async () => {
      // Bitimga bog'langan operatsion xarajat (COGS emas) — dealExpenses ga kiradi; chek to'lovi (COGS) kirmaydi
      await createDds({
        dateTime: DEAL_DATE,
        type: 'EXPENSE',
        account: 'CASH',
        expenseType: 'OPEX',
        categoryName: `${TAG} yetkazib berish`,
        amount: 50_000,
        description: `${TAG} bitim xarajati`,
        createdById: adminId,
        dealId: d1.id,
      });

      const r = await api('GET', `/api/store-reports/${s1.id}?${PERIOD}`, 'CFO');
      expect(r.status).toBe(200);
      const b = r.body;
      expect(b.store).toEqual({ id: s1.id, name: s1.name, isActive: true });
      expect(b.settlement).toBe('STORE_OWES');
      expect(b.ledgerStart).toBe(STORE_LEDGER_START_YMD);
      expect(b.period).toEqual({ startDate: DAY, endDate: DAY });
      expect(b.summary).toEqual({
        dealsCount: 1,
        withdrawnTotal: 5_000_000,
        payoutTotal: 3_500_000,
        profit: 400_000,
        dealExpenses: 50_000,
        netProfit: 350_000,
      });
      const ledger1 = { debt: 3_500_000, paid: 1_000_000, balance: 2_500_000, debtLeft: 2_500_000, deposit: 0 };
      expect(b.ledger.period).toEqual(ledger1);
      expect(b.ledger.overall).toEqual(ledger1);

      expect(b.deals).toHaveLength(1);
      expect(b.deals[0]).toMatchObject({
        id: d1.id,
        dealNumber: d1.dealNumber,
        dateLabel: '06.05.2033 10:15',
        customerName: `${TAG}_mijoz_1`,
        withdrawnLimit: 5_000_000,
        calculatedAmount: 3_500_000,
        profit: 400_000,
        // Oddiy do'kon: qarz tarkibida faqat chek
        debtParts: { check: 3_500_000, agent: 0, profit: 0, total: 3_500_000 },
      });
      expect(b.deals[0]).toHaveProperty('agentAmount');
      expect(b.deals[0].checkExpense).toMatchObject({ amount: 3_500_000 });
      expect(b.deals[0].checkExpense.txNumber).toMatch(/^TX-\d+$/);
      expect(typeof b.deals[0].checkExpense.dateLabel).toBe('string');

      expect(b.expenses).toHaveLength(2);
      const opex = b.expenses.find((e: any) => e.expenseType === 'OPEX');
      expect(opex).toMatchObject({
        categoryName: `${TAG} yetkazib berish`,
        account: 'CASH',
        amount: 50_000,
        dealId: d1.id,
        dealNumber: d1.dealNumber,
        dateLabel: '06.05.2033 10:15',
      });
      expect(b.expenses.find((e: any) => e.expenseType === 'COGS')).toMatchObject({ amount: 3_500_000, dealId: d1.id });

      expect(b.entries).toHaveLength(2);
      const debt = b.entries.find((e: any) => e.type === 'DEBT');
      const pay = b.entries.find((e: any) => e.type === 'PAYMENT');
      expect(debt).toMatchObject({
        amount: 3_500_000,
        dateLabel: '06.05.2033 10:15',
        deal: { id: d1.id, dealNumber: d1.dealNumber, customerName: `${TAG}_mijoz_1` },
        ddsTransaction: null,
      });
      expect(pay).toMatchObject({
        amount: 1_000_000,
        deal: null,
        ddsTransaction: { id: storeIncomeTxId, account: 'BANK_CARD', categoryName: STORE_INCOME_CATEGORY },
      });

      // Sana filtrsiz: eski sanali tasdiqlangan bitim ham hisobotda, lekin qarz yozuvi yo'q (daftar keyin boshlangan)
      const all = (await api('GET', `/api/store-reports/${s1.id}`, 'VIEWER')).body;
      expect(all.period).toEqual({ startDate: null, endDate: null });
      expect(all.summary.dealsCount).toBe(2);
      expect(all.summary.payoutTotal).toBe(4_400_000);
      expect(all.summary.profit).toBe(470_000);
      expect(all.ledger.overall).toEqual(ledger1);
      expect(all.deals.map((d: any) => d.id).sort()).toEqual([d1.id, d4.id].sort());
    });

    it("Qodir aka: /qodir — U bizga qarzdor (STORE_OWES), qarz = chek + agent + 6% foyda, qoldiq = qarz − to'langan; Trust do'koni — daftarsiz (TRUST)", async () => {
      const q = (await api('GET', `/api/store-reports/qodir?${PERIOD}`, 'CASHIER')).body;
      expect(q.store.id).toBe(qodirStore.id);
      expect(q.settlement).toBe('STORE_OWES');
      expect(q.summary).toMatchObject({ dealsCount: 1, payoutTotal: 2_000_000, profit: 250_000, dealExpenses: 0, netProfit: 250_000 });
      expect(q.ledger.period).toEqual({
        debt: DEBT_QODIR_D2,
        paid: 500_000,
        balance: DEBT_QODIR_D2 - 500_000,
        debtLeft: DEBT_QODIR_D2 - 500_000,
        deposit: 0,
      });
      expect(q.ledger.overall.debt).toBeCloseTo(qodirOverallBefore.debt + DEBT_QODIR_D2, 2);
      expect(q.ledger.overall.paid).toBeCloseTo(qodirOverallBefore.paid + 500_000, 2);
      expect(q.ledger.overall.balance).toBeCloseTo(qodirOverallBefore.balance + DEBT_QODIR_D2 - 500_000, 2);
      expect(q.deals).toHaveLength(1);
      expect(q.deals[0]).toMatchObject({
        id: d2.id,
        checkExpense: null,
        debtParts: { check: 2_000_000, agent: 1_900_000, profit: 300_000, total: DEBT_QODIR_D2 },
      });
      expect(q.expenses).toEqual([]);
      expect(q.entries.map((e: any) => e.type).sort()).toEqual(['DEBT', 'PAYMENT']);
      expect(q.entries.find((e: any) => e.type === 'PAYMENT').ddsTransaction.categoryName).toBe(QODIR_PAYMENT_CATEGORY);

      const byId = (await api('GET', `/api/store-reports/${qodirStore.id}?${PERIOD}`, 'CASHIER')).body;
      expect(byId.summary).toEqual(q.summary);
      expect(byId.ledger).toEqual(q.ledger);

      const t = (await api('GET', `/api/store-reports/${trustStore.id}?${PERIOD}`, 'ADMIN')).body;
      expect(t.settlement).toBe('TRUST');
      expect(t.summary).toMatchObject({ dealsCount: 1, payoutTotal: 1_000_000, profit: 800_000 });
      expect(t.ledger.period).toEqual({ debt: 0, paid: 0, balance: 0, debtLeft: 0, deposit: 0 });
      expect(t.entries).toEqual([]);
    });

    it("bitta do'kon (servis getStoreLedger): deals[] elementlarida agentAmount, customerLimit, approvalStatus, provider, debtParts bor", async () => {
      // Servis qatlami
      const svc: any = await getStoreLedger(qodirStore.id, {
        start: new Date(`${DAY}T00:00:00+05:00`),
        end: new Date(`${DAY}T23:59:59.999+05:00`),
      });
      const sd = svc.deals.find((d: any) => d.id === d2.id);
      expect(sd).toBeTruthy();
      expect(sd).toHaveProperty('agentAmount');
      expect(sd).toHaveProperty('customerLimit');
      expect(sd.approvalStatus).toBe('APPROVED');
      expect(sd.provider).toMatchObject({ name: `${TAG}_provider` });
      expect(sd.debtParts).toEqual({ check: 2_000_000, agent: 1_900_000, profit: 300_000, total: DEBT_QODIR_D2 });
    });

    it("bitta do'kon HTTP javobi (/api/store-reports/qodir): deals[] da agentAmount, customerLimit, approvalStatus, provider, debtParts", async () => {
      const sd = { debtParts: { check: 2_000_000, agent: 1_900_000, profit: 300_000, total: DEBT_QODIR_D2 } };
      const http = (await api('GET', `/api/store-reports/qodir?${PERIOD}`, 'CASHIER')).body;
      const hd = http.deals.find((d: any) => d.id === d2.id);
      expect(hd.debtParts).toEqual(sd.debtParts);
      expect(hd.agentAmount).toBe(0); // bitim yaratishda agentAmount yozilmagan (mkDeal) — qarz tarkibi esa qoida bo'yicha hisoblanadi
      expect(hd, 'customerLimit').toHaveProperty('customerLimit');
      expect(hd.approvalStatus, 'approvalStatus').toBe('APPROVED');
      expect(hd.provider, 'provider').toMatchObject({ name: `${TAG}_provider` });
    });

    it("yig'ma ro'yxat: do'kon qatorlari va jami ko'rsatkichlar to'g'ri, bitimlar soni bo'yicha saralangan", async () => {
      const r = await api('GET', `/api/store-reports?${PERIOD}`, 'MANAGER');
      expect(r.status).toBe(200);
      const b = r.body;
      expect(b.period).toEqual({ startDate: DAY, endDate: DAY });
      expect(b.ledgerStart).toBe(STORE_LEDGER_START_YMD);

      const row = (id: string) => b.stores.find((s: any) => s.storeId === id);
      expect(row(s1.id)).toEqual({
        storeId: s1.id,
        name: s1.name,
        isActive: true,
        settlement: 'STORE_OWES',
        dealsCount: 1,
        withdrawnTotal: 5_000_000,
        payoutTotal: 3_500_000,
        profit: 400_000,
        dealExpenses: 50_000,
        netProfit: 350_000,
        period: { debt: 3_500_000, paid: 1_000_000, balance: 2_500_000, debtLeft: 2_500_000, deposit: 0 },
        overall: { debt: 3_500_000, paid: 1_000_000, balance: 2_500_000, debtLeft: 2_500_000, deposit: 0 },
      });
      expect(row(s2.id)).toMatchObject({
        settlement: 'STORE_OWES',
        dealsCount: 1,
        payoutTotal: 1_200_000,
        period: { debt: 1_200_000, paid: 0, balance: 1_200_000 },
      });
      expect(row(qodirStore.id)).toMatchObject({
        settlement: 'STORE_OWES',
        dealsCount: 1,
        payoutTotal: 2_000_000,
        period: { debt: DEBT_QODIR_D2, paid: 500_000, balance: DEBT_QODIR_D2 - 500_000, debtLeft: DEBT_QODIR_D2 - 500_000, deposit: 0 },
      });
      expect(row(trustStore.id)).toMatchObject({
        settlement: 'TRUST',
        dealsCount: 1,
        profit: 800_000,
        period: { debt: 0, paid: 0, balance: 0, debtLeft: 0, deposit: 0 },
        overall: { debt: 0, paid: 0, balance: 0, debtLeft: 0, deposit: 0 },
      });

      // Shu (bo'sh) kunda faqat sinov bitimlari bor: d1, d2, d5 va POST orqali yaratilgani
      expect(b.totals.dealsCount).toBe(4);
      expect(b.totals.payoutTotal).toBe(3_500_000 + 2_000_000 + 1_000_000 + 1_200_000);
      expect(b.totals.dealExpenses).toBe(50_000);
      expect(b.totals.netProfit).toBeCloseTo(b.totals.profit - 50_000, 2);
      // Joriy (butun davr) qoldiqlar: do'konlar bizga (Qodir aka ham shu yerda), omonatlar alohida; weOwe doim 0.
      // Qodir aka'ning avvalgi qoldig'i lokal bazaga bog'liq — shuning uchun o'zgarish debtLeft/deposit bo'yicha hisoblanadi.
      const qb0 = qodirOverallBefore.balance;
      const qb1 = qb0 + DEBT_QODIR_D2 - 500_000;
      const qodirOweDelta = Math.max(0, qb1) - Math.max(0, qb0);
      const qodirDepositDelta = Math.max(0, -qb1) - Math.max(0, -qb0);
      expect(b.totals.storesOweUs).toBeCloseTo(listBefore.totals.storesOweUs + 2_500_000 + 1_200_000 + qodirOweDelta, 2);
      expect(b.totals.storeDeposits).toBeCloseTo(listBefore.totals.storeDeposits + qodirDepositDelta, 2);
      expect(b.totals.weOwe).toBe(0);

      const dealCounts = b.stores.map((s: any) => s.dealsCount);
      expect(dealCounts).toEqual([...dealCounts].sort((x: number, y: number) => y - x));
      // Bitimi ham, qoldig'i ham yo'q do'kon ro'yxatga kirmaydi
      for (const s of b.stores) expect(s.dealsCount > 0 || Math.abs(s.overall.balance) >= 0.01).toBe(true);
      for (const key of Object.keys(b.totals)) expect(typeof b.totals[key], key).toBe('number');
    });

    it("to'lov o'chirilsa — do'kon qoldig'i qaytadi", async () => {
      expect((await api('DELETE', `/api/dds/${storeIncomeTxId}`, 'ADMIN')).status).toBe(200);
      const b = (await api('GET', `/api/store-reports/${s1.id}?${PERIOD}`, 'ADMIN')).body;
      expect(b.ledger.overall).toEqual({ debt: 3_500_000, paid: 0, balance: 3_500_000, debtLeft: 3_500_000, deposit: 0 });
      expect(b.entries).toHaveLength(1);
    });
  });
});
