import {
  AccountType,
  DdsSource,
  DealStatus,
  ExpenseCategoryType,
  PaymentStatus,
  Prisma,
  SalePaymentType,
  TransactionType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { LedgerError, createDdsInTx, deleteDdsInTx } from './ledger.service';
import {
  SALE_DEBT_PAYMENT_CATEGORY,
  SALE_INCOME_CATEGORY,
  SALE_REFUND_CATEGORY,
  allocateRefundByAccount,
  calcSaleShares,
  calcUnsoldDealProfit,
  salePaymentStatus,
  CalculationService,
} from './calculation.service';

/**
 * Ko'p tovarli sotuv (Sale) yadrosi.
 *   • Bitta sotuv = bir nechta ombor qatori (bitim) + bitta umumiy narx + bitta to'lov/qarz.
 *   • Bitimdagi sotuv maydonlari (salePrice, receivedFromBuyer, debtRemainder, profit ...) HAR DOIM
 *     applySaleToDeals orqali sotuvdan ulush bo'yicha qayta yoziladi — eski hisobotlar o'zgarishsiz ishlaydi.
 *   • Formulalar calculation.service'da, pul harakati faqat ledger.service orqali.
 */

type Tx = Prisma.TransactionClient;
/** Tranzaksiya ichida ham, tashqarisida ham ishlaydigan klient */
type Db = Tx | typeof prisma;

export const SALE_TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 };

/** Sotuv amallaridagi xato; `extra` javob tanasiga qo'shiladi (masalan band tovarlar ro'yxati) */
export class SaleError extends LedgerError {
  extra: Record<string, unknown>;
  constructor(message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message, status);
    this.extra = extra;
  }
}

const fmt = (n: number) => Number(n || 0).toLocaleString('uz-UZ');

/** Sotuvga kirgan tovar ustida eski (bitta tovarli) amallar bajarilmasligi haqidagi xabar */
export function saleManagedMessage(saleNumber: number | string): string {
  return `Bu tovar №${saleNumber} sotuvga kiradi — amal Sotuvlar bo'limida bajariladi`;
}

/** Bitim sotuvga kirgan bo'lsa — 409 (eski sell/sale/status/transfer routelari uchun) */
export async function assertDealNotInSale(saleId: string | null | undefined, db: Db = prisma) {
  if (!saleId) return;
  const sale = await db.sale.findUnique({ where: { id: saleId }, select: { saleNumber: true } });
  throw new SaleError(saleManagedMessage(sale?.saleNumber ?? '?'), 409, {
    saleId,
    saleNumber: sale?.saleNumber ?? null,
  });
}

/** Berilgan shartga mos bitimlar orasida sotuvga kirgani bo'lsa — 409 (ommaviy amallar uchun) */
export async function assertDealsNotInSale(where: Prisma.DealWhereInput, db: Db = prisma) {
  const hit = await db.deal.findFirst({
    where: { AND: [where, { saleId: { not: null } }] },
    select: { saleId: true },
  });
  if (hit) await assertDealNotInSale(hit.saleId, db);
}

/**
 * Eski (bitta tovarli) routelardagi SHARTLI yozuv uchun o'ram: yozuv `where: { id, saleId: null }` bilan bajariladi;
 * hech narsa topilmasa (P2025) va tovar shu orada sotuvga kirgan bo'lsa — odatdagi 409 qaytadi
 * (tekshiruv bilan yozuv orasida parallel createSale tovarni band qilgan holat).
 */
export async function guardDealNotClaimed<T>(dealId: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      const row = await prisma.deal.findUnique({ where: { id: dealId }, select: { saleId: true } });
      await assertDealNotInSale(row?.saleId);
    }
    throw e;
  }
}

/** Faol komissiya qoidalari (calculateDeal uchun) — bitim tahriri va omborga qaytarish bir xil qoidalarni ishlatadi */
export async function loadActiveCommissionRules(db: Db = prisma) {
  const rules = await db.commissionRule.findMany({
    where: { isActive: true },
    include: { store: true, provider: true, agency: true },
    orderBy: { priority: 'desc' },
  });
  return rules.map((r) => ({
    storeName: r.store?.name || null,
    providerName: r.provider?.name || null,
    agencyName: r.agency?.name || null,
    ratePercent: Number(r.ratePercent),
    profitPercent: r.profitPercent === null ? null : Number(r.profitPercent),
    validFrom: r.validFrom,
    validTo: r.validTo,
    priority: r.priority,
  }));
}

/**
 * Bitimning foydasi va marjasini berilgan holat uchun qayta hisoblaydi (calculateDeal + faol qoidalar).
 * Holat o'zgarganda kerak: daftar bitimida foyda "Pul tushdi" bo'lgandagina paydo bo'ladi. Bitim topilmasa — null.
 */
export async function computeDealProfitForStatus(dealId: string, status: DealStatus, db: Db = prisma) {
  const d = await db.deal.findUnique({
    where: { id: dealId },
    select: {
      date: true,
      customerLimit: true,
      withdrawnLimit: true,
      calculatedAmount: true,
      isDaftar: true,
      salePrice: true,
      receivedFromBuyer: true,
      store: { select: { name: true } },
      provider: { select: { name: true } },
      agency: { select: { name: true } },
    },
  });
  if (!d) return null;
  const r = CalculationService.calculateDeal(
    {
      customerLimit: Number(d.customerLimit),
      withdrawnLimit: Number(d.withdrawnLimit),
      calculatedAmount: Number(d.calculatedAmount),
      storeName: d.store?.name || '',
      providerName: d.provider?.name || '',
      isDaftarManual: d.isDaftar,
      salePrice: Number(d.salePrice),
      receivedFromBuyer: Number(d.receivedFromBuyer),
      status,
      date: d.date,
      agencyName: d.agency?.name,
    },
    await loadActiveCommissionRules(db)
  );
  return { profit: r.profit, marginPct: r.marginPct };
}

/**
 * Xaridorning to'lanmagan qarzi (kredit nazorati; eski sotuv route'i bilan bir xil shart).
 * `excludeSaleId` — shu sotuvning o'z qarzi hisobga olinmaydi (sotuvni tahrirlashda).
 */
export async function getBuyerOpenDebt(buyerName: string, excludeSaleId?: string | null, db: Db = prisma): Promise<number> {
  const rows = await db.deal.findMany({
    where: {
      OR: [
        { customerName: { equals: buyerName, mode: 'insensitive' } },
        { buyer: { name: { equals: buyerName, mode: 'insensitive' } } },
      ],
      debtRemainder: { gt: 0 },
      paymentStatus: { in: [PaymentStatus.DEBT, PaymentStatus.PARTIAL] },
      ...(excludeSaleId ? { NOT: { saleId: excludeSaleId } } : {}),
    },
    select: { debtRemainder: true },
  });
  return rows.reduce((sum, d) => sum + Number(d.debtRemainder || 0), 0);
}

/** Qarzi bor xaridorga yana qarzga sotish bloklangani haqidagi 403 (POST va PUT /api/sales bir xil shaklda qaytaradi) */
export function creditBlockedError(buyerName: string, totalExistingDebt: number): SaleError {
  return new SaleError(
    `Diqqat! "${buyerName}" da ${totalExistingDebt.toLocaleString('uz-UZ')} UZS qoldiq qarzdorlik mavjud! Tovar chiqarish bloklangan. Davom etish uchun administrator kodini kiriting.`,
    403,
    // existingDebt — shartnomadagi nom; totalExistingDebt — eski maydon (qiymati bir xil)
    { requiresOverride: true, totalExistingDebt, existingDebt: totalExistingDebt }
  );
}

/**
 * Omborga qaytarilgan bitimning sotuv maydonlari (eski routedagi qaytarish bilan bir xil + pul maydonlari).
 * Foyda va marja bu yerda YO'Q — ular resetDealsToWarehouse'da sotilmagan bitim sifatida qayta hisoblanadi.
 */
const WAREHOUSE_RESET = {
  status: DealStatus.IN_WAREHOUSE,
  saleId: null,
  saleDate: null,
  buyerId: null,
  salePrice: 0,
  receivedFromBuyer: 0,
  debtRemainder: 0,
  paidCashUzs: 0,
  paidBank: 0,
  paidTransfer: 0,
  debtDueDate: null,
  paymentStatus: PaymentStatus.PARTIAL,
  statusChangeReason: 'Sotuv bekor qilindi va omborga qaytarildi',
} satisfies Prisma.DealUncheckedUpdateManyInput;

/**
 * Tovarlarni omborga qaytaradi. Sotilmagan bitimning foydasi 0 emas (hamkor bonusi 5%, Trust 16%) —
 * PUT /api/deals/:id bilan bir xil yo'l (calculateDeal + faol qoidalar) bilan qayta hisoblanadi.
 */
async function resetDealsToWarehouse(tx: Tx, where: Prisma.DealWhereInput) {
  const deals = await tx.deal.findMany({
    where,
    select: {
      id: true,
      date: true,
      customerLimit: true,
      withdrawnLimit: true,
      calculatedAmount: true,
      isDaftar: true,
      productName: true,
      quantity: true,
      imeiBarcode: true,
      store: { select: { name: true } },
      provider: { select: { name: true } },
      agency: { select: { name: true } },
    },
  });
  if (!deals.length) return;
  const rules = await loadActiveCommissionRules(tx);
  for (const d of deals) {
    const unsold = calcUnsoldDealProfit(
      {
        customerLimit: Number(d.customerLimit),
        withdrawnLimit: Number(d.withdrawnLimit),
        calculatedAmount: Number(d.calculatedAmount),
        storeName: d.store?.name || '',
        providerName: d.provider?.name || '',
        isDaftarManual: d.isDaftar,
        productName: d.productName || undefined,
        quantity: d.quantity,
        imeiBarcode: d.imeiBarcode || undefined,
        date: d.date,
        agencyName: d.agency?.name,
      },
      rules
    );
    await tx.deal.update({ where: { id: d.id }, data: { ...WAREHOUSE_RESET, ...unsold } });
  }
}

/** Sotuv qatorini tranzaksiya oxirigacha qulflaydi — parallel to'lov/tahrir/qaytarish ketma-ket bajariladi */
export async function lockSale(tx: Tx, saleId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "id" = ${saleId} FOR UPDATE`;
}

/**
 * Sotuvning yig'ma maydonlarini (olingan pul, qarz, holat) to'lovlardan qayta hisoblaydi va
 * sotuvdagi HAR BIR bitimning sotuv maydonlarini ulush bo'yicha qayta yozadi.
 * Sotuvning umumiy narxi, bitimlar to'plami, to'lovlari yoki bitim tannarxi o'zgargan har joyda chaqiriladi.
 */
export async function applySaleToDeals(tx: Tx, saleId: string) {
  // Qulfni o'zi oladi — chaqiruvchi (bitim tahriri, Sheets sinxroni) unutgan bo'lsa ham parallel to'lov/qaytarish bilan to'qnashmaydi
  await lockSale(tx, saleId);
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: {
      buyer: { select: { name: true } },
      payments: { select: { amount: true, accountType: true } },
      deals: { orderBy: { dealNumber: 'asc' }, select: { id: true, totalPurchaseCost: true } },
    },
  });
  if (!sale) return null;

  const totalPrice = Number(sale.totalPrice) || 0;
  const byAccount = { CASH: 0, BANK_CARD: 0, SETTLEMENT_ACCOUNT: 0 };
  let received = 0;
  for (const p of sale.payments) {
    const a = Number(p.amount) || 0;
    received += a;
    byAccount[p.accountType] += a;
  }
  const debt = totalPrice - received;

  await tx.sale.update({
    where: { id: saleId },
    data: {
      receivedAmount: received,
      debtRemainder: debt,
      paymentStatus: salePaymentStatus(totalPrice, received) as PaymentStatus,
    },
  });

  const shares = calcSaleShares({
    totalPrice,
    receivedAmount: received,
    costs: sale.deals.map((d) => Number(d.totalPurchaseCost) || 0),
    byAccount,
  });

  for (let i = 0; i < sale.deals.length; i++) {
    const s = shares[i];
    await tx.deal.update({
      where: { id: sale.deals[i].id },
      // note va customerName ga tegilmaydi (bitim mijozi va izohi saqlanadi)
      data: {
        status: DealStatus.SOLD,
        saleDate: sale.saleDate,
        buyerId: sale.buyerId,
        salePrice: s.priceShare,
        receivedFromBuyer: s.receivedShare,
        debtRemainder: s.debtRemainder,
        paymentStatus: s.paymentStatus as PaymentStatus,
        profit: s.profit,
        marginPct: s.marginPct,
        debtDueDate: sale.debtDueDate,
        paidCashUzs: s.paidCashUzs,
        paidBank: s.paidBank,
        paidTransfer: s.paidTransfer,
        statusChangeReason: `Sotuv №${sale.saleNumber}: Xaridor: ${sale.buyer.name}, Narxi: ${fmt(s.priceShare)} UZS, To'landi: ${fmt(s.receivedShare)} UZS`,
      },
    });
  }
  return { received, debt, shares };
}

export interface CreateSaleInput {
  dealIds: string[];
  /** Foydalanuvchi doirasi (dealScopeWhere) — doiradan tashqaridagi tovar sotilmaydi */
  scope: Prisma.DealWhereInput;
  totalPrice: number;
  buyerId: string;
  buyerName: string;
  paidAmount: number;
  paymentType: SalePaymentType;
  account: AccountType;
  saleDate: Date;
  dueDate: Date | null;
  note: string | null;
  userId?: string | null;
}

/**
 * Yangi sotuv. Hammasi bitta tranzaksiyada: sotuv → tovarlarni shartli band qilish → to'lov + DDS kirimi → ulushlar.
 * Band qilish `updateMany` sharti bilan (omborda, tasdiqlangan, boshqa sotuvda emas) — ikki parallel so'rovdan
 * faqat bittasi o'tadi; ikkinchisi 409 oladi va hech narsa yozilmaydi.
 */
export async function createSale(input: CreateSaleInput): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        saleDate: input.saleDate,
        buyerId: input.buyerId,
        totalPrice: input.totalPrice,
        receivedAmount: 0,
        debtRemainder: input.totalPrice,
        paymentStatus: PaymentStatus.DEBT,
        paymentType: input.paymentType,
        debtDueDate: input.dueDate,
        note: input.note,
        createdById: input.userId || null,
      },
    });

    const claimed = await tx.deal.updateMany({
      where: {
        AND: [
          input.scope,
          { id: { in: input.dealIds }, status: DealStatus.IN_WAREHOUSE, approvalStatus: 'APPROVED', saleId: null },
        ],
      },
      data: { saleId: sale.id },
    });

    if (claimed.count !== input.dealIds.length) {
      const rows = await tx.deal.findMany({
        where: { id: { in: input.dealIds } },
        select: { id: true, dealNumber: true, saleId: true },
      });
      const bad = rows.filter((r) => r.saleId !== sale.id).sort((a, b) => a.dealNumber - b.dealNumber);
      const numbers = bad.map((r) => r.dealNumber);
      // Xato tashlanadi → tranzaksiya to'liq orqaga qaytadi (sotuv ham, band qilingan tovarlar ham)
      throw new SaleError(
        `Tovar(lar)ni sotib bo'lmaydi — omborda emas, tasdiqlanmagan yoki allaqachon sotilgan: ${numbers.map((n) => '№' + n).join(', ') || "noma'lum"}`,
        409,
        { unavailableDealNumbers: numbers, unavailableDealIds: bad.map((r) => r.id) }
      );
    }

    if (input.paidAmount > 0) {
      const now = new Date();
      const dds = await createDdsInTx(tx, {
        dateTime: now,
        type: TransactionType.INCOME,
        account: input.account,
        expenseType: ExpenseCategoryType.OPEX,
        categoryName: SALE_INCOME_CATEGORY,
        sourcePerson: input.buyerName,
        amount: input.paidAmount,
        description: `Sotuv №${sale.saleNumber}: ${input.dealIds.length} ta tovar`,
        createdById: input.userId || null,
        source: DdsSource.SALE_PAYMENT,
      });
      await tx.salePayment.create({
        data: {
          saleId: sale.id,
          amount: input.paidAmount,
          date: now,
          accountType: input.account,
          note: input.paidAmount < input.totalPrice ? "Boshlang'ich to'lov" : "To'liq to'lov",
          ddsTransactionId: dds.id,
          createdById: input.userId || null,
        },
      });
    }

    await applySaleToDeals(tx, sale.id);
    return sale.id;
  }, SALE_TX_OPTIONS);
}

export interface UpdateSaleInput {
  totalPrice?: number;
  /** Xaridor ismi — xaridor yozuvi tekshiruvlardan KEYIN, tranzaksiya ichida topiladi/yaratiladi */
  buyerName?: string;
  /** Administrator kodi to'g'ri kiritilganmi (kredit nazoratini chetlab o'tadi) */
  overrideOk?: boolean;
  saleDate?: Date;
  /** undefined — o'zgarmaydi; null — muddat olib tashlanadi */
  dueDate?: Date | null;
  note?: string | null;
}

/** Sotuvni tahrirlash (narx, xaridor, sana, muddat, izoh). Pul harakati yo'q; ulushlar qayta hisoblanadi. */
export async function updateSale(saleId: string, patch: UpdateSaleInput) {
  return prisma.$transaction(async (tx) => {
    await lockSale(tx, saleId);
    const sale = await tx.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new SaleError('Sotuv topilmadi', 404);

    if (patch.totalPrice !== undefined && patch.totalPrice < Number(sale.receivedAmount)) {
      throw new SaleError(
        `Umumiy narx (${fmt(patch.totalPrice)}) olingan summadan (${fmt(Number(sale.receivedAmount))}) kam bo'lishi mumkin emas`
      );
    }

    // Kredit nazorati (POST /api/sales bilan bir xil qoida): xaridor almashsa yoki sotuv qarzi oshsa va
    // (yangi) xaridorda boshqa to'lanmagan qarz bo'lsa — administrator kodi kerak
    const existingBuyer =
      patch.buyerName !== undefined ? await tx.buyer.findUnique({ where: { name: patch.buyerName } }) : null;
    const buyerChanged = patch.buyerName !== undefined && existingBuyer?.id !== sale.buyerId;
    const newTotal = patch.totalPrice !== undefined ? patch.totalPrice : Number(sale.totalPrice) || 0;
    const newDebt = newTotal - (Number(sale.receivedAmount) || 0);
    const debtIncreased = newDebt > (Number(sale.debtRemainder) || 0);
    if ((buyerChanged || debtIncreased) && newDebt > 0 && !patch.overrideOk) {
      const name =
        patch.buyerName ?? (await tx.buyer.findUnique({ where: { id: sale.buyerId }, select: { name: true } }))?.name ?? '';
      const existingDebt = name ? await getBuyerOpenDebt(name, saleId, tx) : 0;
      if (existingDebt > 0) throw creditBlockedError(name, existingDebt);
    }

    // Xaridor faqat barcha tekshiruvlardan keyin yaratiladi (xato bo'lsa tranzaksiya bilan birga bekor bo'ladi)
    let buyerId: string | undefined;
    if (patch.buyerName !== undefined) {
      buyerId = (existingBuyer ?? (await tx.buyer.create({ data: { name: patch.buyerName } }))).id;
    }

    await tx.sale.update({
      where: { id: saleId },
      data: {
        ...(patch.totalPrice !== undefined ? { totalPrice: patch.totalPrice } : {}),
        ...(buyerId !== undefined ? { buyerId } : {}),
        ...(patch.saleDate !== undefined ? { saleDate: patch.saleDate } : {}),
        ...(patch.dueDate !== undefined ? { debtDueDate: patch.dueDate } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      },
    });
    await applySaleToDeals(tx, saleId);
  }, SALE_TX_OPTIONS);
}

export interface AddSalePaymentInput {
  amount: number;
  account: AccountType;
  date?: Date | null;
  note?: string | null;
  userId?: string | null;
}

/** Sotuv qarziga to'lov: SalePayment + DDS kirimi (yadro orqali) + ulushlar qayta hisoblanadi */
export async function addSalePayment(saleId: string, input: AddSalePaymentInput) {
  return prisma.$transaction((tx) => addSalePaymentInTx(tx, saleId, input), SALE_TX_OPTIONS);
}

/** addSalePayment ning tranzaksiya ichidagi qismi (bir nechta sotuvga taqsimlanadigan to'lov ham shuni ishlatadi) */
async function addSalePaymentInTx(tx: Tx, saleId: string, input: AddSalePaymentInput) {
  {
    await lockSale(tx, saleId);
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { buyer: { select: { name: true } } } });
    if (!sale) throw new SaleError('Sotuv topilmadi', 404);

    const debt = Number(sale.debtRemainder) || 0;
    if (input.amount > debt) {
      throw new SaleError(
        `To'lov summasi (${fmt(input.amount)}) mavjud qarzdan (${fmt(debt)}) katta bo'lishi mumkin emas!`
      );
    }

    const when = input.date || new Date();
    const fullyPaid = debt - input.amount <= 0;
    const dds = await createDdsInTx(tx, {
      dateTime: when,
      type: TransactionType.INCOME,
      account: input.account,
      expenseType: ExpenseCategoryType.OPEX,
      categoryName: SALE_DEBT_PAYMENT_CATEGORY,
      sourcePerson: sale.buyer.name,
      amount: input.amount,
      description: `Sotuv №${sale.saleNumber} - ${sale.buyer.name} dan qarz qaytarilishi (${fmt(input.amount)} UZS)`,
      createdById: input.userId || null,
      source: DdsSource.SALE_PAYMENT,
    });
    await tx.salePayment.create({
      data: {
        saleId,
        amount: input.amount,
        date: when,
        accountType: input.account,
        note: input.note || (fullyPaid ? "Qarz to'liq yopildi" : "Qisman qarz to'lovi"),
        ddsTransactionId: dds.id,
        createdById: input.userId || null,
      },
    });
    await applySaleToDeals(tx, saleId);
  }
}

/** Qarzi bor xaridorlar (DDS kirim formasidagi "xaridor" tugmalari uchun): ism, jami qarz, ochiq sotuvlar soni */
export async function listBuyerDebts(db: Db = prisma) {
  const rows = await db.sale.groupBy({ by: ['buyerId'], where: { debtRemainder: { gt: 0 } }, _sum: { debtRemainder: true }, _count: { _all: true } });
  if (!rows.length) return [];
  const buyers = await db.buyer.findMany({ where: { id: { in: rows.map((r) => r.buyerId) } }, select: { id: true, name: true } });
  const nameOf = new Map(buyers.map((b) => [b.id, b.name]));
  return rows
    .map((r) => ({ buyerId: r.buyerId, name: nameOf.get(r.buyerId) || '', debt: Number(r._sum.debtRemainder) || 0, salesCount: r._count._all }))
    .filter((r) => r.name && r.debt > 0)
    .sort((x, y) => y.debt - x.debt);
}

export interface BuyerPaymentResult {
  buyerName: string;
  debtBefore: number;
  debtAfter: number;
  /** Qaysi sotuvdan qancha ayirildi (eng eski chekdan boshlab) */
  allocations: { saleNumber: number; dealNumbers: number[]; amount: number }[];
}

/**
 * Xaridor bergan pulni uning qarzidan ayiradi (egasi qarori, 15.11.2026: "Umirzoq" tugmasi).
 * Pul ENG ESKI chekdan boshlab taqsimlanadi; har bo'lak oddiy sotuv to'lovi kabi yoziladi (SalePayment + DDS kirimi, kassa oshadi).
 * Summa jami qarzdan katta bo'lsa — hech narsa yozilmaydi.
 */
export async function payBuyerDebt(buyerId: string, input: AddSalePaymentInput): Promise<BuyerPaymentResult> {
  return prisma.$transaction(async (tx) => {
    const buyer = await tx.buyer.findUnique({ where: { id: buyerId }, select: { name: true } });
    if (!buyer) throw new SaleError('Xaridor topilmadi', 404);
    const sales = (
      await tx.sale.findMany({
        where: { buyerId, debtRemainder: { gt: 0 } },
        select: { id: true, saleNumber: true, saleDate: true, debtRemainder: true, deals: { select: { dealNumber: true, date: true } } },
      })
    ).sort((x, y) => {
      const dx = Math.min(...x.deals.map((d) => d.date.getTime()), x.saleDate.getTime());
      const dy = Math.min(...y.deals.map((d) => d.date.getTime()), y.saleDate.getTime());
      return dx - dy || x.saleNumber - y.saleNumber;
    });
    const debtBefore = sales.reduce((s, x) => s + (Number(x.debtRemainder) || 0), 0);
    if (!(input.amount > 0)) throw new SaleError("To'lov summasi 0 dan katta bo'lishi shart!");
    if (debtBefore <= 0) throw new SaleError(`${buyer.name} ning qarzi yo'q`);
    if (input.amount > debtBefore) {
      throw new SaleError(`To'lov summasi (${fmt(input.amount)}) ${buyer.name} ning jami qarzidan (${fmt(debtBefore)}) katta bo'lishi mumkin emas!`);
    }
    let rest = input.amount;
    const allocations: BuyerPaymentResult['allocations'] = [];
    for (const s of sales) {
      if (rest <= 0) break;
      const take = Math.min(Number(s.debtRemainder) || 0, rest);
      if (take <= 0) continue;
      await addSalePaymentInTx(tx, s.id, { ...input, amount: take });
      allocations.push({ saleNumber: s.saleNumber, dealNumbers: s.deals.map((d) => d.dealNumber), amount: take });
      rest -= take;
    }
    return { buyerName: buyer.name, debtBefore, debtAfter: debtBefore - input.amount, allocations };
  }, SALE_TX_OPTIONS);
}

export interface ReturnSaleResult {
  /** Sotuv butunlay bekor qilindimi (sotuv qatori o'chirildi) */
  whole: boolean;
  /** Omborga qaytarilgan tovarlar (bitimlar) soni */
  returned: number;
  /** Xaridorga qaytarilgan (kassadan chiqqan) pul */
  refunded: number;
  dealIds: string[];
}

/**
 * Sotuvni omborga qaytarish.
 *   • To'liq (dealIds berilmasa yoki hamma tovar): sotuvga bog'liq barcha DDS yozuvlari yadro orqali o'chiriladi
 *     (hisob qoldiqlari tuzatiladi), to'lovlar va sotuv qatori o'chadi, tovarlar omborga qaytadi.
 *   • Qisman: tanlangan tovarlar omborga qaytadi, umumiy narx ularning narx ulushiga kamayadi; olingan pul yangi
 *     narxdan oshsa — ortig'i xaridorga qaytariladi (manfiy SalePayment + DDS CHIQIMI, COGS).
 */
export async function returnSale(
  saleId: string,
  dealIds: string[] | undefined,
  userId?: string | null
): Promise<ReturnSaleResult> {
  return prisma.$transaction(async (tx) => {
    await lockSale(tx, saleId);
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        buyer: { select: { name: true } },
        deals: { select: { id: true, dealNumber: true, salePrice: true } },
        // Yozilgan vaqti bo'yicha (foydalanuvchi kiritgan `date` emas) — eng yangi to'lov birinchi
        payments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      },
    });
    if (!sale) throw new SaleError('Sotuv topilmadi', 404);

    const inSale = new Set(sale.deals.map((d) => d.id));
    const requested = Array.from(new Set((dealIds || []).map(String)));
    const foreign = requested.filter((id) => !inSale.has(id));
    if (foreign.length) throw new SaleError('Tanlangan tovar bu sotuvga kirmaydi', 400, { foreignDealIds: foreign });

    const whole = requested.length === 0 || requested.length === sale.deals.length;

    if (whole) {
      for (const p of sale.payments) {
        if (p.ddsTransactionId) await deleteDdsInTx(tx, p.ddsTransactionId);
      }
      const ids = sale.deals.map((d) => d.id);
      await resetDealsToWarehouse(tx, { saleId });
      // To'lovlar (SalePayment) kaskad bilan o'chadi
      await tx.sale.delete({ where: { id: saleId } });
      return { whole: true, returned: ids.length, refunded: Number(sale.receivedAmount) || 0, dealIds: ids };
    }

    const returning = sale.deals.filter((d) => requested.includes(d.id));
    const priceReturned = returning.reduce((s, d) => s + (Number(d.salePrice) || 0), 0);
    const newTotal = Math.max(0, (Number(sale.totalPrice) || 0) - priceReturned);
    const received = Number(sale.receivedAmount) || 0;

    await resetDealsToWarehouse(tx, { id: { in: requested }, saleId });

    let refunded = 0;
    if (received > newTotal) {
      refunded = received - newTotal;
      // Pul hisoblar bo'yicha qaytariladi: eng yangi to'lov tushgan hisobdan boshlab, har bir hisobdan
      // ko'pi bilan shu hisobga sof tushgan summa (Σ SalePayment) — hech bir hisob bo'yicha sof tushum manfiy bo'lmaydi
      const parts = allocateRefundByAccount(
        refunded,
        sale.payments.map((p) => ({ account: p.accountType, amount: Number(p.amount) || 0 }))
      );
      if (parts.reduce((sum, p) => sum + p.amount, 0) !== refunded) {
        throw new SaleError("Qaytariladigan summani hisoblar bo'yicha taqsimlab bo'lmadi — to'lovlar tarixini tekshiring", 409);
      }
      const now = new Date();
      const numbers = returning.map((d) => '№' + d.dealNumber).join(', ');
      for (const part of parts) {
        const dds = await createDdsInTx(tx, {
          dateTime: now,
          type: TransactionType.EXPENSE,
          account: part.account,
          // COGS — operatsion xarajat (OPEX) emas: P&L'da xarajat bo'lib ko'rinmasin
          expenseType: ExpenseCategoryType.COGS,
          categoryName: SALE_REFUND_CATEGORY,
          sourcePerson: sale.buyer.name,
          amount: part.amount,
          description: `Sotuv №${sale.saleNumber}: ${returning.length} ta tovar qaytarildi (${numbers}) — xaridorga ${fmt(part.amount)} UZS qaytarildi`,
          createdById: userId || null,
          source: DdsSource.SALE_PAYMENT,
        });
        await tx.salePayment.create({
          data: {
            saleId,
            amount: -part.amount,
            date: now,
            accountType: part.account,
            note: 'Tovar qaytarildi — xaridorga pul qaytarildi',
            ddsTransactionId: dds.id,
            createdById: userId || null,
          },
        });
      }
    }

    await tx.sale.update({ where: { id: saleId }, data: { totalPrice: newTotal } });
    await applySaleToDeals(tx, saleId);
    return { whole: false, returned: returning.length, refunded, dealIds: requested };
  }, SALE_TX_OPTIONS);
}
