import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { requireAdminConfirm } from '../lib/security';
import { Role } from '@prisma/client';
import { CalculationService } from '../services/calculation.service';
import { pushDealToGoogleSheets } from '../services/sheetsSync.service';
import { DealStatus, PaymentStatus } from '@prisma/client';

const router = Router();

// Helper to fetch commission rules
async function getActiveRules() {
  const rules = await prisma.commissionRule.findMany({
    where: { isActive: true },
    include: { store: true, provider: true },
    orderBy: { priority: 'desc' },
  });
  return rules.map((r) => ({
    storeName: r.store?.name || null,
    providerName: r.provider?.name || null,
    ratePercent: Number(r.ratePercent),
    priority: r.priority,
  }));
}

// GET /api/deals
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      search,
      startDate,
      endDate,
      status,
      paymentStatus,
      storeId,
      providerId,
      agencyId,
      agentId,
      page = '1',
      limit = '50',
      sortBy = 'dealNumber',
      sortOrder = 'desc',
    } = req.query as any;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone1: { contains: search, mode: 'insensitive' } },
        { customerPhone2: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { imeiBarcode: { contains: search, mode: 'insensitive' } },
        { sellerName: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
        { dealNumber: isNaN(Number(search)) ? undefined : Number(search) },
      ].filter(Boolean);
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const startIso = String(startDate).length === 10 ? `${startDate}T00:00:00.000+05:00` : startDate;
        where.date.gte = new Date(startIso);
      }
      if (endDate) {
        const endIso = String(endDate).length === 10 ? `${endDate}T23:59:59.999+05:00` : endDate;
        where.date.lte = new Date(endIso);
      }
    }

    if (status) where.status = status as DealStatus;
    if (paymentStatus) where.paymentStatus = paymentStatus as PaymentStatus;
    if (storeId) where.storeId = storeId;
    if (providerId) where.providerId = providerId;
    if (agencyId) where.agencyId = agencyId;
    if (agentId) where.agentId = agentId;
    if ((req.query as any).daftar === 'true') where.isDaftar = true;
    if ((req.query as any).daftar === 'false') where.isDaftar = false;

    const [totalCount, deals] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
        include: {
          store: true,
          provider: true,
          agency: true,
          agent: true,
          buyer: true,
          createdBy: { select: { id: true, fullName: true, username: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limitNum,
      }),
    ]);

    return res.json({
      deals,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Fetch deals error:', error);
    return res.status(500).json({ error: 'Bitimlarni yuklashda xatolik' });
  }
});

// GET /api/deals/totals (Aggregated sums for summary cards and table footer)
router.get('/totals', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, storeId, providerId, agencyId } = req.query as any;

    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const startIso = String(startDate).length === 10 ? `${startDate}T00:00:00.000+05:00` : startDate;
        where.date.gte = new Date(startIso);
      }
      if (endDate) {
        const endIso = String(endDate).length === 10 ? `${endDate}T23:59:59.999+05:00` : endDate;
        where.date.lte = new Date(endIso);
      }
    }
    if (storeId) where.storeId = storeId;
    if (providerId) where.providerId = providerId;
    if (agencyId) where.agencyId = agencyId;

    const deals = await prisma.deal.findMany({
      where,
      select: {
        customerLimit: true,
        withdrawnLimit: true,
        agentAmount: true,
        totalPurchaseCost: true,
        calculatedAmount: true,
        remainingLimit: true,
        differenceAmount: true,
        extraDaftar: true,
        qodirDebt: true,
        qodirBalance: true,
        greenBazarBalance: true,
        trustBalance: true,
        totalExtraBalance: true,
        salePrice: true,
        profit: true,
        receivedFromBuyer: true,
        debtRemainder: true,
        status: true,
        store: { select: { name: true } },
      },
    });

    const totals = deals.reduce(
      (acc, d) => {
        acc.dealCount += 1;
        acc.totalLimit += Number(d.customerLimit) || 0;
        acc.totalWithdrawn += Number(d.withdrawnLimit) || 0;
        acc.totalAgentAmount += Number(d.agentAmount) || 0;
        acc.totalPurchaseCost += Number(d.totalPurchaseCost) || 0;
        acc.totalCalculatedAmount += Number(d.calculatedAmount) || 0;
        acc.totalRemainingLimit += Number(d.remainingLimit) || 0;
        acc.totalDifference += Number(d.differenceAmount) || 0;
        acc.totalDaftar += Number(d.extraDaftar) || 0;
        acc.totalQodirDebt += Number(d.qodirDebt) || 0;
        acc.totalQodirBalance += Number(d.qodirBalance) || 0;
        acc.totalGreenBazarBalance += Number(d.greenBazarBalance) || 0;
        acc.totalTrustBalance += Number(d.trustBalance) || 0;
        acc.totalExtraBalance += Number(d.totalExtraBalance) || 0;
        acc.totalSalePrice += Number(d.salePrice) || 0;
        acc.totalProfit += Number(d.profit) || 0;
        acc.totalReceived += Number(d.receivedFromBuyer) || 0;
        acc.totalDebtRemainder += Number(d.debtRemainder) || 0;

        const storeName = (d.store?.name || '').toLowerCase();
        if (storeName.includes('qodir')) {
          acc.totalQodirChekExpense += (Number(d.calculatedAmount) || 0) + (Number(d.agentAmount) || 0);
          acc.qodirChekDealCount += 1;
        }

        if (d.status === DealStatus.IN_WAREHOUSE || d.status === DealStatus.IN_TRANSIT) {
          acc.warehouseCostSum += Number(d.totalPurchaseCost) || 0;
          acc.warehouseCount += 1;
        }
        if (d.status === DealStatus.SOLD) {
          acc.cogsSum += Number(d.totalPurchaseCost) || 0;
          acc.soldCount += 1;
        }

        return acc;
      },
      {
        dealCount: 0,
        totalLimit: 0,
        totalWithdrawn: 0,
        totalAgentAmount: 0,
        totalPurchaseCost: 0,
        totalCalculatedAmount: 0,
        totalRemainingLimit: 0,
        totalDifference: 0,
        totalDaftar: 0,
        totalQodirDebt: 0,
        totalQodirBalance: 0,
        totalGreenBazarBalance: 0,
        totalTrustBalance: 0,
        totalExtraBalance: 0,
        totalSalePrice: 0,
        totalProfit: 0,
        totalReceived: 0,
        totalDebtRemainder: 0,
        warehouseCostSum: 0,
        warehouseCount: 0,
        cogsSum: 0,
        soldCount: 0,
        totalQodirChekExpense: 0,
        qodirChekDealCount: 0,
      }
    );

    return res.json(totals);
  } catch (error: any) {
    console.error('Totals error:', error);
    return res.status(500).json({ error: 'Jami summalarni hisoblashda xatolik' });
  }
});

// GET /api/deals/swot-daily (Automated multidimensional daily SWOT aggregator)
router.get('/swot-daily', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, storeId, providerId, period } = req.query as any;

    const tashkentOffset = 5 * 60 * 60 * 1000;
    const todayStr = new Date(Date.now() + tashkentOffset).toISOString().slice(0, 10);

    const where: any = {};
    if (period === 'today') {
      const startIso = `${todayStr}T00:00:00.000+05:00`;
      const endIso = `${todayStr}T23:59:59.999+05:00`;
      where.date = { gte: new Date(startIso), lte: new Date(endIso) };
    } else if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const startIso = String(startDate).length === 10 ? `${startDate}T00:00:00.000+05:00` : startDate;
        where.date.gte = new Date(startIso);
      }
      if (endDate) {
        const endIso = String(endDate).length === 10 ? `${endDate}T23:59:59.999+05:00` : endDate;
        where.date.lte = new Date(endIso);
      }
    }
    if (storeId) where.storeId = storeId;
    if (providerId) where.providerId = providerId;

    const [deals, allDealsForToday, liquidTxs] = await Promise.all([
      prisma.deal.findMany({
        where,
        include: { store: true, provider: true, agency: true },
        orderBy: { date: 'asc' },
      }),
      prisma.deal.findMany({
        where: {
          date: {
            gte: new Date(`${todayStr}T00:00:00.000+05:00`),
            lte: new Date(`${todayStr}T23:59:59.999+05:00`),
          },
        },
        include: { store: true },
      }),
      prisma.ddsTransaction.findMany({
        select: { type: true, amount: true, account: true },
      }),
    ]);

    // Calculate current liquid cash from DDS transactions
    let liquidCash = 0;
    liquidTxs.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'INCOME') liquidCash += amt;
      else liquidCash -= amt;
    });

    // 1. Top KPI Summary Cards
    let totalDeals = deals.length;
    let totalLimitVolume = 0;
    let totalAgentCommission = 0;
    let totalBuyoutExpense = 0;
    let totalPayout = 0;
    let totalQodirChekExpense = 0;

    // Order buyout metrics
    let needToBuyCount = 0;
    let needToBuyTotal = 0;
    let boughtGoodsTotal = 0;
    let boughtGoodsCount = 0;
    const boughtGoodsSet = new Set<string>();

    // Daily grouping
    const dailyMap: { [dateStr: string]: any } = {};

    // Segmentations
    const providerMap: { [name: string]: { count: number; volume: number; commission: number } } = {};
    const storeMap: { [name: string]: { count: number; volume: number; commission: number } } = {};
    const agencyMap: { [name: string]: { count: number; volume: number; commission: number } } = {};

    deals.forEach((d) => {
      const limit = Number(d.withdrawnLimit) || 0;
      const agentFee = Number(d.agentAmount) || 0;
      const buyout = Number(d.totalPurchaseCost) || 0;
      const payout = Number(d.calculatedAmount) || 0;
      const discountPct = Number(d.purchaseDiscountPct) || 0;
      const agentRate = Number(d.agentPct) || 0;

      totalLimitVolume += limit;
      totalAgentCommission += agentFee;
      totalBuyoutExpense += buyout;
      totalPayout += payout;

      // Buyout status
      if (d.status === DealStatus.NEED_TO_BUY) {
        needToBuyCount += 1;
        needToBuyTotal += buyout;
      } else {
        boughtGoodsCount += 1;
        boughtGoodsTotal += buyout;
        if (d.productName) boughtGoodsSet.add(d.productName);
      }

      // Date key
      const dKey = d.date ? d.date.toISOString().slice(0, 10) : 'Noma\'lum';
      if (!dailyMap[dKey]) {
        dailyMap[dKey] = {
          date: dKey,
          dealsCount: 0,
          limitTotal: 0,
          agentFeeTotal: 0,
          buyoutTotal: 0,
          payoutTotal: 0,
          discounts: [] as number[],
          agentRates: [] as number[],
          extraDaftarTotal: 0,
          extraDaftarCount: 0,
          qodirDebtTotal: 0,
          qodirDebtCount: 0,
          greenBazarTotal: 0,
          qodirBalTotal: 0,
          trustTotal: 0,
          trustCount: 0,
          extraBalanceTotal: 0,
          physicalItemsQty: 0,
          physicalItems: [] as string[],
        };
      }

      const day = dailyMap[dKey];
      day.dealsCount += 1;
      day.limitTotal += limit;
      day.agentFeeTotal += agentFee;
      day.buyoutTotal += buyout;
      day.payoutTotal += payout;
      day.discounts.push(discountPct);
      day.agentRates.push(agentRate);

      const eDaftar = Number(d.extraDaftar) || 0;
      if (eDaftar > 0) {
        day.extraDaftarTotal += eDaftar;
        day.extraDaftarCount += 1;
      }

      const qDebt = Number(d.qodirDebt) || 0;
      if (qDebt > 0) {
        day.qodirDebtTotal += qDebt;
        day.qodirDebtCount += 1;
      }

      day.greenBazarTotal += Number(d.greenBazarBalance) || 0;
      day.qodirBalTotal += Number(d.qodirBalance) || 0;

      const eTrust = Number(d.trustBalance) || 0;
      if (eTrust > 0) {
        day.trustTotal += eTrust;
        day.trustCount += 1;
      }

      day.extraBalanceTotal += Number(d.totalExtraBalance) || 0;

      if (d.isActualDeviceSale) {
        day.physicalItemsQty += (Number(d.quantity) || 1);
        if (d.productName) day.physicalItems.push(d.productName);
      }

      // Segmentation grouping
      const provName = d.provider?.name || 'Boshqa';
      if (!providerMap[provName]) providerMap[provName] = { count: 0, volume: 0, commission: 0 };
      providerMap[provName].count += 1;
      providerMap[provName].volume += limit;
      providerMap[provName].commission += agentFee;

      const stName = d.store?.name || 'Boshqa';
      const isQodir = stName.toLowerCase().includes('qodir');
      const qodirChekExpense = isQodir ? (payout + agentFee) : 0;
      totalQodirChekExpense += qodirChekExpense;
      day.qodirChekExpenseTotal = (day.qodirChekExpenseTotal || 0) + qodirChekExpense;

      if (!storeMap[stName]) storeMap[stName] = { count: 0, volume: 0, commission: 0 };
      storeMap[stName].count += 1;
      storeMap[stName].volume += limit;
      storeMap[stName].commission += agentFee;

      const agName = d.agency?.name || 'Mustaqil';
      if (!agencyMap[agName]) agencyMap[agName] = { count: 0, volume: 0, commission: 0 };
      agencyMap[agName].count += 1;
      agencyMap[agName].volume += limit;
      agencyMap[agName].commission += agentFee;
    });

    const grossMargin = totalLimitVolume - totalPayout;

    // Build finalized daily rows
    const dailyRows = Object.values(dailyMap)
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .map((row: any) => {
        const c = row.dealsCount || 1;
        const discountAvg = row.discounts.length ? row.discounts.reduce((a: number, b: number) => a + b, 0) / row.discounts.length : 0;
        const agentRateAvg = row.agentRates.length ? row.agentRates.reduce((a: number, b: number) => a + b, 0) / row.agentRates.length : 0;
        const organicBuyoutTotal = row.buyoutTotal - row.extraBalanceTotal;

        // Roll-forward roll: Hasan vs Qodir expenses
        const expenseHasan = row.payoutTotal - row.qodirDebtTotal - row.greenBazarTotal;
        const expenseQodir = row.qodirDebtTotal;

        return {
          date: row.date,
          dealsCount: row.dealsCount,
          limitTotal: row.limitTotal,
          limitAvg: Math.round(row.limitTotal / c),
          agentFeeTotal: row.agentFeeTotal,
          agentFeeAvg: Math.round(row.agentFeeTotal / c),
          buyoutTotal: row.buyoutTotal,
          buyoutAvg: Math.round(row.buyoutTotal / c),
          payoutTotal: row.payoutTotal,
          payoutAvg: Math.round(row.payoutTotal / c),
          discountAvg,
          agentRateAvg,
          extraDaftarTotal: row.extraDaftarTotal,
          extraDaftarCount: row.extraDaftarCount,
          qodirDebtTotal: row.qodirDebtTotal,
          qodirDebtCount: row.qodirDebtCount,
          qodirChekExpenseTotal: row.qodirChekExpenseTotal || 0,
          greenBazarTotal: row.greenBazarTotal,
          qodirBalTotal: row.qodirBalTotal,
          trustTotal: row.trustTotal,
          trustCount: row.trustCount,
          extraBalanceTotal: row.extraBalanceTotal,
          organicBuyoutTotal,
          physicalItemsQty: row.physicalItemsQty,
          physicalItemsList: row.physicalItems.length ? row.physicalItems.join(', ') : '-',
          expenseHasan,
          expenseQodir,
        };
      });

    // Build finalized segmentations with share percentage
    const formatSegment = (map: { [k: string]: { count: number; volume: number; commission: number } }) =>
      Object.entries(map).map(([name, val]) => ({
        name,
        count: val.count,
        volume: val.volume,
        commission: val.commission,
        sharePct: totalLimitVolume > 0 ? val.volume / totalLimitVolume : 0,
      })).sort((a, b) => b.volume - a.volume);

    const topKPI = {
      totalDeals,
      totalLimitVolume,
      totalAgentCommission,
      totalBuyoutExpense,
      totalPayout,
      grossMargin,
      totalQodirChekExpense,
    };

    // Calculate Today's specific KPI from allDealsForToday
    let todayDealsCount = allDealsForToday.length;
    let todayLimitVolume = 0;
    let todayAgentCommission = 0;
    let todayBuyoutExpense = 0;
    let todayPayout = 0;
    let todayQodirChekExpense = 0;

    allDealsForToday.forEach((d) => {
      todayLimitVolume += Number(d.withdrawnLimit) || 0;
      todayAgentCommission += Number(d.agentAmount) || 0;
      todayBuyoutExpense += Number(d.totalPurchaseCost) || 0;
      todayPayout += Number(d.calculatedAmount) || 0;
      const storeName = d.store?.name?.toLowerCase() || '';
      if (storeName.includes('qodir')) {
        todayQodirChekExpense += (Number(d.calculatedAmount) || 0) + (Number(d.agentAmount) || 0);
      }
    });

    const todayKPI = {
      totalDeals: todayDealsCount,
      totalLimitVolume: todayLimitVolume,
      totalAgentCommission: todayAgentCommission,
      totalBuyoutExpense: todayBuyoutExpense,
      totalPayout: todayPayout,
      grossMargin: todayLimitVolume - todayPayout,
      totalQodirChekExpense: todayQodirChekExpense,
      date: todayStr,
    };

    return res.json({
      summary: topKPI,
      topKPI,
      todayKPI,
      todayStr,
      orderBuyout: {
        needToBuyCount,
        needToBuyTotal,
        boughtGoodsCount,
        boughtGoodsTotal,
        boughtGoodsList: Array.from(boughtGoodsSet).slice(0, 8),
        liquidCash,
      },
      orderBuyoutAnalytics: {
        needToBuyCount,
        needToBuyTotal,
        boughtGoodsCount,
        boughtGoodsTotal,
        boughtGoodsList: Array.from(boughtGoodsSet).slice(0, 8),
        liquidCash,
      },
      dailyRows,
      segmentations: {
        providers: formatSegment(providerMap),
        stores: formatSegment(storeMap),
        agencies: formatSegment(agencyMap),
      },
    });
  } catch (error: any) {
    console.error('SWOT Daily Error:', error);
    return res.status(500).json({ error: 'SWOT aggregatsiyasida xatolik' });
  }
});

// GET /api/deals/:id
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: {
        store: true,
        provider: true,
        agency: true,
        agent: true,
        buyer: true,
        botDeal: true,
      },
    });
    if (!deal) return res.status(404).json({ error: 'Bitim topilmadi' });
    return res.json(deal);
  } catch (error: any) {
    return res.status(500).json({ error: 'Bitimni olishda xatolik' });
  }
});

// POST /api/deals (Create new deal)
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body;

    // Get store and provider info for calculation
    const store = await prisma.store.findUnique({ where: { id: body.storeId } });
    const provider = await prisma.provider.findUnique({ where: { id: body.providerId } });
    if (!store || !provider) {
      return res.status(400).json({ error: 'Do\'kon yoki provayder tanlanmagan' });
    }

    const rules = await getActiveRules();

    // If not specifically NEED_TO_BUY, set status to PENDING (Kutilmoqda) for warehouse intake
    const initialStatus = body.status === DealStatus.NEED_TO_BUY 
      ? DealStatus.NEED_TO_BUY 
      : (body.status || DealStatus.PENDING);

    // Aggregate multiple devices if provided
    let finalProductName = body.productName;
    let finalImeiBarcode = body.imeiBarcode;
    let finalQuantity = Number(body.quantity) || 1;
    let finalColor = body.color;
    let finalStorageGb = body.storageGb;

    if (Array.isArray(body.deviceItems) && body.deviceItems.length > 0) {
      finalQuantity = body.deviceItems.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);
      finalProductName = body.deviceItems.map((it: any) => {
        const parts = [it.productName || 'Qurilma'];
        if (it.storageGb) parts.push(it.storageGb);
        if (it.color) parts.push(it.color);
        if (Number(it.quantity) > 1) parts.push(`(${it.quantity} ta)`);
        return parts.filter(Boolean).join(' ');
      }).join(', ');

      finalImeiBarcode = body.deviceItems.map((it: any) => {
        const ims = [it.imeiBarcode, it.imei2].filter(Boolean);
        return ims.join('/');
      }).filter(Boolean).join(', ');

      finalColor = body.deviceItems[0]?.color || finalColor;
      finalStorageGb = body.deviceItems[0]?.storageGb || finalStorageGb;
    }

    const calcResult = CalculationService.calculateDeal(
      {
        customerLimit: body.customerLimit,
        withdrawnLimit: body.withdrawnLimit,
        calculatedAmount: body.calculatedAmount,
        storeName: store.name,
        providerName: provider.name,
        isDaftarManual: body.isDaftar !== undefined ? (body.isDaftar === true || body.isDaftar === 'true') : undefined,
        productName: finalProductName,
        quantity: finalQuantity,
        imeiBarcode: finalImeiBarcode,
        salePrice: body.salePrice,
        receivedFromBuyer: body.receivedFromBuyer,
        status: initialStatus,
        date: body.date,
      },
      rules
    );

    // Generate deal number if not provided
    let dealNumber = Number(body.dealNumber);
    if (!dealNumber) {
      const lastDeal = await prisma.deal.findFirst({ orderBy: { dealNumber: 'desc' } });
      dealNumber = (lastDeal?.dealNumber || 3500) + 1;
    }

    const newDeal = await prisma.deal.create({
      data: {
        dealNumber,
        date: body.date 
          ? new Date(String(body.date).length === 10 ? `${body.date}T12:00:00.000+05:00` : body.date) 
          : new Date(),
        sellerName: body.sellerName || req.user!.fullName,
        createdById: req.user!.id,
        providerId: body.providerId,
        isDaftar: calcResult.isDaftar,
        customerName: body.customerName,
        customerPhone1: body.customerPhone1,
        customerPhone2: body.customerPhone2,
        contractUrl: body.contractUrl,
        passportPhotoUrl: body.passportPhotoUrl,
        storeId: body.storeId,
        customerLimit: body.customerLimit || 0,
        withdrawnLimit: body.withdrawnLimit || 0,
        agentAmount: calcResult.agentAmount,
        totalPurchaseCost: calcResult.totalPurchaseCost,
        purchaseDiscountPct: calcResult.purchaseDiscountPct,
        agentPct: calcResult.agentPct,
        calculatedAmount: body.calculatedAmount || 0,
        remainingLimit: calcResult.remainingLimit,
        differenceAmount: calcResult.differenceAmount,
        isActualDeviceSale: calcResult.isActualDeviceSale,
        productName: finalProductName,
        quantity: finalQuantity,
        imeiBarcode: finalImeiBarcode,
        imei2: body.imei2,
        color: finalColor,
        storageGb: finalStorageGb,
        deviceItems: body.deviceItems || null,
        statusChangeReason: body.statusChangeReason || (initialStatus === DealStatus.PENDING ? 'Omborga qabul qilish kutilmoqda' : null),
        debtDueDate: body.debtDueDate ? new Date(body.debtDueDate) : null,
        status: calcResult.status,
        agencyId: body.agencyId || null,
        agentId: body.agentId || null,
        extraDaftar: calcResult.extraDaftar,
        qodirDebt: calcResult.qodirDebt,
        qodirBalance: calcResult.qodirBalance,
        greenBazarBalance: calcResult.greenBazarBalance,
        trustBalance: calcResult.trustBalance,
        totalExtraBalance: calcResult.totalExtraBalance,
        buyerId: body.buyerId || null,
        saleDate: body.saleDate ? new Date(body.saleDate) : null,
        salePrice: body.salePrice || 0,
        paidTransfer: body.paidTransfer || 0,
        paidCashUzs: body.paidCashUzs || 0,
        paidCashUsd: body.paidCashUsd || 0,
        paidBank: body.paidBank || 0,
        exchangeRate: body.exchangeRate || 1,
        profit: calcResult.profit,
        marginPct: calcResult.marginPct,
        receivedFromBuyer: body.receivedFromBuyer || 0,
        debtRemainder: calcResult.debtRemainder,
        paymentStatus: calcResult.paymentStatus,
        note: body.note,
      },
      include: {
        store: true,
        provider: true,
        agency: true,
        agent: true,
        buyer: true,
      },
    });

    // Optionally create DDS expense for the payout/buyout amount (Issue 1)
    if (body.autoDdsExpense) {
      const expAmt = Number(body.calculatedAmount || calcResult.totalPurchaseCost) || 0;
      if (expAmt > 0) {
        try {
          const allTxs = await prisma.ddsTransaction.findMany({
            where: { txNumber: { startsWith: 'TX-' } },
            select: { txNumber: true },
            orderBy: { createdAt: 'desc' },
            take: 200,
          });
          let maxNum = 1000;
          for (const t of allTxs) {
            const val = parseInt(t.txNumber.replace(/^TX-/, ''), 10);
            if (!isNaN(val) && val > maxNum && val < 900000000) maxNum = val;
          }
          let nextNum = maxNum + 1;
          let txNumber = `TX-${nextNum}`;
          while (await prisma.ddsTransaction.findUnique({ where: { txNumber } })) {
            nextNum++;
            txNumber = `TX-${nextNum}`;
          }

          await prisma.ddsTransaction.create({
            data: {
              txNumber,
              dateTime: newDeal.date || new Date(),
              type: 'EXPENSE',
              account: (body.ddsAccount || 'CASH') as any,
              expenseType: 'COGS',
              categoryName: 'Mijozga berilgan summa (Tovar xaridi)',
              sourcePerson: newDeal.sellerName || req.user!.fullName,
              amount: expAmt,
              description: `№${newDeal.dealNumber} - ${newDeal.customerName || 'Mijoz'} cheki bo'yicha berilgan summa`,
              createdById: req.user!.id,
            },
          });
        } catch (e: any) {
          console.error('[Deal autoDdsExpense error]:', e.message);
        }
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        entity: 'Deal',
        entityId: newDeal.id,
        action: 'CREATE',
        newValues: newDeal as any,
      },
    });

    // 2 tomonlama sinxronizatsiya: Yangi bitimni Google Sheets jadvaliga ham yozish
    pushDealToGoogleSheets(newDeal).catch((err) =>
      console.error('[GoogleSheets Push] Bitimni sheetsga yuborishda xatolik:', err.message)
    );

    return res.status(201).json(newDeal);
  } catch (error: any) {
    console.error('Create deal error:', error);
    return res.status(500).json({ error: 'Bitim yaratishda xatolik: ' + error.message });
  }
});

// PUT /api/deals/:id (Update deal)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const existingDeal = await prisma.deal.findUnique({
      where: { id },
      include: { store: true, provider: true },
    });
    if (!existingDeal) return res.status(404).json({ error: 'Bitim topilmadi' });

    const storeId = body.storeId || existingDeal.storeId;
    const providerId = body.providerId || existingDeal.providerId;

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!store || !provider) return res.status(400).json({ error: 'Do\'kon yoki provayder xato' });

    const rules = await getActiveRules();

    // Check if status is changed, reason must be provided
    if (body.status && body.status !== existingDeal.status) {
      if (!body.statusChangeReason || !body.statusChangeReason.trim()) {
        return res.status(400).json({ error: "Holatni o'zgartirish sababi (izoh) kiritilishi shart!" });
      }
    }

    // Aggregate multiple devices if provided
    let finalProductName = body.productName !== undefined ? body.productName : existingDeal.productName;
    let finalImeiBarcode = body.imeiBarcode !== undefined ? body.imeiBarcode : existingDeal.imeiBarcode;
    let finalQuantity = body.quantity !== undefined ? body.quantity : existingDeal.quantity;
    let finalColor = body.color !== undefined ? body.color : existingDeal.color;
    let finalStorageGb = body.storageGb !== undefined ? body.storageGb : existingDeal.storageGb;

    if (Array.isArray(body.deviceItems) && body.deviceItems.length > 0) {
      finalQuantity = body.deviceItems.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);
      finalProductName = body.deviceItems.map((it: any) => {
        const parts = [it.productName || 'Qurilma'];
        if (it.storageGb) parts.push(it.storageGb);
        if (it.color) parts.push(it.color);
        if (Number(it.quantity) > 1) parts.push(`(${it.quantity} ta)`);
        return parts.filter(Boolean).join(' ');
      }).join(', ');

      finalImeiBarcode = body.deviceItems.map((it: any) => {
        const ims = [it.imeiBarcode, it.imei2].filter(Boolean);
        return ims.join('/');
      }).filter(Boolean).join(', ');

      finalColor = body.deviceItems[0]?.color || finalColor;
      finalStorageGb = body.deviceItems[0]?.storageGb || finalStorageGb;
    }

    const calcResult = CalculationService.calculateDeal(
      {
        customerLimit: body.customerLimit !== undefined ? body.customerLimit : Number(existingDeal.customerLimit),
        withdrawnLimit: body.withdrawnLimit !== undefined ? body.withdrawnLimit : Number(existingDeal.withdrawnLimit),
        calculatedAmount: body.calculatedAmount !== undefined ? body.calculatedAmount : Number(existingDeal.calculatedAmount),
        storeName: store.name,
        providerName: provider.name,
        isDaftarManual: body.isDaftar !== undefined ? (body.isDaftar === true || body.isDaftar === 'true') : existingDeal.isDaftar,
        productName: finalProductName,
        quantity: finalQuantity,
        imeiBarcode: finalImeiBarcode,
        salePrice: body.salePrice !== undefined ? body.salePrice : Number(existingDeal.salePrice),
        receivedFromBuyer: body.receivedFromBuyer !== undefined ? body.receivedFromBuyer : Number(existingDeal.receivedFromBuyer),
        status: body.status || existingDeal.status,
        date: body.date || existingDeal.date,
      },
      rules
    );

    const updated = await prisma.deal.update({
      where: { id },
      data: {
        date: body.date 
          ? new Date(String(body.date).length === 10 ? `${body.date}T12:00:00.000+05:00` : body.date) 
          : existingDeal.date,
        sellerName: body.sellerName || existingDeal.sellerName,
        providerId,
        isDaftar: calcResult.isDaftar,
        customerName: body.customerName !== undefined ? body.customerName : existingDeal.customerName,
        customerPhone1: body.customerPhone1 !== undefined ? body.customerPhone1 : existingDeal.customerPhone1,
        customerPhone2: body.customerPhone2 !== undefined ? body.customerPhone2 : existingDeal.customerPhone2,
        contractUrl: body.contractUrl !== undefined ? body.contractUrl : existingDeal.contractUrl,
        passportPhotoUrl: body.passportPhotoUrl !== undefined ? body.passportPhotoUrl : existingDeal.passportPhotoUrl,
        storeId,
        customerLimit: body.customerLimit !== undefined ? body.customerLimit : existingDeal.customerLimit,
        withdrawnLimit: body.withdrawnLimit !== undefined ? body.withdrawnLimit : existingDeal.withdrawnLimit,
        agentAmount: calcResult.agentAmount,
        totalPurchaseCost: calcResult.totalPurchaseCost,
        purchaseDiscountPct: calcResult.purchaseDiscountPct,
        agentPct: calcResult.agentPct,
        calculatedAmount: body.calculatedAmount !== undefined ? body.calculatedAmount : existingDeal.calculatedAmount,
        remainingLimit: calcResult.remainingLimit,
        differenceAmount: calcResult.differenceAmount,
        isActualDeviceSale: calcResult.isActualDeviceSale,
        productName: finalProductName,
        quantity: finalQuantity,
        imeiBarcode: finalImeiBarcode,
        imei2: body.imei2 !== undefined ? body.imei2 : existingDeal.imei2,
        color: finalColor,
        storageGb: finalStorageGb,
        deviceItems: body.deviceItems !== undefined ? body.deviceItems : (existingDeal as any).deviceItems,
        statusChangeReason: body.statusChangeReason !== undefined ? body.statusChangeReason : existingDeal.statusChangeReason,
        debtDueDate: body.debtDueDate !== undefined ? (body.debtDueDate ? new Date(body.debtDueDate) : null) : existingDeal.debtDueDate,
        status: calcResult.status,
        agencyId: body.agencyId !== undefined ? body.agencyId : existingDeal.agencyId,
        agentId: body.agentId !== undefined ? body.agentId : existingDeal.agentId,
        extraDaftar: calcResult.extraDaftar,
        qodirDebt: calcResult.qodirDebt,
        qodirBalance: calcResult.qodirBalance,
        greenBazarBalance: calcResult.greenBazarBalance,
        trustBalance: calcResult.trustBalance,
        totalExtraBalance: calcResult.totalExtraBalance,
        buyerId: body.buyerId !== undefined ? body.buyerId : existingDeal.buyerId,
        saleDate: body.saleDate ? new Date(body.saleDate) : existingDeal.saleDate,
        salePrice: body.salePrice !== undefined ? body.salePrice : existingDeal.salePrice,
        paidTransfer: body.paidTransfer !== undefined ? body.paidTransfer : existingDeal.paidTransfer,
        paidCashUzs: body.paidCashUzs !== undefined ? body.paidCashUzs : existingDeal.paidCashUzs,
        paidCashUsd: body.paidCashUsd !== undefined ? body.paidCashUsd : existingDeal.paidCashUsd,
        paidBank: body.paidBank !== undefined ? body.paidBank : existingDeal.paidBank,
        exchangeRate: body.exchangeRate !== undefined ? body.exchangeRate : existingDeal.exchangeRate,
        profit: calcResult.profit,
        marginPct: calcResult.marginPct,
        receivedFromBuyer: body.receivedFromBuyer !== undefined ? body.receivedFromBuyer : existingDeal.receivedFromBuyer,
        debtRemainder: calcResult.debtRemainder,
        paymentStatus: calcResult.paymentStatus,
        note: body.note !== undefined ? body.note : existingDeal.note,
      },
      include: {
        store: true,
        provider: true,
        agency: true,
        agent: true,
        buyer: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        entity: 'Deal',
        entityId: updated.id,
        action: 'UPDATE',
        oldValues: existingDeal as any,
        newValues: updated as any,
      },
    });

    // 2 tomonlama sinxronizatsiya: Yangilangan bitimni Google Sheets jadvaliga ham yozish
    pushDealToGoogleSheets(updated).catch((err) =>
      console.error('[GoogleSheets Push] Bitimni sheetsga yangilashda xatolik:', err.message)
    );

    return res.json(updated);
  } catch (error: any) {
    console.error('Update deal error:', error);
    return res.status(500).json({ error: 'Bitimni yangilashda xatolik' });
  }
});

// POST /api/deals/:id/expense-to-dds (Directly expense the deal's payout into DDS)
router.post('/:id/expense-to-dds', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { account = 'CASH', amount, description } = req.body;
    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) return res.status(404).json({ error: 'Bitim topilmadi' });

    const expAmt = Number(amount || deal.calculatedAmount || deal.totalPurchaseCost) || 0;
    if (expAmt <= 0) {
      return res.status(400).json({ error: 'Xarajat summasi 0 dan katta bo\'lishi kerak' });
    }

    const allTxs = await prisma.ddsTransaction.findMany({
      where: { txNumber: { startsWith: 'TX-' } },
      select: { txNumber: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    let maxNum = 1000;
    for (const t of allTxs) {
      const val = parseInt(t.txNumber.replace(/^TX-/, ''), 10);
      if (!isNaN(val) && val > maxNum && val < 900000000) maxNum = val;
    }
    let nextNum = maxNum + 1;
    let txNumber = `TX-${nextNum}`;
    while (await prisma.ddsTransaction.findUnique({ where: { txNumber } })) {
      nextNum++;
      txNumber = `TX-${nextNum}`;
    }

    const tx = await prisma.ddsTransaction.create({
      data: {
        txNumber,
        dateTime: deal.date || new Date(),
        type: 'EXPENSE',
        account: account as any,
        expenseType: 'COGS',
        categoryName: 'Mijozga berilgan summa (Tovar xaridi)',
        sourcePerson: deal.sellerName || req.user!.fullName,
        amount: expAmt,
        description: description || `№${deal.dealNumber} - ${deal.customerName || 'Mijoz'} cheki bo'yicha berilgan summa`,
        createdById: req.user!.id,
      },
    });

    return res.status(201).json({
      success: true,
      transaction: tx,
      message: `№${deal.dealNumber} chek bo'yicha ${expAmt.toLocaleString()} UZS DDS xarajatiga o'tkazildi!`,
    });
  } catch (err: any) {
    console.error('Expense to DDS error:', err);
    return res.status(500).json({ error: 'Xarajat qilishda xatolik: ' + err.message });
  }
});

// DELETE /api/deals/all (Clear all deals -> Dashboard, Warehouse, Agents all 0)
router.delete('/all', authenticateToken, requireRoles([Role.ADMIN]), requireAdminConfirm, async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.deal.deleteMany({});
    return res.json({
      success: true,
      deletedCount: result.count,
      message: 'Barcha bitimlar o\'chirildi. Barcha ko\'rsatkichlar 0 qilindi.',
    });
  } catch (error: any) {
    console.error('Delete all deals error:', error);
    return res.status(500).json({ error: 'Bitimlarni tozalashda xatolik: ' + error.message });
  }
});

// DELETE /api/deals/:id
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.deal.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Bitim topilmadi' });

    await prisma.deal.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        entity: 'Deal',
        entityId: id,
        action: 'DELETE',
        oldValues: existing as any,
      },
    });

    return res.json({ success: true, message: 'Bitim o\'chirildi' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Bitimni o\'chirishda xatolik' });
  }
});

export default router;
