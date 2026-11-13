/**
 * Chek xarajatlarini DDS'ga ommaviy ko'chirish (preview / apply) — INTEGRATSION test.
 *
 * DIQQAT: haqiqiy bazaga yozadi, shuning uchun FAQAT lokal bazada ishlaydi
 * (DATABASE_URL va DATABASE_URL_UNPOOLED — localhost). Aks holda butun to'plam o'tkazib yuboriladi (skip).
 * Sinov bitimlari alohida, haqiqiy ma'lumot bilan kesishmaydigan kunda (2001-04-05) yaratiladi;
 * oxirida DDS yozuvlari ledger.deleteDds orqali o'chiriladi va hisob qoldiqlari boshlang'ich holatga qaytadi.
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
      username: 'check_test',
      fullName: 'Check Test',
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
import { deleteDds, getAccountBalances } from '../src/services/ledger.service';
import ddsRoutes from '../src/routes/dds.routes';

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
const TAG = `zz_chk_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
// Sinov bitimlari uchun alohida kun (boshqa test fayllari 2001-02-03 ni ishlatadi)
const DAY = '2001-04-05';
const DEAL_DATE = new Date(`${DAY}T09:30:00+05:00`);
const NUM_BASE = 1_900_000_000 + Math.floor(Math.random() * 100_000) * 10;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

describe.skipIf(!LOCAL)("Chek xarajatlarini DDS'ga ommaviy ko'chirish (faqat lokal baza)", () => {
  let server: http.Server;
  let baseUrl = '';
  let adminId = '';
  let balancesBefore: Record<string, number>;
  let ddsCountBefore = 0;
  const created = { stores: [] as string[], providers: [] as string[], deals: [] as string[] };
  let normal: { id: string; dealNumber: number };
  let qodir: { id: string; dealNumber: number };
  let pendingDeal: { id: string; dealNumber: number };

  const api = async (method: string, path: string, role: string | null, body?: unknown) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (role) headers['x-test-role'] = role;
    if (adminId) headers['x-test-user-id'] = adminId;
    const res = await fetch(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json: any = await res.json().catch(() => null);
    return { status: res.status, body: json };
  };

  const previewUrl = `/api/dds/check-expenses/preview?from=${DAY}&to=${DAY}`;

  beforeAll(async () => {
    // Shu kunda oldingi (uzilib qolgan) sinovdan qolgan bitim bo'lmasligi kerak — aks holda apply ularga ham yozardi
    const stale = await prisma.deal.count({
      where: { date: { gte: new Date(`${DAY}T00:00:00+05:00`), lte: new Date(`${DAY}T23:59:59.999+05:00`) } },
    });
    if (stale > 0) throw new Error(`${DAY} sanasida ${stale} ta bitim bor — sinov kuni bo'sh bo'lishi kerak`);

    balancesBefore = (await getAccountBalances()) as Record<string, number>;
    ddsCountBefore = await prisma.ddsTransaction.count();

    const admin = await prisma.user.create({
      data: { username: `${TAG}_admin`, fullName: 'Test chek admin', passwordHash: 'x', role: 'ADMIN' },
    });
    adminId = admin.id;

    const store = await prisma.store.create({ data: { name: `${TAG}_store` } });
    created.stores.push(store.id);
    const provider = await prisma.provider.create({ data: { name: `${TAG}_provider` } });
    created.providers.push(provider.id);
    let qodirStore = await prisma.store.findUnique({ where: { name: 'Qodir aka' } });
    if (!qodirStore) {
      qodirStore = await prisma.store.create({ data: { name: 'Qodir aka' } });
      created.stores.push(qodirStore.id);
    }

    const mkDeal = async (offset: number, storeId: string, calculatedAmount: number, approvalStatus: 'APPROVED' | 'PENDING_APPROVAL') => {
      const d = await prisma.deal.create({
        data: {
          dealNumber: NUM_BASE + offset,
          date: DEAL_DATE,
          createdById: admin.id,
          sellerName: `${TAG}_sotuvchi`,
          providerId: provider.id,
          storeId,
          customerName: `${TAG}_mijoz_${offset}`,
          withdrawnLimit: 5_000_000,
          calculatedAmount,
          approvalStatus,
        },
      });
      created.deals.push(d.id);
      return { id: d.id, dealNumber: d.dealNumber };
    };
    normal = await mkDeal(1, store.id, 3_500_000, 'APPROVED');
    qodir = await mkDeal(2, qodirStore.id, 2_000_000, 'APPROVED');
    pendingDeal = await mkDeal(3, store.id, 1_250_000, 'PENDING_APPROVAL');

    const app = express();
    app.use(express.json());
    app.use('/api/dds', ddsRoutes);
    server = app.listen(0, '127.0.0.1'); // tasodifiy bo'sh port
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    try {
      // DDS yozuvlari yadro orqali o'chiriladi — hisob qoldiqlari ham orqaga qaytadi
      const txs = await prisma.ddsTransaction.findMany({
        where: { OR: [{ dealId: { in: created.deals } }, ...(adminId ? [{ createdById: adminId }] : [])] },
        select: { id: true },
      });
      for (const t of txs) await deleteDds(t.id);
      await prisma.deal.deleteMany({ where: { id: { in: created.deals } } });
      if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
      await prisma.store.deleteMany({ where: { id: { in: created.stores } } });
      await prisma.provider.deleteMany({ where: { id: { in: created.providers } } });

      if (balancesBefore) {
        const now = (await getAccountBalances()) as Record<string, number>;
        for (const key of ['CASH', 'BANK_CARD', 'SETTLEMENT_ACCOUNT', 'total']) {
          expect(now[key], `hisob qoldig'i: ${key}`).toBeCloseTo(balancesBefore[key], 2);
        }
        expect(await prisma.ddsTransaction.count()).toBe(ddsCountBefore);
      }
    } finally {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      await prisma.$disconnect();
    }
  });

  it('ADMIN bo\'lmagan rol → 403, tokensiz → 401; hech narsa yozilmaydi', async () => {
    for (const role of ['MANAGER', 'CFO', 'CASHIER', 'OPERATOR', 'AGENT', 'VIEWER']) {
      expect((await api('GET', previewUrl, role)).status, role).toBe(403);
      expect((await api('POST', '/api/dds/check-expenses/apply', role, { from: DAY, to: DAY })).status, role).toBe(403);
    }
    expect((await api('GET', previewUrl, null)).status).toBe(401);
    expect(await prisma.ddsTransaction.count({ where: { dealId: { in: created.deals } } })).toBe(0);
  });

  it("from majburiy va YYYY-MM-DD bo'lishi shart; noto'g'ri hisob turi → 400", async () => {
    for (const q of ['', '?from=10.11.2026', '?from=2026-13-40', '?from=abc', `?from=${DAY}&to=05.04.2001`, `?from=${DAY}&to=2001-04-04`]) {
      const r = await api('GET', `/api/dds/check-expenses/preview${q}`, 'ADMIN');
      expect(r.status, q).toBe(400);
      expect(typeof r.body.error).toBe('string');
    }
    expect((await api('POST', '/api/dds/check-expenses/apply', 'ADMIN', {})).status).toBe(400);
    expect((await api('POST', '/api/dds/check-expenses/apply', 'ADMIN', { from: DAY, to: DAY, account: 'KASSA' })).status).toBe(400);
    expect(await prisma.ddsTransaction.count({ where: { dealId: { in: created.deals } } })).toBe(0);
  });

  it("preview: tasdiqlangan oddiy bitim ro'yxatda; Qodir aka — qodirSkipped da; tasdiqlanmagan bitim yo'q", async () => {
    const r = await api('GET', previewUrl, 'ADMIN');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ from: DAY, to: DAY, count: 1, total: 3_500_000 });
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0]).toMatchObject({
      dealId: normal.id,
      dealNumber: normal.dealNumber,
      dateLabel: '05.04.2001 09:30',
      customerName: `${TAG}_mijoz_1`,
      storeName: `${TAG}_store`,
      amount: 3_500_000,
    });
    expect(new Date(r.body.items[0].date).getTime()).toBe(DEAL_DATE.getTime());
    expect(r.body.qodirSkipped).toEqual({ count: 1, total: 2_000_000 });
    expect(r.body.zeroSkipped).toEqual({ count: 0 });
    const ids = r.body.items.map((i: any) => i.dealId);
    expect(ids).not.toContain(qodir.id);
    expect(ids).not.toContain(pendingDeal.id);
    // preview hech narsa yozmaydi
    expect(await prisma.ddsTransaction.count({ where: { dealId: { in: created.deals } } })).toBe(0);
  });

  it("apply: bitim sanasi bilan DDS chiqimi yoziladi, hisob qoldig'i kamayadi; Qodir aka va tasdiqlanmagan bitim yozilmaydi", async () => {
    const r = await api('POST', '/api/dds/check-expenses/apply', 'ADMIN', { from: DAY, to: DAY, account: 'BANK_CARD' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, created: 1, skipped: 0, total: 3_500_000, failed: [] });
    expect(r.body.balances.BANK_CARD).toBeCloseTo(balancesBefore.BANK_CARD - 3_500_000, 2);
    expect(r.body.balances.CASH).toBeCloseTo(balancesBefore.CASH, 2);

    const rows = await prisma.ddsTransaction.findMany({ where: { dealId: { in: created.deals } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dealId: normal.id,
      source: 'DEAL_CHECK',
      type: 'EXPENSE',
      expenseType: 'COGS',
      account: 'BANK_CARD',
      createdById: adminId,
    });
    expect(Number(rows[0].amount)).toBe(3_500_000);
    // Egasining qarori: DDS yozuvi bugungi sana bilan emas, BITIM sanasi bilan
    expect(rows[0].dateTime.getTime()).toBe(DEAL_DATE.getTime());

    expect(await prisma.ddsTransaction.count({ where: { dealId: qodir.id } })).toBe(0);
    expect(await prisma.ddsTransaction.count({ where: { dealId: pendingDeal.id } })).toBe(0);

    // Yozilgan bitim preview'dan chiqadi, Qodir aka hanuz o'tkazib yuborilganlar orasida
    const after = await api('GET', previewUrl, 'ADMIN');
    expect(after.body).toMatchObject({ count: 0, total: 0, items: [], qodirSkipped: { count: 1, total: 2_000_000 } });
  });

  it("apply ikkinchi marta: hech narsa yozilmaydi (idempotent), qoldiq o'zgarmaydi", async () => {
    const r = await api('POST', '/api/dds/check-expenses/apply', 'ADMIN', { from: DAY, to: DAY, account: 'BANK_CARD' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, created: 0, skipped: 0, total: 0, failed: [] });
    expect(r.body.balances.BANK_CARD).toBeCloseTo(balancesBefore.BANK_CARD - 3_500_000, 2);
    expect(await prisma.ddsTransaction.count({ where: { dealId: { in: created.deals } } })).toBe(1);
  });
});
