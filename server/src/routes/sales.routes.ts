import { Router, Response } from 'express';
import { AccountType, DealStatus, Prisma, Role, SalePaymentType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { verifyAdminOverride } from '../lib/security';
import { emitRealtime } from '../lib/realtime';
import { APPROVED_ONLY, dealScopeWhere } from '../services/access.service';
import { LedgerError, getAccountBalances } from '../services/ledger.service';
import { calcSaleProfit, tashkentDayRange } from '../services/calculation.service';
import {
  SaleError,
  addSalePayment,
  listBuyerDebts,
  payBuyerDebt,
  createSale,
  creditBlockedError,
  getBuyerOpenDebt,
  returnSale,
  updateSale,
} from '../services/sale.service';
import { HttpError, cleanCustomerText, dealDateTimeLabel, dealItemsView } from './deals.routes';

/**
 * Sotuvlar (ko'p tovarli sotuv):
 *   GET  /api/sales                 — sotuvlar ro'yxati (+ eski, bitta tovarli sotuvlar `legacy:true` bilan) va jami
 *   POST /api/sales                 — yangi sotuv: bir nechta ombor qatori, bitta narx, bitta to'lov
 *   PUT  /api/sales/:id             — narx / xaridor / sana / muddat / izoh (pul harakatisiz)
 *   POST /api/sales/:id/payments    — sotuv qarziga to'lov (DDS kirimi)
 *   POST /api/sales/:id/return      — omborga qaytarish (to'liq yoki qisman; pul ham qaytariladi)
 */
const router = Router();

const SALE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.COO, Role.SELLER];
const PAYMENT_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.COO, Role.SELLER, Role.CASHIER, Role.CFO];

const SALE_INCLUDE = {
  buyer: true,
  deals: {
    orderBy: { dealNumber: 'asc' as const },
    include: { store: true, items: { orderBy: { position: 'asc' as const } } },
  },
  payments: {
    orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }],
    include: { ddsTransaction: { select: { txNumber: true } } },
  },
} satisfies Prisma.SaleInclude;

const LEGACY_INCLUDE = {
  store: true,
  buyer: true,
  items: { orderBy: { position: 'asc' as const } },
  debtPayments: { orderBy: { date: 'desc' as const } },
} satisfies Prisma.DealInclude;

type SaleFull = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;
type LegacyDeal = Prisma.DealGetPayload<{ include: typeof LEGACY_INCLUDE }>;

function sendError(res: Response, error: any, fallback: string) {
  if (error instanceof SaleError) return res.status(error.status).json({ error: error.message, ...error.extra });
  if (error instanceof HttpError || error instanceof LedgerError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallback + ':', error);
  return res.status(500).json({ error: fallback });
}

/** Sotuvdagi bitta tovar (ombor qatori) ko'rinishi */
function itemView(deal: SaleFull['deals'][number] | LegacyDeal) {
  const devices = dealItemsView(deal).map((it) => ({
    productName: it.productName,
    color: it.color || null,
    storageGb: it.storageGb || null,
    imei1: it.imei1 || null,
    imei2: it.imei2 || null,
    quantity: Number(it.quantity) || 1,
  }));
  const cost = Number(deal.totalPurchaseCost) || 0;
  const priceShare = Number(deal.salePrice) || 0;
  const received = Number(deal.receivedFromBuyer) || 0;
  return {
    dealId: deal.id,
    dealNumber: deal.dealNumber,
    storeId: deal.storeId,
    storeName: deal.store?.name || "Do'kon",
    productName: deal.productName || devices[0]?.productName || 'Texnika',
    imei: deal.imeiBarcode || devices[0]?.imei1 || '-',
    devices,
    cost,
    priceShare,
    received,
    debt: Number(deal.debtRemainder) || 0,
    profit: priceShare - cost,
  };
}

/** Sotuv qatori (SaleRow) */
export function saleRowView(sale: SaleFull) {
  const items = sale.deals.map(itemView);
  const totalPrice = Number(sale.totalPrice) || 0;
  const totalCost = items.reduce((s, it) => s + it.cost, 0);
  const { profit, marginPct } = calcSaleProfit(totalPrice, totalCost);
  return {
    id: sale.id,
    legacy: false,
    saleNumber: sale.saleNumber as number | null,
    saleDate: sale.saleDate,
    dateLabel: dealDateTimeLabel({ date: sale.saleDate, createdAt: sale.createdAt }),
    buyerName: sale.buyer?.name || '',
    itemsCount: items.length,
    totalPrice,
    totalCost,
    profit,
    marginPct,
    receivedAmount: Number(sale.receivedAmount) || 0,
    debtRemainder: Number(sale.debtRemainder) || 0,
    paymentStatus: sale.paymentStatus,
    paymentType: sale.paymentType as SalePaymentType | null,
    debtDueDate: sale.debtDueDate,
    note: sale.note,
    items,
    payments: sale.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      date: p.date,
      dateLabel: dealDateTimeLabel({ date: p.date, createdAt: p.createdAt }),
      accountType: p.accountType,
      note: p.note,
      txNumber: (p.ddsTransaction?.txNumber ?? null) as string | null,
    })),
  };
}

/** Eski yo'l bilan (bitta tovar) sotilgan bitim — bitta tovarli sotuv qatori sifatida */
function legacyRowView(deal: LegacyDeal): ReturnType<typeof saleRowView> {
  const item = itemView(deal);
  const date = deal.saleDate || deal.date;
  const { profit, marginPct } = calcSaleProfit(item.priceShare, item.cost);
  return {
    id: deal.id,
    legacy: true,
    saleNumber: null,
    saleDate: date,
    dateLabel: dealDateTimeLabel({ date, createdAt: deal.createdAt }),
    buyerName: cleanCustomerText(deal.buyer?.name) || cleanCustomerText(deal.customerName) || '',
    itemsCount: 1,
    totalPrice: item.priceShare,
    totalCost: item.cost,
    profit,
    marginPct,
    receivedAmount: item.received,
    debtRemainder: item.debt,
    paymentStatus: deal.paymentStatus,
    paymentType: null,
    debtDueDate: deal.debtDueDate,
    note: deal.note,
    items: [item],
    payments: deal.debtPayments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      date: p.date,
      dateLabel: dealDateTimeLabel({ date: p.date, createdAt: p.createdAt }),
      accountType: p.accountType,
      note: p.note,
      txNumber: null,
    })),
  };
}

async function loadSaleRow(id: string) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
  return sale ? saleRowView(sale) : null;
}

/** "YYYY-MM-DD" → shu kunning tushi (Toshkent); to'liq ISO — o'zicha; noto'g'ri bo'lsa 400 */
function parseDateInput(raw: unknown, label: string): Date {
  const s = String(raw).trim();
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00.000+05:00` : s);
  if (isNaN(d.getTime())) throw new HttpError(400, `${label} noto'g'ri formatda`);
  return d;
}

const MIN_EVENT_DATE = new Date('2020-01-01T00:00:00.000+05:00');
const DAY_MS = 24 * 60 * 60 * 1000;

/** Sotuv / to'lov sanasi: 01.01.2020 dan oldin va hozirdan 1 kundan ko'p kelajakda bo'lmaydi */
function parseEventDate(raw: unknown, label: string): Date {
  const d = parseDateInput(raw, label);
  if (d.getTime() < MIN_EVENT_DATE.getTime()) throw new HttpError(400, `${label} 01.01.2020 dan oldin bo'lishi mumkin emas`);
  if (d.getTime() > Date.now() + DAY_MS) throw new HttpError(400, `${label} kelajakda bo'lishi mumkin emas (ko'pi bilan 1 kun oldinga)`);
  return d;
}

const isBlank = (v: unknown) => v === undefined || v === null || v === '';

const MAX_AMOUNT = 1e12;
const MAX_NOTE_LEN = 500;
const MAX_BUYER_NAME_LEN = 200;

/** Pul summasi: butun so'mgacha yaxlitlanadi; son bo'lmasa yoki juda katta bo'lsa 400 */
function parseAmount(raw: unknown, label: string): number {
  const n = typeof raw === 'string' ? Number(raw.replace(/\s+/g, '')) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} son bo'lishi kerak`);
  if (Math.abs(n) > MAX_AMOUNT) throw new HttpError(400, `${label} juda katta (ko'pi bilan 1 000 000 000 000)`);
  return Math.round(n);
}

/** Izoh: bo'sh → null; 500 belgidan uzun bo'lsa 400 */
function parseNote(raw: unknown): string | null {
  const note = String(raw ?? '').trim();
  if (note.length > MAX_NOTE_LEN) throw new HttpError(400, `Izoh ${MAX_NOTE_LEN} belgidan uzun bo'lishi mumkin emas`);
  return note || null;
}

/** Xaridor ismi: majburiy, ko'pi bilan 200 belgi */
function parseBuyerName(raw: unknown): string {
  const name = String(raw ?? '').trim();
  if (!name) throw new HttpError(400, 'Xaridor ismi kiritilishi shart!');
  if (name.length > MAX_BUYER_NAME_LEN) {
    throw new HttpError(400, `Xaridor ismi ${MAX_BUYER_NAME_LEN} belgidan uzun bo'lishi mumkin emas`);
  }
  return name;
}

/** To'lov turi (eski klient yozilishlari ham qabul qilinadi: SETTLEMENT, CARD) */
function parsePaymentType(raw: unknown): SalePaymentType {
  const v = String(raw ?? 'CASH').trim().toUpperCase();
  if (v === 'CASH') return SalePaymentType.CASH;
  if (v === 'BANK_CARD' || v === 'CARD') return SalePaymentType.BANK_CARD;
  if (v === 'SETTLEMENT_ACCOUNT' || v === 'SETTLEMENT') return SalePaymentType.SETTLEMENT_ACCOUNT;
  if (v === 'DEBT' || v === 'INSTALLMENT') return SalePaymentType.DEBT;
  throw new HttpError(400, "To'lov turi noto'g'ri (CASH, BANK_CARD, SETTLEMENT_ACCOUNT yoki DEBT bo'lishi kerak)");
}

function accountOfPaymentType(t: SalePaymentType): AccountType {
  if (t === SalePaymentType.BANK_CARD) return AccountType.BANK_CARD;
  if (t === SalePaymentType.SETTLEMENT_ACCOUNT) return AccountType.SETTLEMENT_ACCOUNT;
  return AccountType.CASH;
}

function parseAccountStrict(raw: unknown): AccountType {
  const v = String(raw ?? '').trim().toUpperCase();
  if ((Object.values(AccountType) as string[]).includes(v)) return v as AccountType;
  throw new HttpError(400, "Hisob turi noto'g'ri (CASH, BANK_CARD yoki SETTLEMENT_ACCOUNT bo'lishi kerak)");
}

/** Xaridor (ism bo'yicha noyob). Parallel so'rovda noyoblik xatosi chiqsa — mavjud yozuv olinadi */
async function upsertBuyer(name: string) {
  try {
    return await prisma.buyer.upsert({ where: { name }, update: {}, create: { name } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const found = await prisma.buyer.findUnique({ where: { name } });
      if (found) return found;
    }
    throw e;
  }
}

// GET /api/sales — sotuvlar ro'yxati (sotuv sanasi bo'yicha) + jami
router.get('/', authenticateToken, requireRoles(SALE_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { search, startDate, endDate, storeId } = req.query as Record<string, string | undefined>;
    const ymd = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
    const range = tashkentDayRange(ymd(startDate), ymd(endDate));
    const dateFilter: Prisma.DateTimeFilter | undefined =
      range.start || range.end
        ? { ...(range.start ? { gte: range.start } : {}), ...(range.end ? { lte: range.end } : {}) }
        : undefined;

    const scope = await dealScopeWhere(req.user!);
    const saleAnd: Prisma.SaleWhereInput[] = [];
    const legacyAnd: Prisma.DealWhereInput[] = [scope, APPROVED_ONLY, { status: DealStatus.SOLD, saleId: null }];

    if (dateFilter) {
      saleAnd.push({ saleDate: dateFilter });
      // Eski sotuvda sotuv sanasi yo'q bo'lsa — bitim sanasi olinadi
      legacyAnd.push({ OR: [{ saleDate: dateFilter }, { saleDate: null, date: dateFilter }] });
    }
    if (storeId) {
      saleAnd.push({ deals: { some: { storeId: String(storeId) } } });
      legacyAnd.push({ storeId: String(storeId) });
    }
    const s = String(search || '').trim();
    if (s) {
      const contains = { contains: s, mode: 'insensitive' as const };
      const dealOr: Prisma.DealWhereInput[] = [
        { productName: contains },
        { imeiBarcode: contains },
        { imei2: contains },
        { items: { some: { OR: [{ productName: contains }, { imei1: contains }, { imei2: contains }] } } },
      ];
      const isNum = /^\d{1,9}$/.test(s);
      if (isNum) dealOr.push({ dealNumber: Number(s) });
      const saleOr: Prisma.SaleWhereInput[] = [{ buyer: { name: contains } }, { deals: { some: { OR: dealOr } } }];
      if (isNum) saleOr.push({ saleNumber: Number(s) });
      saleAnd.push({ OR: saleOr });
      legacyAnd.push({ OR: [...dealOr, { buyer: { name: contains } }, { customerName: contains }] });
    }

    const [sales, legacy] = await Promise.all([
      prisma.sale.findMany({ where: { AND: saleAnd }, include: SALE_INCLUDE }),
      prisma.deal.findMany({ where: { AND: legacyAnd }, include: LEGACY_INCLUDE }),
    ]);

    const rows = [...sales.map(saleRowView), ...legacy.map(legacyRowView)].sort(
      (a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()
    );

    const totals = rows.reduce(
      (t, r) => {
        t.count += 1;
        t.itemsCount += r.itemsCount;
        t.totalPrice += r.totalPrice;
        t.totalCost += r.totalCost;
        t.profit += r.profit;
        t.received += r.receivedAmount;
        t.debt += r.debtRemainder;
        return t;
      },
      { count: 0, itemsCount: 0, totalPrice: 0, totalCost: 0, profit: 0, received: 0, debt: 0 }
    );

    return res.json({ sales: rows, totals });
  } catch (error: any) {
    return sendError(res, error, 'Sotuvlarni yuklashda xatolik');
  }
});

// POST /api/sales — yangi sotuv (bir nechta ombor qatori bitta xaridorga)
router.post('/', authenticateToken, requireRoles(SALE_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};

    if (!Array.isArray(body.dealIds) || body.dealIds.length === 0) {
      throw new HttpError(400, 'Sotiladigan tovarlar tanlanishi shart');
    }
    if (body.dealIds.length > 50) throw new HttpError(400, "Bitta sotuvga ko'pi bilan 50 ta tovar qo'shiladi");
    if (body.dealIds.some((x: unknown) => typeof x !== 'string' || !x.trim())) {
      throw new HttpError(400, "Tovarlar ro'yxati noto'g'ri");
    }
    const dealIds: string[] = body.dealIds.map((x: string) => x.trim());
    if (new Set(dealIds).size !== dealIds.length) {
      throw new HttpError(400, "Bitta tovar ro'yxatda ikki marta kelgan");
    }

    const totalPrice = parseAmount(body.totalPrice, 'Sotuv narxi');
    if (totalPrice <= 0) throw new HttpError(400, 'Sotuv narxi kiritilishi shart!');

    const buyerName = parseBuyerName(body.buyerName);

    const paymentType = parsePaymentType(body.paymentType);
    // Nasiya (DEBT): to'lov majburan 0 — butun summa qarzga yoziladi
    const paidAmount = paymentType === SalePaymentType.DEBT ? 0 : isBlank(body.paidAmount) ? 0 : parseAmount(body.paidAmount, "To'langan summa");
    if (paidAmount < 0) throw new HttpError(400, "To'langan summa manfiy bo'lishi mumkin emas");
    if (paidAmount > totalPrice) {
      throw new HttpError(400, "To'langan summa sotuv narxidan katta bo'lishi mumkin emas");
    }

    const saleDate = isBlank(body.saleDate) ? new Date() : parseEventDate(body.saleDate, 'Sotuv sanasi');
    const dueDate = isBlank(body.dueDate) ? null : parseDateInput(body.dueDate, "Qarz muddati");
    const note = parseNote(body.note);

    // Tovarlar: doirada bormi va sotishga tayyormi (oldindan tekshiruv; yakuniy kafolat — tranzaksiyadagi shartli band qilish)
    const scope = await dealScopeWhere(req.user!);
    const found = await prisma.deal.findMany({
      where: { AND: [scope, { id: { in: dealIds } }] },
      select: { id: true, dealNumber: true, status: true, approvalStatus: true, saleId: true },
    });
    if (found.length !== dealIds.length) throw new HttpError(404, 'Tovar topilmadi');
    const unavailable = found
      .filter((d) => d.status !== DealStatus.IN_WAREHOUSE || d.approvalStatus !== 'APPROVED' || d.saleId)
      .sort((a, b) => a.dealNumber - b.dealNumber);
    if (unavailable.length) {
      const numbers = unavailable.map((d) => d.dealNumber);
      throw new SaleError(
        `Tovar(lar)ni sotib bo'lmaydi — omborda emas, tasdiqlanmagan yoki allaqachon sotilgan: ${numbers.map((n) => '№' + n).join(', ')}`,
        409,
        { unavailableDealNumbers: numbers, unavailableDealIds: unavailable.map((d) => d.id) }
      );
    }

    // Kredit nazorati (eski sotuv route'i bilan bir xil): xaridorda to'lanmagan qarz bo'lsa — administrator kodi kerak
    const totalExistingDebt = await getBuyerOpenDebt(buyerName);
    const isDebtSale = paymentType === SalePaymentType.DEBT || paidAmount < totalPrice;
    if (totalExistingDebt > 0 && isDebtSale && !(await verifyAdminOverride(body.adminOverrideCode))) {
      throw creditBlockedError(buyerName, totalExistingDebt);
    }

    const buyer = await upsertBuyer(buyerName);
    const saleId = await createSale({
      dealIds,
      scope,
      totalPrice,
      buyerId: buyer.id,
      buyerName,
      paidAmount,
      paymentType,
      account: accountOfPaymentType(paymentType),
      saleDate,
      dueDate,
      note,
      userId: req.user?.id,
    });

    emitRealtime('deals:updated', { action: 'sold', saleId });
    if (paidAmount > 0) emitRealtime('dds:updated', {});

    const [sale, balances] = await Promise.all([loadSaleRow(saleId), getAccountBalances()]);
    return res.status(201).json({ sale, balances });
  } catch (error: any) {
    return sendError(res, error, 'Sotuvni qayd qilishda xatolik');
  }
});

// PUT /api/sales/:id — sotuvni tahrirlash (pul harakatisiz; tovar ulushlari qayta hisoblanadi)
router.put('/:id', authenticateToken, requireRoles(SALE_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const patch: Parameters<typeof updateSale>[1] = {};

    if (body.totalPrice !== undefined) {
      const totalPrice = parseAmount(body.totalPrice, 'Sotuv narxi');
      if (totalPrice <= 0) throw new HttpError(400, "Sotuv narxi 0 dan katta bo'lishi shart!");
      patch.totalPrice = totalPrice;
    }
    // Xaridor yozuvi bu yerda YARATILMAYDI — updateSale ichida, tekshiruvlardan keyin (xato so'rov "yetim" xaridor qoldirmaydi)
    if (body.buyerName !== undefined) patch.buyerName = parseBuyerName(body.buyerName);
    if (!isBlank(body.saleDate)) patch.saleDate = parseEventDate(body.saleDate, 'Sotuv sanasi');
    if (body.dueDate !== undefined) patch.dueDate = isBlank(body.dueDate) ? null : parseDateInput(body.dueDate, 'Qarz muddati');
    if (body.note !== undefined) patch.note = parseNote(body.note);
    // Kredit nazorati updateSale ichida (xaridor almashsa yoki qarz oshsa); kod to'g'ri bo'lsa chetlab o'tiladi
    patch.overrideOk = await verifyAdminOverride(body.adminOverrideCode);

    try {
      await updateSale(id, patch);
    } catch (e) {
      // Ikki parallel so'rov bir xil yangi xaridorni yaratmoqchi bo'lgan: ikkinchi urinishda xaridor allaqachon mavjud
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      await updateSale(id, patch);
    }
    emitRealtime('deals:updated', { action: 'sale-updated', saleId: id });

    return res.json({ sale: await loadSaleRow(id) });
  } catch (error: any) {
    return sendError(res, error, 'Sotuvni tahrirlashda xatolik');
  }
});

// POST /api/sales/:id/payments — sotuv qarziga to'lov
router.post('/:id/payments', authenticateToken, requireRoles(PAYMENT_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const amount = parseAmount(body.amount, "To'lov summasi");
    if (amount <= 0) throw new HttpError(400, "To'lov summasi 0 dan katta bo'lishi shart!");
    const account = parseAccountStrict(body.accountType ?? 'CASH');
    const date = isBlank(body.date) ? null : parseEventDate(body.date, "To'lov sanasi");
    const note = parseNote(body.note);

    await addSalePayment(id, {
      amount,
      account,
      date,
      note,
      userId: req.user?.id,
    });

    emitRealtime('deals:updated', { action: 'debt-payment', saleId: id });
    emitRealtime('dds:updated', {});

    const [sale, balances] = await Promise.all([loadSaleRow(id), getAccountBalances()]);
    return res.json({ sale, balances });
  } catch (error: any) {
    return sendError(res, error, "To'lovni qabul qilishda xatolik");
  }
});

// GET /api/sales/buyer-debts — qarzi bor xaridorlar (DDS kirim formasidagi tugmalar uchun)
router.get('/buyer-debts', authenticateToken, requireRoles(PAYMENT_ROLES), async (_req: AuthRequest, res: Response) => {
  try {
    return res.json(await listBuyerDebts());
  } catch (error: any) {
    return sendError(res, error, 'Qarzdor xaridorlarni yuklashda xatolik');
  }
});

// POST /api/sales/buyers/:buyerId/payment {amount, accountType?, date?, note?}
//   Xaridor bergan pul uning qarzidan ayriladi — eng eski chekdan boshlab; kassaga kirim bo'lib tushadi.
router.post('/buyers/:buyerId/payment', authenticateToken, requireRoles(PAYMENT_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const amount = parseAmount(body.amount, "To'lov summasi");
    if (amount <= 0) throw new HttpError(400, "To'lov summasi 0 dan katta bo'lishi shart!");
    const account = parseAccountStrict(body.accountType ?? 'CASH');
    const date = isBlank(body.date) ? null : parseEventDate(body.date, "To'lov sanasi");
    const result = await payBuyerDebt(req.params.buyerId, { amount, account, date, note: parseNote(body.note), userId: req.user?.id });
    emitRealtime('deals:updated', { action: 'debt-payment' });
    emitRealtime('dds:updated', {});
    return res.json({ ...result, balances: await getAccountBalances() });
  } catch (error: any) {
    return sendError(res, error, "To'lovni qabul qilishda xatolik");
  }
});

// POST /api/sales/:id/return — omborga qaytarish (dealIds berilmasa — butun sotuv)
router.post('/:id/return', authenticateToken, requireRoles(SALE_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const raw = req.body?.dealIds;
    if (raw !== undefined && raw !== null) {
      if (!Array.isArray(raw) || raw.some((x: unknown) => typeof x !== 'string' || !x.trim())) {
        throw new HttpError(400, "Qaytariladigan tovarlar ro'yxati noto'g'ri");
      }
    }
    const dealIds: string[] | undefined = Array.isArray(raw) ? raw.map((x: string) => x.trim()) : undefined;

    const result = await returnSale(id, dealIds, req.user?.id);

    emitRealtime('deals:updated', { action: 'sale-cancelled', saleId: id });
    // To'liq qaytarishda DDS kirimlari o'chiriladi, qisman qaytarishda pul qaytarilgan bo'lishi mumkin
    emitRealtime('dds:updated', {});

    const [sale, balances] = await Promise.all([result.whole ? null : loadSaleRow(id), getAccountBalances()]);
    return res.json({ sale, returned: result.returned, refunded: result.refunded, balances });
  } catch (error: any) {
    return sendError(res, error, 'Sotuvni qaytarishda xatolik');
  }
});

export default router;
