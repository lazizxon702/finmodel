import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { DealStatus, TransactionType, ExpenseCategoryType } from '@prisma/client';

const router = Router();

// GET /api/finances/summary
router.get('/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const [deals, transactions, buyers, settings, debtsWeOwe] = await Promise.all([
      prisma.deal.findMany({ include: { buyer: true } }),
      prisma.ddsTransaction.findMany(),
      prisma.buyer.findMany(),
      prisma.appSetting.findMany(),
      prisma.debtRecord.findMany({ where: { weOwe: true } }),
    ]);

    const sMap = new Map(settings.map((s) => [s.key, s.value]));

    // 1. Warehouse Stock
    const warehouseDeals = deals.filter(
      (d) => d.status === DealStatus.IN_WAREHOUSE || d.status === DealStatus.IN_TRANSIT
    );
    const warehouseCount = warehouseDeals.length;
    const warehouseInventoryValue = warehouseDeals.reduce(
      (sum, d) => sum + (Number(d.totalPurchaseCost) || 0),
      0
    );

    // 2. Receivables (Дебиторка)
    const buyerDebts = buyers.map((b) => {
      const bDeals = deals.filter((d) => d.buyerId === b.id && d.status === DealStatus.SOLD);
      const shipped = bDeals.reduce((sum, d) => sum + (Number(d.salePrice) || 0), 0);
      const paid = bDeals.reduce((sum, d) => sum + (Number(d.receivedFromBuyer) || 0), 0);
      const remainder = shipped - paid;

      return {
        id: b.id,
        buyerName: b.name,
        type: 'Xaridor (Дебит)',
        shipped,
        paid,
        remainder,
      };
    });

    const totalReceivables = buyerDebts.reduce((sum, b) => sum + b.remainder, 0);

    // 3. Payables (Кредиторка) - Real debt records where we owe
    const creditors = debtsWeOwe.map((d) => ({
      name: d.debtorName,
      type: 'Kreditorlik (Кредиторка)',
      accrued: Number(d.amountUzs) || 0,
      paid: (Number(d.amountUzs) || 0) - (Number(d.remainingAmount) || 0),
      remainder: Number(d.remainingAmount) || 0,
    }));
    const totalPayables = creditors.reduce((sum, c) => sum + c.remainder, 0);

    // 4. P&L (Отчет о прибылях и убытках)
    const soldDeals = deals.filter((d) => d.status === DealStatus.SOLD);
    const salesRevenue = soldDeals.reduce((sum, d) => sum + (Number(d.salePrice) || 0), 0);
    const cogs = soldDeals.reduce((sum, d) => sum + (Number(d.totalPurchaseCost) || 0), 0);
    const grossProfit = salesRevenue - cogs;

    // DDS expenses breakdown
    let agentPayouts = 0;
    let logisticsExpenses = 0;
    let officeAndAdmin = 0;

    for (const tx of transactions) {
      if (tx.type === TransactionType.EXPENSE) {
        const cat = (tx.categoryName || '').toLowerCase();
        const amt = Number(tx.amount) || 0;
        if (cat.includes('агент') || cat.includes('партнер') || cat.includes('комисси')) {
          agentPayouts += amt;
        } else if (cat.includes('логистик') || cat.includes('доставк')) {
          logisticsExpenses += amt;
        } else if (cat.includes('аренд') || cat.includes('связь') || cat.includes('офис')) {
          officeAndAdmin += amt;
        }
      }
    }

    const totalOpex = agentPayouts + logisticsExpenses + officeAndAdmin;
    const netProfit = grossProfit - totalOpex;
    const rosPct = salesRevenue > 0 ? netProfit / salesRevenue : 0;

    // 5. Cash Flow
    let liquidCashFromTx = 0;
    for (const tx of transactions) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === TransactionType.INCOME) liquidCashFromTx += amt;
      else liquidCashFromTx -= amt;
    }

    const beginningCash = Number(sMap.get('initial_cash')) || 0;
    const buyerInflows = deals.reduce((sum, d) => sum + (Number(d.receivedFromBuyer) || 0), 0);
    const investorLoanInflow = transactions.length > 0 ? (Number(sMap.get('investor_loan')) || 0) : 0;
    const totalInflows = buyerInflows + investorLoanInflow;

    const purchaseOutflows = deals.reduce((sum, d) => sum + (Number(d.totalPurchaseCost) || 0), 0);
    const uzimeiOutflows = 0;
    const opexOutflows = totalOpex;
    const totalOutflows = purchaseOutflows + uzimeiOutflows + opexOutflows;

    const hasData = deals.length > 0 || transactions.length > 0 || beginningCash > 0;
    const endingCash = hasData ? (beginningCash + totalInflows - totalOutflows) : 0;
    const netCashFlow = hasData ? (totalInflows - totalOutflows) : 0;

    // 6. Management Balance Sheet (Активы и Пассивы)
    const fixedAssets = hasData ? (Number(sMap.get('fixed_assets')) || 0) : 0;
    const totalAssets = endingCash + warehouseInventoryValue + totalReceivables + fixedAssets;

    const longTermLoan = hasData ? (Number(sMap.get('investor_loan')) || 0) : 0;
    const charterCapital = hasData ? (Number(sMap.get('charter_capital')) || 0) : 0;
    const retainedEarnings = hasData ? (totalAssets - totalPayables - longTermLoan - charterCapital) : 0;
    const totalLiabilitiesAndEquity = totalPayables + longTermLoan + charterCapital + retainedEarnings;

    const balanceDifference = Math.round(totalAssets - totalLiabilitiesAndEquity);
    const isBalanced = Math.abs(balanceDifference) < 1;

    return res.json({
      cards: {
        liquidCash: endingCash,
        warehouseValue: warehouseInventoryValue,
        warehouseCount,
        inTransitCount: deals.filter((d) => d.status === DealStatus.IN_TRANSIT).length,
        receivablesDebt: totalReceivables,
        netProfit,
        rosPct,
      },
      receivables: buyerDebts,
      payables: creditors,
      totals: {
        totalReceivables,
        totalPayables,
      },
      pnl: {
        salesRevenue,
        cogs,
        grossProfit,
        agentPayouts,
        logisticsExpenses,
        officeAndAdmin,
        totalOpex,
        netProfit,
        rosPct,
      },
      cashFlow: {
        beginningCash,
        buyerInflows,
        investorLoanInflow,
        totalInflows,
        purchaseOutflows,
        uzimeiOutflows,
        opexOutflows,
        totalOutflows,
        netCashFlow,
        endingCash,
      },
      balanceSheet: {
        assets: {
          cash: endingCash,
          inventory: warehouseInventoryValue,
          receivables: totalReceivables,
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
        balanceCheck: {
          difference: balanceDifference,
          isBalanced,
          statusText: isBalanced ? 'Balans mos (Баланс сходится)' : `Farq bor: ${balanceDifference.toLocaleString()} UZS`,
        },
      },
    });
  } catch (error: any) {
    console.error('Finances summary error:', error);
    return res.status(500).json({ error: 'Moliyaviy ko\'rsatkichlarni yuklashda xatolik' });
  }
});

export default router;
