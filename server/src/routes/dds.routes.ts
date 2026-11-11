import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { requireAdminConfirm } from '../lib/security';
import { Role } from '@prisma/client';
import { TransactionType, AccountType, ExpenseCategoryType } from '@prisma/client';

const router = Router();

// GET /api/dds
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      type,
      account,
      expenseType,
      categoryName,
      startDate,
      endDate,
      search,
      page = '1',
      limit = '500',
      sortOrder = 'asc',
    } = req.query as any;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 500;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      amount: { gt: 0 },
    };
    if (type) where.type = type as TransactionType;
    if (account) where.account = account as AccountType;
    if (expenseType) where.expenseType = expenseType as ExpenseCategoryType;
    if (categoryName) where.categoryName = { contains: categoryName, mode: 'insensitive' };

    if (startDate || endDate) {
      where.dateTime = {};
      if (startDate) where.dateTime.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.dateTime.lte = end;
      }
    }

    if (search) {
      where.OR = [
        { txNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { categoryName: { contains: search, mode: 'insensitive' } },
        { sourcePerson: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderDir = sortOrder === 'desc' ? 'desc' : 'asc';

    const [totalCount, transactions] = await Promise.all([
      prisma.ddsTransaction.count({ where }),
      prisma.ddsTransaction.findMany({
        where,
        orderBy: { dateTime: orderDir },
        skip,
        take: limitNum,
      }),
    ]);

    return res.json({
      transactions,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error: any) {
    console.error('DDS transactions error:', error);
    return res.status(500).json({ error: 'DDS tranzaksiyalarini yuklashda xatolik' });
  }
});

// GET /api/dds/categories (Distinct categories)
router.get('/categories', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const raw = await prisma.ddsTransaction.findMany({
      select: { categoryName: true },
      distinct: ['categoryName'],
      where: { categoryName: { not: null } },
    });
    const categories = raw.map((r) => r.categoryName).filter(Boolean);
    return res.json(categories);
  } catch (error: any) {
    console.error('DDS categories error:', error);
    return res.status(500).json({ error: 'Kategoriyalarni yuklashda xatolik' });
  }
});

// GET /api/dds/summary
router.get('/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query as any;

    const where: any = {};
    if (startDate || endDate) {
      where.dateTime = {};
      if (startDate) where.dateTime.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.dateTime.lte = end;
      }
    }

    const allTx = await prisma.ddsTransaction.findMany({ where });

    let totalIncome = 0;
    let totalExpense = 0;
    let totalCogs = 0;
    let totalOpex = 0;

    let cashIncome = 0;
    let cashExpense = 0;
    let cardIncome = 0;
    let cardExpense = 0;
    let settlementIncome = 0;
    let settlementExpense = 0;

    const categoryMap: { [cat: string]: { amount: number; type: ExpenseCategoryType } } = {};

    for (const tx of allTx) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === TransactionType.INCOME) {
        totalIncome += amt;
        if (tx.account === AccountType.CASH) cashIncome += amt;
        else if (tx.account === AccountType.BANK_CARD) cardIncome += amt;
        else if (tx.account === AccountType.SETTLEMENT_ACCOUNT) settlementIncome += amt;
      } else {
        totalExpense += amt;
        if (tx.account === AccountType.CASH) cashExpense += amt;
        else if (tx.account === AccountType.BANK_CARD) cardExpense += amt;
        else if (tx.account === AccountType.SETTLEMENT_ACCOUNT) settlementExpense += amt;

        if (tx.expenseType === ExpenseCategoryType.COGS) totalCogs += amt;
        else if (tx.expenseType === ExpenseCategoryType.OPEX) totalOpex += amt;

        const cat = tx.categoryName || 'Boshqa';
        if (!categoryMap[cat]) {
          categoryMap[cat] = { amount: 0, type: tx.expenseType };
        }
        categoryMap[cat].amount += amt;
      }
    }

    const cashBalance = cashIncome - cashExpense;
    const cardBalance = cardIncome - cardExpense;
    const settlementBalance = settlementIncome - settlementExpense;
    const netCashFlow = totalIncome - totalExpense;
    const totalLiquidity = cashBalance + cardBalance + settlementBalance;

    const categoriesBreakdown = Object.entries(categoryMap).map(([catName, data]) => ({
      categoryName: catName,
      classification: data.type === ExpenseCategoryType.COGS ? 'O\'zgaruvchan (COGS)' : 'Operatsion (OPEX)',
      amount: data.amount,
      sharePct: totalExpense > 0 ? data.amount / totalExpense : 0,
    })).sort((a, b) => b.amount - a.amount);

    return res.json({
      totalIncome,
      totalExpense,
      totalCogs,
      totalOpex,
      netCashFlow,
      cashBalance,
      cardBalance,
      settlementBalance,
      totalLiquidity,
      categoriesBreakdown,
    });
  } catch (error: any) {
    console.error('DDS summary error:', error);
    return res.status(500).json({ error: 'DDS hisobotini olishda xatolik' });
  }
});

// POST /api/dds
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { dateTime, type, account, expenseType, categoryName, sourcePerson, amount, description } = req.body;

    if (!type || !account || !amount || !categoryName) {
      return res.status(400).json({ error: 'Majburiy maydonlar to\'ldirilmagan' });
    }

    // Robust Auto-generate unique TX number
    const allTxs = await prisma.ddsTransaction.findMany({
      where: { txNumber: { startsWith: 'TX-' } },
      select: { txNumber: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    let maxNum = 1000;
    for (const t of allTxs) {
      // Check if it's purely numeric after TX-
      const numPart = t.txNumber.replace(/^TX-/, '');
      const val = parseInt(numPart, 10);
      if (!isNaN(val) && val > maxNum && val < 900000000) {
        maxNum = val;
      }
    }

    let nextNum = maxNum + 1;
    let txNumber = `TX-${nextNum}`;
    let attempts = 0;
    while (await prisma.ddsTransaction.findUnique({ where: { txNumber } })) {
      nextNum++;
      txNumber = `TX-${nextNum}`;
      attempts++;
      if (attempts > 50) {
        txNumber = `TX-${Date.now()}`;
        break;
      }
    }

    const newTx = await prisma.ddsTransaction.create({
      data: {
        txNumber,
        dateTime: dateTime ? new Date(dateTime) : new Date(),
        type: type as TransactionType,
        account: account as AccountType,
        expenseType: (expenseType || ExpenseCategoryType.OPEX) as ExpenseCategoryType,
        categoryName: categoryName.trim(),
        sourcePerson: sourcePerson || req.user!.fullName,
        amount: Number(amount) || 0,
        description: description || null,
        createdById: req.user!.id,
      },
    });

    return res.status(201).json(newTx);
  } catch (error: any) {
    console.error('Create DDS error:', error);
    return res.status(500).json({ error: 'Tranzaksiya yaratishda xatolik: ' + (error.message || error) });
  }
});

// DELETE /api/dds/all (Clear all transactions -> Balance = 0)
router.delete('/all', authenticateToken, requireRoles([Role.ADMIN]), requireAdminConfirm, async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.ddsTransaction.deleteMany({});
    return res.json({
      success: true,
      deletedCount: result.count,
      message: 'Barcha kirim-chiqim operatsiyalari o\'chirildi. Balans 0 qilindi.',
    });
  } catch (error: any) {
    console.error('Delete all DDS error:', error);
    return res.status(500).json({ error: 'Tranzaksiyalarni tozalashda xatolik: ' + error.message });
  }
});

// DELETE /api/dds/:id
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.ddsTransaction.delete({ where: { id } });
    return res.json({ success: true, message: 'Tranzaksiya o\'chirildi' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Tranzaksiyani o\'chirishda xatolik' });
  }
});

export default router;
