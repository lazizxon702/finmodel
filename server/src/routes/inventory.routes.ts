import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { verifyAdminOverride } from '../lib/security';
import { DealStatus, PaymentStatus, AccountType, TransactionType, ExpenseCategoryType } from '@prisma/client';

const router = Router();

// GET /api/inventory
// Warehouse items (In warehouse, In transit, Pending, Sold, Need to buy)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, storeId, daftar, startDate, endDate, page = '1', limit = '1000' } = req.query as any;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 1000;
    const skip = (pageNum - 1) * limitNum;

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
    if (status) {
      where.status = status as DealStatus;
    } else {
      where.status = {
        in: [
          DealStatus.IN_WAREHOUSE,
          DealStatus.IN_TRANSIT,
          DealStatus.PENDING,
          DealStatus.MONEY_RECEIVED,
          DealStatus.PARTIAL_AMOUNT,
          DealStatus.SOLD,
          DealStatus.NEED_TO_BUY,
        ],
      };
    }

    if (storeId) {
      where.storeId = storeId;
    }

    if (daftar === 'true') {
      where.isDaftar = true;
    } else if (daftar === 'false') {
      where.isDaftar = false;
    }

    if (search) {
      where.OR = [
        { productName: { contains: search, mode: 'insensitive' } },
        { imeiBarcode: { contains: search, mode: 'insensitive' } },
        { imei2: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { color: { contains: search, mode: 'insensitive' } },
        { dealNumber: isNaN(Number(search)) ? undefined : Number(search) },
      ].filter(Boolean);
    }

    const [totalCount, items] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
        include: { store: true, buyer: true, createdBy: true, provider: true },
        orderBy: { date: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    const formatted = items.map((deal) => {
      const purchaseCost = Number(deal.totalPurchaseCost) || 0;
      const salePrice = Number(deal.salePrice) || 0;
      const profit = deal.status === DealStatus.SOLD ? salePrice - purchaseCost : 0;
      const marginPct = salePrice > 0 ? profit / salePrice : 0;
      const received = Number(deal.receivedFromBuyer) || 0;
      const debt = Number(deal.debtRemainder) || (deal.status === DealStatus.SOLD ? salePrice - received : 0);

      return {
        id: deal.id,
        dealNumber: deal.dealNumber,
        date: deal.date,
        dealDate: deal.saleDate || deal.date,
        storeId: deal.storeId,
        storeName: deal.store?.name || 'Do\'kon',
        providerName: deal.provider?.name || '-',
        customerName: deal.customerName || deal.sellerName || '-',
        customerPhone: deal.customerPhone1 || '-',
        productName: deal.productName || (deal.isDaftar ? 'Qurilma (Daftar)' : 'Texnika'),
        quantity: deal.quantity || 1,
        imei: deal.imeiBarcode || '-',
        imeiBarcode: deal.imeiBarcode || '-',
        imei2: deal.imei2 || '-',
        color: deal.color || '-',
        storageGb: deal.storageGb || '-',
        status: deal.status,
        statusChangeReason: deal.statusChangeReason || '-',
        purchaseCost,
        primeCost: purchaseCost,
        salePrice,
        saleDate: deal.saleDate,
        buyerName: deal.buyer?.name || deal.customerName || '-',
        paidCashUzs: Number(deal.paidCashUzs) || 0,
        paidBank: Number(deal.paidBank) || 0,
        exchangeRate: Number(deal.exchangeRate) || 1,
        profit,
        marginPct,
        marginPercent: marginPct,
        receivedFromBuyer: received,
        debtRemainder: debt,
        debtDueDate: deal.debtDueDate,
        paymentStatus: deal.paymentStatus,
        note: deal.note,
        isDaftar: deal.isDaftar || false,
        extraDaftar: Number(deal.extraDaftar) || 0,
      };
    });

    return res.json({
      items: formatted,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Inventory error:', error);
    return res.status(500).json({ error: 'Ombor ma\'lumotlarini yuklashda xatolik: ' + error.message });
  }
});

// PUT /api/inventory/:id/receive (Skaner orqali qabul qilish / Prixod)
router.put('/:id/receive', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { imeiBarcode, imei2, color, storageGb } = req.body;

    if (!imeiBarcode?.trim()) {
      return res.status(400).json({ error: 'IMEI / Shtrix-kod kiritilishi yoki skaner qilinishi shart!' });
    }

    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) return res.status(404).json({ error: 'Tovar topilmadi' });

    const updated = await prisma.deal.update({
      where: { id },
      data: {
        imeiBarcode: imeiBarcode.trim(),
        imei2: imei2?.trim() || deal.imei2,
        color: color?.trim() || deal.color,
        storageGb: storageGb?.trim() || deal.storageGb,
        status: DealStatus.IN_WAREHOUSE,
        statusChangeReason: 'Skaner orqali prixod qilindi va omborga joylashtirildi',
      },
      include: { store: true, buyer: true },
    });

    return res.json({
      success: true,
      message: `№${deal.dealNumber} - ${deal.productName} omborga muvaffaqiyatli qabul qilindi`,
      item: updated,
    });
  } catch (error: any) {
    console.error('Receive inventory error:', error);
    return res.status(500).json({ error: 'Tovarni qabul qilishda xatolik: ' + error.message });
  }
});

// PUT /api/inventory/:id/status (Holatni o'zgartirish + majburiy izoh)
router.put('/:id/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Yangi holat tanlanishi shart' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Holatni o\'zgartirish sababi (izoh) kiritilishi shart!' });
    }

    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) return res.status(404).json({ error: 'Tovar topilmadi' });

    const updated = await prisma.deal.update({
      where: { id },
      data: {
        status: status as DealStatus,
        statusChangeReason: reason.trim(),
      },
      include: { store: true },
    });

    return res.json({
      success: true,
      message: `№${deal.dealNumber} holati muvaffaqiyatli yangilandi`,
      item: updated,
    });
  } catch (error: any) {
    console.error('Status change error:', error);
    return res.status(500).json({ error: 'Holatni yangilashda xatolik: ' + error.message });
  }
});

// POST /api/inventory/transfer (Filiallararo tovar ko'chirish)
router.post('/transfer', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { dealIds, targetStoreId, reason } = req.body;

    if (!dealIds || !Array.isArray(dealIds) || dealIds.length === 0) {
      return res.status(400).json({ error: 'Ko\'chiriladigan tovarlar tanlanishi shart' });
    }

    if (!targetStoreId) {
      return res.status(400).json({ error: 'Qabul qiluvchi filial (do\'kon) tanlanishi shart' });
    }

    const targetStore = await prisma.store.findUnique({ where: { id: targetStoreId } });
    if (!targetStore) {
      return res.status(404).json({ error: 'Qabul qiluvchi filial topilmadi' });
    }

    const transferNote = `Filiallararo ko'chirish: -> ${targetStore.name}. Sabab: ${reason || 'O\'tkazma'}`;

    await prisma.deal.updateMany({
      where: { id: { in: dealIds } },
      data: {
        status: DealStatus.IN_TRANSIT,
        statusChangeReason: transferNote,
        note: transferNote,
      },
    });

    return res.json({
      success: true,
      message: `${dealIds.length} ta tovar ${targetStore.name} filialiga jo'natildi (Yo'lda)`,
    });
  } catch (error: any) {
    console.error('Transfer error:', error);
    return res.status(500).json({ error: 'Tovarlarni ko\'chirishda xatolik: ' + error.message });
  }
});

// POST /api/inventory/transfer/accept (O'tkazmani qabul qilish)
router.post('/transfer/accept', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { dealIds, targetStoreId } = req.body;

    if (!dealIds || !Array.isArray(dealIds) || dealIds.length === 0) {
      return res.status(400).json({ error: 'Qabul qilinadigan tovarlar tanlanishi shart' });
    }

    await prisma.deal.updateMany({
      where: { id: { in: dealIds } },
      data: {
        storeId: targetStoreId,
        status: DealStatus.IN_WAREHOUSE,
        statusChangeReason: 'Filialda qabul qilib olindi va omborga kiritildi',
      },
    });

    return res.json({
      success: true,
      message: `${dealIds.length} ta tovar omborga qabul qilindi`,
    });
  } catch (error: any) {
    console.error('Accept transfer error:', error);
    return res.status(500).json({ error: 'Tovarlarni qabul qilishda xatolik: ' + error.message });
  }
});

// PUT /api/inventory/:id/sell (Tovarni sotish - Kassa va Qarz integratsiyasi)
router.put('/:id/sell', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      salePrice,
      buyerName,
      paidAmount = 0,
      paymentType = 'CASH', // CASH, BANK_CARD, SETTLEMENT, DEBT
      dueDate,
      note,
      adminOverrideCode,
      saleDate,
    } = req.body;

    const sPrice = Number(salePrice) || 0;
    if (sPrice <= 0) {
      return res.status(400).json({ error: 'Sotuv narxi kiritilishi shart!' });
    }

    const bName = (buyerName || '').trim();
    if (!bName) {
      return res.status(400).json({ error: 'Xaridor ismi kiritilishi shart!' });
    }

    // 1. Credit Check: Does this customer have existing unpaid debt?
    const existingDebts = await prisma.deal.findMany({
      where: {
        OR: [
          { customerName: { equals: bName, mode: 'insensitive' } },
          { buyer: { name: { equals: bName, mode: 'insensitive' } } },
        ],
        debtRemainder: { gt: 0 },
        paymentStatus: { in: [PaymentStatus.DEBT, PaymentStatus.PARTIAL] },
      },
    });

    const totalExistingDebt = existingDebts.reduce((sum, d) => sum + Number(d.debtRemainder || 0), 0);
    const pAmount = Number(paidAmount) || 0;
    const isDebtSale = paymentType === 'DEBT' || paymentType === 'INSTALLMENT' || pAmount < sPrice;

    if (totalExistingDebt > 0 && isDebtSale) {
      if (!(await verifyAdminOverride(adminOverrideCode))) {
        return res.status(403).json({
          error: `Diqqat! "${bName}" da ${totalExistingDebt.toLocaleString('uz-UZ')} UZS qoldiq qarzdorlik mavjud! Tovar chiqarish bloklangan. Davom etish uchun administrator kodini kiriting.`,
          requiresOverride: true,
          totalExistingDebt,
        });
      }
    }

    const deal = await prisma.deal.findUnique({ where: { id }, include: { store: true } });
    if (!deal) return res.status(404).json({ error: 'Tovar topilmadi' });

    // Buyer
    const b = await prisma.buyer.upsert({
      where: { name: bName },
      update: {},
      create: { name: bName },
    });

    const purchaseCost = Number(deal.totalPurchaseCost) || 0;
    const profit = sPrice - purchaseCost;
    const marginPct = sPrice > 0 ? profit / sPrice : 0;
    const debtRemainder = Math.max(0, sPrice - pAmount);

    let pStatus: PaymentStatus = PaymentStatus.PAID;
    if (debtRemainder > 0) {
      pStatus = pAmount > 0 ? PaymentStatus.PARTIAL : PaymentStatus.DEBT;
    }

    // Account mapping
    let ddsAccount: AccountType = AccountType.CASH;
    if (paymentType === 'BANK_CARD' || paymentType === 'CARD') ddsAccount = AccountType.BANK_CARD;
    else if (paymentType === 'SETTLEMENT') ddsAccount = AccountType.SETTLEMENT_ACCOUNT;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update deal
      const d = await tx.deal.update({
        where: { id },
        data: {
          status: DealStatus.SOLD,
          saleDate: saleDate ? new Date(String(saleDate).length === 10 ? `${saleDate}T12:00:00.000+05:00` : saleDate) : new Date(),
          salePrice: sPrice,
          buyerId: b.id,
          customerName: bName,
          paidCashUzs: paymentType === 'CASH' ? pAmount : 0,
          paidBank: (paymentType === 'BANK_CARD' || paymentType === 'CARD') ? pAmount : 0,
          paidTransfer: paymentType === 'SETTLEMENT' ? pAmount : 0,
          profit,
          marginPct,
          receivedFromBuyer: pAmount,
          debtRemainder,
          debtDueDate: dueDate ? new Date(dueDate) : null,
          paymentStatus: pStatus,
          note: note ? `${note} (Sotildi)` : 'Sotildi',
          statusChangeReason: `Sotildi: Xaridor: ${bName}, Narxi: ${sPrice.toLocaleString('uz-UZ')} UZS, To'landi: ${pAmount.toLocaleString('uz-UZ')} UZS`,
        },
        include: { buyer: true, store: true },
      });

      // 2. If money was received, log into DDS (Kassa)
      if (pAmount > 0) {
        await tx.ddsTransaction.create({
          data: {
            txNumber: `TX-SALE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            dateTime: new Date(),
            type: TransactionType.INCOME,
            account: ddsAccount,
            expenseType: ExpenseCategoryType.OPEX,
            categoryName: 'Sotuv tushumi (Tovar sotildi)',
            sourcePerson: bName,
            amount: pAmount,
            description: `Chek №${deal.dealNumber} - ${deal.productName || 'Texnika'} sotuvi tushumi`,
            createdById: req.user?.id,
          },
        });

        // 3. Log DebtPayment if there's remaining debt
        if (debtRemainder > 0) {
          await tx.debtPayment.create({
            data: {
              dealId: id,
              amount: pAmount,
              date: new Date(),
              paidBy: bName,
              accountType: ddsAccount,
              note: 'Boshlang\'ich to\'lov',
            },
          });
        }
      }

      return d;
    });

    return res.json({
      success: true,
      message: `№${deal.dealNumber} - ${deal.productName} muvaffaqiyatli sotildi`,
      item: updated,
    });
  } catch (error: any) {
    console.error('Sale error:', error);
    return res.status(500).json({ error: 'Sotuvni qayd qilishda xatolik: ' + error.message });
  }
});

// PUT /api/inventory/:id/sale (Sotuv ma'lumotlarini tahrirlash - Narx, Haridor, Qarz, Sana)
router.put('/:id/sale', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      salePrice,
      buyerName,
      paidAmount = 0,
      paymentType = 'CASH',
      dueDate,
      note,
      returnToWarehouse = false,
      saleDate,
    } = req.body;

    const deal = await prisma.deal.findUnique({ where: { id }, include: { store: true, buyer: true } });
    if (!deal) return res.status(404).json({ error: 'Bitim (sotuv) topilmadi' });

    if (returnToWarehouse) {
      // Revert sale back to IN_WAREHOUSE
      const updated = await prisma.deal.update({
        where: { id },
        data: {
          status: DealStatus.IN_WAREHOUSE,
          saleDate: null,
          salePrice: 0,
          receivedFromBuyer: 0,
          debtRemainder: 0,
          debtDueDate: null,
          paymentStatus: PaymentStatus.PARTIAL,
          statusChangeReason: 'Sotuv bekor qilindi va omborga qaytarildi',
        },
        include: { buyer: true, store: true },
      });
      return res.json({
        success: true,
        message: `№${deal.dealNumber} sotuvi bekor qilindi va tovar yana omborga qaytarildi (Omborda)`,
        item: updated,
      });
    }

    const sPrice = Number(salePrice) || 0;
    const pAmount = Number(paidAmount) || 0;
    const bName = (buyerName || deal.customerName || deal.buyer?.name || 'Mijoz').trim();

    const purchaseCost = Number(deal.totalPurchaseCost) || 0;
    const profit = sPrice - purchaseCost;
    const marginPct = sPrice > 0 ? profit / sPrice : 0;
    const debtRemainder = Math.max(0, sPrice - pAmount);

    let pStatus: PaymentStatus = PaymentStatus.PAID;
    if (debtRemainder > 0) {
      pStatus = pAmount > 0 ? PaymentStatus.PARTIAL : PaymentStatus.DEBT;
    }

    // Buyer upsert
    let buyerId = deal.buyerId;
    if (bName) {
      const b = await prisma.buyer.upsert({
        where: { name: bName },
        update: {},
        create: { name: bName },
      });
      buyerId = b.id;
    }

    const updated = await prisma.deal.update({
      where: { id },
      data: {
        status: DealStatus.SOLD,
        saleDate: saleDate ? new Date(String(saleDate).length === 10 ? `${saleDate}T12:00:00.000+05:00` : saleDate) : (deal.saleDate || new Date()),
        salePrice: sPrice,
        customerName: bName,
        buyerId,
        receivedFromBuyer: pAmount,
        debtRemainder,
        debtDueDate: dueDate ? new Date(dueDate) : deal.debtDueDate,
        profit,
        marginPct,
        paymentStatus: pStatus,
        note: note !== undefined ? note : deal.note,
        statusChangeReason: `Sotuv tahrirlandi: Narxi: ${sPrice.toLocaleString('uz-UZ')}, Qarz: ${debtRemainder.toLocaleString('uz-UZ')}`,
      },
      include: { buyer: true, store: true },
    });

    return res.json({
      success: true,
      message: `№${deal.dealNumber} sotuv ma'lumotlari muvaffaqiyatli yangilandi`,
      item: updated,
    });
  } catch (error: any) {
    console.error('Edit sale error:', error);
    return res.status(500).json({ error: 'Sotuvni tahrirlashda xatolik: ' + error.message });
  }
});

// DELETE /api/inventory/:id/sale (Sotuvni bekor qilish yoki o'chirish)
router.delete('/:id/sale', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { deletePermanently = false } = req.query;

    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) return res.status(404).json({ error: 'Bitim topilmadi' });

    if (deletePermanently === 'true') {
      await prisma.deal.delete({ where: { id } });
      return res.json({
        success: true,
        message: `№${deal.dealNumber} butunlay o'chirildi`,
      });
    }

    // Revert back to IN_WAREHOUSE
    const updated = await prisma.deal.update({
      where: { id },
      data: {
        status: DealStatus.IN_WAREHOUSE,
        saleDate: null,
        salePrice: 0,
        receivedFromBuyer: 0,
        debtRemainder: 0,
        debtDueDate: null,
        paymentStatus: PaymentStatus.PARTIAL,
        statusChangeReason: 'Sotuv bekor qilindi va tovar omborga qaytarildi',
      },
    });

    return res.json({
      success: true,
      message: `№${deal.dealNumber} sotuvi bekor qilindi va tovar yana omborga qaytarildi (Omborda)`,
      item: updated,
    });
  } catch (error: any) {
    console.error('Delete sale error:', error);
    return res.status(500).json({ error: 'Sotuvni o\'chirishda xatolik: ' + error.message });
  }
});

export default router;
