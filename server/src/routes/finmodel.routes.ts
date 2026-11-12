import { Router, Response } from 'express';
import { DdsSource, DealStatus, ExpenseCategoryType, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { APPROVED_ONLY, isScopedRole } from '../services/access.service';
import { TRUST_RATE } from '../services/calculation.service';
import { getTrustLedger } from '../services/ledger.service';
import { decomposeDealProfit } from './finances.routes';

const router = Router();

/** Model 1-oyi (Kunlik hisob shu oydan olinadi) */
const MODEL_START_YEAR_MONTH = '2026-11';

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
/** Sana qaysi oyga tushadi — Asia/Tashkent bo'yicha "YYYY-MM" */
const tashkentYearMonth = (d: Date) => new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 7);
/** "YYYY-MM" ga n oy qo'shadi */
const addMonths = (yearMonth: string, n: number) => {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

interface ActualMonth {
  yearMonth: string;
  dealsCount: number;
  soldCount: number;
  withdrawnVolume: number;
  salesRevenue: number;
  tradeMargin: number;
  partnerBonus: number;
  trustIncome: number;
  dealsProfit: number;
  trustReceived: number;
  totalOpex: number;
  netProfit: number;
}
const emptyActual = (yearMonth: string): ActualMonth => ({
  yearMonth,
  dealsCount: 0,
  soldCount: 0,
  withdrawnVolume: 0,
  salesRevenue: 0,
  tradeMargin: 0,
  partnerBonus: 0,
  trustIncome: 0,
  dealsProfit: 0,
  trustReceived: 0,
  totalOpex: 0,
  netProfit: 0,
});

/**
 * Haqiqiy (fakt) ko'rsatkichlar oylar kesimida — faqat ADMIN tasdiqlagan bitimlar.
 * Trust daromadi (yechilgan limit × 16%) alohida qator; xarajatlar — DDS'dagi OPEX.
 */
async function loadActuals() {
  const [deals, dds, trustLedger] = await Promise.all([
    prisma.deal.findMany({
      where: APPROVED_ONLY,
      select: {
        date: true,
        status: true,
        salePrice: true,
        withdrawnLimit: true,
        totalPurchaseCost: true,
        trustDebtAmount: true,
        profit: true,
        store: { select: { name: true } },
      },
    }),
    prisma.ddsTransaction.findMany({
      where: {
        amount: { gt: 0 },
        OR: [
          { type: TransactionType.EXPENSE, expenseType: ExpenseCategoryType.OPEX },
          { type: TransactionType.INCOME, source: DdsSource.TRUST_PAYMENT },
        ],
      },
      select: { dateTime: true, type: true, amount: true },
    }),
    getTrustLedger(),
  ]);

  const byMonth = new Map<string, ActualMonth>();
  const month = (ym: string) => {
    let row = byMonth.get(ym);
    if (!row) {
      row = emptyActual(ym);
      byMonth.set(ym, row);
    }
    return row;
  };

  for (const d of deals) {
    const row = month(tashkentYearMonth(d.date));
    const p = decomposeDealProfit({ ...d, storeName: d.store?.name });
    row.dealsCount += 1;
    row.withdrawnVolume += Number(d.withdrawnLimit) || 0;
    if (d.status === DealStatus.SOLD) {
      row.soldCount += 1;
      row.salesRevenue += Number(d.salePrice) || 0;
    }
    row.tradeMargin += p.tradeMargin;
    row.partnerBonus += p.partnerBonus;
    row.trustIncome += p.trustIncome;
    row.dealsProfit += p.stored;
  }
  for (const t of dds) {
    const row = month(tashkentYearMonth(t.dateTime));
    const amt = Number(t.amount) || 0;
    if (t.type === TransactionType.INCOME) row.trustReceived += amt;
    else row.totalOpex += amt;
  }

  const months = Array.from(byMonth.values()).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  for (const m of months) m.netProfit = m.dealsProfit - m.totalOpex;

  const totals = months.reduce((acc, m) => {
    for (const k of Object.keys(acc) as (keyof ActualMonth)[]) {
      if (k !== 'yearMonth') (acc[k] as number) += m[k] as number;
    }
    return acc;
  }, emptyActual('total'));

  return { months, totals, byMonth, trustOverall: trustLedger.overall };
}

// GET /api/finmodel
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || isScopedRole(req.user.role)) {
      return res.status(403).json({ error: "Sizda moliyaviy modelni ko'rish huquqi yo'q" });
    }

    const [settings, actuals] = await Promise.all([prisma.appSetting.findMany(), loadActuals()]);
    const sMap = new Map(settings.map((s) => [s.key, s.value]));

    const baseCheck = Number(sMap.get('base_check')) || 10000000;
    const wholesaleShare = Number(sMap.get('wholesale_split')) || 0.5;
    const retailShare = Number(sMap.get('retail_split')) || 0.5;
    const wholesaleCoef = Number(sMap.get('wholesale_coef')) || 0.85;
    const retailCoef = Number(sMap.get('retail_coef')) || 0.95;
    const monthlyGrowth = 0.08; // 8%

    // 1st month deals from Daily accounting if available, else 0
    const dailyEntries = await prisma.dailyAccountingEntry.findMany({
      where: { yearMonth: MODEL_START_YEAR_MONTH },
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

      // Shu kalendar oyning haqiqiy ko'rsatkichlari (faqat tasdiqlangan bitimlar); Trust daromadi — alohida qator
      const yearMonth = addMonths(MODEL_START_YEAR_MONTH, m - 1);
      const actual = actuals.byMonth.get(yearMonth) || null;
      const factFields = {
        yearMonth,
        trustIncome: actual ? actual.trustIncome : 0,
        actual,
      };

      if (currentDeals === 0) {
        monthsData.push({
          ...factFields,
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
        ...factFields,
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
      // Haqiqiy ko'rsatkichlar (faqat tasdiqlangan bitimlar), oylar kesimida — model bilan solishtirish uchun
      actuals: {
        months: actuals.months,
        totals: actuals.totals,
      },
      // Trust daromadi: hisoblangan (16%), haqiqatda kelgan va qoldiq
      trustIncome: {
        ratePercent: TRUST_RATE * 100,
        accrued: actuals.totals.trustIncome,
        received: actuals.trustOverall.totalPaid,
        outstanding: actuals.trustOverall.balance,
      },
    });
  } catch (error: any) {
    console.error('FinModel error:', error);
    return res.status(500).json({ error: 'Moliyaviy modelni hisoblashda xatolik' });
  }
});

export default router;
