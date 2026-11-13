import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { PaymentStatus, AccountType, Prisma, TransactionType, ExpenseCategoryType } from '@prisma/client';
import { emitRealtime } from '../lib/realtime';
import { APPROVED_ONLY, dealScopeWhere, isScopedRole } from '../services/access.service';
import { LedgerError, createDdsInTx } from '../services/ledger.service';
import { saleManagedMessage } from '../services/sale.service';
import { cleanCustomerText, dealDateTimeLabel } from './deals.routes';

const router = Router();

/** Sotuv qarzi qatoridagi bitta tovar (ombor qatori) */
interface SaleDebtItem {
  dealId: string;
  dealNumber: number;
  productName: string;
  imeiBarcode: string;
  storeName: string;
  salePrice: number;
  receivedFromBuyer: number;
  debtRemainder: number;
}

// GET /api/debtors — faol qarzdorlar (doira + faqat tasdiqlangan bitimlar)
// Ikki xil qator qaytadi (`kind`):
//   DEAL — eski yo'l bilan (bitta tovar) sotilgan bitim qarzi;
//   SALE — ko'p tovarli sotuv qarzi: bitta sotuvga BITTA qator (ichidagi bitimlar alohida ko'rsatilmaydi).
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { search, page = '1', limit = '100' } = req.query as any;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(5000, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    const scope = await dealScopeWhere(req.user!);
    // Sotuvga kirgan bitimlar alohida qator bo'lmaydi — ular sotuv qatorida (ikki marta sanalmasin)
    const and: Prisma.DealWhereInput[] = [scope, APPROVED_ONLY, { debtRemainder: { gt: 0 } }, { saleId: null }];
    // Sotuv: ichida foydalanuvchi doirasidagi tasdiqlangan bitim bo'lsa ko'rinadi
    const saleAnd: Prisma.SaleWhereInput[] = [
      { debtRemainder: { gt: 0 } },
      { deals: { some: { AND: [scope, APPROVED_ONLY] } } },
    ];
    // Cheklangan rollar (OPERATOR/AGENT): sotuv qatori faqat ichidagi BARCHA bitimlar doirada bo'lsa ko'rinadi —
    // aks holda birovning bitimlari (tovar, narx, qarz) ko'rinib qolardi; bunday sotuv jami qarzga ham kirmaydi
    if (isScopedRole(req.user!.role)) saleAnd.push({ deals: { every: scope } });

    if (search && String(search).trim()) {
      const s = String(search).trim();
      const contains = { contains: s, mode: 'insensitive' as const };
      const isNum = /^\d{1,9}$/.test(s);
      const or: Prisma.DealWhereInput[] = [
        { customerName: contains },
        { customerPhone1: contains },
        { customerPhone2: contains },
        { productName: contains },
        { buyer: { name: contains } },
      ];
      if (isNum) or.push({ dealNumber: Number(s) });
      and.push({ OR: or });

      const dealOr: Prisma.DealWhereInput[] = [{ productName: contains }, { imeiBarcode: contains }];
      if (isNum) dealOr.push({ dealNumber: Number(s) });
      const saleOr: Prisma.SaleWhereInput[] = [
        { buyer: { name: contains } },
        { buyer: { phone: contains } },
        { deals: { some: { OR: dealOr } } },
      ];
      if (isNum) saleOr.push({ saleNumber: Number(s) });
      saleAnd.push({ OR: saleOr });
    }
    const where: Prisma.DealWhereInput = { AND: and };
    const saleWhere: Prisma.SaleWhereInput = { AND: saleAnd };

    // Ikki manba birlashtirilib sana bo'yicha tartiblanadi, sahifalash xotirada bajariladi
    const [items, sales, debtSum, saleDebtSum] = await Promise.all([
      prisma.deal.findMany({
        where,
        include: {
          store: true,
          buyer: true,
          debtPayments: {
            orderBy: { date: 'desc' },
          },
        },
      }),
      prisma.sale.findMany({
        where: saleWhere,
        include: {
          buyer: true,
          deals: { orderBy: { dealNumber: 'asc' }, include: { store: true } },
          payments: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
        },
      }),
      // Jami qarz — faqat shu sahifadagilar emas, mos keladigan barcha (tasdiqlangan) bitimlar bo'yicha
      prisma.deal.aggregate({ where, _sum: { debtRemainder: true } }),
      // Sotuv qarzi = ichidagi bitimlar qarzlarining yig'indisi (ulushlar aynan shunday taqsimlanadi)
      prisma.sale.aggregate({ where: saleWhere, _sum: { debtRemainder: true } }),
    ]);

    const saleRows = sales.map((sale) => {
      const buyerName = cleanCustomerText(sale.buyer?.name) || '';
      const first = sale.deals[0];
      const firstName = first?.productName || 'Texnika';
      const stores = Array.from(new Set(sale.deals.map((d) => d.store?.name).filter(Boolean)));
      return {
        kind: 'SALE' as const,
        // To'lov manzili: POST /api/sales/:id/payments (id = saleId)
        id: sale.id,
        saleId: sale.id as string | null,
        saleNumber: sale.saleNumber as number | null,
        itemsCount: sale.deals.length,
        dealNumber: null as number | null,
        date: sale.saleDate,
        dateTimeLabel: dealDateTimeLabel({ date: sale.saleDate, createdAt: sale.createdAt }),
        debtorName: buyerName,
        buyerName,
        customerName: buyerName,
        customerPhone: '',
        customerPhone1: '',
        customerPhone2: '',
        buyerPhone: cleanCustomerText(sale.buyer?.phone) || '',
        // Mahsulotlar qisqacha: "iPhone 15 +2 ta"
        productName: sale.deals.length > 1 ? `${firstName} +${sale.deals.length - 1} ta` : firstName,
        imeiBarcode: first?.imeiBarcode || '-',
        storeName: stores.join(', ') || "Do'kon",
        salePrice: Number(sale.totalPrice) || 0,
        receivedFromBuyer: Number(sale.receivedAmount) || 0,
        debtRemainder: Number(sale.debtRemainder) || 0,
        debtDueDate: sale.debtDueDate,
        isOverdue: sale.debtDueDate ? new Date(sale.debtDueDate) < new Date() : false,
        paymentStatus: sale.paymentStatus,
        // Manfiy summa — xaridorga qaytarilgan pul
        payments: sale.payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          date: p.date,
          paidBy: buyerName as string | null,
          accountType: p.accountType,
          note: p.note,
        })),
        items: sale.deals.map(
          (d): SaleDebtItem => ({
            dealId: d.id,
            dealNumber: d.dealNumber,
            productName: d.productName || 'Texnika',
            imeiBarcode: d.imeiBarcode || '-',
            storeName: d.store?.name || "Do'kon",
            salePrice: Number(d.salePrice) || 0,
            receivedFromBuyer: Number(d.receivedFromBuyer) || 0,
            debtRemainder: Number(d.debtRemainder) || 0,
          })
        ),
      };
    });

    const dealRows = items.map((deal) => {
      const salePrice = Number(deal.salePrice) || 0;
      const received = Number(deal.receivedFromBuyer) || 0;
      const debt = Number(deal.debtRemainder) || 0;
      const isOverdue = deal.debtDueDate ? new Date(deal.debtDueDate) < new Date() : false;

      const customerName = cleanCustomerText(deal.customerName);
      const buyerName = cleanCustomerText(deal.buyer?.name);
      const phone1 = cleanCustomerText(deal.customerPhone1);
      const phone2 = cleanCustomerText(deal.customerPhone2);

      return {
        kind: 'DEAL' as const,
        id: deal.id,
        saleId: null as string | null,
        saleNumber: null as number | null,
        itemsCount: 1,
        dealNumber: deal.dealNumber as number | null,
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
        items: [] as SaleDebtItem[],
      };
    });

    const all = [...dealRows, ...saleRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const totalCount = all.length;
    const formatted = all.slice(skip, skip + limitNum);

    return res.json({
      items: formatted,
      totalDebtSum: (Number(debtSum._sum.debtRemainder) || 0) + (Number(saleDebtSum._sum.debtRemainder) || 0),
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
    // Ko'p tovarli sotuvga kirgan bitim: qarz sotuv bo'yicha yuritiladi — to'lov sotuvga qo'shiladi
    if (deal.saleId) {
      const sale = await prisma.sale.findUnique({ where: { id: deal.saleId }, select: { saleNumber: true } });
      return res.status(409).json({
        error: `${saleManagedMessage(sale?.saleNumber ?? '?')} (to'lov: POST /api/sales/${deal.saleId}/payments)`,
        saleId: deal.saleId,
        saleNumber: sale?.saleNumber ?? null,
        paymentUrl: `/api/sales/${deal.saleId}/payments`,
      });
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
