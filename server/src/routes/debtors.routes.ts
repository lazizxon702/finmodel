import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { PaymentStatus, AccountType, TransactionType, ExpenseCategoryType } from '@prisma/client';

const router = Router();

// GET /api/debtors (List all active debtors)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { search, page = '1', limit = '100' } = req.query as any;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 100;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      debtRemainder: { gt: 0 },
    };

    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone1: { contains: search, mode: 'insensitive' } },
        { productName: { contains: search, mode: 'insensitive' } },
        { dealNumber: isNaN(Number(search)) ? undefined : Number(search) },
        { buyer: { name: { contains: search, mode: 'insensitive' } } },
      ].filter(Boolean);
    }

    const [totalCount, items] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
        include: {
          store: true,
          buyer: true,
          debtPayments: {
            orderBy: { date: 'desc' },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    const formatted = items.map((deal) => {
      const salePrice = Number(deal.salePrice) || 0;
      const received = Number(deal.receivedFromBuyer) || 0;
      const debt = Number(deal.debtRemainder) || 0;

      // Overdue check
      const isOverdue = deal.debtDueDate ? new Date(deal.debtDueDate) < new Date() : false;

      return {
        id: deal.id,
        dealNumber: deal.dealNumber,
        date: deal.saleDate || deal.date,
        customerName: deal.customerName || deal.buyer?.name || 'Mijoz',
        customerPhone: deal.customerPhone1 || '-',
        productName: deal.productName || 'Texnika',
        imeiBarcode: deal.imeiBarcode || '-',
        storeName: deal.store?.name || 'Do\'kon',
        salePrice,
        receivedFromBuyer: received,
        debtRemainder: debt,
        debtDueDate: deal.debtDueDate,
        isOverdue,
        paymentStatus: deal.paymentStatus,
        payments: deal.debtPayments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          date: p.date,
          paidBy: p.paidBy,
          accountType: p.accountType,
          note: p.note,
        })),
      };
    });

    const totalDebtSum = formatted.reduce((sum, d) => sum + d.debtRemainder, 0);

    return res.json({
      items: formatted,
      totalDebtSum,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Get debtors error:', error);
    return res.status(500).json({ error: 'Qarzdorlarni yuklashda xatolik: ' + error.message });
  }
});

// GET /api/debtors/check-customer (Check if customer has active debt)
router.get('/check-customer', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.query as any;
    if (!name || !name.trim()) {
      return res.json({ hasDebt: false, totalDebt: 0 });
    }

    const debtorDeals = await prisma.deal.findMany({
      where: {
        OR: [
          { customerName: { equals: name.trim(), mode: 'insensitive' } },
          { buyer: { name: { equals: name.trim(), mode: 'insensitive' } } },
        ],
        debtRemainder: { gt: 0 },
      },
      select: {
        id: true,
        dealNumber: true,
        productName: true,
        debtRemainder: true,
        debtDueDate: true,
      },
    });

    const totalDebt = debtorDeals.reduce((sum, d) => sum + Number(d.debtRemainder || 0), 0);

    return res.json({
      hasDebt: totalDebt > 0,
      totalDebt,
      dealsCount: debtorDeals.length,
      deals: debtorDeals,
    });
  } catch (error: any) {
    console.error('Check customer debt error:', error);
    return res.status(500).json({ error: 'Mijoz qarzini tekshirishda xatolik' });
  }
});

// POST /api/debtors/:id/payment (Pay debt / Qarzni kamaytirish yoki to'liq yopish)
router.post('/:id/payment', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, accountType = 'CASH', paidBy, note } = req.body;

    const payAmount = Number(amount) || 0;
    if (payAmount <= 0) {
      return res.status(400).json({ error: 'To\'lov summasi 0 dan katta bo\'lishi shart!' });
    }

    const deal = await prisma.deal.findUnique({
      where: { id },
      include: { buyer: true },
    });

    if (!deal) {
      return res.status(404).json({ error: 'Bitim (qarzdorlik) topilmadi' });
    }

    const currentDebt = Number(deal.debtRemainder) || 0;
    const currentReceived = Number(deal.receivedFromBuyer) || 0;

    if (payAmount > currentDebt) {
      return res.status(400).json({
        error: `To'lov summasi (${payAmount.toLocaleString('uz-UZ')}) mavjud qarzdan (${currentDebt.toLocaleString('uz-UZ')}) katta bo'lishi mumkin emas!`,
      });
    }

    const newDebtRemainder = currentDebt - payAmount;
    const newReceived = currentReceived + payAmount;
    const isFullyPaid = newDebtRemainder <= 0;

    let ddsAccount: AccountType = AccountType.CASH;
    if (accountType === 'BANK_CARD') ddsAccount = AccountType.BANK_CARD;
    else if (accountType === 'SETTLEMENT_ACCOUNT') ddsAccount = AccountType.SETTLEMENT_ACCOUNT;

    const payer = (paidBy || deal.customerName || deal.buyer?.name || 'Mijoz').trim();

    await prisma.$transaction(async (tx) => {
      // 1. Update deal debt balance
      await tx.deal.update({
        where: { id },
        data: {
          debtRemainder: newDebtRemainder,
          receivedFromBuyer: newReceived,
          paymentStatus: isFullyPaid ? PaymentStatus.PAID : PaymentStatus.PARTIAL,
          statusChangeReason: `Qarz to'landi: ${payAmount.toLocaleString('uz-UZ')} UZS. Qoldiq: ${newDebtRemainder.toLocaleString('uz-UZ')} UZS`,
        },
      });

      // 2. Add DebtPayment record
      await tx.debtPayment.create({
        data: {
          dealId: id,
          amount: payAmount,
          date: new Date(),
          paidBy: payer,
          accountType: ddsAccount,
          note: note || (isFullyPaid ? 'Qarz to\'liq yopildi' : 'Qisman qarz to\'lovi'),
        },
      });

      // 3. Post to DDS (Kassa tushumi)
      await tx.ddsTransaction.create({
        data: {
          txNumber: `TX-DEBT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          dateTime: new Date(),
          type: TransactionType.INCOME,
          account: ddsAccount,
          expenseType: ExpenseCategoryType.OPEX,
          categoryName: 'Qarzdorlik qaytarilishi (Kassa kirim)',
          sourcePerson: payer,
          amount: payAmount,
          description: `Chek №${deal.dealNumber} - ${payer} dan qarz qaytarilishi (${payAmount.toLocaleString('uz-UZ')} UZS)`,
          createdById: req.user?.id,
        },
      });
    });

    return res.json({
      success: true,
      message: `№${deal.dealNumber} bo'yicha ${payAmount.toLocaleString('uz-UZ')} UZS qabul qilindi va kassaga kiritildi. Qoldiq: ${newDebtRemainder.toLocaleString('uz-UZ')} UZS`,
      remainingDebt: newDebtRemainder,
      isFullyPaid,
    });
  } catch (error: any) {
    console.error('Debt payment error:', error);
    return res.status(500).json({ error: 'Qarz to\'lovini qabul qilishda xatolik: ' + error.message });
  }
});

export default router;
