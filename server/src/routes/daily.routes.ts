import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { requireAdminConfirm } from '../lib/security';
import { Role } from '@prisma/client';

const router = Router();

const PROVIDERS_CONFIG = [
  { code: 'alif_10_20', name: 'Alif (10 - 20 млн сум, ком. 28%)', rateMultiplier: 720 },
  { code: 'alif_gt_20', name: 'Alif (> 20 млн сум, ком. 32%)', rateMultiplier: 680 },
  { code: 'alif_online', name: 'Alif Онлайн (ком. 37%)', rateMultiplier: 630 },
  { code: 'uzum_bank', name: 'Uzum Bank (ком. 22.5%)', rateMultiplier: 775 },
  { code: 'uzum_nasiya', name: 'Uzum Nasiya (ком. 27.5%)', rateMultiplier: 725 },
  { code: 'payme_nasiya', name: 'Payme Nasiya (ком. 30%)', rateMultiplier: 700 },
  { code: 'open_anor', name: 'Open / Anor Bank (ком. 42.5%)', rateMultiplier: 575 },
];

// GET /api/daily
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { yearMonth = '2026-11' } = req.query as any;

    // Fetch app settings
    const settings = await prisma.appSetting.findMany();
    const sMap = new Map(settings.map((s) => [s.key, s.value]));

    const baseCheck = Number(sMap.get('base_check')) || 10000000;
    const startCash = Number(sMap.get('initial_cash')) || 0;
    const logisticsPerUnit = Number(sMap.get('logistics_per_unit')) || 50000;
    const cacPerUnit = Number(sMap.get('cac_per_unit')) || 250000;
    const fotM1 = Number(sMap.get('fot_m1')) || 0;
    const officeRent = Number(sMap.get('office_rent')) || 0;
    const telecomCrm = Number(sMap.get('telecom_crm')) || 0;
    const adminExp = Number(sMap.get('admin_expenses')) || 0;

    const daysInMonth = 31;
    const dailyFot = Math.round(fotM1 / daysInMonth);
    const dailyRent = Math.round(officeRent / daysInMonth);
    const dailyTelecom = Math.round(telecomCrm / daysInMonth);
    const dailyAdmin = Math.round(adminExp / daysInMonth);

    // Fetch entries
    const entries = await prisma.dailyAccountingEntry.findMany({
      where: { yearMonth },
    });

    const monthTotalEntries = entries.reduce((s, e) => s + e.dealCount, 0);

    const entryMap = new Map<string, number>();
    for (const e of entries) {
      entryMap.set(`${e.dayNumber}:${e.providerCode}`, e.dealCount);
    }

    // Calculate metrics day by day
    const daysData: any[] = [];
    let runningCash = monthTotalEntries > 0 ? startCash : 0;

    for (let day = 1; day <= daysInMonth; day++) {
      let dayTotalCount = 0;
      let dayWeightedSum = 0;
      const providerCounts: { [code: string]: number } = {};

      for (const p of PROVIDERS_CONFIG) {
        const count = entryMap.get(`${day}:${p.code}`) || 0;
        providerCounts[p.code] = count;
        dayTotalCount += count;
        dayWeightedSum += count * p.rateMultiplier;
      }

      const nominalVolume = dayTotalCount * baseCheck;
      const wholesaleRevenue = nominalVolume * 0.5 * 0.85;
      const retailRevenue = nominalVolume * 0.5 * 0.95;
      const totalRevenue = wholesaleRevenue + retailRevenue;

      const purchaseCost = (baseCheck / 1000) * dayWeightedSum;
      const logistics = dayTotalCount * logisticsPerUnit;
      const totalCogs = purchaseCost + logistics;
      const grossProfit = totalRevenue - totalCogs;
      const grossMarginPct = totalRevenue > 0 ? grossProfit / totalRevenue : 0;

      const marketingCac = dayTotalCount * cacPerUnit;
      const totalOpex = monthTotalEntries > 0 ? (marketingCac + dailyFot + dailyRent + dailyTelecom + dailyAdmin) : 0;
      const netProfit = grossProfit - totalOpex;
      const netMarginPct = totalRevenue > 0 ? netProfit / totalRevenue : 0;
      const netProfitPerDeal = dayTotalCount > 0 ? netProfit / dayTotalCount : 0;

      // Cash flow
      const dayStartCash = runningCash;
      const inflow = totalRevenue;
      const outflowPurchases = purchaseCost;
      const outflowOpex = logistics + totalOpex;
      const netCashFlow = inflow - outflowPurchases - outflowOpex;
      const dayEndCash = monthTotalEntries > 0 ? (dayStartCash + netCashFlow) : 0;
      runningCash = dayEndCash;

      daysData.push({
        dayNumber: day,
        providerCounts,
        dayTotalCount,
        nominalVolume,
        wholesaleRevenue,
        retailRevenue,
        totalRevenue,
        purchaseCost,
        logistics,
        totalCogs,
        grossProfit,
        grossMarginPct,
        marketingCac,
        dailyFot,
        dailyRent,
        dailyTelecom,
        dailyAdmin,
        totalOpex,
        netProfit,
        netMarginPct,
        netProfitPerDeal,
        dayStartCash,
        inflow,
        outflowPurchases,
        outflowOpex,
        netCashFlow,
        dayEndCash,
        liquidityStatus: dayEndCash >= 0 ? 'В НОРМЕ' : 'КАССОВЫЙ РАЗРЫВ!',
      });
    }

    // Monthly aggregates
    const monthTotalCount = daysData.reduce((s, d) => s + d.dayTotalCount, 0);
    const monthTotalRevenue = daysData.reduce((s, d) => s + d.totalRevenue, 0);
    const monthPurchaseCost = daysData.reduce((s, d) => s + d.purchaseCost, 0);
    const monthTotalCogs = daysData.reduce((s, d) => s + d.totalCogs, 0);
    const monthGrossProfit = daysData.reduce((s, d) => s + d.grossProfit, 0);
    const monthTotalOpex = daysData.reduce((s, d) => s + d.totalOpex, 0);
    const monthNetProfit = daysData.reduce((s, d) => s + d.netProfit, 0);
    const endingCash = daysData[daysData.length - 1].dayEndCash;

    const minDayEnd = Math.min(...daysData.map((d) => d.dayEndCash));
    const overallLiquidityStatus = minDayEnd >= 0 ? 'Ликвидность в норме' : 'Риск дефицита';

    return res.json({
      yearMonth,
      parameters: {
        baseCheck,
        startCash,
        logisticsPerUnit,
        cacPerUnit,
        fotM1,
        officeRent,
        telecomCrm,
        adminExp,
      },
      providers: PROVIDERS_CONFIG,
      days: daysData,
      summary: {
        totalDevicesBought: monthTotalCount,
        totalRevenue: monthTotalRevenue,
        purchaseCost: monthPurchaseCost,
        totalCogs: monthTotalCogs,
        grossProfit: monthGrossProfit,
        grossMarginPct: monthTotalRevenue > 0 ? monthGrossProfit / monthTotalRevenue : 0,
        totalOpex: monthTotalOpex,
        netProfit: monthNetProfit,
        netMarginPct: monthTotalRevenue > 0 ? monthNetProfit / monthTotalRevenue : 0,
        endingCash,
        overallLiquidityStatus,
      },
    });
  } catch (error: any) {
    console.error('Daily accounting error:', error);
    return res.status(500).json({ error: 'Kunlik hisobni yuklashda xatolik' });
  }
});

// POST /api/daily/cell (Update count)
router.post('/cell', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { yearMonth, dayNumber, providerCode, dealCount } = req.body;

    if (!yearMonth || dayNumber === undefined || !providerCode) {
      return res.status(400).json({ error: 'Barcha parametrlar ko\'rsatilishi kerak' });
    }

    const updated = await prisma.dailyAccountingEntry.upsert({
      where: {
        yearMonth_dayNumber_providerCode: {
          yearMonth,
          dayNumber: Number(dayNumber),
          providerCode,
        },
      },
      update: { dealCount: Number(dealCount) || 0 },
      create: {
        yearMonth,
        dayNumber: Number(dayNumber),
        providerCode,
        dealCount: Number(dealCount) || 0,
      },
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: 'Qiymatni yangilashda xatolik: ' + error.message });
  }
});

// DELETE /api/daily/all (Clear all entries)
router.delete('/all', authenticateToken, requireRoles([Role.ADMIN]), requireAdminConfirm, async (req: AuthRequest, res: Response) => {
  try {
    const resDel = await prisma.dailyAccountingEntry.deleteMany({});
    return res.json({ success: true, deletedCount: resDel.count });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
