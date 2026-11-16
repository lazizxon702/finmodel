import 'dotenv/config';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Bitimlar API integratsion testi (haqiqiy PostgreSQL bilan).
 *   • FAQAT lokal bazada ishlaydi (DATABASE_URL / DATABASE_URL_UNPOOLED hosti localhost bo'lsa), aks holda o'tkazib yuboriladi.
 *   • Tashqi ta'sirlar o'chirilgan: Google Sheets'ga yozish va Telegram/push bildirishnomalari soxta (mock).
 *   • Barcha test yozuvlari (foydalanuvchilar, bitimlar, DDS, audit) oxirida o'chiriladi, hisob qoldiqlari qaytariladi.
 */
vi.mock('../src/services/sheetsSync.service', () => ({
  pushDealToGoogleSheets: vi.fn(async () => ({ success: false, reason: 'test' })),
}));
vi.mock('../src/services/notification.service', () => ({
  notifyDealDecision: vi.fn(async () => undefined),
}));

function isLocalDatabase(): boolean {
  const urls = [process.env.DATABASE_URL_UNPOOLED, process.env.DATABASE_URL].filter(Boolean) as string[];
  if (!urls.length) return false;
  return urls.every((raw) => {
    try {
      const host = new URL(raw).hostname.replace(/^\[|\]$/g, '');
      return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
      return false;
    }
  });
}

const LOCAL = isLocalDatabase();
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const TAG = `zz_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
// Test bitimlari uchun alohida, haqiqiy ma'lumotlar bilan kesishmaydigan kun
const DAY = '2001-02-03';
const DAY_MARKER = `${DAY}T12:00:00+05:00`;

describe.skipIf(!LOCAL)('Bitimlar API (lokal baza)', () => {
  let prisma: typeof import('../src/lib/prisma').prisma;
  let ledger: typeof import('../src/services/ledger.service');
  let server: Server;
  let base = '';
  let sign: (u: { id: string; username: string; role: string; fullName: string }) => string;

  const users: Record<string, { id: string; username: string; role: string; fullName: string }> = {};
  const createdRefs: { stores: string[]; providers: string[]; agencies: string[] } = { stores: [], providers: [], agencies: [] };
  let store: { id: string };
  let provider: { id: string };
  let qodirStore: { id: string };
  let trustStore: { id: string };
  let trustProvider: { id: string };
  let agency: { id: string };

  async function api(who: keyof typeof users | null, method: string, url: string, body?: unknown) {
    const res = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(who ? { Authorization: `Bearer ${sign(users[who])}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* matn */
    }
    return { status: res.status, data };
  }

  const dealBody = (extra: Record<string, unknown> = {}) => ({
    date: DAY_MARKER,
    storeId: store.id,
    providerId: provider.id,
    customerName: 'Test Mijozov',
    customerPhone1: '+998900000001',
    customerPhone2: '+998900000002',
    customerLimit: 10_000_000,
    withdrawnLimit: 5_000_000,
    calculatedAmount: 3_500_000,
    productName: 'Test telefon',
    ...extra,
  });

  async function ensureByName(model: 'store' | 'provider', name: string) {
    const found = await (prisma[model] as any).findUnique({ where: { name } });
    if (found) return found as { id: string };
    const created = await (prisma[model] as any).create({ data: { name } });
    (model === 'store' ? createdRefs.stores : createdRefs.providers).push(created.id);
    return created as { id: string };
  }

  beforeAll(async () => {
    (BigInt.prototype as any).toJSON = function () {
      return this.toString();
    };

    prisma = (await import('../src/lib/prisma')).prisma;
    ledger = await import('../src/services/ledger.service');
    const express = (await import('express')).default;
    const jwt = (await import('jsonwebtoken')).default;
    const { getJwtSecret } = await import('../src/lib/security');
    sign = (u) => jwt.sign({ id: u.id, username: u.username, role: u.role, fullName: u.fullName }, getJwtSecret(), { expiresIn: '15m' });

    // Faqat bitimlarga tegishli routelar ulanadi (butun ilova emas)
    const app = express();
    app.use(express.json());
    app.use('/api/deals', (await import('../src/routes/deals.routes')).default);
    app.use('/api/agents', (await import('../src/routes/agents.routes')).default);
    app.use('/api/debtors', (await import('../src/routes/debtors.routes')).default);
    app.use('/api/inventory', (await import('../src/routes/inventory.routes')).default);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const ag = await prisma.agency.create({ data: { name: `${TAG}_agency` } });
    createdRefs.agencies.push(ag.id);
    agency = ag;

    const mk = async (key: string, role: string, extra: Record<string, unknown> = {}) => {
      const u = await prisma.user.create({
        data: { username: `${TAG}_${key}`, fullName: `Test ${key}`, passwordHash: 'x', role: role as any, ...extra },
      });
      users[key] = { id: u.id, username: u.username, role: u.role, fullName: u.fullName };
      return u;
    };
    await mk('admin', 'ADMIN');
    await mk('cashier', 'CASHIER');
    await mk('viewer', 'VIEWER');
    await mk('opA', 'OPERATOR');
    await mk('opB', 'OPERATOR');
    const agent = await mk('agent', 'AGENT', { agencyId: ag.id });
    await mk('teamOp', 'OPERATOR', { parentAgentId: agent.id });

    store = await prisma.store.create({ data: { name: `${TAG}_store` } });
    createdRefs.stores.push(store.id);
    provider = await prisma.provider.create({ data: { name: `${TAG}_provider` } });
    createdRefs.providers.push(provider.id);
    qodirStore = await ensureByName('store', 'Qodir aka');
    trustStore = await ensureByName('store', 'Trust');
    trustProvider = await ensureByName('provider', 'Trust 1');
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const userIds = Object.values(users).map((u) => u.id);
      const deals = await prisma.deal.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
      const dealIds = deals.map((d) => d.id);
      // DDS yozuvlari yadro orqali o'chiriladi — hisob qoldiqlari ham orqaga qaytadi
      const txs = await prisma.ddsTransaction.findMany({
        where: { OR: [{ dealId: { in: dealIds } }, { createdById: { in: userIds } }] },
        select: { id: true },
      });
      for (const t of txs) await ledger.deleteDds(t.id);
      await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
      await prisma.buyer.deleteMany({ where: { name: { startsWith: TAG } } });
      await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { in: dealIds } }] } });
      await prisma.user.deleteMany({ where: { id: { in: userIds }, parentAgentId: { not: null } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.agency.deleteMany({ where: { id: { in: createdRefs.agencies } } });
      await prisma.store.deleteMany({ where: { id: { in: createdRefs.stores } } });
      await prisma.provider.deleteMany({ where: { id: { in: createdRefs.providers } } });
    } finally {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      await prisma.$disconnect();
    }
  });

  const dayQuery = `startDate=${DAY}&endDate=${DAY}&storeId=`;
  const totalsFor = async (who: keyof typeof users, storeId: string) =>
    (await api(who, 'GET', `/api/deals/totals?${dayQuery}${storeId}`)).data;

  it('token talab qilinadi', async () => {
    expect((await api(null, 'GET', '/api/deals')).status).toBe(401);
  });

  it("operator kiritgan bitim: PENDING_APPROVAL, ism/telefon to'liq, sana + hozirgi vaqt, autoDdsExpense e'tiborsiz", async () => {
    const r = await api('opA', 'POST', '/api/deals', dealBody({ autoDdsExpense: true, approvalStatus: 'APPROVED', dealNumber: 1 }));
    expect(r.status).toBe(201);
    const d = r.data;
    expect(d.approvalStatus).toBe('PENDING_APPROVAL');
    expect(d.approvedById).toBeNull();
    expect(d.dealNumber).not.toBe(1);
    expect(d.customerName).toBe('Test Mijozov');
    expect(d.customerPhone1).toBe('+998900000001');
    expect(d.customerPhone2).toBe('+998900000002');
    expect(d.createdBy).toMatchObject({ id: users.opA.id, role: 'OPERATOR' });
    expect(d.dateYmd).toBe(DAY);
    expect(d.dateTimeLabel.startsWith('03.02.2001 ')).toBe(true);
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ position: 0, productName: 'Test telefon', quantity: 1 });
    expect(d.checkExpense).toBeNull();
    expect(await prisma.ddsTransaction.count({ where: { dealId: d.id } })).toBe(0);
  });

  it("to'ldirgichlar (\"Mijoz\", \"-\") bazaga yozilmaydi", async () => {
    const r = await api('opA', 'POST', '/api/deals', dealBody({ customerName: 'Mijoz', customerPhone1: '-', customerPhone2: '' }));
    expect(r.status).toBe(201);
    const row = await prisma.deal.findUnique({ where: { id: r.data.id } });
    expect(row?.customerName).toBeNull();
    expect(row?.customerPhone1).toBeNull();
    expect(row?.customerPhone2).toBeNull();
    expect((await api('opA', 'DELETE', `/api/deals/${r.data.id}`)).status).toBe(200);
  });

  it("boshqa operator bu bitimni ko'rmaydi (404 / bo'sh ro'yxat) va o'zgartira olmaydi", async () => {
    const mine = (await api('opA', 'GET', '/api/deals?limit=100')).data.deals;
    expect(mine.length).toBeGreaterThan(0);
    const id = mine[0].id;
    expect(mine.every((d: any) => d.createdById === users.opA.id)).toBe(true);

    const other = await api('opB', 'GET', '/api/deals?limit=100');
    expect(other.data.deals).toEqual([]);
    expect(other.data.pagination.total).toBe(0);

    expect((await api('opB', 'GET', `/api/deals/${id}`)).status).toBe(404);
    expect((await api('opB', 'PUT', `/api/deals/${id}`, { note: 'x' })).status).toBe(404);
    expect((await api('opB', 'DELETE', `/api/deals/${id}`)).status).toBe(404);
    expect((await api('opB', 'GET', '/api/deals/pending-count')).data.count).toBe(0);
    expect((await api('opA', 'GET', '/api/deals/pending-count')).data.count).toBe(1);

    const adminView = await api('admin', 'GET', `/api/deals/${id}`);
    expect(adminView.status).toBe(200);
    expect(adminView.data.createdBy.id).toBe(users.opA.id);
  });

  it("tasdiqlanmagan bitim totals/KPI ga kirmaydi; admin tasdiqlagach kiradi va DDS chiqimi yoziladi", async () => {
    const id = (await api('opA', 'GET', '/api/deals?limit=1')).data.deals[0].id;

    const before = await totalsFor('admin', store.id);
    expect(before.dealCount).toBe(0);
    expect(before.totalWithdrawn).toBe(0);
    const swotBefore = (await api('admin', 'GET', `/api/deals/swot-daily?${dayQuery}${store.id}`)).data;
    expect(swotBefore.summary.totalDeals).toBe(0);

    // faqat ADMIN tasdiqlaydi
    expect((await api('opA', 'POST', `/api/deals/${id}/approve`, {})).status).toBe(403);
    expect((await api('cashier', 'POST', `/api/deals/${id}/approve`, {})).status).toBe(403);
    // tasdiqlanmagan bitimga xarajat yozilmaydi
    expect((await api('admin', 'POST', `/api/deals/${id}/expense-to-dds`, { amount: 3_500_000, account: 'CASH' })).status).toBe(409);
    // noto'g'ri hisob turi → 400, bitim tasdiqlanmay qoladi
    expect((await api('admin', 'POST', `/api/deals/${id}/approve`, { account: 'KASSA' })).status).toBe(400);

    const balBefore = await ledger.getAccountBalances();
    const ok = await api('admin', 'POST', `/api/deals/${id}/approve`, { account: 'BANK_CARD' });
    expect(ok.status).toBe(200);
    expect(ok.data.deal.approvalStatus).toBe('APPROVED');
    expect(ok.data.deal.approvedBy.id).toBe(users.admin.id);
    expect(ok.data.check.created).toBe(true);
    expect(Number(ok.data.check.transaction.amount)).toBe(3_500_000);
    expect(ok.data.check.transaction).toMatchObject({ type: 'EXPENSE', account: 'BANK_CARD', source: 'DEAL_CHECK', dealId: id });
    expect(ok.data.balances.BANK_CARD).toBe(balBefore.BANK_CARD - 3_500_000);
    expect(ok.data.deal.checkExpense).toMatchObject({ amount: 3_500_000, account: 'BANK_CARD' });

    // ikkinchi marta tasdiqlash → 409
    expect((await api('admin', 'POST', `/api/deals/${id}/approve`, {})).status).toBe(409);

    const after = await totalsFor('admin', store.id);
    expect(after.dealCount).toBe(1);
    expect(after.totalWithdrawn).toBe(5_000_000);
    expect(after.totalCalculatedAmount).toBe(3_500_000);

    // "Rasxod qilish" qayta bosilsa dublikat yozilmaydi
    const again = await api('admin', 'POST', `/api/deals/${id}/expense-to-dds`, { amount: 3_500_000, account: 'CASH' });
    expect(again.status).toBe(200);
    expect(again.data.created).toBe(false);
    expect(again.data.transaction.id).toBe(ok.data.check.transaction.id);
    expect(again.data.balances.BANK_CARD).toBe(balBefore.BANK_CARD - 3_500_000);
    expect(await prisma.ddsTransaction.count({ where: { dealId: id } })).toBe(1);

    // operator endi tasdiqlangan bitimni tahrirlay ham, o'chira ham olmaydi
    expect((await api('opA', 'PUT', `/api/deals/${id}`, { note: 'x' })).status).toBe(403);
    expect((await api('opA', 'DELETE', `/api/deals/${id}`)).status).toBe(403);
    // boshqa rollar (VIEWER) o'chira olmaydi
    expect((await api('viewer', 'DELETE', `/api/deals/${id}`)).status).toBe(403);
  });

  it('expense-to-dds: idempotent (ketma-ket va parallel), rollar, hisob turi tekshiruvi', async () => {
    const created = await api('admin', 'POST', '/api/deals', dealBody({ calculatedAmount: 1_200_000 }));
    expect(created.status).toBe(201);
    expect(created.data.approvalStatus).toBe('APPROVED');
    const id = created.data.id;
    expect(await prisma.ddsTransaction.count({ where: { dealId: id } })).toBe(0);

    expect((await api('opA', 'POST', `/api/deals/${id}/expense-to-dds`, { account: 'CASH' })).status).toBe(403);
    expect((await api('viewer', 'POST', `/api/deals/${id}/expense-to-dds`, { account: 'CASH' })).status).toBe(403);
    const bad = await api('admin', 'POST', `/api/deals/${id}/expense-to-dds`, { amount: 1_200_000, account: 'KASSA' });
    expect(bad.status).toBe(400);
    expect(bad.data.error).toContain('CASH');
    expect((await api('admin', 'POST', `/api/deals/${id}/expense-to-dds`, { amount: 'abc' })).status).toBe(400);
    expect((await api('admin', 'POST', '/api/deals/00000000-0000-0000-0000-000000000000/expense-to-dds', {})).status).toBe(404);

    const balBefore = await ledger.getAccountBalances();
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(() => api('cashier', 'POST', `/api/deals/${id}/expense-to-dds`, { amount: 1_200_000, account: 'cash' }))
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(results.filter((r) => r.data.created).length).toBe(1);
    expect(new Set(results.map((r) => r.data.transaction.id)).size).toBe(1);

    const rows = await prisma.ddsTransaction.findMany({ where: { dealId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'EXPENSE', account: 'CASH', source: 'DEAL_CHECK', expenseType: 'COGS' });
    expect(Number(rows[0].amount)).toBe(1_200_000);
    // chiqim bugungi sana-vaqt bilan yoziladi (bitimning eski sanasi bilan emas)
    expect(Date.now() - rows[0].dateTime.getTime()).toBeLessThan(120_000);
    const balAfter = await ledger.getAccountBalances();
    expect(balAfter.CASH).toBe(balBefore.CASH - 1_200_000);

    const last = await api('admin', 'POST', `/api/deals/${id}/expense-to-dds`, { account: 'CASH' });
    expect(last.status).toBe(200);
    expect(last.data).toMatchObject({ created: false, skippedReason: null });
    expect(last.data.balances.CASH).toBe(balAfter.CASH);
  });

  it("Qodir aka cheki xarajatga olinmaydi; mijozga berilgan summa 0 bo'lsa ham yozilmaydi", async () => {
    const qodir = await api('admin', 'POST', '/api/deals', dealBody({ storeId: qodirStore.id, autoDdsExpense: true }));
    expect(qodir.status).toBe(201);
    expect(qodir.data.checkExpenseResult).toMatchObject({ created: false });
    const r = await api('admin', 'POST', `/api/deals/${qodir.data.id}/expense-to-dds`, { amount: 3_500_000, account: 'CASH' });
    expect(r.status).toBe(200);
    expect(r.data.created).toBe(false);
    expect(r.data.transaction).toBeNull();
    expect(r.data.skippedReason).toContain('Qodir aka');
    expect(r.data.balances).toHaveProperty('total');
    expect(await prisma.ddsTransaction.count({ where: { dealId: qodir.data.id } })).toBe(0);

    const zero = await api('admin', 'POST', '/api/deals', dealBody({ calculatedAmount: 0 }));
    const z = await api('admin', 'POST', `/api/deals/${zero.data.id}/expense-to-dds`, {
      amount: Number(zero.data.totalPurchaseCost),
      account: 'CASH',
    });
    expect(z.status).toBe(200);
    expect(z.data.created).toBe(false);
    expect(z.data.skippedReason).toBeTruthy();
    expect(await prisma.ddsTransaction.count({ where: { dealId: zero.data.id } })).toBe(0);
  });

  it("admin yaratgan bitim + autoDdsExpense: darhol APPROVED va chiqim bir marta yoziladi", async () => {
    const r = await api('admin', 'POST', '/api/deals', dealBody({ calculatedAmount: 700_000, autoDdsExpense: true, ddsAccount: 'BANK_CARD' }));
    expect(r.status).toBe(201);
    expect(r.data.approvalStatus).toBe('APPROVED');
    expect(r.data.checkExpenseResult).toMatchObject({ created: true });
    expect(r.data.checkExpense).toMatchObject({ amount: 700_000, account: 'BANK_CARD' });
    const again = await api('admin', 'POST', `/api/deals/${r.data.id}/expense-to-dds`, { account: 'CASH' });
    expect(again.data.created).toBe(false);
    expect(await prisma.ddsTransaction.count({ where: { dealId: r.data.id } })).toBe(1);
  });

  it("Trust bitimi: tasdiqlangach Trust daftariga DEBT (to'liq limit) tushadi; trustDebtAmount (daromad) 16%, limit o'zgarsa yangilanadi, o'chirilsa yo'qoladi", async () => {
    const r = await api('opA', 'POST', '/api/deals', dealBody({ storeId: trustStore.id, providerId: trustProvider.id, withdrawnLimit: 10_000_000, calculatedAmount: 8_000_000 }));
    expect(r.status).toBe(201);
    const id = r.data.id;
    expect(Number(r.data.trustDebtAmount)).toBe(1_600_000);
    expect(await prisma.trustLedgerEntry.count({ where: { dealId: id } })).toBe(0);

    const ok = await api('admin', 'POST', `/api/deals/${id}/approve`, {});
    expect(ok.status).toBe(200);
    expect(ok.data.trustDebt).toBe(10_000_000);
    let entry = await prisma.trustLedgerEntry.findUnique({ where: { dealId: id } });
    expect(entry).toMatchObject({ type: 'DEBT' });
    expect(Number(entry!.amount)).toBe(10_000_000);

    const upd = await api('admin', 'PUT', `/api/deals/${id}`, { withdrawnLimit: 5_000_000 });
    expect(upd.status).toBe(200);
    entry = await prisma.trustLedgerEntry.findUnique({ where: { dealId: id } });
    expect(Number(entry!.amount)).toBe(5_000_000);

    // do'kon/provayder Trust bo'lmay qolsa — qarz yozuvi o'chadi
    const moved = await api('admin', 'PUT', `/api/deals/${id}`, { storeId: store.id, providerId: provider.id });
    expect(moved.status).toBe(200);
    expect(await prisma.trustLedgerEntry.count({ where: { dealId: id } })).toBe(0);
    const back = await api('admin', 'PUT', `/api/deals/${id}`, { storeId: trustStore.id, providerId: trustProvider.id });
    expect(back.status).toBe(200);
    expect(await prisma.trustLedgerEntry.count({ where: { dealId: id } })).toBe(1);

    expect((await api('admin', 'DELETE', `/api/deals/${id}`)).status).toBe(200);
    expect(await prisma.trustLedgerEntry.count({ where: { dealId: id } })).toBe(0);
  });

  it("rad etish: sabab saqlanadi; operator tuzatsa yana tasdiqqa qaytadi; kutilayotganini o'zi o'chira oladi", async () => {
    const r = await api('opA', 'POST', '/api/deals', dealBody());
    const id = r.data.id;
    expect((await api('opA', 'POST', `/api/deals/${id}/reject`, { reason: 'x' })).status).toBe(403);
    const rej = await api('admin', 'POST', `/api/deals/${id}/reject`, { reason: "Summa noto'g'ri" });
    expect(rej.status).toBe(200);
    expect(rej.data.deal).toMatchObject({ approvalStatus: 'REJECTED', rejectReason: "Summa noto'g'ri" });

    // rad etilgan bitimni o'chirib bo'lmaydi (faqat kutilayotganini), lekin tuzatish mumkin
    expect((await api('opA', 'DELETE', `/api/deals/${id}`)).status).toBe(403);
    const fixed = await api('opA', 'PUT', `/api/deals/${id}`, { calculatedAmount: 3_400_000, approvalStatus: 'APPROVED', approvedById: users.opA.id });
    expect(fixed.status).toBe(200);
    expect(fixed.data).toMatchObject({ approvalStatus: 'PENDING_APPROVAL', rejectReason: null, approvedById: null });
    expect(Number(fixed.data.calculatedAmount)).toBe(3_400_000);

    const list = await api('opA', 'GET', '/api/deals?approvalStatus=PENDING_APPROVAL&limit=100');
    expect(list.data.deals.some((d: any) => d.id === id)).toBe(true);
    expect(list.data.deals.every((d: any) => d.approvalStatus === 'PENDING_APPROVAL')).toBe(true);
    expect((await api('opA', 'GET', '/api/deals?approvalStatus=XATO')).status).toBe(400);

    expect((await api('opA', 'DELETE', `/api/deals/${id}`)).status).toBe(200);
    expect(await prisma.deal.count({ where: { id } })).toBe(0);
  });

  it("ko'p mahsulotli bitim: items saqlanadi, eski maydonlar sinxron, PUT da to'liq almashtiriladi", async () => {
    const r = await api('admin', 'POST', '/api/deals', dealBody({
      productName: undefined,
      items: [
        { productName: 'iPhone 15', color: 'Black', storageGb: '256GB', imei1: `${TAG}-A1`, imei2: `${TAG}-A2`, quantity: 1, price: 12_000_000 },
        { productName: 'Galaxy S25', color: 'Blue', storageGb: '128GB', imeiBarcode: `${TAG}-B1`, quantity: 2 },
      ],
    }));
    expect(r.status).toBe(201);
    const id = r.data.id;
    expect(r.data.items.map((i: any) => [i.position, i.productName, i.quantity])).toEqual([
      [0, 'iPhone 15', 1],
      [1, 'Galaxy S25', 2],
    ]);
    expect(r.data.items[0].price).toBe(12_000_000);
    expect(r.data.productName).toBe('iPhone 15 + Galaxy S25');
    expect(r.data.quantity).toBe(3);
    expect(r.data.imeiBarcode).toBe(`${TAG}-A1`);
    expect(r.data.imei2).toBe(`${TAG}-A2`);
    expect(r.data.deviceItems).toHaveLength(2);
    expect(r.data.deviceItems[1].imeiBarcode).toBe(`${TAG}-B1`);
    expect(await prisma.dealItem.count({ where: { dealId: id } })).toBe(2);

    // ikkinchi qurilmaning IMEI si bo'yicha ham topiladi
    const found = await api('admin', 'GET', `/api/deals?search=${TAG}-B1`);
    expect(found.data.deals.map((d: any) => d.id)).toEqual([id]);

    // eski klient formati (deviceItems) bilan to'liq almashtirish
    const upd = await api('admin', 'PUT', `/api/deals/${id}`, {
      deviceItems: [{ id: '1', productName: 'Redmi 13', color: 'Green', storageGb: '128GB', quantity: 1, imeiBarcode: `${TAG}-C1`, imei2: '' }],
    });
    expect(upd.status).toBe(200);
    expect(upd.data.items).toHaveLength(1);
    expect(upd.data.items[0]).toMatchObject({ position: 0, productName: 'Redmi 13', imei1: `${TAG}-C1` });
    expect(upd.data.productName).toBe('Redmi 13');
    expect(upd.data.quantity).toBe(1);
    expect(upd.data.imeiBarcode).toBe(`${TAG}-C1`);
    expect(await prisma.dealItem.count({ where: { dealId: id } })).toBe(1);

    const one = await api('admin', 'GET', `/api/deals/${id}`);
    expect(one.data.items).toHaveLength(1);
    expect(one.data.approvedBy).toMatchObject({ id: users.admin.id, role: 'ADMIN' });
  });

  it("bitim raqami: parallel yaratishda takrorlanmaydi", async () => {
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => api('opB', 'POST', '/api/deals', dealBody())));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.data.dealNumber)).size).toBe(6);
  });

  it("agent doirasi: o'zi + jamoasi + o'z agentligi; agentlik avtomatik qo'yiladi", async () => {
    const own = await api('agent', 'POST', '/api/deals', dealBody());
    expect(own.status).toBe(201);
    expect(own.data.approvalStatus).toBe('PENDING_APPROVAL');
    expect(own.data.agencyId).toBe(agency.id);

    const team = await api('teamOp', 'POST', '/api/deals', dealBody());
    expect(team.data.agencyId).toBe(agency.id);
    // agentlikka yozilgan, lekin boshqa (admin) kiritgan bitim
    const byAdmin = await api('admin', 'POST', '/api/deals', dealBody({ agencyId: agency.id, withdrawnLimit: 4_000_000, calculatedAmount: 3_000_000 }));

    const list = (await api('agent', 'GET', '/api/deals?limit=200')).data.deals.map((d: any) => d.id);
    expect(list).toContain(own.data.id);
    expect(list).toContain(team.data.id);
    expect(list).toContain(byAdmin.data.id);
    expect(list).toHaveLength(3);

    // jamoa operatori faqat o'zinikini ko'radi
    const teamList = (await api('teamOp', 'GET', '/api/deals?limit=200')).data.deals.map((d: any) => d.id);
    expect(teamList).toEqual([team.data.id]);

    // agent foydasi yig'masi: OPERATOR → 403; AGENT → faqat o'z agentligi, faqat tasdiqlangan bitimlar
    expect((await api('opA', 'GET', '/api/agents/commission-summary')).status).toBe(403);
    expect((await api('opA', 'GET', '/api/agents/deals')).status).toBe(403);
    const summary = await api('agent', 'GET', '/api/agents/commission-summary');
    expect(summary.status).toBe(200);
    expect(summary.data.agencies).toHaveLength(1);
    expect(summary.data.agencies[0]).toMatchObject({ agencyId: agency.id, dealsTotal: 1, dealsToday: 0, dealsMonth: 0 });
    expect(summary.data.agencies[0].total).toBeCloseTo(Number(byAdmin.data.agentAmount), 4);
    // Formula: Yechilgan limit × (Xarid diskonti − Agent foizi); bu do'kon/provayderda agent foizi 0
    expect(Number(byAdmin.data.agentAmount)).toBeCloseTo(4_000_000 * ((4_000_000 - 3_000_000) / 4_000_000 - 0), 4);

    const adminSummary = await api('admin', 'GET', '/api/agents/commission-summary');
    const row = adminSummary.data.agencies.find((a: any) => a.agencyId === agency.id);
    expect(row).toMatchObject({ dealsTotal: 1 });
    expect(row.total).toBeCloseTo(Number(byAdmin.data.agentAmount), 4);

    // agent CRM ro'yxati ham shu doirada: sukut bo'yicha faqat tasdiqlangan
    const crm = await api('agent', 'GET', '/api/agents/deals');
    expect(crm.status).toBe(200);
    expect(crm.data.items.map((i: any) => i.id)).toEqual([byAdmin.data.id]);
    expect(crm.data.items[0]).toMatchObject({ customerName: 'Test Mijozov', customerPhone1: '+998900000001', customerPhone2: '+998900000002' });
    expect(crm.data.totals.dealCount).toBe(1);
    const crmAll = await api('agent', 'GET', '/api/agents/deals?approvalStatus=all');
    expect(crmAll.data.items).toHaveLength(3);
    expect(crmAll.data.totals.dealCount).toBe(1);
    expect(crm.data.agenciesList.map((a: any) => a.id)).toEqual([agency.id]);
  });

  it("ombor va qarzdorlar: doira + sukut bo'yicha faqat tasdiqlangan; mijoz ismi/telefoni to'liq", async () => {
    const adminInv = await api('admin', 'GET', `/api/inventory?startDate=${DAY}&endDate=${DAY}&storeId=${store.id}`);
    expect(adminInv.status).toBe(200);
    expect(adminInv.data.items.length).toBeGreaterThan(0);
    expect(adminInv.data.items.every((i: any) => i.approvalStatus === 'APPROVED')).toBe(true);
    const sample = adminInv.data.items.find((i: any) => i.customerName);
    expect(sample).toMatchObject({ customerName: 'Test Mijozov', customerPhone1: '+998900000001', customerPhone2: '+998900000002' });
    expect(typeof sample.dateTimeLabel).toBe('string');

    // opB ning barcha bitimlari kutilmoqda → omborda ko'rinmaydi; approvalStatus=all bilan faqat o'ziniki
    const opInv = await api('opB', 'GET', '/api/inventory');
    expect(opInv.data.items).toEqual([]);
    const opInvAll = await api('opB', 'GET', '/api/inventory?approvalStatus=all');
    expect(opInvAll.data.items).toHaveLength(6);

    // doiradan tashqaridagi tovarni o'zgartirib bo'lmaydi
    const foreignId = adminInv.data.items[0].id;
    expect((await api('opB', 'PUT', `/api/inventory/${foreignId}/status`, { status: 'IN_WAREHOUSE', reason: 'x' })).status).toBe(404);
    expect((await api('opB', 'PUT', `/api/inventory/${foreignId}/sell`, { salePrice: 1, buyerName: 'x' })).status).toBe(404);
    expect((await api('opB', 'DELETE', `/api/inventory/${foreignId}/sale?deletePermanently=true`)).status).toBe(404);
    // tasdiqlanmagan bitimni sotib bo'lmaydi
    expect((await api('opB', 'PUT', `/api/inventory/${opInvAll.data.items[0].id}/sell`, { salePrice: 1000, buyerName: `${TAG} xaridor`, paidAmount: 1000 })).status).toBe(409);

    expect((await api('opB', 'GET', '/api/debtors')).data.items).toEqual([]);
  });

  it("sotuv: mijoz ismi xaridor ismi bilan ustidan yozilmaydi; tushum va qarz to'lovi hisob qoldig'iga tushadi", async () => {
    const created = await api('admin', 'POST', '/api/deals', dealBody({ customerName: 'Asl Mijoz' }));
    const id = created.data.id;
    const buyer = `${TAG} xaridor`;
    const balBefore = await ledger.getAccountBalances();

    const sold = await api('admin', 'PUT', `/api/inventory/${id}/sell`, { salePrice: 6_000_000, buyerName: buyer, paidAmount: 4_000_000, paymentType: 'CASH' });
    expect(sold.status).toBe(200);
    const row = await prisma.deal.findUnique({ where: { id }, include: { buyer: true } });
    expect(row?.customerName).toBe('Asl Mijoz');
    expect(row?.buyer?.name).toBe(buyer);
    expect(Number(row?.debtRemainder)).toBe(2_000_000);
    expect((await ledger.getAccountBalances()).CASH).toBe(balBefore.CASH + 4_000_000);

    const debtors = await api('admin', 'GET', `/api/debtors?search=${encodeURIComponent(buyer)}`);
    expect(debtors.data.items).toHaveLength(1);
    expect(debtors.data.items[0]).toMatchObject({
      debtorName: buyer,
      buyerName: buyer,
      customerName: 'Asl Mijoz',
      customerPhone1: '+998900000001',
      customerPhone2: '+998900000002',
      debtRemainder: 2_000_000,
    });
    expect(debtors.data.totalDebtSum).toBe(2_000_000);

    // kredit nazorati butun baza bo'yicha ishlaydi, lekin bitim tafsilotlari faqat doiradagilar uchun
    const check = await api('opA', 'GET', `/api/debtors/check-customer?name=${encodeURIComponent(buyer)}`);
    expect(check.data).toMatchObject({ hasDebt: true, totalDebt: 2_000_000, dealsCount: 1 });
    expect(check.data.deals).toEqual([]);

    expect((await api('opA', 'POST', `/api/debtors/${id}/payment`, { amount: 1000 })).status).toBe(404);
    const pay = await api('admin', 'POST', `/api/debtors/${id}/payment`, { amount: 2_000_000, accountType: 'BANK_CARD' });
    expect(pay.status).toBe(200);
    expect(pay.data).toMatchObject({ remainingDebt: 0, isFullyPaid: true });
    const balAfter = await ledger.getAccountBalances();
    expect(balAfter.BANK_CARD).toBe(balBefore.BANK_CARD + 2_000_000);

  });

  it("kpi-details total = swot-daily KPI (test kuni va haqiqiy ma'lumotlar bo'yicha)", async () => {
    const { KPI_METRICS } = await import('../src/routes/deals.routes');
    const ranges = [`startDate=${DAY}&endDate=${DAY}`, 'startDate=2020-01-01&endDate=2100-01-01', 'period=today'];
    for (const who of ['admin', 'agent', 'opA'] as const) {
      for (const range of ranges) {
        const swot = await api(who, 'GET', `/api/deals/swot-daily?${range}`);
        expect(swot.status).toBe(200);
        for (const metric of KPI_METRICS) {
          const det = await api(who, 'GET', `/api/deals/kpi-details?metric=${metric}&${range}`);
          expect(det.status).toBe(200);
          expect(det.data.total).toBe(swot.data.summary[metric]);
          expect(det.data.count).toBe(det.data.deals.length);
          if (metric === 'totalDeals') expect(det.data.deals.length).toBe(swot.data.summary.totalDeals);
          const sum = det.data.deals.reduce((s: number, d: any) => s + d.value, 0);
          expect(Math.abs(sum - det.data.total)).toBeLessThan(0.01);
        }
      }
    }
    const today = (await api('admin', 'GET', '/api/deals/swot-daily')).data;
    const todayDetails = await api('admin', 'GET', `/api/deals/kpi-details?metric=totalLimitVolume&startDate=${today.todayStr}&endDate=${today.todayStr}`);
    expect(todayDetails.data.total).toBe(today.todayKPI.totalLimitVolume);

    expect((await api('admin', 'GET', '/api/deals/kpi-details?metric=boshqa')).status).toBe(400);
    const sample = (await api('admin', 'GET', `/api/deals/kpi-details?metric=totalPayout&startDate=${DAY}&endDate=${DAY}`)).data;
    expect(sample.deals[0]).toHaveProperty('dateTimeLabel');
    expect(sample.deals[0]).toHaveProperty('storeName');
    expect(sample.deals[0]).toHaveProperty('customerPhone1');
    // operator KPI si faqat o'z (tasdiqlangan) bitimlaridan
    const opDeals = (await api('opA', 'GET', `/api/deals/kpi-details?metric=totalDeals&startDate=${DAY}&endDate=${DAY}`)).data;
    expect(opDeals.total).toBe(1);
  });
});
