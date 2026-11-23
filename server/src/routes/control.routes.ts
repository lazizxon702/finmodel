/**
 * Nazorat bo'limi (egasi, 23.11.2026):
 *   GET  /api/control/awaiting-goods                 — 7-blok: do'konlar bo'yicha tovar kutayotgan cheklar va bizning foyda
 *   GET  /api/control/registrator-errors?month=YYYY-MM — 6-blok: registratorlar xatolari (rad etilgan / tasdiqdan keyin tuzatilgan)
 *   GET  /api/control/pairs                          — 2-blok: ruxsat etilgan "do'kon — provayder" juftliklari + 01.11 dan cheklardagi juftliklar
 *   POST /api/control/pairs { pairs: [{storeId, providerId}] }  — qo'shish (ADMIN)
 *   DELETE /api/control/pairs/:id                    — o'chirish (ADMIN)
 *   POST /api/control/pairs/check { enabled }        — tekshiruvni yoqish/o'chirish (ADMIN)
 */
import { Router, Response } from 'express';
import { DealStatus, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { STALE_DEAL_DAYS, isStaleDeal, tashkentDayRange } from '../services/calculation.service';
import { STORE_PROVIDER_CHECK_KEY, collectDealImeis, isStoreProviderCheckOn } from '../services/dealChecks.service';
import { type OurDeal, matchStatement, parseStatement, toStatementRows } from '../services/reconciliation.service';

const router = Router();
const VIEW_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.CFO, Role.COO, Role.VIEWER];
const n = (v: unknown) => Number(v) || 0;
const DAY_MS = 86_400_000;

// ─────────────── 7-blok: kimdan tovar kutyapmiz va foydamiz ───────────────
router.get('/awaiting-goods', authenticateToken, requireRoles(VIEW_ROLES), async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const deals = await prisma.deal.findMany({
      where: { approvalStatus: 'APPROVED', status: { in: [DealStatus.PENDING, DealStatus.NEED_TO_BUY] } },
      orderBy: { date: 'asc' },
      select: {
        id: true, dealNumber: true, date: true, status: true, productName: true, customerName: true,
        withdrawnLimit: true, calculatedAmount: true, profit: true,
        store: { select: { id: true, name: true } }, provider: { select: { name: true } },
      },
    });
    const byStore = new Map<string, any>();
    for (const d of deals) {
      const key = d.store?.id || '-';
      const g = byStore.get(key) || { storeId: key, storeName: d.store?.name || '—', count: 0, staleCount: 0, withdrawnLimit: 0, calculatedAmount: 0, profit: 0, oldestDate: d.date, deals: [] as any[] };
      const stale = isStaleDeal(d.status, d.date, now);
      g.count++;
      if (stale) g.staleCount++;
      g.withdrawnLimit += n(d.withdrawnLimit);
      g.calculatedAmount += n(d.calculatedAmount);
      g.profit += n(d.profit);
      g.deals.push({
        id: d.id, dealNumber: d.dealNumber, date: d.date, days: Math.floor((now.getTime() - d.date.getTime()) / DAY_MS),
        status: d.status, stale, productName: d.productName, customerName: d.customerName, providerName: d.provider?.name || null,
        withdrawnLimit: n(d.withdrawnLimit), calculatedAmount: n(d.calculatedAmount), profit: n(d.profit),
      });
      byStore.set(key, g);
    }
    const stores = [...byStore.values()]
      .map((g) => ({ ...g, deals: g.deals.sort((a: any, b: any) => Number(b.stale) - Number(a.stale) || b.days - a.days) }))
      // kechikkan cheki bor do'konlar tepada, keyin eng uzoq kutayotgan
      .sort((a, b) => b.staleCount - a.staleCount || new Date(a.oldestDate).getTime() - new Date(b.oldestDate).getTime());
    const totals = stores.reduce(
      (t, g) => ({ count: t.count + g.count, staleCount: t.staleCount + g.staleCount, withdrawnLimit: t.withdrawnLimit + g.withdrawnLimit, calculatedAmount: t.calculatedAmount + g.calculatedAmount, profit: t.profit + g.profit }),
      { count: 0, staleCount: 0, withdrawnLimit: 0, calculatedAmount: 0, profit: 0 }
    );
    return res.json({ staleDays: STALE_DEAL_DAYS, totals, stores });
  } catch (error: any) {
    console.error('awaiting-goods:', error);
    return res.status(500).json({ error: 'Hisobotni olishda xatolik' });
  }
});

// ─────────────── 6-blok: registratorlar xatolari ───────────────
/** "YYYY-MM" → shu oyning Toshkent bo'yicha boshlanishi va oxiri */
function monthRange(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const r = tashkentDayRange(`${m[1]}-${m[2]}-01`, `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`);
  return r.start && r.end ? { start: r.start, end: r.end } : null;
}

router.get('/registrator-errors', authenticateToken, requireRoles(VIEW_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const month = String(req.query.month || '').trim() || new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 7);
    const range = monthRange(month);
    if (!range) return res.status(400).json({ error: "Oy noto'g'ri (YYYY-MM)" });
    const [registrators, deals] = await Promise.all([
      prisma.user.findMany({ where: { role: Role.REGISTRATURA }, select: { id: true, fullName: true, isActive: true }, orderBy: { fullName: 'asc' } }),
      prisma.deal.findMany({
        where: { registratorId: { not: null }, date: { gte: range.start, lte: range.end } },
        select: { id: true, dealNumber: true, registratorId: true, approvalStatus: true },
      }),
    ]);
    const ids = deals.map((d) => d.id);
    const logs = ids.length
      ? await prisma.auditLog.findMany({ where: { entity: 'Deal', entityId: { in: ids }, action: { in: ['REJECT', 'UPDATE'] } }, select: { entityId: true, action: true, newValues: true } })
      : [];
    const rejected = new Set<string>();
    const fixed = new Set<string>();
    for (const l of logs) {
      if (l.action === 'REJECT') rejected.add(l.entityId);
      if (l.action === 'UPDATE' && (l.newValues as any)?._inputError === true) fixed.add(l.entityId);
    }
    for (const d of deals) if (d.approvalStatus === 'REJECTED') rejected.add(d.id);

    const rows = registrators.map((r) => {
      const mine = deals.filter((d) => d.registratorId === r.id);
      const errDeals = mine.filter((d) => rejected.has(d.id) || fixed.has(d.id));
      return {
        id: r.id,
        fullName: r.fullName,
        isActive: r.isActive,
        total: mine.length,
        rejected: mine.filter((d) => rejected.has(d.id)).length,
        fixedAfterApproval: mine.filter((d) => fixed.has(d.id)).length,
        errors: errDeals.length,
        errorPct: mine.length ? Math.round((errDeals.length / mine.length) * 1000) / 10 : 0,
        errorDeals: errDeals.map((d) => d.dealNumber).sort((a, b) => a - b),
      };
    });
    return res.json({ month, rows: rows.filter((r) => r.total > 0 || r.isActive).sort((a, b) => b.errorPct - a.errorPct || b.total - a.total) });
  } catch (error: any) {
    console.error('registrator-errors:', error);
    return res.status(500).json({ error: 'Statistikani olishda xatolik' });
  }
});

// ─────────────── 2-blok: do'kon — provayder juftliklari ───────────────
router.get('/pairs', authenticateToken, requireRoles(VIEW_ROLES), async (_req: AuthRequest, res: Response) => {
  try {
    const [pairs, enabled, used] = await Promise.all([
      prisma.storeProviderPair.findMany({ include: { store: { select: { name: true } }, provider: { select: { name: true } } } }),
      isStoreProviderCheckOn(),
      // Boshlang'ich ro'yxat uchun: 01.11.2026 dan tasdiqlangan cheklardagi juftliklar
      prisma.deal.groupBy({
        by: ['storeId', 'providerId'],
        where: { approvalStatus: 'APPROVED', date: { gte: new Date('2026-11-01T00:00:00+05:00') } },
        _count: { _all: true },
        _min: { date: true },
        _max: { date: true },
      }),
    ]);
    const [stores, providers] = await Promise.all([
      prisma.store.findMany({ select: { id: true, name: true } }),
      prisma.provider.findMany({ select: { id: true, name: true } }),
    ]);
    const sName = new Map(stores.map((s) => [s.id, s.name]));
    const pName = new Map(providers.map((p) => [p.id, p.name]));
    const allowed = new Set(pairs.map((p) => `${p.storeId}|${p.providerId}`));
    return res.json({
      enabled,
      pairs: pairs
        .map((p) => ({ id: p.id, storeId: p.storeId, providerId: p.providerId, storeName: p.store.name, providerName: p.provider.name }))
        .sort((a, b) => a.storeName.localeCompare(b.storeName) || a.providerName.localeCompare(b.providerName)),
      fromDeals: used
        .map((u) => ({
          storeId: u.storeId, providerId: u.providerId, storeName: sName.get(u.storeId) || '—', providerName: pName.get(u.providerId) || '—',
          count: u._count._all, firstDate: u._min.date, lastDate: u._max.date, allowed: allowed.has(`${u.storeId}|${u.providerId}`),
        }))
        .sort((a, b) => a.storeName.localeCompare(b.storeName) || b.count - a.count),
    });
  } catch (error: any) {
    console.error('pairs:', error);
    return res.status(500).json({ error: 'Juftliklarni olishda xatolik' });
  }
});

router.post('/pairs', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const list = Array.isArray(req.body?.pairs) ? req.body.pairs : [];
    const clean = list
      .map((p: any) => ({ storeId: String(p?.storeId || ''), providerId: String(p?.providerId || '') }))
      .filter((p: any) => p.storeId && p.providerId);
    if (!clean.length) return res.status(400).json({ error: 'Juftlik tanlanmagan' });
    const r = await prisma.storeProviderPair.createMany({
      data: clean.map((p: any) => ({ ...p, createdById: req.user!.id })),
      skipDuplicates: true,
    });
    return res.status(201).json({ added: r.count });
  } catch (error: any) {
    console.error('pairs add:', error);
    return res.status(400).json({ error: "Juftlikni qo'shib bo'lmadi (do'kon yoki provayder topilmadi)" });
  }
});

router.delete('/pairs/:id', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    await prisma.storeProviderPair.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch {
    return res.status(404).json({ error: 'Juftlik topilmadi' });
  }
});

router.post('/pairs/check', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled === true;
    if (enabled && (await prisma.storeProviderPair.count()) === 0) {
      return res.status(400).json({ error: "Avval ruxsat etilgan juftliklarni qo'shing — aks holda hech bir chek saqlanmaydi" });
    }
    await prisma.appSetting.upsert({
      where: { key: STORE_PROVIDER_CHECK_KEY },
      update: { value: enabled ? 'on' : 'off' },
      create: { key: STORE_PROVIDER_CHECK_KEY, value: enabled ? 'on' : 'off', description: "Do'kon — provayder juftligi tekshiruvi" },
    });
    return res.json({ enabled });
  } catch (error: any) {
    console.error('pairs check:', error);
    return res.status(500).json({ error: 'Sozlamani saqlab bo\'lmadi' });
  }
});

// ─────────────── 9-blok: provayder bilan sverka akti ───────────────
const RECON_ROLES: Role[] = [Role.ADMIN, Role.CFO, Role.MANAGER];
const RECON_MAX_BYTES = 8 * 1024 * 1024;
const decodeFile = (b64: unknown) => Buffer.from(String(b64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64');

// POST /api/control/recon/parse { fileName, dataBase64 } — Excel/CSV vipiskani o'qib, sarlavhalar va ustun taxminini qaytaradi
router.post('/recon/parse', authenticateToken, requireRoles(RECON_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const data = decodeFile(req.body?.dataBase64);
    if (!data.length) return res.status(400).json({ error: "Fayl bo'sh" });
    if (data.length > RECON_MAX_BYTES) return res.status(400).json({ error: "Fayl 8 MB dan katta bo'lmasin" });
    const parsed = await parseStatement(String(req.body?.fileName || ''), data);
    return res.json({ headers: parsed.headers, sample: parsed.rows.slice(0, 5), rowCount: parsed.rows.length, guess: parsed.guess });
  } catch (error: any) {
    return res.status(400).json({ error: "Faylni o'qib bo'lmadi — Excel (.xlsx) yoki CSV yuklang" });
  }
});

// POST /api/control/recon { providerId, startDate, endDate, providerTotal?, note?, file?: {fileName, mimeType, dataBase64}, mapping? }
router.post('/recon', authenticateToken, requireRoles(RECON_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body || {};
    const provider = b.providerId ? await prisma.provider.findUnique({ where: { id: String(b.providerId) } }) : null;
    if (!provider) return res.status(400).json({ error: 'Provayder tanlanmagan' });
    const { start, end } = tashkentDayRange(String(b.startDate || ''), String(b.endDate || ''));
    if (!start || !end || start > end) return res.status(400).json({ error: "Davr noto'g'ri" });

    const deals = await prisma.deal.findMany({
      where: { providerId: provider.id, approvalStatus: 'APPROVED', date: { gte: start, lte: end } },
      select: { id: true, dealNumber: true, date: true, withdrawnLimit: true, contractNumber: true, imeiBarcode: true, imei2: true, customerName: true, items: { select: { imei1: true, imei2: true } } },
      orderBy: { date: 'asc' },
    });
    const ours: OurDeal[] = deals.map((d) => ({
      id: d.id, dealNumber: d.dealNumber, date: d.date, amount: n(d.withdrawnLimit), contractNumber: d.contractNumber,
      imeis: collectDealImeis(d), customerName: d.customerName,
    }));
    const ourTotal = ours.reduce((s, d) => s + d.amount, 0);

    let file: { name: string; mime: string; data: Buffer } | null = null;
    if (b.file?.dataBase64) {
      const data = decodeFile(b.file.dataBase64);
      if (data.length > RECON_MAX_BYTES) return res.status(400).json({ error: "Fayl 8 MB dan katta bo'lmasin" });
      file = { name: String(b.file.fileName || 'vipiska').slice(0, 200), mime: String(b.file.mimeType || 'application/octet-stream'), data };
    }

    // Vipiska (Excel/CSV) + ustunlar tanlangan bo'lsa — qatorma-qator solishtirish; aks holda faqat jami summa
    let comparison: ReturnType<typeof matchStatement> | null = null;
    let statementTotal: number | null = null;
    const isSheet = file && /\.(xlsx|csv|txt)$/i.test(file.name);
    if (isSheet && b.mapping && b.mapping.amount !== undefined) {
      const parsed = await parseStatement(file!.name, file!.data);
      const rows = toStatementRows(parsed.rows, b.mapping);
      statementTotal = rows.reduce((s, r) => s + (r.amount || 0), 0);
      comparison = matchStatement(rows, ours);
    }
    const manualTotal = b.providerTotal !== undefined && b.providerTotal !== null && b.providerTotal !== '' ? Number(b.providerTotal) : null;
    if (manualTotal !== null && !(manualTotal >= 0)) return res.status(400).json({ error: "Provayder summasi noto'g'ri" });
    const providerTotal = manualTotal ?? statementTotal;
    if (providerTotal === null) return res.status(400).json({ error: 'Provayder summasini kiriting yoki vipiska yuklang' });

    const result = {
      ourDeals: ours.map((d) => ({ dealId: d.id, dealNumber: d.dealNumber, date: d.date, amount: d.amount, contractNumber: d.contractNumber, customerName: d.customerName })),
      statementTotal,
      diff: Math.round((providerTotal - ourTotal) * 100) / 100,
      ...(comparison || {}),
      compared: !!comparison,
    };
    const act = await prisma.reconciliationAct.create({
      data: {
        providerId: provider.id, periodStart: start, periodEnd: end, providerTotal, ourTotal, ourCount: ours.length,
        fileName: file?.name || null, mimeType: file?.mime || null, fileData: file?.data || null,
        result: JSON.parse(JSON.stringify(result)), note: b.note ? String(b.note).slice(0, 1000) : null, createdById: req.user!.id,
      },
      select: { id: true },
    });
    return res.status(201).json({ id: act.id, providerName: provider.name, providerTotal, ourTotal, ourCount: ours.length, result });
  } catch (error: any) {
    console.error('recon:', error);
    return res.status(500).json({ error: 'Sverka qilishda xatolik' });
  }
});

// GET /api/control/recon — sverka aktlari ro'yxati
router.get('/recon', authenticateToken, requireRoles(RECON_ROLES), async (_req: AuthRequest, res: Response) => {
  const list = await prisma.reconciliationAct.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, periodStart: true, periodEnd: true, providerTotal: true, ourTotal: true, ourCount: true, fileName: true, note: true, createdAt: true, provider: { select: { name: true } } },
  });
  return res.json(list.map((a) => ({ ...a, providerName: a.provider.name, providerTotal: a.providerTotal === null ? null : n(a.providerTotal), ourTotal: n(a.ourTotal) })));
});

// GET /api/control/recon/:id — bitta akt natijasi bilan
router.get('/recon/:id', authenticateToken, requireRoles(RECON_ROLES), async (req: AuthRequest, res: Response) => {
  const a = await prisma.reconciliationAct.findUnique({
    where: { id: req.params.id },
    select: { id: true, periodStart: true, periodEnd: true, providerTotal: true, ourTotal: true, ourCount: true, fileName: true, note: true, result: true, createdAt: true, provider: { select: { name: true } } },
  });
  if (!a) return res.status(404).json({ error: 'Akt topilmadi' });
  return res.json({ ...a, providerName: a.provider.name, providerTotal: a.providerTotal === null ? null : n(a.providerTotal), ourTotal: n(a.ourTotal) });
});

// GET /api/control/recon/:id/file — biriktirilgan vipiska/skrin
router.get('/recon/:id/file', authenticateToken, requireRoles(RECON_ROLES), async (req: AuthRequest, res: Response) => {
  const a = await prisma.reconciliationAct.findUnique({ where: { id: req.params.id }, select: { fileName: true, mimeType: true, fileData: true } });
  if (!a?.fileData) return res.status(404).json({ error: 'Fayl yo\'q' });
  res.setHeader('Content-Type', a.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.fileName || 'fayl')}"`);
  return res.send(Buffer.from(a.fileData));
});

export default router;
