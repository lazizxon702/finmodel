import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { verifyAdminOverride } from '../lib/security';
import { DealStatus, PaymentStatus, AccountType, Prisma, TransactionType, ExpenseCategoryType } from '@prisma/client';
import { emitRealtime } from '../lib/realtime';
import { APPROVED_ONLY, dealScopeWhere } from '../services/access.service';
import { LedgerError, createDdsInTx } from '../services/ledger.service';
import {
  HttpError,
  cleanCustomerText,
  dateRangeWhere,
  dealDateTimeLabel,
  dealItemsView,
  dealWriteDenial,
  parseApprovalFilter,
  toDeviceItemsJson,
} from './deals.routes';

const router = Router();

type AuthUser = NonNullable<AuthRequest['user']>;

/** Doiradagi bitim (tovar); doiradan tashqarida yoki yo'q bo'lsa null (→ 404) */
async function findScoped<T extends Prisma.DealInclude>(user: AuthUser, id: string, include?: T) {
  const scope = await dealScopeWhere(user);
  return prisma.deal.findFirst({ where: { AND: [scope, { id }] }, include });
}

const NOT_APPROVED_ERROR = 'Bitim hali tasdiqlanmagan — administrator tasdiqlagandan keyin sotish mumkin';

function sendError(res: Response, error: any, fallback: string) {
  if (error instanceof HttpError || error instanceof LedgerError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallback + ':', error);
  return res.status(500).json({ error: fallback });
}

// GET /api/inventory
// Ombor tovarlari. Doira bo'yicha; sukut bo'yicha faqat tasdiqlangan bitimlar
// (approvalStatus=all | PENDING_APPROVAL | REJECTED bilan o'zgartiriladi).
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, storeId, daftar, startDate, endDate, page = '1', limit = '1000' } = req.query as any;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(5000, Math.max(1, parseInt(limit, 10) || 1000));
    const skip = (pageNum - 1) * limitNum;

    const scope = await dealScopeWhere(req.user!);
    const and: Prisma.DealWhereInput[] = [scope];
    const approval = parseApprovalFilter((req.query as any).approvalStatus, APPROVED_ONLY);
    if (approval) and.push(approval);

    const range = dateRangeWhere(startDate, endDate);
    if (range) and.push({ date: range });

    if (status) {
      if (!(Object.values(DealStatus) as string[]).includes(String(status))) {
        throw new HttpError(400, "Tovar holati noto'g'ri");
      }
      and.push({ status: status as DealStatus });
    } else {
      and.push({
        status: {
          in: [
            DealStatus.IN_WAREHOUSE,
            DealStatus.IN_TRANSIT,
            DealStatus.PENDING,
            DealStatus.MONEY_RECEIVED,
            DealStatus.PARTIAL_AMOUNT,
            DealStatus.SOLD,
            DealStatus.NEED_TO_BUY,
          ],
        },
      });
    }

    if (storeId) and.push({ storeId: String(storeId) });
    if (daftar === 'true') and.push({ isDaftar: true });
    else if (daftar === 'false') and.push({ isDaftar: false });

    if (search && String(search).trim()) {
      const s = String(search).trim();
      const or: Prisma.DealWhereInput[] = [
        { productName: { contains: s, mode: 'insensitive' } },
        { imeiBarcode: { contains: s, mode: 'insensitive' } },
        { imei2: { contains: s, mode: 'insensitive' } },
        { customerName: { contains: s, mode: 'insensitive' } },
        { customerPhone1: { contains: s, mode: 'insensitive' } },
        { customerPhone2: { contains: s, mode: 'insensitive' } },
        { color: { contains: s, mode: 'insensitive' } },
        // Ko'p mahsulotli bitim: ikkinchi va keyingi qurilmalarning IMEI/nomi bo'yicha ham qidiriladi
        {
          items: {
            some: {
              OR: [
                { productName: { contains: s, mode: 'insensitive' } },
                { imei1: { contains: s, mode: 'insensitive' } },
                { imei2: { contains: s, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
      if (/^\d{1,9}$/.test(s)) or.push({ dealNumber: Number(s) });
      and.push({ OR: or });
    }

    const where: Prisma.DealWhereInput = { AND: and };

    const [totalCount, items] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
        include: { store: true, buyer: true, provider: true, items: { orderBy: { position: 'asc' } } },
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

      const customerName = cleanCustomerText(deal.customerName);
      const phone1 = cleanCustomerText(deal.customerPhone1);
      const phone2 = cleanCustomerText(deal.customerPhone2);

      return {
        id: deal.id,
        dealNumber: deal.dealNumber,
        date: deal.date,
        dateTimeLabel: dealDateTimeLabel(deal),
        dealDate: deal.saleDate || deal.date,
        approvalStatus: deal.approvalStatus,
        storeId: deal.storeId,
        storeName: deal.store?.name || "Do'kon",
        providerName: deal.provider?.name || '-',
        sellerName: deal.sellerName || '',
        // Mijoz ismi — faqat haqiqiy mijoz (sotuvchi ismi yoki "-" bilan almashtirilmaydi); yo'q bo'lsa bo'sh satr
        customerName: customerName || '',
        customerPhone: phone1 || '',
        customerPhone1: phone1 || '',
        customerPhone2: phone2 || '',
        productName: deal.productName || (deal.isDaftar ? 'Qurilma (Daftar)' : 'Texnika'),
        quantity: deal.quantity || 1,
        imei: deal.imeiBarcode || '-',
        imeiBarcode: deal.imeiBarcode || '-',
        imei2: deal.imei2 || '-',
        color: deal.color || '-',
        storageGb: deal.storageGb || '-',
        items: dealItemsView(deal),
        status: deal.status,
        statusChangeReason: deal.statusChangeReason || '-',
        purchaseCost,
        primeCost: purchaseCost,
        salePrice,
        saleDate: deal.saleDate,
        buyerName: deal.buyer?.name || customerName || '-',
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
    return sendError(res, error, "Ombor ma'lumotlarini yuklashda xatolik");
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

    const deal = await findScoped(req.user!, id);
    if (!deal) return res.status(404).json({ error: 'Tovar topilmadi' });

    const next = {
      imeiBarcode: String(imeiBarcode).trim(),
      imei2: imei2?.trim() || deal.imei2,
      color: color?.trim() || deal.color,
      storageGb: storageGb?.trim() || deal.storageGb,
    };

    const updated = await prisma.$transaction(async (tx) => {
      // Birinchi mahsulot qatori (DealItem) va deviceItems (Json) eski yagona maydonlar bilan sinxron qoladi
      const rows = await tx.dealItem.findMany({ where: { dealId: id }, orderBy: { position: 'asc' } });
      if (rows.length) {
        await tx.dealItem.update({
          where: { id: rows[0].id },
          data: { imei1: next.imeiBarcode, imei2: next.imei2, color: next.color, storageGb: next.storageGb },
        });
      } else {
        await tx.dealItem.create({
          data: {
            dealId: id,
            position: 0,
            productName: deal.productName || 'Mahsulot',
            imei1: next.imeiBarcode,
            imei2: next.imei2,
            color: next.color,
            storageGb: next.storageGb,
            quantity: deal.quantity || 1,
          },
        });
      }
      const fresh = await tx.dealItem.findMany({ where: { dealId: id }, orderBy: { position: 'asc' } });
      return tx.deal.update({
        where: { id },
        data: {
          ...next,
          deviceItems: toDeviceItemsJson(
            fresh.map((it, i) => ({
              position: i,
              productName: it.productName,
              color: it.color,
              storageGb: it.storageGb,
              imei1: it.imei1,
              imei2: it.imei2,
              quantity: it.quantity,
              price: Number(it.price) || 0,
            }))
          ),
          status: DealStatus.IN_WAREHOUSE,
          statusChangeReason: 'Skaner orqali prixod qilindi va omborga joylashtirildi',
        },
        include: { store: true, buyer: true },
      });
    });

    emitRealtime('deals:updated', { id, action: 'received' });

    return res.json({
      success: true,
      message: `№${deal.dealNumber} - ${deal.productName} omborga muvaffaqiyatli qabul qilindi`,
      item: updated,
    });
  } catch (error: any) {
    return sendError(res, error, 'Tovarni qabul qilishda xatolik');
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
    if (!(Object.values(DealStatus) as string[]).includes(String(status))) {
      return res.status(400).json({ error: "Tovar holati noto'g'ri" });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Holatni o'zgartirish sababi (izoh) kiritilishi shart!" });
    }

    const deal = await findScoped(req.user!, id);
    if (!deal) return res.status(404).json({ error: 'Tovar topilmadi' });

    const updated = await prisma.deal.update({
      where: { id },
      data: {
        status: status as DealStatus,
        statusChangeReason: reason.trim(),
      },
      include: { store: true },
    });

    emitRealtime('deals:updated', { id, action: 'status' });

    return res.json({
      success: true,
      message: `№${deal.dealNumber} holati muvaffaqiyatli yangilandi`,
      item: updated,
    });
  } catch (error: any) {
    return sendError(res, error, 'Holatni yangilashda xatolik');
  }
});

// POST /api/inventory/transfer (Filiallararo tovar ko'chirish) — faqat doiradagi tovarlar
router.post('/transfer', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { dealIds, targetStoreId, reason } = req.body;

    if (!dealIds || !Array.isArray(dealIds) || dealIds.length === 0) {
      return res.status(400).json({ error: "Ko'chiriladigan tovarlar tanlanishi shart" });
    }

    if (!targetStoreId) {
      return res.status(400).json({ error: "Qabul qiluvchi filial (do'kon) tanlanishi shart" });
    }

    const targetStore = await prisma.store.findUnique({ where: { id: targetStoreId } });
    if (!targetStore) {
      return res.status(404).json({ error: 'Qabul qiluvchi filial topilmadi' });
    }

    const transferNote = `Filiallararo ko'chirish: -> ${targetStore.name}. Sabab: ${reason || "O'tkazma"}`;
    const scope = await dealScopeWhere(req.user!);

    const result = await prisma.deal.updateMany({
      where: { AND: [scope, { id: { in: dealIds.map(String) } }] },
      data: {
        status: DealStatus.IN_TRANSIT,
        statusChangeReason: transferNote,
        note: transferNote,
      },
    });
    if (result.count === 0) return res.status(404).json({ error: 'Tovarlar topilmadi' });

    emitRealtime('deals:updated', { action: 'transfer' });

    return res.json({
      success: true,
      message: `${result.count} ta tovar ${targetStore.name} filialiga jo'natildi (Yo'lda)`,
    });
  } catch (error: any) {
    return sendError(res, error, "Tovarlarni ko'chirishda xatolik");
  }
});

// POST /api/inventory/transfer/accept (O'tkazmani qabul qilish) — faqat doiradagi tovarlar
router.post('/transfer/accept', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // Ikki xil klient formati qabul qilinadi: { dealIds: [...] } (Ombor) va { dealId } (Sklad sahifasi)
    const dealIds: unknown[] = Array.isArray(req.body?.dealIds)
      ? req.body.dealIds
      : req.body?.dealId
        ? [req.body.dealId]
        : [];
    const targetStoreId = req.body?.targetStoreId || null;

    if (dealIds.length === 0) {
      return res.status(400).json({ error: 'Qabul qilinadigan tovarlar tanlanishi shart' });
    }
    // Filial berilmasa tovar o'z do'konida qoladi (avvalgidek); berilsa — mavjud bo'lishi shart
    if (targetStoreId && !(await prisma.store.findUnique({ where: { id: String(targetStoreId) } }))) {
      return res.status(404).json({ error: 'Qabul qiluvchi filial topilmadi' });
    }

    const scope = await dealScopeWhere(req.user!);
    const result = await prisma.deal.updateMany({
      where: { AND: [scope, { id: { in: dealIds.map(String) } }] },
      data: {
        ...(targetStoreId ? { storeId: String(targetStoreId) } : {}),
        status: DealStatus.IN_WAREHOUSE,
        statusChangeReason: 'Filialda qabul qilib olindi va omborga kiritildi',
      },
    });
    if (result.count === 0) return res.status(404).json({ error: 'Tovarlar topilmadi' });

    emitRealtime('deals:updated', { action: 'transfer-accept' });

    return res.json({
      success: true,
      message: `${result.count} ta tovar omborga qabul qilindi`,
    });
  } catch (error: any) {
    return sendError(res, error, 'Tovarlarni qabul qilishda xatolik');
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

    const deal = await findScoped(req.user!, id, { store: true });
    if (!deal) return res.status(404).json({ error: 'Tovar topilmadi' });
    if (deal.approvalStatus !== 'APPROVED') return res.status(409).json({ error: NOT_APPROVED_ERROR });

    // 1. Kredit nazorati: shu xaridorda to'lanmagan qarz bormi (butun baza bo'yicha tekshiriladi)
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

    // Xaridor
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

    let ddsAccount: AccountType = AccountType.CASH;
    if (paymentType === 'BANK_CARD' || paymentType === 'CARD') ddsAccount = AccountType.BANK_CARD;
    else if (paymentType === 'SETTLEMENT') ddsAccount = AccountType.SETTLEMENT_ACCOUNT;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Bitimni yangilash. Xaridor buyerId da saqlanadi — bitim mijozining ismi (customerName)
      //    xaridor ismi bilan ustidan yozilmaydi (aks holda mijoz ismi yo'qoladi).
      const d = await tx.deal.update({
        where: { id },
        data: {
          status: DealStatus.SOLD,
          saleDate: saleDate ? new Date(String(saleDate).length === 10 ? `${saleDate}T12:00:00.000+05:00` : saleDate) : new Date(),
          salePrice: sPrice,
          buyerId: b.id,
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

      // 2. Pul olingan bo'lsa — DDS kirimi yadro orqali (hisob qoldig'i ham shu tranzaksiyada oshadi)
      if (pAmount > 0) {
        await createDdsInTx(tx, {
          dateTime: new Date(),
          type: TransactionType.INCOME,
          account: ddsAccount,
          expenseType: ExpenseCategoryType.OPEX,
          categoryName: 'Sotuv tushumi (Tovar sotildi)',
          sourcePerson: bName,
          amount: pAmount,
          description: `Chek №${deal.dealNumber} - ${deal.productName || 'Texnika'} sotuvi tushumi`,
          createdById: req.user?.id,
        });

        // 3. Qarz qolgan bo'lsa — boshlang'ich to'lov tarixi
        if (debtRemainder > 0) {
          await tx.debtPayment.create({
            data: {
              dealId: id,
              amount: pAmount,
              date: new Date(),
              paidBy: bName,
              accountType: ddsAccount,
              note: "Boshlang'ich to'lov",
            },
          });
        }
      }

      return d;
    });

    emitRealtime('deals:updated', { id, action: 'sold' });
    if (pAmount > 0) emitRealtime('dds:updated', {});

    return res.json({
      success: true,
      message: `№${deal.dealNumber} - ${deal.productName} muvaffaqiyatli sotildi`,
      item: updated,
    });
  } catch (error: any) {
    return sendError(res, error, 'Sotuvni qayd qilishda xatolik');
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
      dueDate,
      note,
      returnToWarehouse = false,
      saleDate,
    } = req.body;

    const deal = await findScoped(req.user!, id, { store: true, buyer: true });
    if (!deal) return res.status(404).json({ error: 'Bitim (sotuv) topilmadi' });

    if (returnToWarehouse) {
      // Sotuvni bekor qilib, tovarni omborga qaytarish
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
      emitRealtime('deals:updated', { id, action: 'sale-cancelled' });
      return res.json({
        success: true,
        message: `№${deal.dealNumber} sotuvi bekor qilindi va tovar yana omborga qaytarildi (Omborda)`,
        item: updated,
      });
    }

    if (deal.approvalStatus !== 'APPROVED') return res.status(409).json({ error: NOT_APPROVED_ERROR });

    const sPrice = Number(salePrice) || 0;
    const pAmount = Number(paidAmount) || 0;
    // Xaridor: yangi ism → avvalgi xaridor → (eski yozuvlar uchun) bitim mijozi
    const bName = String(buyerName || deal.buyer?.name || cleanCustomerText(deal.customerName) || '').trim();

    const purchaseCost = Number(deal.totalPurchaseCost) || 0;
    const profit = sPrice - purchaseCost;
    const marginPct = sPrice > 0 ? profit / sPrice : 0;
    const debtRemainder = Math.max(0, sPrice - pAmount);

    let pStatus: PaymentStatus = PaymentStatus.PAID;
    if (debtRemainder > 0) {
      pStatus = pAmount > 0 ? PaymentStatus.PARTIAL : PaymentStatus.DEBT;
    }

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
        // customerName (bitim mijozi) xaridor ismi bilan ustidan yozilmaydi
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

    emitRealtime('deals:updated', { id, action: 'sale-updated' });

    return res.json({
      success: true,
      message: `№${deal.dealNumber} sotuv ma'lumotlari muvaffaqiyatli yangilandi`,
      item: updated,
    });
  } catch (error: any) {
    return sendError(res, error, 'Sotuvni tahrirlashda xatolik');
  }
});

// DELETE /api/inventory/:id/sale (Sotuvni bekor qilish yoki bitimni butunlay o'chirish)
router.delete('/:id/sale', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { deletePermanently = false } = req.query;

    const deal = await findScoped(req.user!, id);
    if (!deal) return res.status(404).json({ error: 'Bitim topilmadi' });

    if (deletePermanently === 'true') {
      // Butunlay o'chirish — DELETE /api/deals/:id bilan bir xil qoida
      const denial = dealWriteDenial('delete', req.user!.role, deal.approvalStatus);
      if (denial) return res.status(403).json({ error: denial });

      const hadTrustEntry = await prisma.trustLedgerEntry.count({ where: { dealId: id } });
      await prisma.deal.delete({ where: { id } });
      emitRealtime('deals:updated', { id, action: 'deleted' });
      if (hadTrustEntry > 0) emitRealtime('trust:updated', {});
      return res.json({
        success: true,
        message: `№${deal.dealNumber} butunlay o'chirildi`,
      });
    }

    // Omborga qaytarish
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

    emitRealtime('deals:updated', { id, action: 'sale-cancelled' });

    return res.json({
      success: true,
      message: `№${deal.dealNumber} sotuvi bekor qilindi va tovar yana omborga qaytarildi (Omborda)`,
      item: updated,
    });
  } catch (error: any) {
    return sendError(res, error, "Sotuvni o'chirishda xatolik");
  }
});

export default router;
