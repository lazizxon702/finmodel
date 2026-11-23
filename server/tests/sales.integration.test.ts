import 'dotenv/config';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Ko'p tovarli sotuv (Sale) API integratsion testi (haqiqiy PostgreSQL bilan).
 *   • FAQAT lokal bazada ishlaydi (DATABASE_URL hosti localhost bo'lsa), aks holda o'tkazib yuboriladi.
 *   • Tashqi ta'sirlar o'chirilgan: Google Sheets'ga yozish va bildirishnomalar soxta (mock).
 *   • Barcha test yozuvlari (foydalanuvchi, bitim, sotuv, DDS, xaridor) oxirida o'chiriladi,
 *     hisob qoldiqlari boshlang'ich holatga qaytgani tekshiriladi.
 */
vi.mock('../src/services/sheetsSync.service', () => ({
  pushDealToGoogleSheets: vi.fn(async () => ({ success: false, reason: 'test' })),
}));
vi.mock('../src/services/notification.service', () => ({
  notifyDealDecision: vi.fn(async () => undefined),
  notifyAdmins: vi.fn(async () => undefined),
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
const TAG = `zz_sale_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
// Test sotuvlari uchun alohida, haqiqiy ma'lumotlar bilan kesishmaydigan kun
const DAY = '2021-03-04';
const DAY_MARKER = `${DAY}T12:00:00+05:00`;
const INCOME_CATEGORY = 'Sotuv tushumi (Tovar sotildi)';
const DEBT_CATEGORY = 'Qarzdorlik qaytarilishi (Kassa kirim)';
const REFUND_CATEGORY = 'Sotuv qaytarilishi (Xaridorga qaytarildi)';

type Balances = { CASH: number; BANK_CARD: number; SETTLEMENT_ACCOUNT: number; total: number };

describe.skipIf(!LOCAL)("Sotuvlar API — ko'p tovarli sotuv (lokal baza)", () => {
  let prisma: typeof import('../src/lib/prisma').prisma;
  let ledger: typeof import('../src/services/ledger.service');
  let saleService: typeof import('../src/services/sale.service');
  let server: Server;
  let base = '';
  let sign: (u: { id: string; username: string; role: string; fullName: string }) => string;

  const users: Record<string, { id: string; username: string; role: string; fullName: string }> = {};
  let store: { id: string };
  let store2: { id: string };
  let provider: { id: string };
  let initial: Balances;
  let dealSeq = 2_000_000_000 + Math.floor(Math.random() * 100_000_000);

  // Testlar orasida ulashiladigan holat
  let mainSaleId = '';
  let mainDeals: string[] = [];
  let legacyDealId = '';

  async function api(who: string | null, method: string, url: string, body?: unknown) {
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

  const buyer = (n: string) => `${TAG}_xaridor_${n}`;
  const balances = async () => (await ledger.getAccountBalances()) as unknown as Balances;
  const num = (v: unknown) => Number(v);
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

  /** Omborda turgan, tasdiqlangan test tovari (bitim) */
  async function mkDeal(cost: number, extra: Record<string, unknown> = {}) {
    const n = dealSeq++;
    const d = await prisma.deal.create({
      data: {
        dealNumber: n,
        date: new Date(DAY_MARKER),
        createdById: users.admin.id,
        sellerName: 'Test sotuvchi',
        providerId: provider.id,
        storeId: store.id,
        customerName: `${TAG}_mijoz`,
        productName: `${TAG} telefon ${n}`,
        imeiBarcode: `IMEI${n}`,
        totalPurchaseCost: cost,
        status: 'IN_WAREHOUSE',
        approvalStatus: 'APPROVED',
        note: 'asl izoh',
        items: { create: [{ position: 0, productName: `${TAG} telefon ${n}`, imei1: `IMEI${n}`, quantity: 1 }] },
        ...extra,
      } as any,
    });
    return d.id;
  }

  const dealsOf = (ids: string[]) =>
    prisma.deal.findMany({ where: { id: { in: ids } }, orderBy: { dealNumber: 'asc' } });
  const saleDds = (saleId: string) =>
    prisma.ddsTransaction.findMany({ where: { salePayment: { saleId } }, orderBy: { createdAt: 'asc' } });

  /** Sotuvning asosiy invarianti: bitim ulushlari yig'indisi sotuvga aynan teng */
  async function expectSaleConsistent(saleId: string) {
    const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { deals: true, payments: true } });
    expect(sale).toBeTruthy();
    const deals = sale!.deals;
    expect(sum(deals.map((d) => num(d.salePrice)))).toBe(num(sale!.totalPrice));
    expect(sum(deals.map((d) => num(d.receivedFromBuyer)))).toBe(num(sale!.receivedAmount));
    expect(sum(deals.map((d) => num(d.debtRemainder)))).toBe(num(sale!.debtRemainder));
    expect(sum(sale!.payments.map((p) => num(p.amount)))).toBe(num(sale!.receivedAmount));
    expect(num(sale!.totalPrice) - num(sale!.receivedAmount)).toBe(num(sale!.debtRemainder));
    for (const d of deals) {
      expect(d.status).toBe('SOLD');
      expect(d.buyerId).toBe(sale!.buyerId);
      expect(num(d.salePrice) - num(d.receivedFromBuyer)).toBe(num(d.debtRemainder));
      expect(num(d.debtRemainder)).toBeGreaterThanOrEqual(0);
      expect(num(d.profit)).toBe(num(d.salePrice) - num(d.totalPurchaseCost));
      expect(num(d.paidCashUzs) + num(d.paidBank) + num(d.paidTransfer)).toBe(num(d.receivedFromBuyer));
    }
    return sale!;
  }

  beforeAll(async () => {
    (BigInt.prototype as any).toJSON = function () {
      return this.toString();
    };

    prisma = (await import('../src/lib/prisma')).prisma;
    ledger = await import('../src/services/ledger.service');
    saleService = await import('../src/services/sale.service');
    const express = (await import('express')).default;
    const jwt = (await import('jsonwebtoken')).default;
    const { getJwtSecret } = await import('../src/lib/security');
    sign = (u) => jwt.sign({ id: u.id, username: u.username, role: u.role, fullName: u.fullName }, getJwtSecret(), { expiresIn: '15m' });

    const app = express();
    app.use(express.json());
    app.use('/api/sales', (await import('../src/routes/sales.routes')).default);
    app.use('/api/deals', (await import('../src/routes/deals.routes')).default);
    app.use('/api/debtors', (await import('../src/routes/debtors.routes')).default);
    app.use('/api/inventory', (await import('../src/routes/inventory.routes')).default);
    app.use('/api/dds', (await import('../src/routes/dds.routes')).default);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const mk = async (key: string, role: string) => {
      const u = await prisma.user.create({
        data: { username: `${TAG}_${key}`, fullName: `Test ${key}`, passwordHash: 'x', role: role as any },
      });
      users[key] = { id: u.id, username: u.username, role: u.role, fullName: u.fullName };
    };
    await mk('admin', 'ADMIN');
    await mk('seller', 'SELLER');
    await mk('cashier', 'CASHIER');
    await mk('viewer', 'VIEWER');
    await mk('operator', 'OPERATOR');

    store = await prisma.store.create({ data: { name: `${TAG}_store` } });
    store2 = await prisma.store.create({ data: { name: `${TAG}_store2` } });
    provider = await prisma.provider.create({ data: { name: `${TAG}_provider` } });
    await prisma.commissionRule.create({ data: { name: `${TAG}_rule`, providerId: provider.id, ratePercent: 0 } });
    initial = await balances();
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const userIds = Object.values(users).map((u) => u.id);
      // Qolgan sotuvlar yadro orqali qaytariladi — DDS yozuvlari o'chadi, hisob qoldiqlari tuzatiladi
      const sales = await prisma.sale.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
      for (const s of sales) await saleService.returnSale(s.id, undefined);
      const txs = await prisma.ddsTransaction.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
      for (const t of txs) await ledger.deleteDds(t.id);
      const deals = await prisma.deal.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
      const dealIds = deals.map((d) => d.id);
      await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
      await prisma.buyer.deleteMany({ where: { name: { startsWith: TAG } } });
      await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { in: dealIds } }] } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.store.deleteMany({ where: { name: { startsWith: TAG } } });
      await prisma.commissionRule.deleteMany({ where: { name: { startsWith: TAG } } });
      await prisma.provider.deleteMany({ where: { name: { startsWith: TAG } } });
    } finally {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      await prisma.$disconnect();
    }
  });

  it('token va rol talab qilinadi (VIEWER, OPERATOR, CASHIER — 403)', async () => {
    expect((await api(null, 'GET', '/api/sales')).status).toBe(401);
    const id = await mkDeal(1_000_000);
    const body = { dealIds: [id], totalPrice: 1_500_000, buyerName: buyer('rol'), paidAmount: 1_500_000, paymentType: 'CASH' };
    for (const who of ['viewer', 'operator']) {
      expect((await api(who, 'GET', '/api/sales')).status).toBe(403);
      expect((await api(who, 'POST', '/api/sales', body)).status).toBe(403);
      expect((await api(who, 'PUT', '/api/sales/x', { note: 'a' })).status).toBe(403);
      expect((await api(who, 'POST', '/api/sales/x/payments', { amount: 1 })).status).toBe(403);
      expect((await api(who, 'POST', '/api/sales/x/return', {})).status).toBe(403);
    }
    // Kassir: to'lov qabul qila oladi, lekin sotuv yarata/qaytara olmaydi
    expect((await api('cashier', 'POST', '/api/sales', body)).status).toBe(403);
    expect((await api('cashier', 'POST', '/api/sales/x/return', {})).status).toBe(403);
    expect((await api('cashier', 'POST', '/api/sales/yoq-sotuv/payments', { amount: 1 })).status).toBe(404);

    const row = await prisma.deal.findUnique({ where: { id } });
    expect(row?.status).toBe('IN_WAREHOUSE');
    expect(row?.saleId).toBeNull();
    expect(await balances()).toEqual(initial);
  });

  it("kiritish tekshiruvi: bo'sh ro'yxat, takror id, narx, xaridor, ortiqcha to'lov, noto'g'ri tur — 400", async () => {
    const id = await mkDeal(1_000_000);
    const ok = { dealIds: [id], totalPrice: 2_000_000, buyerName: buyer('val'), paidAmount: 0, paymentType: 'CASH' };
    const bad = async (patch: Record<string, unknown>) => (await api('admin', 'POST', '/api/sales', { ...ok, ...patch })).status;
    expect(await bad({ dealIds: [] })).toBe(400);
    expect(await bad({ dealIds: [id, id] })).toBe(400);
    expect(await bad({ dealIds: Array.from({ length: 51 }, (_, i) => `x${i}`) })).toBe(400);
    expect(await bad({ totalPrice: 0 })).toBe(400);
    expect(await bad({ buyerName: '  ' })).toBe(400);
    expect(await bad({ paidAmount: 2_000_001 })).toBe(400);
    expect(await bad({ paidAmount: -1 })).toBe(400);
    expect(await bad({ paymentType: 'BITCOIN' })).toBe(400);
    expect(await bad({ dealIds: [id, 'yoq-id'] })).toBe(404);
    expect(await prisma.sale.count({ where: { createdById: users.admin.id } })).toBe(0);
    expect((await prisma.deal.findUnique({ where: { id } }))?.saleId).toBeNull();
  });

  it("3 tovarli sotuv, qisman to'lov: ulushlar aynan teng, bitim maydonlari, CASH qoldig'i, bitta DDS qatori", async () => {
    mainDeals = [await mkDeal(1_000_000), await mkDeal(1_000_000), await mkDeal(1_000_000, { storeId: store2.id })];
    const before = await balances();
    const r = await api('seller', 'POST', '/api/sales', {
      dealIds: mainDeals,
      totalPrice: 10_000_000,
      buyerName: buyer('asosiy'),
      paidAmount: 5_000_000,
      paymentType: 'CASH',
      dueDate: '2021-04-01',
      note: 'ulgurji',
      saleDate: DAY,
    });
    expect(r.status).toBe(201);
    const sale = r.data.sale;
    mainSaleId = sale.id;
    expect(sale).toMatchObject({
      legacy: false,
      buyerName: buyer('asosiy'),
      itemsCount: 3,
      totalPrice: 10_000_000,
      totalCost: 3_000_000,
      profit: 7_000_000,
      receivedAmount: 5_000_000,
      debtRemainder: 5_000_000,
      paymentStatus: 'PARTIAL',
      paymentType: 'CASH',
      note: 'ulgurji',
    });
    expect(sale.marginPct).toBeCloseTo(0.7, 10);
    expect(typeof sale.saleNumber).toBe('number');
    expect(sale.dateLabel.startsWith('04.03.2021')).toBe(true);
    expect(sale.items.map((i: any) => i.priceShare)).toEqual([3_333_333, 3_333_333, 3_333_334]);
    expect(sum(sale.items.map((i: any) => i.received))).toBe(5_000_000);
    expect(sum(sale.items.map((i: any) => i.debt))).toBe(5_000_000);
    expect(sale.items[0]).toMatchObject({ dealId: mainDeals[0], storeId: store.id, cost: 1_000_000, profit: 2_333_333 });
    expect(sale.items[0].devices).toHaveLength(1);
    expect(sale.items[0].devices[0]).toMatchObject({ quantity: 1 });
    expect(sale.items[0].imei).toMatch(/^IMEI/);
    expect(sale.payments).toHaveLength(1);
    expect(sale.payments[0]).toMatchObject({ amount: 5_000_000, accountType: 'CASH' });
    expect(sale.payments[0].txNumber).toMatch(/^TX-/);

    expect(r.data.balances.CASH).toBe(before.CASH + 5_000_000);
    const after = await balances();
    expect(after.CASH).toBe(before.CASH + 5_000_000);
    expect(after.BANK_CARD).toBe(before.BANK_CARD);
    expect(after.SETTLEMENT_ACCOUNT).toBe(before.SETTLEMENT_ACCOUNT);

    const dds = await saleDds(mainSaleId);
    expect(dds).toHaveLength(1);
    expect(dds[0]).toMatchObject({
      source: 'SALE_PAYMENT',
      type: 'INCOME',
      account: 'CASH',
      expenseType: 'OPEX',
      categoryName: INCOME_CATEGORY,
      sourcePerson: buyer('asosiy'),
      dealId: null,
      createdById: users.seller.id,
    });
    expect(num(dds[0].amount)).toBe(5_000_000);
    expect(dds[0].description).toBe(`Sotuv №${sale.saleNumber}: 3 ta tovar`);

    const row = await expectSaleConsistent(mainSaleId);
    for (const d of row.deals) {
      expect(d.saleId).toBe(mainSaleId);
      expect(d.paymentStatus).toBe('PARTIAL');
      expect(num(d.paidCashUzs)).toBe(num(d.receivedFromBuyer));
      expect(num(d.marginPct)).toBeCloseTo(num(d.profit) / num(d.salePrice), 8);
      expect(d.saleDate?.toISOString()).toBe(new Date(`${DAY}T12:00:00.000+05:00`).toISOString());
      expect(d.debtDueDate).toBeTruthy();
      // Bitim mijozi va izohi ustidan yozilmaydi
      expect(d.note).toBe('asl izoh');
      expect(d.customerName).toBe(`${TAG}_mijoz`);
      expect(d.statusChangeReason).toContain(`Sotuv №${sale.saleNumber}`);
    }
  });

  it("nasiya (DEBT): to'lov majburan 0, DDS yozilmaydi", async () => {
    const ids = [await mkDeal(2_000_000), await mkDeal(0)];
    const before = await balances();
    const r = await api('admin', 'POST', '/api/sales', {
      dealIds: ids,
      totalPrice: 3_000_000,
      buyerName: buyer('nasiya'),
      paidAmount: 999_000,
      paymentType: 'DEBT',
      saleDate: DAY,
    });
    expect(r.status).toBe(201);
    expect(r.data.sale).toMatchObject({ receivedAmount: 0, debtRemainder: 3_000_000, paymentStatus: 'DEBT', paymentType: 'DEBT' });
    expect(r.data.sale.payments).toEqual([]);
    // Tannarxi 0 bo'lgan tovarga narx ulushi tushmaydi (hammasi tannarxli tovarga)
    expect(r.data.sale.items.map((i: any) => i.priceShare)).toEqual([3_000_000, 0]);
    expect(await saleDds(r.data.sale.id)).toHaveLength(0);
    expect(await balances()).toEqual(before);
    const row = await expectSaleConsistent(r.data.sale.id);
    expect(row.deals.find((d) => d.id === ids[0])?.paymentStatus).toBe('DEBT');
  });

  it("tannarxlar yig'indisi 0 — narx teng bo'linadi", async () => {
    const ids = [await mkDeal(0), await mkDeal(0), await mkDeal(0)];
    const r = await api('admin', 'POST', '/api/sales', {
      dealIds: ids,
      totalPrice: 1_000_000,
      buyerName: buyer('teng'),
      paidAmount: 1_000_000,
      paymentType: 'CASH',
      saleDate: DAY,
    });
    expect(r.status).toBe(201);
    expect(r.data.sale.items.map((i: any) => i.priceShare)).toEqual([333_333, 333_333, 333_334]);
    expect(r.data.sale.paymentStatus).toBe('PAID');
    await expectSaleConsistent(r.data.sale.id);
    const back = await api('admin', 'POST', `/api/sales/${r.data.sale.id}/return`, {});
    expect(back.status).toBe(200);
  });

  it("BANK_CARD va SETTLEMENT_ACCOUNT: pul to'g'ri hisobga tushadi", async () => {
    const before = await balances();
    const a = await mkDeal(1_000_000);
    const b = await mkDeal(1_000_000);

    const card = await api('admin', 'POST', '/api/sales', {
      dealIds: [a], totalPrice: 1_500_000, buyerName: buyer('karta'), paidAmount: 1_500_000, paymentType: 'BANK_CARD', saleDate: DAY,
    });
    expect(card.status).toBe(201);
    expect(card.data.sale).toMatchObject({ paymentStatus: 'PAID', paymentType: 'BANK_CARD', debtRemainder: 0 });
    const da = (await dealsOf([a]))[0];
    expect(num(da.paidBank)).toBe(1_500_000);
    expect(num(da.paidCashUzs)).toBe(0);
    expect(da.paymentStatus).toBe('PAID');
    expect((await saleDds(card.data.sale.id))[0].account).toBe('BANK_CARD');

    const acc = await api('admin', 'POST', '/api/sales', {
      dealIds: [b], totalPrice: 1_700_000, buyerName: buyer('hisob'), paidAmount: 700_000, paymentType: 'SETTLEMENT_ACCOUNT', saleDate: DAY,
    });
    expect(acc.status).toBe(201);
    const db = (await dealsOf([b]))[0];
    expect(num(db.paidTransfer)).toBe(700_000);
    expect(num(db.paidBank)).toBe(0);
    expect((await saleDds(acc.data.sale.id))[0].account).toBe('SETTLEMENT_ACCOUNT');

    const after = await balances();
    expect(after.BANK_CARD).toBe(before.BANK_CARD + 1_500_000);
    expect(after.SETTLEMENT_ACCOUNT).toBe(before.SETTLEMENT_ACCOUNT + 700_000);
    expect(after.CASH).toBe(before.CASH);
  });

  it('sotilgan / boshqa sotuvdagi / tasdiqlanmagan tovar → 409, hech narsa yozilmaydi', async () => {
    const good = await mkDeal(1_000_000);
    const pending = await mkDeal(1_000_000, { approvalStatus: 'PENDING_APPROVAL' });
    const transit = await mkDeal(1_000_000, { status: 'IN_TRANSIT' });
    const before = await balances();
    const salesBefore = await prisma.sale.count();
    const ddsBefore = await prisma.ddsTransaction.count({ where: { source: 'SALE_PAYMENT' } });
    const sold = await prisma.deal.findUnique({ where: { id: mainDeals[0] } });

    const attempt = (ids: string[]) =>
      api('admin', 'POST', '/api/sales', {
        dealIds: ids, totalPrice: 5_000_000, buyerName: buyer('rad'), paidAmount: 5_000_000, paymentType: 'CASH', saleDate: DAY,
      });

    const r1 = await attempt([good, mainDeals[0]]);
    expect(r1.status).toBe(409);
    expect(r1.data.unavailableDealNumbers).toEqual([sold!.dealNumber]);
    expect(r1.data.unavailableDealIds).toEqual([mainDeals[0]]);
    expect(r1.data.error).toContain(`№${sold!.dealNumber}`);

    const r2 = await attempt([good, pending]);
    expect(r2.status).toBe(409);
    expect(r2.data.unavailableDealIds).toEqual([pending]);

    const r3 = await attempt([transit]);
    expect(r3.status).toBe(409);

    expect(await prisma.sale.count()).toBe(salesBefore);
    expect(await prisma.ddsTransaction.count({ where: { source: 'SALE_PAYMENT' } })).toBe(ddsBefore);
    expect(await balances()).toEqual(before);
    expect(await prisma.buyer.count({ where: { name: buyer('rad') } })).toBe(0);
    const g = await prisma.deal.findUnique({ where: { id: good } });
    expect(g).toMatchObject({ status: 'IN_WAREHOUSE', saleId: null, buyerId: null });
    expect(num(g!.salePrice)).toBe(0);
    // Avval sotilgan tovar o'z sotuvida qoladi
    expect((await prisma.deal.findUnique({ where: { id: mainDeals[0] } }))?.saleId).toBe(mainSaleId);
  });

  it('bitta tovar uchun ikki parallel sotuv → aynan bittasi o\'tadi', async () => {
    const id = await mkDeal(1_000_000);
    const other = await mkDeal(1_000_000);
    const before = await balances();
    const post = (extra: string[], who: string) =>
      api(who, 'POST', '/api/sales', {
        dealIds: [id, ...extra], totalPrice: 2_000_000, buyerName: buyer('parallel'), paidAmount: 2_000_000, paymentType: 'CASH', saleDate: DAY,
      });
    const results = await Promise.all([post([], 'admin'), post([other], 'seller'), post([], 'seller')]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409]);

    const deal = await prisma.deal.findUnique({ where: { id } });
    expect(deal?.saleId).toBeTruthy();
    const sales = await prisma.sale.findMany({ where: { buyer: { name: buyer('parallel') } }, include: { deals: true } });
    expect(sales).toHaveLength(1);
    expect(sales[0].id).toBe(deal!.saleId);
    await expectSaleConsistent(sales[0].id);
    expect(await saleDds(sales[0].id)).toHaveLength(1);
    expect((await balances()).CASH).toBe(before.CASH + 2_000_000);
    // Yutqazgan so'rovdagi qo'shimcha tovar band qilinmagan
    if (!sales[0].deals.some((d) => d.id === other)) {
      expect((await prisma.deal.findUnique({ where: { id: other } }))?.saleId).toBeNull();
    }
  });

  it("qarzi bor xaridorga yana qarzga sotish → 403 requiresOverride (eski route bilan bir xil shakl)", async () => {
    const id = await mkDeal(1_000_000);
    const body = { dealIds: [id], totalPrice: 2_000_000, buyerName: buyer('asosiy'), paidAmount: 0, paymentType: 'DEBT', saleDate: DAY };
    const r = await api('admin', 'POST', '/api/sales', body);
    expect(r.status).toBe(403);
    expect(r.data.requiresOverride).toBe(true);
    expect(r.data.totalExistingDebt).toBe(5_000_000);
    expect(r.data.existingDebt).toBe(5_000_000);
    expect(Object.keys(r.data).sort()).toEqual(['error', 'existingDebt', 'requiresOverride', 'totalExistingDebt']);
    expect((await api('admin', 'POST', '/api/sales', { ...body, adminOverrideCode: `${TAG}-xato-kod` })).status).toBe(403);
    expect((await prisma.deal.findUnique({ where: { id } }))?.saleId).toBeNull();

    // Eski route ham shu xaridor uchun bloklaydi — sotuv qarzi bitim qarzlari orqali ko'rinadi
    const old = await api('admin', 'PUT', `/api/inventory/${id}/sell`, { salePrice: 2_000_000, buyerName: buyer('asosiy'), paidAmount: 0, paymentType: 'DEBT' });
    expect(old.status).toBe(403);
    expect(old.data.totalExistingDebt).toBe(5_000_000);

    const check = await api('admin', 'GET', `/api/debtors/check-customer?name=${encodeURIComponent(buyer('asosiy'))}`);
    expect(check.data).toMatchObject({ hasDebt: true, totalDebt: 5_000_000, dealsCount: 3 });
  });

  it("to'lov qo'shish (kassir): ulushlar va qoldiq; ortiqcha to'lov → 400", async () => {
    const before = await balances();
    expect((await api('cashier', 'POST', `/api/sales/${mainSaleId}/payments`, { amount: 0 })).status).toBe(400);
    expect((await api('cashier', 'POST', `/api/sales/${mainSaleId}/payments`, { amount: 1000, accountType: 'USD' })).status).toBe(400);
    const over = await api('cashier', 'POST', `/api/sales/${mainSaleId}/payments`, { amount: 5_000_001, accountType: 'CASH' });
    expect(over.status).toBe(400);
    expect(await balances()).toEqual(before);

    const r = await api('cashier', 'POST', `/api/sales/${mainSaleId}/payments`, {
      amount: 2_000_000, accountType: 'BANK_CARD', note: 'ikkinchi to\'lov',
    });
    expect(r.status).toBe(200);
    expect(r.data.sale).toMatchObject({ receivedAmount: 7_000_000, debtRemainder: 3_000_000, paymentStatus: 'PARTIAL' });
    expect(r.data.sale.payments).toHaveLength(2);
    expect(r.data.balances.BANK_CARD).toBe(before.BANK_CARD + 2_000_000);
    expect((await balances()).CASH).toBe(before.CASH);

    const dds = await saleDds(mainSaleId);
    expect(dds).toHaveLength(2);
    expect(dds[1]).toMatchObject({ source: 'SALE_PAYMENT', type: 'INCOME', account: 'BANK_CARD', expenseType: 'OPEX', categoryName: DEBT_CATEGORY, dealId: null });

    const row = await expectSaleConsistent(mainSaleId);
    expect(sum(row.deals.map((d) => num(d.paidCashUzs)))).toBeGreaterThan(0);
    expect(sum(row.deals.map((d) => num(d.paidBank)))).toBeGreaterThan(0);

    // Sotuvga bog'langan DDS yozuvini DDS bo'limidan o'chirib bo'lmaydi
    const del = await api('admin', 'DELETE', `/api/dds/${dds[1].id}`);
    expect(del.status).toBe(409);
    expect(await prisma.ddsTransaction.count({ where: { id: dds[1].id } })).toBe(1);
  });

  it("sotuvni tahrirlash: narx, xaridor, izoh; narx olingan summadan kam bo'lmaydi", async () => {
    const before = await balances();
    expect((await api('admin', 'PUT', `/api/sales/${mainSaleId}`, { totalPrice: 6_999_999 })).status).toBe(400);
    expect((await api('admin', 'PUT', `/api/sales/${mainSaleId}`, { totalPrice: 0 })).status).toBe(400);
    expect((await api('admin', 'PUT', '/api/sales/yoq-sotuv', { note: 'x' })).status).toBe(404);

    const r = await api('seller', 'PUT', `/api/sales/${mainSaleId}`, {
      totalPrice: 12_000_000, buyerName: buyer('asosiy2'), note: 'yangi izoh', saleDate: DAY, dueDate: null,
    });
    expect(r.status).toBe(200);
    expect(r.data.sale).toMatchObject({
      totalPrice: 12_000_000, receivedAmount: 7_000_000, debtRemainder: 5_000_000, buyerName: buyer('asosiy2'), note: 'yangi izoh', debtDueDate: null,
    });
    expect(r.data.sale.items.map((i: any) => i.priceShare)).toEqual([4_000_000, 4_000_000, 4_000_000]);
    const row = await expectSaleConsistent(mainSaleId);
    expect(row.deals.every((d) => d.debtDueDate === null && d.note === 'asl izoh')).toBe(true);
    // Tahrir pul harakatini keltirib chiqarmaydi
    expect(await balances()).toEqual(before);
    expect(await saleDds(mainSaleId)).toHaveLength(2);
  });

  it("qisman qaytarish: ortiqcha pul xaridorga qaytadi (manfiy to'lov, COGS chiqimi, qoldiq)", async () => {
    const small = await mkDeal(1_000_000);
    const big = await mkDeal(3_000_000);
    const before = await balances();
    const created = await api('admin', 'POST', '/api/sales', {
      dealIds: [small, big], totalPrice: 8_000_000, buyerName: buyer('qaytarish'), paidAmount: 7_000_000, paymentType: 'CASH', saleDate: DAY,
    });
    expect(created.status).toBe(201);
    const saleId = created.data.sale.id;
    expect(created.data.sale.items.map((i: any) => i.priceShare)).toEqual([2_000_000, 6_000_000]);

    expect((await api('admin', 'POST', `/api/sales/${saleId}/return`, { dealIds: [mainDeals[0]] })).status).toBe(400);
    expect((await api('admin', 'POST', `/api/sales/${saleId}/return`, { dealIds: 'x' })).status).toBe(400);

    const r = await api('admin', 'POST', `/api/sales/${saleId}/return`, { dealIds: [big] });
    expect(r.status).toBe(200);
    expect(r.data.returned).toBe(1);
    expect(r.data.refunded).toBe(5_000_000);
    expect(r.data.sale).toMatchObject({ itemsCount: 1, totalPrice: 2_000_000, receivedAmount: 2_000_000, debtRemainder: 0, paymentStatus: 'PAID' });
    expect(r.data.sale.payments.map((p: any) => p.amount).sort((a: number, b: number) => a - b)).toEqual([-5_000_000, 7_000_000]);
    expect(r.data.balances.CASH).toBe(before.CASH + 2_000_000);

    const dds = await saleDds(saleId);
    expect(dds).toHaveLength(2);
    const refund = dds.find((d) => d.type === 'EXPENSE')!;
    expect(refund).toMatchObject({ source: 'SALE_PAYMENT', account: 'CASH', expenseType: 'COGS', categoryName: REFUND_CATEGORY, dealId: null });
    expect(num(refund.amount)).toBe(5_000_000);

    const returned = (await dealsOf([big]))[0];
    expect(returned).toMatchObject({ status: 'IN_WAREHOUSE', saleId: null, saleDate: null, buyerId: null, debtDueDate: null, paymentStatus: 'PARTIAL', note: 'asl izoh' });
    for (const k of ['salePrice', 'receivedFromBuyer', 'debtRemainder', 'profit', 'marginPct', 'paidCashUzs', 'paidBank', 'paidTransfer'] as const) {
      expect(num(returned[k])).toBe(0);
    }
    const kept = await expectSaleConsistent(saleId);
    expect(kept.deals).toHaveLength(1);
    expect(num(kept.deals[0].salePrice)).toBe(2_000_000);
    expect(num(kept.deals[0].paidCashUzs)).toBe(2_000_000);

    // Qaytarilgan tovarni qayta sotish mumkin
    const again = await api('admin', 'POST', '/api/sales', {
      dealIds: [big], totalPrice: 4_000_000, buyerName: buyer('qayta'), paidAmount: 4_000_000, paymentType: 'CASH', saleDate: DAY,
    });
    expect(again.status).toBe(201);
    expect((await api('admin', 'POST', `/api/sales/${again.data.sale.id}/return`)).status).toBe(200);

    // Butun sotuvni qaytarish: DDS qatorlari o'chadi, qoldiq va tovar tiklanadi
    const whole = await api('seller', 'POST', `/api/sales/${saleId}/return`, {});
    expect(whole.status).toBe(200);
    expect(whole.data).toMatchObject({ sale: null, returned: 1, refunded: 2_000_000 });
    expect(whole.data.balances).toEqual(before);
    expect(await balances()).toEqual(before);
    expect(await prisma.sale.count({ where: { id: saleId } })).toBe(0);
    expect(await prisma.salePayment.count({ where: { saleId } })).toBe(0);
    expect(await prisma.ddsTransaction.count({ where: { id: { in: dds.map((d) => d.id) } } })).toBe(0);
    const s = (await dealsOf([small]))[0];
    expect(s).toMatchObject({ status: 'IN_WAREHOUSE', saleId: null, buyerId: null, saleDate: null });
    expect(num(s.salePrice)).toBe(0);
    expect((await api('admin', 'POST', `/api/sales/${saleId}/return`, {})).status).toBe(404);
  });

  it("qisman qaytarish pul qaytarmasdan: qarz kamayadi, DDS o'zgarmaydi", async () => {
    const a = await mkDeal(1_000_000);
    const b = await mkDeal(1_000_000);
    const before = await balances();
    const created = await api('admin', 'POST', '/api/sales', {
      dealIds: [a, b], totalPrice: 4_000_000, buyerName: buyer('qisman'), paidAmount: 1_000_000, paymentType: 'CASH', saleDate: DAY,
    });
    const saleId = created.data.sale.id;
    const r = await api('admin', 'POST', `/api/sales/${saleId}/return`, { dealIds: [b] });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ returned: 1, refunded: 0 });
    expect(r.data.sale).toMatchObject({ totalPrice: 2_000_000, receivedAmount: 1_000_000, debtRemainder: 1_000_000, paymentStatus: 'PARTIAL' });
    expect(await saleDds(saleId)).toHaveLength(1);
    expect((await balances()).CASH).toBe(before.CASH + 1_000_000);
    await expectSaleConsistent(saleId);
    expect((await api('admin', 'POST', `/api/sales/${saleId}/return`, { dealIds: [a] })).data.sale).toBeNull();
    expect(await balances()).toEqual(before);
  });

  it("eski yo'l bilan sotilgan tovar ro'yxatda legacy:true; saralash, qidiruv, jami", async () => {
    legacyDealId = await mkDeal(1_000_000);
    const sell = await api('admin', 'PUT', `/api/inventory/${legacyDealId}/sell`, {
      salePrice: 1_800_000, buyerName: buyer('eski'), paidAmount: 800_000, paymentType: 'CASH', saleDate: DAY,
    });
    expect(sell.status).toBe(200);
    const legacy = await prisma.deal.findUnique({ where: { id: legacyDealId } });
    expect(legacy?.saleId).toBeNull();

    const r = await api('seller', 'GET', `/api/sales?startDate=${DAY}&endDate=${DAY}&search=${TAG}`);
    expect(r.status).toBe(200);
    const rows: any[] = r.data.sales;
    const lg = rows.find((x) => x.id === legacyDealId);
    expect(lg).toMatchObject({
      legacy: true, saleNumber: null, paymentType: null, itemsCount: 1, totalPrice: 1_800_000, totalCost: 1_000_000, profit: 800_000,
      receivedAmount: 800_000, debtRemainder: 1_000_000, buyerName: buyer('eski'),
    });
    expect(lg.items[0]).toMatchObject({ dealId: legacyDealId, dealNumber: legacy!.dealNumber, priceShare: 1_800_000 });
    expect(lg.payments).toHaveLength(1);
    expect(lg.payments[0]).toMatchObject({ amount: 800_000, txNumber: null });

    const main = rows.find((x) => x.id === mainSaleId);
    expect(main).toMatchObject({ legacy: false, itemsCount: 3 });
    // Sotuvga kirgan bitimlar alohida (legacy) qator bo'lib chiqmaydi
    expect(rows.some((x) => mainDeals.includes(x.id))).toBe(false);
    expect(rows.every((x) => x.dateLabel.startsWith('04.03.2021'))).toBe(true);
    const times = rows.map((x) => new Date(x.saleDate).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const t = r.data.totals;
    expect(t.count).toBe(rows.length);
    expect(t.itemsCount).toBe(sum(rows.map((x) => x.itemsCount)));
    expect(t.totalPrice).toBe(sum(rows.map((x) => x.totalPrice)));
    expect(t.totalCost).toBe(sum(rows.map((x) => x.totalCost)));
    expect(t.profit).toBe(t.totalPrice - t.totalCost);
    expect(t.received).toBe(sum(rows.map((x) => x.receivedAmount)));
    expect(t.debt).toBe(sum(rows.map((x) => x.debtRemainder)));

    // Qidiruv: sotuv raqami, bitim raqami, IMEI, xaridor
    const bySale = await api('admin', 'GET', `/api/sales?startDate=${DAY}&endDate=${DAY}&search=${main.saleNumber}`);
    expect(bySale.data.sales.some((x: any) => x.id === mainSaleId)).toBe(true);
    const byDeal = await api('admin', 'GET', `/api/sales?search=${legacy!.dealNumber}`);
    expect(byDeal.data.sales.map((x: any) => x.id)).toEqual([legacyDealId]);
    const byImei = await api('admin', 'GET', `/api/sales?search=${main.items[2].imei}`);
    expect(byImei.data.sales.map((x: any) => x.id)).toEqual([mainSaleId]);
    const byBuyer = await api('admin', 'GET', `/api/sales?search=${encodeURIComponent(buyer('asosiy2'))}`);
    expect(byBuyer.data.sales.map((x: any) => x.id)).toEqual([mainSaleId]);
    // Do'kon va sana filtri
    const byStore = await api('admin', 'GET', `/api/sales?startDate=${DAY}&endDate=${DAY}&storeId=${store2.id}`);
    expect(byStore.data.sales.map((x: any) => x.id)).toEqual([mainSaleId]);
    const otherDay = await api('admin', 'GET', `/api/sales?startDate=2021-03-05&endDate=2021-03-05&search=${TAG}`);
    expect(otherDay.data.sales).toEqual([]);
    expect(otherDay.data.totals).toEqual({ count: 0, itemsCount: 0, totalPrice: 0, totalCost: 0, profit: 0, received: 0, debt: 0 });
  });

  it("qarzdorlar: har sotuvga BITTA qator, totalDebtSum bitimlar yig'indisiga teng, eski qator o'zgarmagan", async () => {
    const r = await api('admin', 'GET', `/api/debtors?search=${TAG}_xaridor&limit=1000`);
    expect(r.status).toBe(200);
    const rows: any[] = r.data.items;

    const saleRow = rows.find((x) => x.kind === 'SALE' && x.saleId === mainSaleId);
    expect(saleRow).toMatchObject({
      id: mainSaleId, itemsCount: 3, dealNumber: null, debtorName: buyer('asosiy2'), buyerName: buyer('asosiy2'),
      salePrice: 12_000_000, receivedFromBuyer: 7_000_000, debtRemainder: 5_000_000, paymentStatus: 'PARTIAL', isOverdue: false,
    });
    expect(typeof saleRow.saleNumber).toBe('number');
    expect(saleRow.productName).toMatch(/ \+2 ta$/);
    expect(saleRow.storeName).toContain(`${TAG}_store`);
    expect(saleRow.payments).toHaveLength(2);
    expect(saleRow.items).toHaveLength(3);
    expect(sum(saleRow.items.map((i: any) => i.debtRemainder))).toBe(5_000_000);
    expect(rows.filter((x) => x.saleId === mainSaleId)).toHaveLength(1);
    // Sotuvdagi bitimlar alohida qator emas
    expect(rows.some((x) => mainDeals.includes(x.id))).toBe(false);

    const legacyRow = rows.find((x) => x.id === legacyDealId);
    expect(legacyRow).toMatchObject({ kind: 'DEAL', saleId: null, saleNumber: null, itemsCount: 1, debtRemainder: 1_000_000, salePrice: 1_800_000 });
    expect(typeof legacyRow.dealNumber).toBe('number');

    // Jami qarz: bitimlar bo'yicha yig'indi bilan bir xil (ikki marta sanalmaydi)
    const perDeal = await prisma.deal.aggregate({
      where: { buyer: { name: { startsWith: `${TAG}_xaridor` } }, debtRemainder: { gt: 0 }, approvalStatus: 'APPROVED' },
      _sum: { debtRemainder: true },
    });
    expect(r.data.totalDebtSum).toBe(num(perDeal._sum.debtRemainder));
    expect(r.data.totalDebtSum).toBe(sum(rows.map((x) => x.debtRemainder)));
    expect(r.data.pagination.total).toBe(rows.length);

    // Sahifalash birlashtirilgan ro'yxat bo'yicha
    const p1 = await api('admin', 'GET', `/api/debtors?search=${TAG}_xaridor&limit=1&page=1`);
    expect(p1.data.items).toHaveLength(1);
    expect(p1.data.pagination.total).toBe(rows.length);
    expect(p1.data.totalDebtSum).toBe(r.data.totalDebtSum);

    // Sotuvdagi bitimga eski yo'l bilan to'lov qabul qilinmaydi
    const before = await balances();
    const pay = await api('admin', 'POST', `/api/debtors/${mainDeals[0]}/payment`, { amount: 1000 });
    expect(pay.status).toBe(409);
    expect(pay.data).toMatchObject({ saleId: mainSaleId, paymentUrl: `/api/sales/${mainSaleId}/payments` });
    expect(await balances()).toEqual(before);
    // Eski bitim uchun eski to'lov ishlayveradi
    const legacyPay = await api('admin', 'POST', `/api/debtors/${legacyDealId}/payment`, { amount: 100_000 });
    expect(legacyPay.status).toBe(200);
    expect((await balances()).CASH).toBe(before.CASH + 100_000);
  });

  it("eski routelar sotuvga kirgan tovar uchun 409 qaytaradi, bitim o'zgarmaydi", async () => {
    const id = mainDeals[1];
    const sale = await prisma.sale.findUnique({ where: { id: mainSaleId } });
    const snapshot = await prisma.deal.findUnique({ where: { id } });
    const msg = `Bu tovar №${sale!.saleNumber} sotuvga kiradi — amal Sotuvlar bo'limida bajariladi`;

    const calls = [
      await api('admin', 'PUT', `/api/inventory/${id}/sell`, { salePrice: 1, buyerName: 'x', paidAmount: 1 }),
      await api('admin', 'PUT', `/api/inventory/${id}/sale`, { salePrice: 1, paidAmount: 1 }),
      await api('admin', 'PUT', `/api/inventory/${id}/sale`, { returnToWarehouse: true }),
      await api('admin', 'DELETE', `/api/inventory/${id}/sale`),
      await api('admin', 'DELETE', `/api/inventory/${id}/sale?deletePermanently=true`),
      await api('admin', 'PUT', `/api/inventory/${id}/status`, { status: 'IN_WAREHOUSE', reason: 'sinov' }),
      await api('admin', 'PUT', `/api/inventory/${id}/receive`, { imeiBarcode: '123' }),
      await api('admin', 'POST', '/api/inventory/transfer', { dealIds: [id], targetStoreId: store2.id }),
      await api('admin', 'POST', '/api/inventory/transfer/accept', { dealIds: [id], targetStoreId: store2.id }),
      await api('admin', 'DELETE', `/api/deals/${id}`),
    ];
    for (const c of calls) {
      expect(c.status).toBe(409);
      expect(c.data.error).toBe(msg);
    }
    const after = await prisma.deal.findUnique({ where: { id } });
    expect({ ...after, updatedAt: null }).toEqual({ ...snapshot, updatedAt: null });
  });

  it("bitimni tahrirlash (PUT /api/deals/:id) sotuv maydonlarini buzmaydi; tannarx o'zgarsa ulushlar qayta taqsimlanadi", async () => {
    const id = mainDeals[0];
    const before = await prisma.deal.findUnique({ where: { id } });
    const r = await api('admin', 'PUT', `/api/deals/${id}`, { editReason: 'sinov tahriri',
      note: 'tahrirlangan izoh',
      status: 'IN_WAREHOUSE',
      statusChangeReason: 'sinov',
      salePrice: 1,
      receivedFromBuyer: 0,
      buyerId: null,
      saleDate: '2020-01-01',
      paidCashUzs: 5,
      paidBank: 5,
      paidTransfer: 5,
      debtDueDate: '2030-01-01',
    });
    expect(r.status).toBe(200);
    const after = await prisma.deal.findUnique({ where: { id } });
    expect(after?.note).toBe('tahrirlangan izoh');
    expect(after?.status).toBe('SOLD');
    expect(after?.saleId).toBe(mainSaleId);
    expect(after?.buyerId).toBe(before?.buyerId);
    expect(after?.saleDate?.toISOString()).toBe(before?.saleDate?.toISOString());
    expect(after?.debtDueDate).toBeNull();
    const costChanged = num(after!.totalPurchaseCost) !== num(before!.totalPurchaseCost);
    if (!costChanged) {
      for (const k of ['salePrice', 'receivedFromBuyer', 'debtRemainder', 'profit', 'marginPct', 'paidCashUzs', 'paidBank', 'paidTransfer'] as const) {
        expect(num(after![k])).toBe(num(before![k]));
      }
      expect(after?.paymentStatus).toBe(before?.paymentStatus);
    }
    // Har qanday holatda sotuv invarianti saqlanadi (tannarx o'zgargan bo'lsa ulushlar qayta taqsimlangan)
    const sale = await expectSaleConsistent(mainSaleId);
    expect(num(sale.totalPrice)).toBe(12_000_000);
    expect(num(sale.receivedAmount)).toBe(7_000_000);

    // Tannarxni o'zgartiradigan tahrir: yechilgan limit / xarid diskonti
    const r2 = await api('admin', 'PUT', `/api/deals/${id}`, { customerLimit: 9_000_000, withdrawnLimit: 6_000_000, calculatedAmount: 4_000_000, editReason: 'sinov tahriri' });
    expect(r2.status).toBe(200);
    const sale2 = await expectSaleConsistent(mainSaleId);
    expect(num(sale2.totalPrice)).toBe(12_000_000);
    const costs = sale2.deals.sort((a, b) => a.dealNumber - b.dealNumber).map((d) => num(d.totalPurchaseCost));
    const { allocateProportional } = await import('../src/services/calculation.service');
    expect(sale2.deals.map((d) => num(d.salePrice))).toEqual(allocateProportional(12_000_000, costs));
  });

  it("Trust do'koni bitimi: sotib, omborga qaytarilgach foyda sotuvdan oldingi qiymatga qaytadi (0 emas)", async () => {
    const { CalculationService } = await import('../src/services/calculation.service');
    let trust = await prisma.store.findFirst({ where: { name: { in: ['Trust', 'Trust 1'] } } });
    const createdTrust = !trust;
    if (!trust) trust = await prisma.store.create({ data: { name: 'Trust' } });
    try {
      const limits = { customerLimit: 6_000_000, withdrawnLimit: 5_000_000, calculatedAmount: 3_500_000 };
      // Sotuvdan oldingi foyda — bitim yaratish/tahrirlash (calculateDeal) beradigan qiymat
      const unsold = CalculationService.calculateDeal(
        { ...limits, storeName: trust.name, providerName: `${TAG}_provider`, isDaftarManual: false, status: 'IN_WAREHOUSE' as any, date: new Date(DAY_MARKER) },
        []
      );
      expect(unsold.profit).toBe(800_000);
      const mk = () => mkDeal(3_000_000, { storeId: trust!.id, ...limits, isDaftar: false, profit: unsold.profit, marginPct: unsold.marginPct });
      const a = await mk();
      const b = await mk();

      const created = await api('admin', 'POST', '/api/sales', {
        dealIds: [a, b], totalPrice: 9_000_000, buyerName: buyer('trust'), paidAmount: 9_000_000, paymentType: 'CASH', saleDate: DAY,
      });
      expect(created.status).toBe(201);
      // Sotilgan paytda foyda eski qoida bo'yicha: narx ulushi − tannarx
      const sold = await expectSaleConsistent(created.data.sale.id);
      expect(sold.deals.map((d) => num(d.profit))).toEqual([1_500_000, 1_500_000]);

      // Qisman qaytarish
      const part = await api('admin', 'POST', `/api/sales/${created.data.sale.id}/return`, { dealIds: [b] });
      expect(part.status).toBe(200);
      const rb = (await dealsOf([b]))[0];
      expect(rb.status).toBe('IN_WAREHOUSE');
      expect(num(rb.profit)).toBe(800_000);
      expect(num(rb.marginPct)).toBeCloseTo(unsold.marginPct, 8);

      // To'liq qaytarish
      const whole = await api('admin', 'POST', `/api/sales/${created.data.sale.id}/return`, {});
      expect(whole.status).toBe(200);
      const ra = (await dealsOf([a]))[0];
      expect(ra).toMatchObject({ status: 'IN_WAREHOUSE', saleId: null });
      expect(num(ra.profit)).toBe(800_000);
      expect(num(ra.marginPct)).toBeCloseTo(unsold.marginPct, 8);
      expect(num(ra.salePrice)).toBe(0);
    } finally {
      await prisma.deal.deleteMany({ where: { storeId: trust.id, createdById: users.admin.id, customerName: `${TAG}_mijoz` } });
      if (createdTrust) await prisma.store.delete({ where: { id: trust.id } });
    }
  });

  it("qisman qaytarishda pul hisoblar bo'yicha qaytadi: eng yangi to'lovdan, har hisobdan ko'pi bilan sof tushgan summa", async () => {
    const keep = await mkDeal(2_100_000);
    const back = await mkDeal(3_000_000);
    const before = await balances();
    const created = await api('admin', 'POST', '/api/sales', {
      dealIds: [keep, back], totalPrice: 5_100_000, buyerName: buyer('hisoblar'), paidAmount: 5_000_000, paymentType: 'BANK_CARD', saleDate: DAY,
    });
    expect(created.status).toBe(201);
    const saleId = created.data.sale.id;
    expect(created.data.sale.items.map((i: any) => i.priceShare)).toEqual([2_100_000, 3_000_000]);
    // Keyingi to'lov naqd; sanasi ataylab eski — tartib foydalanuvchi sanasi emas, yozilgan vaqt bo'yicha
    const pay = await api('cashier', 'POST', `/api/sales/${saleId}/payments`, { amount: 100_000, accountType: 'CASH', date: '2020-06-01' });
    expect(pay.status).toBe(200);

    const r = await api('admin', 'POST', `/api/sales/${saleId}/return`, { dealIds: [back] });
    expect(r.status).toBe(200);
    expect(r.data.refunded).toBe(3_000_000);
    expect(r.data.sale).toMatchObject({ totalPrice: 2_100_000, receivedAmount: 2_100_000, debtRemainder: 0, paymentStatus: 'PAID' });

    const payments = await prisma.salePayment.findMany({ where: { saleId } });
    const negatives = payments.filter((p) => num(p.amount) < 0);
    expect(negatives.map((p) => [p.accountType, num(p.amount)]).sort()).toEqual([['BANK_CARD', -2_900_000], ['CASH', -100_000]].sort());
    for (const acc of ['CASH', 'BANK_CARD', 'SETTLEMENT_ACCOUNT']) {
      expect(sum(payments.filter((p) => p.accountType === acc).map((p) => num(p.amount)))).toBeGreaterThanOrEqual(0);
    }
    const refunds = (await saleDds(saleId)).filter((d) => d.type === 'EXPENSE');
    expect(refunds).toHaveLength(2);
    expect(refunds.every((d) => d.expenseType === 'COGS' && d.categoryName === REFUND_CATEGORY && d.source === 'SALE_PAYMENT')).toBe(true);
    expect(refunds.map((d) => [d.account, num(d.amount)]).sort()).toEqual([['BANK_CARD', 2_900_000], ['CASH', 100_000]].sort());

    const after = await balances();
    expect(after.CASH).toBe(before.CASH);
    expect(after.BANK_CARD).toBe(before.BANK_CARD + 2_100_000);
    const kept = await expectSaleConsistent(saleId);
    expect(num(kept.deals[0].paidBank)).toBe(2_100_000);
    expect(num(kept.deals[0].paidCashUzs)).toBe(0);

    expect((await api('admin', 'POST', `/api/sales/${saleId}/return`, {})).status).toBe(200);
    expect(await balances()).toEqual(before);
  });

  it("kiritish chegaralari: summa butun so'mga yaxlitlanadi; juda katta summa, uzun izoh/ism, noto'g'ri sana — 400", async () => {
    const id = await mkDeal(1_000_000);
    const ok = { dealIds: [id], totalPrice: 2_000_000, buyerName: buyer('chegara'), paidAmount: 2_000_000, paymentType: 'CASH', saleDate: DAY };
    const bad = async (patch: Record<string, unknown>) => {
      const r = await api('admin', 'POST', '/api/sales', { ...ok, ...patch });
      expect(typeof r.data.error).toBe('string');
      return r.status;
    };
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    expect(await bad({ totalPrice: 1e13, paidAmount: 0 })).toBe(400);
    expect(await bad({ totalPrice: 'abc' })).toBe(400);
    expect(await bad({ totalPrice: '1e999' })).toBe(400);
    expect(await bad({ note: 'x'.repeat(501) })).toBe(400);
    expect(await bad({ buyerName: 'x'.repeat(201) })).toBe(400);
    expect(await bad({ saleDate: '2019-12-31' })).toBe(400);
    expect(await bad({ saleDate: future })).toBe(400);
    expect((await prisma.deal.findUnique({ where: { id } }))?.saleId).toBeNull();
    expect(await prisma.buyer.count({ where: { name: buyer('chegara') } })).toBe(0);

    const r = await api('admin', 'POST', '/api/sales', { ...ok, totalPrice: 2_000_000.4, paidAmount: 1_499_999.6, note: 'x'.repeat(500) });
    expect(r.status).toBe(201);
    expect(r.data.sale).toMatchObject({ totalPrice: 2_000_000, receivedAmount: 1_500_000, debtRemainder: 500_000 });
    const saleId = r.data.sale.id;

    const before = await balances();
    const pay = (body: Record<string, unknown>) => api('cashier', 'POST', `/api/sales/${saleId}/payments`, body);
    expect((await pay({ amount: 1000, date: future })).status).toBe(400);
    expect((await pay({ amount: 1000, date: '2019-01-01' })).status).toBe(400);
    expect((await pay({ amount: 1000, note: 'x'.repeat(501) })).status).toBe(400);
    expect((await pay({ amount: 1e13 })).status).toBe(400);
    expect((await api('admin', 'PUT', `/api/sales/${saleId}`, { saleDate: '2019-12-31' })).status).toBe(400);
    expect((await api('admin', 'PUT', `/api/sales/${saleId}`, { saleDate: future })).status).toBe(400);
    expect((await api('admin', 'PUT', `/api/sales/${saleId}`, { note: 'x'.repeat(501) })).status).toBe(400);
    expect((await api('admin', 'PUT', `/api/sales/${saleId}`, { buyerName: 'x'.repeat(201) })).status).toBe(400);
    expect(await balances()).toEqual(before);
    const ok2 = await pay({ amount: 1000.4 });
    expect(ok2.status).toBe(200);
    expect(ok2.data.sale).toMatchObject({ receivedAmount: 1_501_000, debtRemainder: 499_000 });
    await expectSaleConsistent(saleId);
  });

  it("sotuvni tahrirlash: xato so'rov xaridor yaratmaydi; xaridor almashsa kredit nazorati (403 → kod bilan o'tadi)", async () => {
    const id = await mkDeal(1_000_000);
    const created = await api('admin', 'POST', '/api/sales', {
      dealIds: [id], totalPrice: 2_000_000, buyerName: buyer('tahrir'), paidAmount: 1_000_000, paymentType: 'CASH', saleDate: DAY,
    });
    expect(created.status).toBe(201);
    const saleId = created.data.sale.id;
    const put = (body: Record<string, unknown>) => api('seller', 'PUT', `/api/sales/${saleId}`, body);

    // Tekshiruvdan o'tmagan so'rov "yetim" xaridor qoldirmaydi
    expect((await put({ buyerName: buyer('yetim'), totalPrice: 0 })).status).toBe(400);
    expect((await put({ buyerName: buyer('yetim'), totalPrice: 999_999 })).status).toBe(400);
    expect((await put({ buyerName: buyer('yetim'), saleDate: 'sana-emas' })).status).toBe(400);
    expect(await prisma.buyer.count({ where: { name: buyer('yetim') } })).toBe(0);

    // Qarzi bor xaridorga o'tkazish — POST bilan bir xil 403
    const debtor = buyer('asosiy2');
    const blocked = await put({ buyerName: debtor });
    expect(blocked.status).toBe(403);
    expect(blocked.data.requiresOverride).toBe(true);
    expect(blocked.data.totalExistingDebt).toBe(5_000_000);
    expect(blocked.data.existingDebt).toBe(5_000_000);
    expect(Object.keys(blocked.data).sort()).toEqual(['error', 'existingDebt', 'requiresOverride', 'totalExistingDebt']);
    expect((await put({ buyerName: debtor, adminOverrideCode: `${TAG}-xato-kod` })).status).toBe(403);
    expect((await prisma.sale.findUnique({ where: { id: saleId }, include: { buyer: true } }))?.buyer.name).toBe(buyer('tahrir'));

    // O'z qarzi hisobga olinmaydi: boshqa qarzi yo'q xaridorda narx (qarz) oshishi bloklanmaydi; izoh tahriri ham
    const raised = await put({ totalPrice: 2_500_000, note: 'narx oshdi' });
    expect(raised.status).toBe(200);
    expect(raised.data.sale).toMatchObject({ totalPrice: 2_500_000, debtRemainder: 1_500_000, buyerName: buyer('tahrir') });
    // Yangi (qarzsiz) xaridorga o'tkazish — xaridor tranzaksiya ichida yaratiladi
    const moved = await put({ buyerName: buyer('yangi') });
    expect(moved.status).toBe(200);
    expect(moved.data.sale.buyerName).toBe(buyer('yangi'));
    expect(await prisma.buyer.count({ where: { name: buyer('yangi') } })).toBe(1);

    // Administrator kodi bilan o'tadi
    const prev = process.env.ADMIN_OVERRIDE_CODE;
    process.env.ADMIN_OVERRIDE_CODE = `${TAG}-kod`;
    try {
      const okd = await put({ buyerName: debtor, adminOverrideCode: `${TAG}-kod` });
      expect(okd.status).toBe(200);
      expect(okd.data.sale.buyerName).toBe(debtor);
      // Endi shu xaridorda qarz oshishi ham kod talab qiladi (boshqa sotuvdagi qarzi bor)
      expect((await put({ totalPrice: 3_000_000 })).status).toBe(403);
      expect((await put({ totalPrice: 3_000_000, adminOverrideCode: `${TAG}-kod` })).status).toBe(200);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_OVERRIDE_CODE;
      else process.env.ADMIN_OVERRIDE_CODE = prev;
    }
    // Qarz kamayishi / o'zgarmasligi kod talab qilmaydi
    expect((await put({ totalPrice: 2_800_000 })).status).toBe(200);
    await expectSaleConsistent(saleId);
    expect((await api('admin', 'POST', `/api/sales/${saleId}/return`, {})).status).toBe(200);
  });

  it("qarzdorlar (OPERATOR): birovning bitimi aralashgan sotuv qatori ko'rinmaydi va jami qarzga kirmaydi", async () => {
    const mine1 = await mkDeal(1_000_000, { createdById: users.operator.id });
    const mine2 = await mkDeal(1_000_000, { createdById: users.operator.id });
    const foreign = await mkDeal(1_000_000);
    const mixed = await api('admin', 'POST', '/api/sales', {
      dealIds: [mine1, foreign], totalPrice: 4_000_000, buyerName: buyer('aralash'), paidAmount: 0, paymentType: 'DEBT', saleDate: DAY,
    });
    const own = await api('admin', 'POST', '/api/sales', {
      dealIds: [mine2], totalPrice: 1_500_000, buyerName: buyer('operator_ozi'), paidAmount: 0, paymentType: 'DEBT', saleDate: DAY,
    });
    expect([mixed.status, own.status]).toEqual([201, 201]);

    const op = await api('operator', 'GET', `/api/debtors?search=${TAG}_xaridor&limit=1000`);
    expect(op.status).toBe(200);
    const rows: any[] = op.data.items;
    expect(rows.some((x) => x.saleId === mixed.data.sale.id)).toBe(false);
    expect(rows.filter((x) => x.saleId === own.data.sale.id)).toHaveLength(1);
    // Operator faqat o'z bitimlaridan tuzilgan qatorlarni ko'radi
    expect(rows.every((x) => x.kind !== 'SALE' || x.items.every((i: any) => [mine1, mine2].includes(i.dealId)))).toBe(true);
    expect(op.data.totalDebtSum).toBe(sum(rows.map((x) => x.debtRemainder)));
    expect(op.data.totalDebtSum).toBe(1_500_000);
    expect(op.data.pagination.total).toBe(rows.length);

    // Cheklanmagan rol ikkalasini ham ko'radi
    const adm = await api('admin', 'GET', `/api/debtors?search=${TAG}_xaridor&limit=1000`);
    expect(adm.data.items.some((x: any) => x.saleId === mixed.data.sale.id)).toBe(true);
    expect(adm.data.items.some((x: any) => x.saleId === own.data.sale.id)).toBe(true);
  });

  it("eski sotish (PUT /inventory/:id/sell) va yangi sotuv bir vaqtda — aynan bittasi o'tadi, sotuv ustidan yozilmaydi", async () => {
    for (let i = 0; i < 4; i++) {
      const id = await mkDeal(1_000_000);
      const [modern, legacy] = await Promise.all([
        api('admin', 'POST', '/api/sales', {
          dealIds: [id], totalPrice: 2_000_000, buyerName: buyer(`poyga_yangi_${i}`), paidAmount: 0, paymentType: 'DEBT', saleDate: DAY,
        }),
        api('seller', 'PUT', `/api/inventory/${id}/sell`, {
          salePrice: 1_700_000, buyerName: buyer(`poyga_eski_${i}`), paidAmount: 0, paymentType: 'DEBT', saleDate: DAY,
        }),
      ]);
      expect([modern.status, legacy.status].sort()).toEqual(modern.status === 201 ? [201, 409] : [200, 409]);
      const deal = await prisma.deal.findUnique({ where: { id } });
      if (modern.status === 201) {
        expect(deal?.saleId).toBe(modern.data.sale.id);
        expect(num(deal!.salePrice)).toBe(2_000_000);
        await expectSaleConsistent(modern.data.sale.id);
      } else {
        expect(deal?.saleId).toBeNull();
        expect(num(deal!.salePrice)).toBe(1_700_000);
        expect(await prisma.sale.count({ where: { buyer: { name: buyer(`poyga_yangi_${i}`) } } })).toBe(0);
      }
    }
  });

  it('tozalash: barcha sotuvlar qaytarilgach hisob qoldiqlari boshlang\'ich holatga qaytadi', async () => {
    const userIds = Object.values(users).map((u) => u.id);
    const sales = await prisma.sale.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
    expect(sales.length).toBeGreaterThan(0);
    for (const s of sales) {
      const r = await api('admin', 'POST', `/api/sales/${s.id}/return`, {});
      expect(r.status).toBe(200);
      expect(r.data.sale).toBeNull();
    }
    expect(await prisma.sale.count({ where: { createdById: { in: userIds } } })).toBe(0);
    expect(await prisma.ddsTransaction.count({ where: { source: 'SALE_PAYMENT', createdById: { in: userIds } } })).toBe(0);
    const main = await dealsOf(mainDeals);
    expect(main.every((d) => d.status === 'IN_WAREHOUSE' && d.saleId === null && num(d.salePrice) === 0)).toBe(true);

    // Eski route orqali yozilgan DDS (sotuv tushumi va qarz to'lovi) ham yadro orqali o'chiriladi
    const txs = await prisma.ddsTransaction.findMany({ where: { createdById: { in: userIds } }, select: { id: true } });
    expect(txs).toHaveLength(2);
    for (const t of txs) await ledger.deleteDds(t.id);
    expect(await balances()).toEqual(initial);
  });
});
