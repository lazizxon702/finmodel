import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// GET /api/finmodel
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const settings = await prisma.appSetting.findMany();
    const sMap = new Map(settings.map((s) => [s.key, s.value]));

    const baseCheck = Number(sMap.get('base_check')) || 10000000;
    const wholesaleShare = Number(sMap.get('wholesale_split')) || 0.5;
    const retailShare = Number(sMap.get('retail_split')) || 0.5;
    const wholesaleCoef = Number(sMap.get('wholesale_coef')) || 0.85;
    const retailCoef = Number(sMap.get('retail_coef')) || 0.95;
    const monthlyGrowth = 0.08; // 8%

    // 1st month deals from Daily accounting if available, else 0
    const dailyEntries = await prisma.dailyAccountingEntry.findMany({
      where: { yearMonth: '2026-11' },
    });
    const dailySum = dailyEntries.reduce((s, e) => s + e.dealCount, 0);
    const startDealsM1 = dailySum;

    // Providers directory
    const providers = [
      { name: 'Alif (10 - 20 млн сум)', terms: '10 000 000 - 20 000 000 UZS', baseCommission: 0.26, uzimeiBonus: 0.02, mixShare: 0.20 },
      { name: 'Alif (> 20 млн сум)', terms: 'Свыше 20 000 000 UZS', baseCommission: 0.30, uzimeiBonus: 0.02, mixShare: 0.15 },
      { name: 'Alif Онлайн', terms: 'Онлайн-одобрение лимита', baseCommission: 0.35, uzimeiBonus: 0.02, mixShare: 0.10 },
      { name: 'Uzum Bank', terms: 'Стандартный лимит (20-25%)', baseCommission: 0.225, uzimeiBonus: 0.00, mixShare: 0.15 },
      { name: 'Uzum Nasiya', terms: 'Насия рассрочка (25-30%)', baseCommission: 0.275, uzimeiBonus: 0.00, mixShare: 0.10 },
      { name: 'Payme (Payme Nasiya)', terms: 'Фиксированная ставка 30%', baseCommission: 0.30, uzimeiBonus: 0.00, mixShare: 0.10 },
      { name: 'Open / Anor Bank', terms: 'Высокий дисконт (40-45%)', baseCommission: 0.425, uzimeiBonus: 0.00, mixShare: 0.10 },
      { name: 'Xamrox / Ishonch', terms: 'Партнерские сети (20-25%)', baseCommission: 0.21, uzimeiBonus: 0.00, mixShare: 0.10 },
    ];

    const providerRows = providers.map((p) => {
      const finalCommission = p.baseCommission + p.uzimeiBonus;
      const weightedRate = finalCommission * p.mixShare;
      return {
        ...p,
        finalCommission,
        weightedRate,
      };
    });

    const weightedAvgRate = providerRows.reduce((s, p) => s + p.weightedRate, 0);

    // Unit Economics per provider
    const unitEconomics = providerRows.map((p) => {
      const purchasePrice = baseCheck * (1 - p.finalCommission);
      const wholesaleRev = baseCheck * wholesaleCoef;
      const retailRev = baseCheck * retailCoef;
      const avgRev = (wholesaleShare * wholesaleRev) + (retailShare * retailRev);
      const grossProfit = avgRev - purchasePrice;
      const marginPct = avgRev > 0 ? grossProfit / avgRev : 0;

      return {
        providerName: p.name,
        nominalPrice: baseCheck,
        commissionPct: p.finalCommission,
        purchasePrice,
        wholesaleRevenue: wholesaleRev,
        retailRevenue: retailRev,
        averageRevenue: avgRev,
        grossProfit,
        marginPct,
      };
    });

    // Weighted average unit deal
    const avgUnitDeal = {
      nominalPrice: baseCheck,
      commissionPct: weightedAvgRate,
      purchasePrice: baseCheck * (1 - weightedAvgRate),
      wholesaleRevenue: baseCheck * wholesaleCoef,
      retailRevenue: baseCheck * retailCoef,
      averageRevenue: (wholesaleShare * baseCheck * wholesaleCoef) + (retailShare * baseCheck * retailCoef),
      grossProfit: ((wholesaleShare * baseCheck * wholesaleCoef) + (retailShare * baseCheck * retailCoef)) - (baseCheck * (1 - weightedAvgRate)),
      marginPct: (((wholesaleShare * baseCheck * wholesaleCoef) + (retailShare * baseCheck * retailCoef)) - (baseCheck * (1 - weightedAvgRate))) / ((wholesaleShare * baseCheck * wholesaleCoef) + (retailShare * baseCheck * retailCoef)),
    };

    // 12-Month P&L Projections
    const monthsData: any[] = [];
    let currentDeals = startDealsM1;

    for (let m = 1; m <= 12; m++) {
      if (m > 1) {
        currentDeals = Math.round(currentDeals * (1 + monthlyGrowth));
      }

      if (currentDeals === 0) {
        monthsData.push({
          monthNumber: m,
          monthName: `Oy ${m} (Месяц ${m})`,
          dealsCount: 0,
          nominalVolume: 0,
          wholesaleRevenue: 0,
          retailRevenue: 0,
          totalRevenue: 0,
          purchaseCost: 0,
          agentCommissionRef: 0,
          logistics: 0,
          totalCogs: 0,
          grossProfit: 0,
          grossMarginPct: 0,
          marketingCac: 0,
          fot: 0,
          officeRent: 0,
          telecom: 0,
          admin: 0,
          totalOpex: 0,
          netProfit: 0,
          netMarginPct: 0,
        });
        continue;
      }

      const nominalVolume = currentDeals * baseCheck;
      const wholesaleRev = currentDeals * wholesaleShare * avgUnitDeal.wholesaleRevenue;
      const retailRev = currentDeals * retailShare * avgUnitDeal.retailRevenue;
      const totalRevenue = wholesaleRev + retailRev;

      const purchaseCost = currentDeals * avgUnitDeal.purchasePrice;
      const agentCommissionRef = nominalVolume * weightedAvgRate;
      const logistics = currentDeals * 50000;
      const totalCogs = purchaseCost + logistics;
      const grossProfit = totalRevenue - totalCogs;
      const grossMarginPct = totalRevenue > 0 ? grossProfit / totalRevenue : 0;

      // Dynamic FOT based on volume
      let fot = 12000000;
      if (currentDeals > 55) fot = 20000000;
      else if (currentDeals > 40) fot = 16000000;

      const marketingCac = currentDeals * 250000;
      const officeRent = 6000000;
      const telecom = 2500000;
      const admin = 2000000;
      const totalOpex = marketingCac + fot + officeRent + telecom + admin;

      const netProfit = grossProfit - totalOpex;
      const netMarginPct = totalRevenue > 0 ? netProfit / totalRevenue : 0;

      monthsData.push({
        monthNumber: m,
        monthName: `Oy ${m} (Месяц ${m})`,
        dealsCount: currentDeals,
        nominalVolume,
        wholesaleRevenue: wholesaleRev,
        retailRevenue: retailRev,
        totalRevenue,
        purchaseCost,
        agentCommissionRef,
        logistics,
        totalCogs,
        grossProfit,
        grossMarginPct,
        marketingCac,
        fot,
        officeRent,
        telecom,
        admin,
        totalOpex,
        netProfit,
        netMarginPct,
      });
    }

    // 1-Year Total KPI
    const yearTotalDeals = monthsData.reduce((s, m) => s + m.dealsCount, 0);
    const yearTotalRevenue = monthsData.reduce((s, m) => s + m.totalRevenue, 0);
    const yearTotalGrossProfit = monthsData.reduce((s, m) => s + m.grossProfit, 0);
    const yearTotalNetProfit = monthsData.reduce((s, m) => s + m.netProfit, 0);

    const yearSummary = {
      totalDeals: yearTotalDeals,
      avgDealsPerMonth: Math.round(yearTotalDeals / 12),
      totalRevenue: yearTotalRevenue,
      avgRevenuePerMonth: Math.round(yearTotalRevenue / 12),
      totalGrossProfit: yearTotalGrossProfit,
      grossMarginPct: yearTotalRevenue > 0 ? yearTotalGrossProfit / yearTotalRevenue : 0,
      totalNetProfit: yearTotalNetProfit,
      netMarginPct: yearTotalRevenue > 0 ? yearTotalNetProfit / yearTotalRevenue : 0,
    };

    return res.json({
      assumptions: {
        baseCheck,
        wholesaleShare,
        retailShare,
        wholesaleCoef,
        retailCoef,
        startDealsM1,
        monthlyGrowth,
      },
      providers: providerRows,
      weightedAvgRate,
      unitEconomics,
      avgUnitDeal,
      months: monthsData,
      yearSummary,
    });
  } catch (error: any) {
    console.error('FinModel error:', error);
    return res.status(500).json({ error: 'Moliyaviy modelni hisoblashda xatolik' });
  }
});

export default router;
