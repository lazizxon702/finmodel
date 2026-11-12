import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { PaymentStatus, AccountType, Prisma, TransactionType, ExpenseCategoryType } from '@prisma/client';
import { emitRealtime } from '../lib/realtime';
import { APPROVED_ONLY, dealScopeWhere } from '../services/access.service';
import { LedgerError, createDdsInTx } from '../services/ledger.service';
import { cleanCustomerText, dealDateTimeLabel } from './deals.routes';

const router = Router();

// GET /api/debtors — faol qarzdorlar (doira + faqat tasdiqlangan bitimlar)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { search, page = '1', limit = '100' } = req.query as any;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(5000, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    const scope = await dealScopeWhere(req.user!);
    const and: Prisma.DealWhereInput[] = [scope, APPROVED_ONLY, { debtRemainder: { gt: 0 } }];

    if (search && String(search).trim()) {
      const s = String(search).trim();
      const or: Prisma.DealWhereInput[] = [
        { customerName: { contains: s, mode: 'insensitive' } },
        { customerPhone1: { contains: s, mode: 'insensitive' } },
        { customerPhone2: { contains: s, mode: 'insensitive' } },
        { productName: { contains: s, mode: 'insensitive' } },
        { buyer: { name: { contains: s, mode: 'insensitive' } } },
      ];
      if (/^\d{1,9}$/.test(s)) or.push({ dealNumber: Number(s) });
      and.push({ OR: or });
    }
    const where: Prisma.DealWhereInput = { AND: and };

    const [totalCount, items, debtSum] = await Promise.all([
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
      // Jami qarz — faqat shu sahifadagilar emas, mos keladigan barcha (tasdiqlangan) bitimlar bo'yicha
      prisma.deal.aggregate({ where, _sum: { debtRemainder: true } }),
    ]);

    const formatted = items.map((deal) => {
      const salePrice = Number(deal.salePrice) || 0;
      const received = Number(deal.receivedFromBuyer) || 0;
      const debt = Number(deal.debtRemainder) || 0;
      const isOverdue = deal.debtDueDate ? new Date(deal.debtDueDate) < new Date() : false;

      const customerName = cleanCustomerText(deal.customerName);
      const buyerName = cleanCustomerText(deal.buyer?.name);
      const phone1 = cleanCustomerText(deal.customerPhone1);
      const phone2 = cleanCustomerText(deal.customerPhone2);

      return {
        id: deal.id,
        dealNumber: deal.dealNumber,
        date: deal.saleDate || deal.date,
        dateTimeLabel: dealDateTimeLabel({ date: deal.saleDate || deal.date, createdAt: deal.createdAt }),
        // Qarzdor — tovarni olgan xaridor; xaridor yozilmagan bo'lsa bitim mijozi
        debtorName: buyerName || customerName || '',
        buyerName: buyerName || '',
        // Mijoz ismi/telefoni to'ldirgichsiz ("Mijoz", "-" emas) — yo'q bo'lsa bo'sh satr
        customerName: customerName || buyerName || '',
        customerPhone: phone1 || '',
        customerPhone1: phone1 || '',
        customerPhone2: phone2 || '',
        buyerPhone: cleanCustomerText(deal.buyer?.phone) || '',
        productName: deal.productName || 'Texnika',
        imeiBarcode: deal.imeiBarcode || '-',
        storeName: deal.store?.name || "Do'kon",
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

    return res.json({
      items: formatted,
      totalDebtSum: Number(debtSum._sum.debtRemainder) || 0,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Get debtors error:', error);
    return res.status(500).json({ error: 'Qarzdorlarni yuklashda xatolik' });
  }
});

// GET /api/debtors/check-customer — mijozda faol qarz bormi (bitim kiritishda kredit nazorati)
// Jami qarz butun baza bo'yicha tekshiriladi (aks holda nazorat ishlamaydi), lekin bitim tafsilotlari
// faqat foydalanuvchi doirasidagi bitimlar uchun qaytadi.
router.get('/check-customer', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.query as any;
    if (!name || !String(name).trim()) {
      return res.json({ hasDebt: false, totalDebt: 0 });
    }
    const trimmed = String(name).trim();

    const match: Prisma.DealWhereInput = {
      OR: [
        { customerName: { equals: trimmed, mode: 'insensitive' } },
        { buyer: { name: { equals: trimmed, mode: 'insensitive' } } },
      ],
      debtRemainder: { gt: 0 },
    };
    const scope = await dealScopeWhere(req.user!);

    const [agg, visibleDeals] = await Promise.all([
      prisma.deal.aggregate({
        where: { AND: [APPROVED_ONLY, match] },
        _sum: { debtRemainder: true },
        _count: { _all: true },
      }),
      prisma.deal.findMany({
        where: { AND: [scope, APPROVED_ONLY, match] },
        select: {
          id: true,
          dealNumber: true,
          productName: true,
          debtRemainder: true,
          debtDueDate: true,
        },
      }),
    ]);

    const totalDebt = Number(agg._sum.debtRemainder) || 0;

    return res.json({
      hasDebt: totalDebt > 0,
      totalDebt,
      dealsCount: agg._count._all,
      deals: visibleDeals,
    });
  } catch (error: any) {
    console.error('Check customer debt error:', error);
    return res.status(500).json({ error: 'Mijoz qarzini tekshirishda xatolik' });
  }
});

// POST /api/debtors/:id/payment (Qarzni kamaytirish yoki to'liq yopish) — faqat doiradagi tasdiqlangan bitim
router.post('/:id/payment', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, accountType = 'CASH', paidBy, note } = req.body;

    const payAmount = Number(amount) || 0;
    if (payAmount <= 0) {
      return res.status(400).json({ error: "To'lov summasi 0 dan katta bo'lishi shart!" });
    }

    const scope = await dealScopeWhere(req.user!);
    const deal = await prisma.deal.findFirst({
      where: { AND: [scope, { id }] },
      include: { buyer: true },
    });

    if (!deal) {
      return res.status(404).json({ error: 'Bitim (qarzdorlik) topilmadi' });
    }
    if (deal.approvalStatus !== 'APPROVED') {
      return res.status(409).json({ error: "Bitim hali tasdiqlanmagan — to'lov qabul qilib bo'lmaydi" });
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

    const payer =
      String(paidBy || '').trim() ||
      cleanCustomerText(deal.buyer?.name) ||
      cleanCustomerText(deal.customerName) ||
      'Mijoz';

    await prisma.$transaction(async (tx) => {
      // 1. Bitim qarzini yangilash
      await tx.deal.update({
        where: { id },
        data: {
          debtRemainder: newDebtRemainder,
          receivedFromBuyer: newReceived,
          paymentStatus: isFullyPaid ? PaymentStatus.PAID : PaymentStatus.PARTIAL,
          statusChangeReason: `Qarz to'landi: ${payAmount.toLocaleString('uz-UZ')} UZS. Qoldiq: ${newDebtRemainder.toLocaleString('uz-UZ')} UZS`,
        },
      });

      // 2. To'lov tarixi
      await tx.debtPayment.create({
        data: {
          dealId: id,
          amount: payAmount,
          date: new Date(),
          paidBy: payer,
          accountType: ddsAccount,
          note: note || (isFullyPaid ? "Qarz to'liq yopildi" : "Qisman qarz to'lovi"),
        },
      });

      // 3. DDS kirimi — yadro orqali (hisob qoldig'i ham shu tranzaksiyada oshadi)
      await createDdsInTx(tx, {
        dateTime: new Date(),
        type: TransactionType.INCOME,
        account: ddsAccount,
        expenseType: ExpenseCategoryType.OPEX,
        categoryName: 'Qarzdorlik qaytarilishi (Kassa kirim)',
        sourcePerson: payer,
        amount: payAmount,
        description: `Chek №${deal.dealNumber} - ${payer} dan qarz qaytarilishi (${payAmount.toLocaleString('uz-UZ')} UZS)`,
        createdById: req.user?.id,
      });
    });

    emitRealtime('deals:updated', { id, action: 'debt-payment' });
    emitRealtime('dds:updated', {});

    return res.json({
      success: true,
      message: `№${deal.dealNumber} bo'yicha ${payAmount.toLocaleString('uz-UZ')} UZS qabul qilindi va kassaga kiritildi. Qoldiq: ${newDebtRemainder.toLocaleString('uz-UZ')} UZS`,
      remainingDebt: newDebtRemainder,
      isFullyPaid,
    });
  } catch (error: any) {
    if (error instanceof LedgerError) return res.status(error.status).json({ error: error.message });
    console.error('Debt payment error:', error);
    return res.status(500).json({ error: "Qarz to'lovini qabul qilishda xatolik" });
  }
});

export default router;
