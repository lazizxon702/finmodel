import { Router, Response } from 'express';
import { DealStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticateToken, requireRoles, AuthRequest } from '../middleware/auth.middleware';
import { emitRealtime } from '../lib/realtime';
import {
  daftarDealResult,
  daftarSpent,
  daftarStage,
  formatTashkentDateTime,
  isDaftarDeal,
  summarizeDaftar,
  tashkentDayRange,
} from '../services/calculation.service';
import { computeDealProfitForStatus } from '../services/sale.service';

/**
 * Daftar hisoboti. Daftar = provayder Imanium VA do'kon Denov yoki Jizzax (isDaftarDeal).
 * Qodir aka bilan hisob-kitob bunga KIRMAYDI — u alohida (/api/store-reports/qodir).
 *
 *   GET  /api/daftar-reports?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *        Javob: { period, daftars: [{ storeId, name, summary, deals[] }], totals }   (faqat tasdiqlangan cheklar)
 *   POST /api/daftar-reports/:dealId/money-received            — 2-bosqich: ilovada pul tushgani tekshirildi
 *   POST /api/daftar-reports/:dealId/device-purchased {amount} — 3-bosqich: qurilma olindi, narxi QO'LDA kiritiladi
 *   POST /api/daftar-reports/:dealId/back                      — xato bosilgan bosqichni bir qadam orqaga qaytarish
 *   4-bosqich (sotildi) — mavjud Sotuv bo'limi orqali (sotuv narxi o'sha yerda kiritiladi).
 *
 * Qoidalar (egasi, 15.11.2026): foyda/zarar = sotilgan narx − kompaniya sarflagani (mijozga berilgan + agent ulushi),
 * faqat qurilma sotilgach; har bir chek bo'yicha alohida qurilma olinadi.
 */
const router = Router();
const VIEW_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.CFO, Role.COO, Role.CASHIER, Role.VIEWER];
const EDIT_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.COO];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const n = (v: unknown) => Number(v) || 0;
const cleanName = (v?: string | null) => {
  const t = (v || '').trim();
  return !t || t === '-' || t.toLowerCase() === 'mijoz' ? null : t;
};

class DaftarError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
function sendError(res: Response, error: any, fallback: string) {
  if (error instanceof DaftarError) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

router.get('/', authenticateToken, requireRoles(VIEW_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as Record<string, unknown>;
    const startDate = typeof q.startDate === 'string' && YMD.test(q.startDate) ? q.startDate : null;
    const endDate = typeof q.endDate === 'string' && YMD.test(q.endDate) ? q.endDate : null;
    const { start, end } = tashkentDayRange(startDate, endDate);
    const where: Prisma.DealWhereInput = { approvalStatus: 'APPROVED' };
    if (start || end) where.date = { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };

    const rows = await prisma.deal.findMany({
      where,
      select: {
        id: true,
        dealNumber: true,
        date: true,
        status: true,
        saleId: true,
        customerName: true,
        productName: true,
        withdrawnLimit: true,
        calculatedAmount: true,
        agentAmount: true,
        totalPurchaseCost: true,
        devicePurchaseAmount: true,
        daftarMoneyAt: true,
        devicePurchasedAt: true,
        salePrice: true,
        receivedFromBuyer: true,
        debtRemainder: true,
        store: { select: { id: true, name: true } },
        provider: { select: { name: true } },
        agency: { select: { name: true } },
        agent: { select: { name: true } },
      },
      orderBy: [{ date: 'desc' }, { dealNumber: 'desc' }],
    });

    const toItem = (d: (typeof rows)[number]) => {
      const row = {
        status: d.status as string,
        withdrawnLimit: n(d.withdrawnLimit),
        calculatedAmount: n(d.calculatedAmount),
        agentAmount: n(d.agentAmount),
        totalPurchaseCost: n(d.totalPurchaseCost),
        devicePurchaseAmount: n(d.devicePurchaseAmount),
        salePrice: n(d.salePrice),
        receivedFromBuyer: n(d.receivedFromBuyer),
        debtRemainder: n(d.debtRemainder),
      };
      return {
        ...row,
        id: d.id,
        dealNumber: d.dealNumber,
        dateLabel: formatTashkentDateTime(d.date),
        stage: daftarStage(d.status),
        inSale: !!d.saleId,
        customerName: cleanName(d.customerName),
        productName: d.productName || null,
        agencyName: d.agency?.name || null,
        agentName: d.agent?.name || null,
        /** Kompaniya sarflagani = mijozga berilgan + agent ulushi */
        spent: daftarSpent(row),
        /** Foyda/zarar: faqat sotilgach; aks holda null */
        result: daftarDealResult(row),
        moneyAtLabel: d.daftarMoneyAt ? formatTashkentDateTime(d.daftarMoneyAt) : null,
        deviceAtLabel: d.devicePurchasedAt ? formatTashkentDateTime(d.devicePurchasedAt) : null,
      };
    };
    type Item = ReturnType<typeof toItem>;

    const byStore = new Map<string, { storeId: string; name: string; deals: Item[] }>();
    for (const d of rows) {
      if (!d.store || !isDaftarDeal(d.store.name, d.provider?.name)) continue;
      const g = byStore.get(d.store.id) || { storeId: d.store.id, name: d.store.name, deals: [] };
      g.deals.push(toItem(d));
      byStore.set(d.store.id, g);
    }
    const daftars = [...byStore.values()]
      .map((g) => ({ ...g, summary: summarizeDaftar(g.deals) }))
      .sort((a, b) => b.summary.limitTotal - a.summary.limitTotal);

    return res.json({
      period: { startDate, endDate },
      canEdit: EDIT_ROLES.includes(req.user!.role as Role),
      daftars,
      totals: summarizeDaftar(daftars.flatMap((g) => g.deals)),
    });
  } catch (error: any) {
    return sendError(res, error, 'Daftar hisobotini yuklashda xatolik');
  }
});

/** Daftar chekini topadi va bosqich o'zgartirishga yaroqliligini tekshiradi */
async function loadDaftarDeal(dealId: string) {
  const d = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      dealNumber: true,
      status: true,
      approvalStatus: true,
      saleId: true,
      store: { select: { name: true } },
      provider: { select: { name: true } },
    },
  });
  if (!d) throw new DaftarError(404, 'Chek topilmadi');
  if (!isDaftarDeal(d.store?.name, d.provider?.name)) throw new DaftarError(400, 'Bu chek Daftarga tegishli emas (faqat Imanium + Denov yoki Jizzax)');
  if (d.approvalStatus !== 'APPROVED') throw new DaftarError(409, 'Chek hali tasdiqlanmagan');
  if (d.saleId) throw new DaftarError(409, "Bu chek sotuvga bog'langan — bosqichini Sotuv bo'limida o'zgartiring");
  return d;
}

/** Holatni o'zgartiradi, foydani qayta hisoblaydi, audit yozadi */
async function applyStage(req: AuthRequest, dealId: string, status: DealStatus, data: Prisma.DealUpdateInput, action: string) {
  const profitFields = (await computeDealProfitForStatus(dealId, status)) || {};
  const updated = await prisma.deal.update({ where: { id: dealId }, data: { ...data, status, ...profitFields }, select: { id: true, dealNumber: true, status: true } });
  await prisma.auditLog
    .create({ data: { userId: req.user!.id, entity: 'Deal', entityId: dealId, action, newValues: { status, ...(data as object) } as any, ipAddress: req.ip || '' } })
    .catch(() => undefined);
  emitRealtime('deals:updated', { id: dealId });
  return updated;
}

// 2-bosqich: ilovada pul tushgani tekshirildi
router.post('/:dealId/money-received', authenticateToken, requireRoles(EDIT_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const d = await loadDaftarDeal(req.params.dealId);
    if (daftarStage(d.status) !== 'CHEQUE') throw new DaftarError(409, 'Bu chekda pul tushgani allaqachon belgilangan');
    return res.json(await applyStage(req, d.id, DealStatus.MONEY_RECEIVED, { daftarMoneyAt: new Date() }, 'DAFTAR_MONEY_RECEIVED'));
  } catch (error: any) {
    return sendError(res, error, 'Pul tushganini belgilashda xatolik');
  }
});

// 3-bosqich: qurilma olindi — narxi qo'lda kiritiladi
router.post('/:dealId/device-purchased', authenticateToken, requireRoles(EDIT_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new DaftarError(400, "Qurilma narxini kiriting (0 dan katta son)");
    const d = await loadDaftarDeal(req.params.dealId);
    const stage = daftarStage(d.status);
    if (stage === 'CHEQUE') throw new DaftarError(409, 'Avval ilovada pul tushganini belgilang');
    // DEVICE bosqichida qayta chaqirilsa — narx tuzatiladi
    return res.json(
      await applyStage(
        req,
        d.id,
        // Sotilgan chekda (eski ma'lumot, masalan #3644) faqat narx to'ldiriladi — holat o'zgarmaydi
        stage === 'SOLD' ? (d.status as DealStatus) : DealStatus.IN_WAREHOUSE,
        { devicePurchaseAmount: amount, ...(stage === 'MONEY' ? { devicePurchasedAt: new Date() } : {}) },
        'DAFTAR_DEVICE_PURCHASED'
      )
    );
  } catch (error: any) {
    return sendError(res, error, 'Qurilma olinganini belgilashda xatolik');
  }
});

// Xato bosilgan bosqichni bir qadam orqaga: DEVICE → MONEY → CHEQUE (sotilgan chek Sotuv bo'limida qaytariladi)
router.post('/:dealId/back', authenticateToken, requireRoles(EDIT_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const d = await loadDaftarDeal(req.params.dealId);
    const stage = daftarStage(d.status);
    if (stage === 'DEVICE') {
      return res.json(await applyStage(req, d.id, DealStatus.MONEY_RECEIVED, { devicePurchaseAmount: null, devicePurchasedAt: null }, 'DAFTAR_STAGE_BACK'));
    }
    if (stage === 'MONEY') {
      return res.json(await applyStage(req, d.id, DealStatus.NEED_TO_BUY, { daftarMoneyAt: null }, 'DAFTAR_STAGE_BACK'));
    }
    throw new DaftarError(409, stage === 'SOLD' ? "Sotilgan chek Sotuv bo'limida qaytariladi" : 'Bu chek birinchi bosqichda turibdi');
  } catch (error: any) {
    return sendError(res, error, 'Bosqichni qaytarishda xatolik');
  }
});

export default router;
