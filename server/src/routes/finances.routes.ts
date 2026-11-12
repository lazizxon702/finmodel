import { Router, Response } from 'express';
import { DdsSource, DealStatus, ExpenseCategoryType, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { APPROVED_ONLY, isScopedRole } from '../services/access.service';
import {
  TRUST_RATE,
  balanceDelta,
  isQodirStore,
  normalizeName,
  tashkentDayRange,
} from '../services/calculation.service';
import { getAccountBalances, getTrustLedger } from '../services/ledger.service';

const router = Router();

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Qodir aka / Green Bazar bitimlarida xarid summasining 5% i foydaga o'tadi (calculateDeal dagi 1-qoida) */
export const PARTNER_BONUS_RATE = 0.05;

export interface DealProfitLike {
  status: DealStatus | string;
  salePrice: unknown;
  withdrawnLimit: unknown;
  totalPurchaseCost: unknown;
  trustDebtAmount: unknown;
  profit: unknown;
  storeName?: string | null;
}

/**
 * Bitim foydasining tarkibi — CalculationService.calculateDeal qoidasi bo'yicha:
 *   savdo marjasi   = sotilgan bitimda (sotuv narxi − yechilgan limit)
 *   hamkor bonusi   = Qodir aka / Green Bazar: jami xarid summasi × 5%
 *   Trust daromadi  = Deal.trustDebtAmount (yechilgan limit × 16%)
 * `stored` — bazadagi Deal.profit (Bitimlar sahifasidagi "Sof foyda" shundan yig'iladi);
 * `difference` 0 bo'lmasa, bitimning saqlangan foydasi shu qoida bo'yicha qayta hisoblanmagan.
 */
export function decomposeDealProfit(d: DealProfitLike) {
  const salePrice = Number(d.salePrice) || 0;
  const withdrawn = Number(d.withdrawnLimit) || 0;
  const storeLower = (d.storeName || '').toLowerCase();
  const isPartnerStore = isQodirStore(d.storeName) || storeLower.includes('qodir') || storeLower.includes('green bazar');

  // Sotuv narxi kiritilmagan "SOLD" bitimda marja tan olinmaydi (aks holda butun limit zarar bo'lib chiqadi)
  const tradeMargin = d.status === DealStatus.SOLD && salePrice > 0 ? salePrice - withdrawn : 0;
  const partnerBonus = isPartnerStore ? (Number(d.totalPurchaseCost) || 0) * PARTNER_BONUS_RATE : 0;
  const trustIncome = Number(d.trustDebtAmount) || 0;
  const expected = tradeMargin + partnerBonus + trustIncome;
  const stored = Number(d.profit) || 0;
  return { tradeMargin, partnerBonus, trustIncome, expected, stored, difference: stored - expected };
}

export type OpexBucket =
  | 'agentPayouts'
  | 'logisticsExpenses'
  | 'officeAndAdmin'
  | 'payrollExpenses'
  | 'marketingExpenses'
  | 'otherOpex';

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));
// "фот" / "fot" — alohida so'z sifatida (masalan "фото" ga tushmasin)
const PAYROLL_ABBR = /(^|[^a-zа-яё])(фот|fot)([^a-zа-яё]|$)/;

/**
 * OPEX kategoriyasini guruhga ajratadi — ruscha va o'zbekcha (lotin/kirill) nomlar bo'yicha.
 * Xarajat OPEX ekanini DDS'dagi expenseType maydoni belgilaydi; bu funksiya faqat qaysi qatorga tushishini aniqlaydi.
 */
export function classifyOpexCategory(categoryName?: string | null): OpexBucket {
  const c = normalizeName(categoryName);
  if (has(c, ['банк', 'bank', 'эквайринг', 'ekvayring'])) return 'officeAndAdmin';
  if (has(c, ['агент', 'партнер', 'партнёр', 'комисси', 'agent', 'hamkor', 'komissi', 'vositachi', 'ҳамкор'])) return 'agentPayouts';
  if (has(c, ['логистик', 'доставк', 'транспорт', 'бензин', 'такси', 'logisti', 'yetkaz', 'dostavka', 'transport', 'benzin', 'yoqilgi', 'taksi'])) {
    return 'logisticsExpenses';
  }
  if (PAYROLL_ABBR.test(c) || has(c, ['зарплат', 'оклад', 'аванс', 'ish haqi', 'maosh', 'oylik', 'avans', 'иш ҳақи', 'маош', 'ойлик'])) {
    return 'payrollExpenses';
  }
  if (has(c, ['маркетинг', 'реклам', 'marketing', 'reklama', 'smm', 'target'])) return 'marketingExpenses';
  if (
    has(c, [
      'аренд', 'связь', 'офис', 'интернет', 'софт', 'коммунал', 'канцеляр', 'инвентар', 'налог',
      'ijara', 'ofis', 'aloqa', 'internet', 'kommunal', 'kanselyar', 'inventar', 'jihoz', 'soliq', 'ижара', 'алоқа', 'солиқ',
    ])
  ) {
    return 'officeAndAdmin';
  }
  return 'otherOpex';
}

const isInvestorCategory = (categoryName?: string | null) =>
  has(normalizeName(categoryName), ['инвест', 'инвист', 'invest', 'займ', 'заем', 'кредит', 'kredit', 'ssuda']);
const isUzimeiCategory = (categoryName?: string | null) => normalizeName(categoryName).includes('uzimei');

const ymdOrNull = (v: unknown) => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || '').trim());
  return m ? m[1] : null;
};

/**
 * GET /api/finances/summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *   - faqat ADMIN tasdiqlagan bitimlar hisobga kiradi;
 *   - P&L va pul oqimi — tanlangan davr uchun (Toshkent kuni), balans va kartochkalar — joriy holat;
 *   - P&L: bitimlar bo'yicha foyda (= Bitimlar sahifasidagi "Sof foyda") − operatsion xarajatlar (DDS, expenseType = OPEX);
 *   - pul qoldig'i AccountBalance jadvalidan; balans majburan tenglashtirilmaydi — farq ochiq ko'rsatiladi.
 */
router.get('/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || isScopedRole(req.user.role)) {
      return res.status(403).json({ error: "Sizda moliyaviy hisobotlarni ko'rish huquqi yo'q" });
    }

    const startYmd = ymdOrNull((req.query as any).startDate);
    const endYmd = ymdOrNull((req.query as any).endDate);
    const range = tashkentDayRange(startYmd, endYmd);
    const inRange = (d: Date) => (!range.start || d >= range.start) && (!range.end || d <= range.end);

    const [deals, transactions, buyers, settings, debtsWeOwe, balances, trustLedger] = await Promise.all([
      prisma.deal.findMany({ where: APPROVED_ONLY, include: { buyer: true, store: { select: { name: true } } } }),
      prisma.ddsTransaction.findMany({
        where: { amount: { gt: 0 } },
        select: { dateTime: true, type: true, account: true, expenseType: true, categoryName: true, amount: true, source: true },
      }),
      prisma.buyer.findMany(),
      prisma.appSetting.findMany(),
      prisma.debtRecord.findMany({ where: { weOwe: true } }),
      getAccountBalances(),
      getTrustLedger(range),
    ]);

    const sMap = new Map(settings.map((s) => [s.key, s.value]));
    const periodDeals = deals.filter((d) => inRange(d.date));
    const periodTx = transactions.filter((t) => inRange(t.dateTime));

    // ─── 1. Ombor (joriy holat) ───
    const warehouseDeals = deals.filter(
      (d) => d.status === DealStatus.IN_WAREHOUSE || d.status === DealStatus.IN_TRANSIT
    );
    const warehouseCount = warehouseDeals.length;
    const warehouseInventoryValue = warehouseDeals.reduce((sum, d) => sum + (Number(d.totalPurchaseCost) || 0), 0);

    // ─── 2. Debitorlik (joriy holat): xaridorlar + Trust (bizga qarzdor bo'lgan 16%) ───
    const buyerDebts = buyers.map((b) => {
      const bDeals = deals.filter((d) => d.buyerId === b.id && d.status === DealStatus.SOLD);
      const shipped = bDeals.reduce((sum, d) => sum + (Number(d.salePrice) || 0), 0);
      const paid = bDeals.reduce((sum, d) => sum + (Number(d.receivedFromBuyer) || 0), 0);
      return {
        id: b.id,
        buyerName: b.name,
        type: 'Xaridor (Дебит)',
        shipped,
        paid,
        remainder: shipped - paid,
      };
    });
    const buyerReceivables = buyerDebts.reduce((sum, b) => sum + b.remainder, 0);

    const trustOverall = trustLedger.overall; // butun davr: { totalDebt, totalPaid, balance }
    const trustReceivable = trustOverall.balance;
    const receivables = [...buyerDebts];
    if (trustOverall.totalDebt !== 0 || trustOverall.totalPaid !== 0) {
      receivables.push({
        id: 'trust',
        buyerName: `Trust (yechilgan limitning ${TRUST_RATE * 100}% i)`,
        type: 'Trust qarzi',
        shipped: trustOverall.totalDebt,
        paid: trustOverall.totalPaid,
        remainder: trustReceivable,
      });
    }
    const totalReceivables = buyerReceivables + trustReceivable;

    // ─── 3. Kreditorlik (joriy holat) ───
    const creditors = debtsWeOwe.map((d) => ({
      name: d.debtorName,
      type: 'Kreditorlik (Кредиторка)',
      accrued: Number(d.amountUzs) || 0,
      paid: (Number(d.amountUzs) || 0) - (Number(d.remainingAmount) || 0),
      remainder: Number(d.remainingAmount) || 0,
    }));
    const totalPayables = creditors.reduce((sum, c) => sum + c.remainder, 0);

    // ─── 4. P&L (davr) ───
    const soldDeals = periodDeals.filter((d) => d.status === DealStatus.SOLD);
    const salesRevenue = soldDeals.reduce((sum, d) => sum + (Number(d.salePrice) || 0), 0);
    const cogs = soldDeals.reduce((sum, d) => sum + (Number(d.totalPurchaseCost) || 0), 0);
    const grossProfit = salesRevenue - cogs;

    // Bitimlar bo'yicha foyda va uning tarkibi
    let tradeMargin = 0;
    let partnerBonus = 0;
    let trustIncome = 0;
    let dealsNetProfit = 0; // Σ Deal.profit — Bitimlar sahifasidagi "Sof foyda" bilan bir xil manba
    let soldWithoutSalePrice = 0;
    const mismatched: { id: string; dealNumber: number; status: string; storedProfit: number; expectedProfit: number; difference: number }[] = [];
    for (const d of periodDeals) {
      const p = decomposeDealProfit({ ...d, storeName: d.store?.name });
      tradeMargin += p.tradeMargin;
      partnerBonus += p.partnerBonus;
      trustIncome += p.trustIncome;
      dealsNetProfit += p.stored;
      if (d.status === DealStatus.SOLD && !(Number(d.salePrice) > 0)) soldWithoutSalePrice++;
      if (Math.abs(p.difference) >= 1) {
        mismatched.push({
          id: d.id,
          dealNumber: d.dealNumber,
          status: d.status,
          storedProfit: round2(p.stored),
          expectedProfit: round2(p.expected),
          difference: round2(p.difference),
        });
      }
    }
    tradeMargin = round2(tradeMargin);
    partnerBonus = round2(partnerBonus);
    trustIncome = round2(trustIncome);
    dealsNetProfit = round2(dealsNetProfit);
    const pnlDealsProfit = round2(tradeMargin + partnerBonus + trustIncome);
    const dealsProfitDifference = round2(dealsNetProfit - pnlDealsProfit);

    // Operatsion xarajatlar: DDS chiqimlari, expenseType = OPEX (kategoriya nomi qaysi tilda bo'lishidan qat'i nazar)
    const opex: Record<OpexBucket, number> = {
      agentPayouts: 0,
      logisticsExpenses: 0,
      officeAndAdmin: 0,
      payrollExpenses: 0,
      marketingExpenses: 0,
      otherOpex: 0,
    };
    const opexByCategory = new Map<string, { amount: number; bucket: OpexBucket }>();
    let cogsCashOut = 0;
    let trustReceived = 0;
    for (const tx of periodTx) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === TransactionType.INCOME) {
        if (tx.source === DdsSource.TRUST_PAYMENT) trustReceived += amt;
        continue;
      }
      if (tx.expenseType === ExpenseCategoryType.COGS) cogsCashOut += amt;
      if (tx.expenseType !== ExpenseCategoryType.OPEX) continue;
      const bucket = classifyOpexCategory(tx.categoryName);
      opex[bucket] += amt;
      const name = (tx.categoryName || '').trim() || 'Boshqa xarajat';
      const row = opexByCategory.get(name) || { amount: 0, bucket };
      row.amount += amt;
      opexByCategory.set(name, row);
    }
    const totalOpex = Object.values(opex).reduce((s, v) => s + v, 0);
    const opexBreakdown = Array.from(opexByCategory.entries())
      .map(([categoryName, v]) => ({ categoryName, bucket: v.bucket, amount: v.amount }))
      .sort((a, b) => b.amount - a.amount);

    // Sof foyda = bitimlar bo'yicha foyda (Bitimlar sahifasi bilan bir xil) − operatsion xarajatlar
    const netProfit = round2(dealsNetProfit - totalOpex);
    const rosPct = salesRevenue > 0 ? netProfit / salesRevenue : 0;

    // ─── 5. Pul oqimi (davr) — haqiqiy DDS yozuvlaridan ───
    let operatingInflows = 0;
    let trustInflows = 0;
    let investorLoanInflow = 0;
    let purchaseOutflows = 0;
    let uzimeiOutflows = 0;
    let opexOutflows = 0;
    let otherOutflows = 0;
    for (const tx of periodTx) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === TransactionType.INCOME) {
        if (tx.source === DdsSource.TRUST_PAYMENT) trustInflows += amt;
        else if (isInvestorCategory(tx.categoryName)) investorLoanInflow += amt;
        else operatingInflows += amt;
      } else if (isUzimeiCategory(tx.categoryName)) uzimeiOutflows += amt;
      else if (tx.expenseType === ExpenseCategoryType.COGS) purchaseOutflows += amt;
      else if (tx.expenseType === ExpenseCategoryType.OPEX) opexOutflows += amt;
      else otherOutflows += amt;
    }
    const totalInflows = operatingInflows + trustInflows + investorLoanInflow;
    const totalOutflows = purchaseOutflows + uzimeiOutflows + opexOutflows + otherOutflows;
    const netCashFlow = totalInflows - totalOutflows;

    // Davr oxiridagi pul = joriy qoldiq (AccountBalance) − davrdan keyingi harakatlar
    const afterPeriodNet = range.end
      ? transactions
          .filter((t) => t.dateTime > range.end!)
          .reduce((s, t) => s + balanceDelta(t.type, Number(t.amount) || 0), 0)
      : 0;
    const liquidCashNow = balances.total;
    const endingCash = round2(liquidCashNow - afterPeriodNet);
    const beginningCash = round2(endingCash - netCashFlow);

    // ─── 6. Boshqaruv balansi (joriy holat) — "plug"siz ───
    const fixedAssets = Number(sMap.get('fixed_assets')) || 0;
    const totalAssets = round2(liquidCashNow + warehouseInventoryValue + totalReceivables + fixedAssets);

    const longTermLoan = Number(sMap.get('investor_loan')) || 0;
    const charterCapital = Number(sMap.get('charter_capital')) || 0;
    // Taqsimlanmagan foyda = butun davr sof foydasi (tasdiqlangan bitimlar foydasi − barcha OPEX); balansni tenglashtirish uchun moslanmaydi
    const allTimeDealsProfit = deals.reduce((s, d) => s + (Number(d.profit) || 0), 0);
    const allTimeOpex = transactions.reduce(
      (s, t) =>
        t.type === TransactionType.EXPENSE && t.expenseType === ExpenseCategoryType.OPEX ? s + (Number(t.amount) || 0) : s,
      0
    );
    const retainedEarnings = round2(allTimeDealsProfit - allTimeOpex);
    const totalLiabilitiesAndEquity = round2(totalPayables + longTermLoan + charterCapital + retainedEarnings);

    const balanceDifference = Math.round(totalAssets - totalLiabilitiesAndEquity);
    const isBalanced = Math.abs(balanceDifference) < 1;
    const statusText = isBalanced
      ? 'Balans mos (Баланс сходится)'
      : `Balans mos emas — farq: ${balanceDifference.toLocaleString('ru-RU')} UZS`;

    return res.json({
      period: { startDate: startYmd, endDate: endYmd },
      balances, // { CASH, BANK_CARD, SETTLEMENT_ACCOUNT, total } — AccountBalance
      cards: {
        liquidCash: liquidCashNow,
        warehouseValue: warehouseInventoryValue,
        warehouseCount,
        inTransitCount: deals.filter((d) => d.status === DealStatus.IN_TRANSIT).length,
        receivablesDebt: totalReceivables,
        netProfit,
        rosPct,
        dealsProfit: dealsNetProfit,
        trustOutstanding: trustReceivable,
      },
      receivables,
      payables: creditors,
      totals: {
        totalReceivables,
        totalPayables,
        buyerReceivables,
        trustReceivable,
      },
      pnl: {
        // Ma'lumot uchun (sotilgan tasdiqlangan bitimlar)
        salesRevenue,
        cogs,
        grossProfit,
        // Bitimlar bo'yicha foyda tarkibi
        tradeMargin, // savdo marjasi: Σ (sotuv narxi − yechilgan limit), sotilgan bitimlar
        partnerBonus, // hamkor bonusi 5% (Qodir aka / Green Bazar)
        trustIncome, // Trust daromadi 16% — hisoblash usuli (Σ trustDebtAmount)
        dealsProfitComponents: pnlDealsProfit, // yuqoridagi uch qator yig'indisi
        dealsProfitAdjustment: dealsProfitDifference, // bitim kartasidagi foyda qoidadan farq qilsa (0 bo'lishi kerak)
        dealsProfit: dealsNetProfit, // "Bitimlar bo'yicha foyda" = Σ Deal.profit = Bitimlar sahifasidagi "Sof foyda"
        // Operatsion xarajatlar (DDS, expenseType = OPEX)
        agentPayouts: opex.agentPayouts,
        logisticsExpenses: opex.logisticsExpenses,
        officeAndAdmin: opex.officeAndAdmin,
        payrollExpenses: opex.payrollExpenses,
        marketingExpenses: opex.marketingExpenses,
        otherOpex: opex.otherOpex,
        totalOpex,
        opexBreakdown,
        netProfit, // = dealsProfit − totalOpex
        rosPct,
        // Trust: hisoblangan / haqiqatda kelgan / qoldiq
        trustRatePercent: TRUST_RATE * 100,
        trustReceived, // davrda Trust haqiqatda bergan pul (DDS, source = TRUST_PAYMENT)
        trustOutstanding: trustReceivable, // Trust'ning joriy qarzi (butun davr: jami qarz − jami to'langan)
        cogsCashOut, // davrda tovar xaridiga chiqqan pul (DDS, expenseType = COGS) — foydadan qayta ayirilmaydi
        soldWithoutSalePrice, // "SOLD" bo'lib, sotuv narxi kiritilmagan bitimlar soni
        reconciliation: {
          dealsNetProfit, // Bitimlar sahifasi: Σ Deal.profit (tasdiqlangan, shu davr)
          pnlDealsProfit, // P&L: savdo marjasi + hamkor bonusi + Trust daromadi
          difference: dealsProfitDifference,
          isReconciled: Math.abs(dealsProfitDifference) < 1,
          dealsCount: periodDeals.length,
          mismatchedDealsCount: mismatched.length,
          mismatchedDeals: mismatched.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)).slice(0, 50),
        },
      },
      cashFlow: {
        beginningCash,
        buyerInflows: operatingInflows, // operatsion tushumlar (Trust va investitsiyadan tashqari barcha kirim)
        operatingInflows,
        trustInflows,
        investorLoanInflow,
        totalInflows,
        purchaseOutflows,
        uzimeiOutflows,
        opexOutflows,
        otherOutflows,
        totalOutflows,
        netCashFlow,
        endingCash,
      },
      balanceSheet: {
        assets: {
          cash: liquidCashNow,
          inventory: warehouseInventoryValue,
          receivables: totalReceivables,
          buyerReceivables,
          trustReceivable,
          fixedAssets,
          totalAssets,
        },
        liabilities: {
          payables: totalPayables,
          longTermLoan,
          charterCapital,
          retainedEarnings,
          totalLiabilitiesAndEquity,
        },
        difference: balanceDifference, // aktivlar − (majburiyatlar + kapital); 0 bo'lmasa balans mos emas
        isBalanced,
        balanceCheck: {
          difference: balanceDifference,
          isBalanced,
          statusText,
        },
      },
    });
  } catch (error: any) {
    console.error('Finances summary error:', error);
    return res.status(500).json({ error: 'Moliyaviy ko\'rsatkichlarni yuklashda xatolik' });
  }
});

export default router;
