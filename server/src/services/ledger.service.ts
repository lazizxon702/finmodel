import {
  AccountType,
  DdsSource,
  ExpenseCategoryType,
  Prisma,
  StoreEntryType,
  TransactionType,
  TrustEntryType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emitRealtime } from '../lib/realtime';
import {
  CHECK_EXPENSE_CATEGORY,
  QODIR_PAYMENT_CATEGORY,
  STORE_INCOME_CATEGORY,
  STORE_LEDGER_START_YMD,
  TRUST_INCOME_CATEGORY,
  balanceDelta,
  calcCheckExpense,
  calcStoreDebt,
  calcTrustDebt,
  isQodirPaymentCategory,
  isQodirStore,
  isStoreIncomeCategory,
  isTrustDeal,
  isTrustIncomeCategory,
  storeSettlementKind,
  summarizeLedger,
  summarizeTrustLedger,
} from './calculation.service';
import { notifyDealDecision } from './notification.service';

/**
 * Pul harakati yadrosi. DDS yozuvi, hisob qoldig'i va Trust daftari HAR DOIM shu yerdan,
 * bitta DB tranzaksiyasida o'zgaradi — routelar to'g'ridan-to'g'ri prisma.ddsTransaction.create chaqirmasin.
 */

type Tx = Prisma.TransactionClient;

/** Bildirishnomani kutadi, lekin ko'pi bilan ms millisekund; xato yoki kechikish asosiy amalni buzmaydi */
async function settleWithin(p: Promise<unknown>, ms = 5000): Promise<void> {
  await Promise.race([p.catch(() => undefined), new Promise((r) => setTimeout(r, ms))]);
}

export class LedgerError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const ACCOUNTS = Object.values(AccountType) as string[];
const TYPES = Object.values(TransactionType) as string[];
const EXPENSE_TYPES = Object.values(ExpenseCategoryType) as string[];

// Kategoriya aniqlagichlari calculation.service'da; eski importlar buzilmasligi uchun shu yerdan ham eksport qilinadi
export { isTrustIncomeCategory, isQodirPaymentCategory, isStoreIncomeCategory };

const DDS_STORE_SOURCES: DdsSource[] = [DdsSource.QODIR_PAYMENT, DdsSource.STORE_PAYMENT];

/** Spravochnikdagi "Qodir aka" do'koni (yozilish variantlari bilan); yo'q bo'lsa null */
export async function findQodirStore(db: Tx | typeof prisma = prisma) {
  const exact = await db.store.findUnique({ where: { name: 'Qodir aka' } });
  if (exact) return exact;
  const candidates = await db.store.findMany({
    where: { OR: [{ name: { contains: 'odir', mode: 'insensitive' } }, { name: { contains: 'одир', mode: 'insensitive' } }] },
    orderBy: { name: 'asc' },
  });
  return candidates.find((c) => isQodirStore(c.name)) || null;
}

/** Navbatdagi noyob TX raqami. Advisory lock — parallel so'rovlarda bir xil raqam chiqmaydi. */
async function nextTxNumber(tx: Tx): Promise<string> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(778899)`);
  const rows = await tx.$queryRawUnsafe<{ max: number | null }[]>(
    `SELECT MAX(CAST(SUBSTRING("txNumber" FROM 4) AS BIGINT))::float8 AS max
       FROM "DdsTransaction"
      WHERE "txNumber" ~ '^TX-[0-9]{1,8}$'`
  );
  const max = Math.max(1000, Number(rows[0]?.max) || 0);
  return `TX-${max + 1}`;
}

async function applyBalance(tx: Tx, account: AccountType, delta: number) {
  await tx.accountBalance.upsert({
    where: { account },
    create: { account, balance: delta },
    update: { balance: { increment: delta } },
  });
}

export interface CreateDdsInput {
  dateTime?: Date | string | null;
  type: TransactionType | string;
  account: AccountType | string;
  expenseType?: ExpenseCategoryType | string | null;
  categoryName: string;
  sourcePerson?: string | null;
  amount: number | string;
  description?: string | null;
  createdById?: string | null;
  dealId?: string | null;
  source?: DdsSource;
  /** "Do'kondan tushum" kirimi uchun majburiy: qaysi do'konning qarzi kamayadi */
  storeId?: string | null;
}

/**
 * DDS tranzaksiyasini yozadi va:
 *   1) tegishli kassa/karta/hisob qoldig'ini o'zgartiradi (kirim → +, chiqim → −);
 *   2) agar bu Trust bergan pul bo'lsa ("Trust 1 daromadi" kirimi) — Trust qarzidan ayiradi;
 *   3) "Qodir aka to'lovi" CHIQIMI — Qodir aka daftariga PAYMENT (bizning unga qarzimiz kamayadi), toifasi COGS;
 *   4) "Do'kondan tushum" KIRIMI (storeId bilan) — tanlangan do'kon daftariga PAYMENT (do'kon qarzi kamayadi).
 */
export async function createDdsInTx(tx: Tx, input: CreateDdsInput) {
  const type = String(input.type || '').toUpperCase();
  const account = String(input.account || '').toUpperCase();
  const amount = Number(input.amount);
  const categoryName = (input.categoryName || '').trim();

  if (!TYPES.includes(type)) throw new LedgerError("Tranzaksiya turi noto'g'ri (INCOME yoki EXPENSE bo'lishi kerak)");
  if (!ACCOUNTS.includes(account))
    throw new LedgerError("Hisob turi noto'g'ri (CASH, BANK_CARD yoki SETTLEMENT_ACCOUNT bo'lishi kerak)");
  if (!Number.isFinite(amount) || amount <= 0) throw new LedgerError("Summa 0 dan katta son bo'lishi kerak");
  if (!categoryName) throw new LedgerError('Kategoriya kiritilmagan');

  let expenseType = String(input.expenseType || '').toUpperCase();
  if (!EXPENSE_TYPES.includes(expenseType)) {
    expenseType = type === 'INCOME' ? ExpenseCategoryType.INCOME_TRANSFER : ExpenseCategoryType.OPEX;
  }

  const dateTime = input.dateTime ? new Date(input.dateTime) : new Date();
  if (isNaN(dateTime.getTime())) throw new LedgerError("Sana noto'g'ri formatda");

  const trustPayment = type === 'INCOME' && (input.source === DdsSource.TRUST_PAYMENT || isTrustIncomeCategory(categoryName));
  const qodirPayment = !trustPayment && (input.source === DdsSource.QODIR_PAYMENT || isQodirPaymentCategory(categoryName));
  const storePayment =
    !trustPayment && !qodirPayment && (input.source === DdsSource.STORE_PAYMENT || isStoreIncomeCategory(categoryName));

  // Do'kon daftariga tushadigan to'lov: qaysi do'kon, qaysi kategoriya va manba bilan yozilishi
  let storeTarget: { id: string; name: string } | null = null;
  let finalCategory = trustPayment ? TRUST_INCOME_CATEGORY : categoryName;
  let sourcePerson = (input.sourcePerson || '').trim() || 'Tizim';
  let source: DdsSource = trustPayment ? DdsSource.TRUST_PAYMENT : input.source || DdsSource.MANUAL;

  if (qodirPayment) {
    if (type !== 'EXPENSE') {
      throw new LedgerError(`"${QODIR_PAYMENT_CATEGORY}" kategoriyasi faqat CHIQIM uchun (Qodir akaga berilgan pul)`);
    }
    storeTarget = await findQodirStore(tx);
    if (!storeTarget) throw new LedgerError("\"Qodir aka\" do'koni spravochnikda topilmadi — avval do'konni qo'shing");
    finalCategory = QODIR_PAYMENT_CATEGORY;
    source = DdsSource.QODIR_PAYMENT;
    // Qarzni qaytarish — operatsion xarajat emas: OPEX'ga tushmasin, P&L foydasini kamaytirmasin
    expenseType = ExpenseCategoryType.COGS;
  } else if (storePayment) {
    if (type !== 'INCOME') {
      throw new LedgerError(`"${STORE_INCOME_CATEGORY}" kategoriyasi faqat KIRIM uchun (do'kon bergan pul)`);
    }
    const storeId = typeof input.storeId === 'string' ? input.storeId.trim() : '';
    if (!storeId) throw new LedgerError(`"${STORE_INCOME_CATEGORY}" uchun do'kon tanlanishi shart`);
    storeTarget = await tx.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
    if (!storeTarget) throw new LedgerError("Tanlangan do'kon topilmadi");
    const kind = storeSettlementKind(storeTarget.name);
    if (kind === 'WE_OWE') {
      throw new LedgerError(
        `Qodir aka bilan hisob-kitob "${QODIR_PAYMENT_CATEGORY}" chiqimi orqali yuritiladi — bu kategoriyada tanlab bo'lmaydi`
      );
    }
    if (kind === 'TRUST') {
      throw new LedgerError(
        `Trust bilan hisob-kitob "${TRUST_INCOME_CATEGORY}" kirimi orqali yuritiladi — bu kategoriyada tanlab bo'lmaydi`
      );
    }
    finalCategory = STORE_INCOME_CATEGORY;
    source = DdsSource.STORE_PAYMENT;
    expenseType = ExpenseCategoryType.INCOME_TRANSFER;
    sourcePerson = storeTarget.name;
  }

  const txNumber = await nextTxNumber(tx);
  const created = await tx.ddsTransaction.create({
    data: {
      txNumber,
      dateTime,
      type: type as TransactionType,
      account: account as AccountType,
      expenseType: expenseType as ExpenseCategoryType,
      categoryName: finalCategory,
      sourcePerson,
      amount,
      description: input.description || null,
      createdById: input.createdById || null,
      dealId: input.dealId || null,
      source,
    },
  });

  await applyBalance(tx, account as AccountType, balanceDelta(type, amount));

  if (trustPayment) {
    await tx.trustLedgerEntry.create({
      data: {
        type: TrustEntryType.PAYMENT,
        amount,
        dateTime,
        ddsTransactionId: created.id,
        note: input.description || 'Trust bergan pul',
        createdById: input.createdById || null,
      },
    });
  }

  if (storeTarget) {
    await tx.storeLedgerEntry.create({
      data: {
        storeId: storeTarget.id,
        type: StoreEntryType.PAYMENT,
        amount,
        dateTime,
        ddsTransactionId: created.id,
        note: input.description || (qodirPayment ? "Qodir akaga to'lov" : `${storeTarget.name}: do'kondan tushum`),
        createdById: input.createdById || null,
      },
    });
  }

  return created;
}

/** DDS yozuvi (tranzaksiya bilan o'ralgan) + real vaqt hodisalari */
export async function createDds(input: CreateDdsInput) {
  const created = await prisma.$transaction((tx) => createDdsInTx(tx, input));
  emitRealtime('dds:updated', { id: created.id });
  if (created.source === DdsSource.TRUST_PAYMENT) emitRealtime('trust:updated', {});
  if (DDS_STORE_SOURCES.includes(created.source)) emitRealtime('stores:updated', {});
  return created;
}

/** DDS yozuvini o'chiradi va qoldiqni (hamda Trust to'lovini) orqaga qaytaradi */
export async function deleteDds(id: string) {
  const removed = await prisma.$transaction(async (tx) => {
    const existing = await tx.ddsTransaction.findUnique({ where: { id } });
    if (!existing) throw new LedgerError('Tranzaksiya topilmadi', 404);
    // Trust va do'kon daftarlaridagi bog'liq PAYMENT yozuvi onDelete: Cascade orqali o'chadi
    await tx.ddsTransaction.delete({ where: { id } });
    await applyBalance(tx, existing.account, -balanceDelta(existing.type, Number(existing.amount)));
    return existing;
  });
  emitRealtime('dds:updated', { id });
  if (removed.source === DdsSource.TRUST_PAYMENT) emitRealtime('trust:updated', {});
  if (DDS_STORE_SOURCES.includes(removed.source)) emitRealtime('stores:updated', {});
  return removed;
}

/** Hisob qoldiqlarini barcha DDS yozuvlaridan qayta hisoblaydi (tiklash/tekshiruv uchun) */
export async function rebuildAccountBalances() {
  return prisma.$transaction(async (tx) => {
    const grouped = await tx.ddsTransaction.groupBy({ by: ['account', 'type'], _sum: { amount: true } });
    const totals: Record<string, number> = {};
    for (const a of ACCOUNTS) totals[a] = 0;
    for (const g of grouped) totals[g.account] += balanceDelta(g.type, Number(g._sum.amount) || 0);
    for (const a of ACCOUNTS) {
      await tx.accountBalance.upsert({
        where: { account: a as AccountType },
        create: { account: a as AccountType, balance: totals[a] },
        update: { balance: totals[a] },
      });
    }
    return totals;
  });
}

export async function getAccountBalances() {
  const rows = await prisma.accountBalance.findMany();
  const out: Record<string, number> = {};
  for (const a of ACCOUNTS) out[a] = 0;
  for (const r of rows) out[r.account] = Number(r.balance);
  return { ...out, total: Object.values(out).reduce((s, v) => s + v, 0) };
}

/**
 * Bitimning Trust qarzini daftar bilan moslashtiradi:
 *   tasdiqlangan Trust bitimi → DEBT yozuvi (yechilgan limit × 16%), aks holda yozuv o'chiriladi.
 * Bitim yaratilganda, tahrirlanganda, tasdiqlanganda va rad etilganda chaqiriladi.
 */
export async function syncTrustDebtForDeal(tx: Tx, dealId: string) {
  const deal = await tx.deal.findUnique({
    where: { id: dealId },
    include: { store: { select: { name: true } }, provider: { select: { name: true } } },
  });
  if (!deal) return 0;

  const trust = isTrustDeal(deal.store?.name, deal.provider?.name);
  const debt = trust && deal.approvalStatus === 'APPROVED' ? calcTrustDebt(Number(deal.withdrawnLimit)) : 0;

  if (debt > 0) {
    await tx.trustLedgerEntry.upsert({
      where: { dealId },
      create: {
        type: TrustEntryType.DEBT,
        amount: debt,
        dateTime: deal.date,
        dealId,
        note: `Bitim #${deal.dealNumber}: yechilgan limitning 16% i`,
      },
      update: { amount: debt, dateTime: deal.date },
    });
  } else {
    await tx.trustLedgerEntry.deleteMany({ where: { dealId } });
  }

  const plannedDebt = trust ? calcTrustDebt(Number(deal.withdrawnLimit)) : 0;
  if (Number(deal.trustDebtAmount) !== plannedDebt) {
    await tx.deal.update({ where: { id: dealId }, data: { trustDebtAmount: plannedDebt } });
  }
  return debt;
}

/**
 * Bitimning do'kon bilan hisob-kitob qarzini do'kon daftari bilan moslashtiradi:
 *   tasdiqlangan, daftar boshlangan kundan keyingi, Trust bo'lmagan do'kon bitimi → DEBT yozuvi
 *   (summa = mijozga berilgan summa); aks holda yozuv o'chiriladi. Bitimning do'koni o'zgarsa yozuv yangi do'konga ko'chadi.
 * syncTrustDebtForDeal chaqirilgan hamma joyda chaqiriladi.
 */
export async function syncStoreDebtForDeal(tx: Tx, dealId: string) {
  const deal = await tx.deal.findUnique({ where: { id: dealId }, include: { store: { select: { name: true } } } });
  if (!deal) return 0;

  const debt = calcStoreDebt({
    calculatedAmount: Number(deal.calculatedAmount),
    storeName: deal.store?.name,
    approvalStatus: deal.approvalStatus,
    date: deal.date,
  });

  if (debt > 0) {
    const note = `Bitim #${deal.dealNumber}: mijozga berilgan summa`;
    await tx.storeLedgerEntry.upsert({
      where: { dealId },
      create: { storeId: deal.storeId, type: StoreEntryType.DEBT, amount: debt, dateTime: deal.date, dealId, note },
      update: { storeId: deal.storeId, amount: debt, dateTime: deal.date, note },
    });
  } else {
    await tx.storeLedgerEntry.deleteMany({ where: { dealId } });
  }
  return debt;
}

/**
 * Chek xarajati: mijozga berilgan summa DDS CHIQIMI bo'lib yoziladi (Qodir aka cheki — istisno).
 * Bitta bitim uchun faqat bir marta yoziladi; qayta chaqirilsa mavjud yozuv qaytadi.
 */
export async function createCheckExpenseInTx(
  tx: Tx,
  dealId: string,
  opts: {
    account?: AccountType | string;
    amount?: number;
    createdById?: string | null;
    sourcePerson?: string | null;
    /** DDS yozuvining sanasi; berilmasa — hozirgi vaqt (ommaviy ko'chirishda bitim sanasi beriladi) */
    dateTime?: Date;
  } = {}
) {
  const deal = await tx.deal.findUnique({ where: { id: dealId }, include: { store: { select: { name: true } } } });
  if (!deal) throw new LedgerError('Bitim topilmadi', 404);

  const existing = await tx.ddsTransaction.findFirst({ where: { dealId, source: DdsSource.DEAL_CHECK } });
  if (existing) return { transaction: existing, created: false, skippedReason: null as string | null };

  const base = Number(opts.amount) > 0 ? Number(opts.amount) : Number(deal.calculatedAmount);
  const amount = calcCheckExpense({ calculatedAmount: base, storeName: deal.store?.name });
  if (amount <= 0) {
    return {
      transaction: null,
      created: false,
      skippedReason:
        Number(base) > 0 ? 'Qodir aka cheki xarajatga olinmaydi' : "Mijozga berilgan summa 0 — xarajat yozilmadi",
    };
  }

  const transaction = await createDdsInTx(tx, {
    dateTime: opts.dateTime || new Date(),
    type: TransactionType.EXPENSE,
    account: opts.account || AccountType.CASH,
    expenseType: ExpenseCategoryType.COGS,
    categoryName: CHECK_EXPENSE_CATEGORY,
    sourcePerson: opts.sourcePerson || deal.sellerName,
    amount,
    description: `Bitim #${deal.dealNumber}${deal.customerName ? ' — ' + deal.customerName : ''}: chek uchun mijozga to'lov`,
    createdById: opts.createdById || null,
    dealId,
    source: DdsSource.DEAL_CHECK,
  });
  return { transaction, created: true, skippedReason: null as string | null };
}

export interface PendingCheckExpenseItem {
  dealId: string;
  dealNumber: number;
  date: Date;
  customerName: string | null;
  storeName: string | null;
  /** DDS chiqimiga yoziladigan summa (Qodir aka / nol summali bitimlarda — bitimdagi "mijozga berilgan summa") */
  amount: number;
}

/** Har bir bitim o'zining qisqa tranzaksiyasida yoziladi (TX raqami advisory lock ostida beriladi) */
const CHECK_TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 };

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Chek xarajati hali DDS'ga yozilmagan TASDIQLANGAN bitimlar (bitim sanasi oralig'i bo'yicha).
 *   items        — yoziladiganlar (calcCheckExpense > 0)
 *   qodirSkipped — Qodir aka cheki: xarajatga olinmaydi
 *   zeroSkipped  — mijozga berilgan summa 0
 */
export async function listPendingCheckExpenses(range: { start?: Date; end?: Date } = {}) {
  const where: Prisma.DealWhereInput = {
    approvalStatus: 'APPROVED',
    ddsTransactions: { none: { source: DdsSource.DEAL_CHECK } },
  };
  if (range.start || range.end) {
    where.date = { ...(range.start ? { gte: range.start } : {}), ...(range.end ? { lte: range.end } : {}) };
  }
  const deals = await prisma.deal.findMany({
    where,
    orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
    select: {
      id: true,
      dealNumber: true,
      date: true,
      customerName: true,
      calculatedAmount: true,
      store: { select: { name: true } },
    },
  });

  const items: PendingCheckExpenseItem[] = [];
  const qodirSkipped: PendingCheckExpenseItem[] = [];
  const zeroSkipped: PendingCheckExpenseItem[] = [];
  for (const d of deals) {
    const storeName = d.store?.name || null;
    const calculatedAmount = Number(d.calculatedAmount) || 0;
    const amount = calcCheckExpense({ calculatedAmount, storeName });
    const row: PendingCheckExpenseItem = {
      dealId: d.id,
      dealNumber: d.dealNumber,
      date: d.date,
      customerName: d.customerName,
      storeName,
      amount: amount > 0 ? amount : calculatedAmount,
    };
    if (amount > 0) items.push(row);
    else if (isQodirStore(storeName)) qodirSkipped.push(row);
    else zeroSkipped.push(row);
  }

  const sum = (rows: PendingCheckExpenseItem[]) => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  return {
    items,
    qodirSkipped,
    zeroSkipped,
    count: items.length,
    total: sum(items),
    qodirCount: qodirSkipped.length,
    qodirTotal: sum(qodirSkipped),
    zeroCount: zeroSkipped.length,
  };
}

/**
 * Yozilmagan chek xarajatlarini DDS'ga ommaviy ko'chiradi. DDS yozuvi BITIM SANASI bilan yoziladi (bugungi sana emas).
 * Har bir bitim alohida tranzaksiyada; allaqachon yozilgani (yoki parallel so'rov yozib ulgurgani) — "skipped",
 * bitta bitimdagi xato butun to'plamni to'xtatmaydi (failed ro'yxatiga tushadi).
 */
export async function applyPendingCheckExpenses(
  range: { start?: Date; end?: Date } = {},
  opts: { account?: AccountType | string; createdById?: string | null } = {}
) {
  const pending = await listPendingCheckExpenses(range);
  let created = 0;
  let skipped = 0;
  let total = 0;
  const failed: { dealId: string; dealNumber: number; error: string }[] = [];

  for (const item of pending.items) {
    try {
      const result = await prisma.$transaction(
        (tx) =>
          createCheckExpenseInTx(tx, item.dealId, {
            account: opts.account,
            createdById: opts.createdById || null,
            dateTime: item.date,
          }),
        CHECK_TX_OPTIONS
      );
      if (result.created && result.transaction) {
        created += 1;
        total += Number(result.transaction.amount) || 0;
      } else {
        skipped += 1;
      }
    } catch (e: any) {
      // Noyoblik cheklovi (dealId + source): boshqa so'rov shu bitimni yozib ulgurgan — dublikat yo'q
      if (isUniqueViolation(e)) {
        skipped += 1;
        continue;
      }
      failed.push({
        dealId: item.dealId,
        dealNumber: item.dealNumber,
        error: e instanceof LedgerError ? e.message : "Kutilmagan xatolik — yozuv saqlanmadi",
      });
      if (!(e instanceof LedgerError)) console.error(`[chek→DDS] bitim #${item.dealNumber}:`, e);
    }
  }

  if (created > 0) {
    emitRealtime('dds:updated', { bulk: true });
    emitRealtime('deals:updated', { action: 'expense', bulk: true });
  }

  return { created, skipped, total: Math.round(total * 100) / 100, failed };
}

/**
 * ADMIN bitimni tasdiqlaydi: bitim hisob-kitobga qo'shiladi, Trust qarzi yoziladi,
 * chek summasi DDS chiqimi bo'ladi, bitim egasiga bildirishnoma ketadi.
 */
export async function approveDeal(
  dealId: string,
  admin: { id: string; fullName?: string },
  opts: { account?: AccountType | string } = {}
) {
  const result = await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new LedgerError('Bitim topilmadi', 404);
    if (deal.approvalStatus === 'APPROVED') throw new LedgerError('Bitim allaqachon tasdiqlangan', 409);

    const updated = await tx.deal.update({
      where: { id: dealId },
      data: { approvalStatus: 'APPROVED', approvedById: admin.id, approvedAt: new Date(), rejectReason: null },
    });
    const trustDebt = await syncTrustDebtForDeal(tx, dealId);
    const storeDebt = await syncStoreDebtForDeal(tx, dealId);
    const check = await createCheckExpenseInTx(tx, dealId, {
      account: opts.account,
      createdById: admin.id,
      sourcePerson: admin.fullName,
    });
    return { deal: updated, trustDebt, storeDebt, check };
  });

  emitRealtime('deals:updated', { id: dealId, approvalStatus: 'APPROVED' });
  if (result.check.created) emitRealtime('dds:updated', {});
  if (result.trustDebt > 0) emitRealtime('trust:updated', {});
  if (result.storeDebt > 0) emitRealtime('stores:updated', {});

  // Serverless muhitda javobdan keyin jarayon muzlashi mumkin — shuning uchun qisqa muddat kutamiz
  await settleWithin(notifyDealDecision({
    dealId,
    dealNumber: result.deal.dealNumber,
    decision: 'APPROVED',
    recipientUserId: result.deal.createdById,
    customerName: result.deal.customerName,
    amount: Number(result.deal.withdrawnLimit),
    decidedByName: admin.fullName,
  }));

  return result;
}

/** ADMIN bitimni rad etadi: hisob-kitobga kirmaydi, Trust qarzi yozilmaydi */
export async function rejectDeal(dealId: string, admin: { id: string; fullName?: string }, reason?: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new LedgerError('Bitim topilmadi', 404);
    if (deal.approvalStatus === 'APPROVED')
      throw new LedgerError("Tasdiqlangan bitimni rad etib bo'lmaydi — avval tegishli DDS yozuvini o'chiring", 409);
    const u = await tx.deal.update({
      where: { id: dealId },
      data: {
        approvalStatus: 'REJECTED',
        approvedById: admin.id,
        approvedAt: new Date(),
        rejectReason: (reason || '').trim() || null,
      },
    });
    await syncTrustDebtForDeal(tx, dealId);
    await syncStoreDebtForDeal(tx, dealId);
    return u;
  });

  emitRealtime('deals:updated', { id: dealId, approvalStatus: 'REJECTED' });

  // Serverless muhitda javobdan keyin jarayon muzlashi mumkin — shuning uchun qisqa muddat kutamiz
  await settleWithin(notifyDealDecision({
    dealId,
    dealNumber: updated.dealNumber,
    decision: 'REJECTED',
    reason: updated.rejectReason,
    recipientUserId: updated.createdById,
    customerName: updated.customerName,
    amount: Number(updated.withdrawnLimit),
    decidedByName: admin.fullName,
  }));

  return updated;
}

/** Trust hisob-kitobi: yig'ma (Jami qarz, Trust bergan pul, Qoldiq) + yozuvlar, sana oralig'i bilan */
export async function getTrustLedger(range: { start?: Date; end?: Date } = {}) {
  const where: Prisma.TrustLedgerEntryWhereInput = {};
  if (range.start || range.end) {
    where.dateTime = { ...(range.start ? { gte: range.start } : {}), ...(range.end ? { lte: range.end } : {}) };
  }
  const [entries, all] = await Promise.all([
    prisma.trustLedgerEntry.findMany({
      where,
      orderBy: { dateTime: 'desc' },
      include: {
        deal: {
          select: {
            id: true,
            dealNumber: true,
            customerName: true,
            withdrawnLimit: true,
            store: { select: { name: true } },
            provider: { select: { name: true } },
          },
        },
        ddsTransaction: { select: { id: true, txNumber: true, account: true, sourcePerson: true } },
      },
    }),
    prisma.trustLedgerEntry.findMany({ select: { type: true, amount: true } }),
  ]);
  return {
    period: summarizeTrustLedger(entries.map((e) => ({ type: e.type, amount: Number(e.amount) }))),
    overall: summarizeTrustLedger(all.map((e) => ({ type: e.type, amount: Number(e.amount) }))),
    entries,
  };
}

// ════════════════════════════════════════════════════════════════════
//  Do'konlar bilan hisob-kitob (do'kon daftari) — hisobotlar
// ════════════════════════════════════════════════════════════════════

type DateRange = { start?: Date; end?: Date };
const dateFilter = (range: DateRange) =>
  range.start || range.end
    ? { ...(range.start ? { gte: range.start } : {}), ...(range.end ? { lte: range.end } : {}) }
    : undefined;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Bitta do'kon bo'yicha hisobot: davrdagi tasdiqlangan bitimlar, ularga bog'langan DDS chiqimlari,
 * do'kon daftari (davr + butun davr yig'masi) va yozuvlar. Do'kon topilmasa — null.
 *   payoutTotal  = Σ mijozga berilgan summa;  profit = Σ Deal.profit (saqlangan qiymat, qayta hisoblanmaydi);
 *   dealExpenses = shu bitimlarga bog'langan DDS chiqimlari, COGS'dan TASHQARI (chek to'lovi — do'kon qaytaradigan
 *                  moliyalashtirish, xarajat emas);  netProfit = profit − dealExpenses.
 */
export async function getStoreLedger(storeId: string, range: DateRange = {}) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, isActive: true } });
  if (!store) return null;

  const dealWhere: Prisma.DealWhereInput = { storeId, approvalStatus: 'APPROVED' };
  const df = dateFilter(range);
  if (df) dealWhere.date = df;

  const [deals, entries, overallRows] = await Promise.all([
    prisma.deal.findMany({
      where: dealWhere,
      orderBy: [{ date: 'desc' }, { dealNumber: 'desc' }],
      select: {
        id: true,
        dealNumber: true,
        date: true,
        customerName: true,
        withdrawnLimit: true,
        calculatedAmount: true,
        profit: true,
      },
    }),
    prisma.storeLedgerEntry.findMany({
      where: { storeId, ...(df ? { dateTime: df } : {}) },
      orderBy: [{ dateTime: 'desc' }, { createdAt: 'desc' }],
      include: {
        deal: { select: { id: true, dealNumber: true, customerName: true } },
        ddsTransaction: { select: { id: true, txNumber: true, account: true, categoryName: true } },
      },
    }),
    prisma.storeLedgerEntry.groupBy({ by: ['type'], where: { storeId }, _sum: { amount: true } }),
  ]);

  const dealById = new Map(deals.map((d) => [d.id, d]));
  const expenses = deals.length
    ? await prisma.ddsTransaction.findMany({
        where: { type: TransactionType.EXPENSE, amount: { gt: 0 }, dealId: { in: deals.map((d) => d.id) } },
        orderBy: [{ dateTime: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          txNumber: true,
          dateTime: true,
          categoryName: true,
          expenseType: true,
          account: true,
          amount: true,
          dealId: true,
          source: true,
        },
      })
    : [];

  const checkByDeal = new Map<string, (typeof expenses)[number]>();
  let dealExpenses = 0;
  for (const e of expenses) {
    if (e.source === DdsSource.DEAL_CHECK && e.dealId) checkByDeal.set(e.dealId, e);
    if (e.expenseType !== ExpenseCategoryType.COGS) dealExpenses += Number(e.amount) || 0;
  }

  const sum = (pick: (d: (typeof deals)[number]) => unknown) => r2(deals.reduce((s, d) => s + (Number(pick(d)) || 0), 0));
  const profit = sum((d) => d.profit);
  dealExpenses = r2(dealExpenses);

  return {
    store,
    settlement: storeSettlementKind(store.name),
    ledgerStart: STORE_LEDGER_START_YMD,
    summary: {
      dealsCount: deals.length,
      withdrawnTotal: sum((d) => d.withdrawnLimit),
      payoutTotal: sum((d) => d.calculatedAmount),
      profit,
      dealExpenses,
      netProfit: r2(profit - dealExpenses),
    },
    ledger: {
      period: summarizeLedger(entries.map((e) => ({ type: e.type, amount: Number(e.amount) }))),
      overall: summarizeLedger(overallRows.map((g) => ({ type: g.type, amount: Number(g._sum.amount) || 0 }))),
    },
    deals: deals.map((d) => ({ ...d, checkExpense: checkByDeal.get(d.id) || null })),
    expenses: expenses.map((e) => ({ ...e, dealNumber: e.dealId ? dealById.get(e.dealId)?.dealNumber ?? null : null })),
    entries,
  };
}

/**
 * Barcha do'konlar bo'yicha yig'ma hisobot. Ro'yxatga davrda kamida bitta tasdiqlangan bitimi bor
 * YOKI butun davr qoldig'i nolga teng bo'lmagan do'konlar kiradi; bitimlar soni bo'yicha kamayish tartibida.
 * totals.storesOweUs / weOwe — joriy (butun davr) qoldiqlar: do'konlar bizga / biz Qodir akaga.
 */
export async function getStoresReport(range: DateRange = {}) {
  const df = dateFilter(range);
  const dealWhere: Prisma.DealWhereInput = { approvalStatus: 'APPROVED', ...(df ? { date: df } : {}) };

  const [stores, dealGroups, expenseRows, periodRows, overallRows] = await Promise.all([
    prisma.store.findMany({ select: { id: true, name: true, isActive: true } }),
    prisma.deal.groupBy({
      by: ['storeId'],
      where: dealWhere,
      _count: { _all: true },
      _sum: { withdrawnLimit: true, calculatedAmount: true, profit: true },
    }),
    prisma.ddsTransaction.findMany({
      where: {
        type: TransactionType.EXPENSE,
        amount: { gt: 0 },
        expenseType: { not: ExpenseCategoryType.COGS },
        deal: dealWhere,
      },
      select: { amount: true, deal: { select: { storeId: true } } },
    }),
    prisma.storeLedgerEntry.groupBy({
      by: ['storeId', 'type'],
      where: df ? { dateTime: df } : {},
      _sum: { amount: true },
    }),
    prisma.storeLedgerEntry.groupBy({ by: ['storeId', 'type'], _sum: { amount: true } }),
  ]);

  const dealsByStore = new Map(dealGroups.map((g) => [g.storeId, g]));
  const expenseByStore = new Map<string, number>();
  for (const e of expenseRows) {
    const sid = e.deal?.storeId;
    if (sid) expenseByStore.set(sid, (expenseByStore.get(sid) || 0) + (Number(e.amount) || 0));
  }
  const ledgerOf = (rows: typeof overallRows, storeId: string) =>
    summarizeLedger(rows.filter((r) => r.storeId === storeId).map((r) => ({ type: r.type, amount: Number(r._sum.amount) || 0 })));

  const rows = stores
    .map((s) => {
      const g = dealsByStore.get(s.id);
      const profit = r2(Number(g?._sum.profit) || 0);
      const dealExpenses = r2(expenseByStore.get(s.id) || 0);
      return {
        storeId: s.id,
        name: s.name,
        isActive: s.isActive,
        settlement: storeSettlementKind(s.name),
        dealsCount: g?._count._all || 0,
        withdrawnTotal: r2(Number(g?._sum.withdrawnLimit) || 0),
        payoutTotal: r2(Number(g?._sum.calculatedAmount) || 0),
        profit,
        dealExpenses,
        netProfit: r2(profit - dealExpenses),
        period: ledgerOf(periodRows, s.id),
        overall: ledgerOf(overallRows, s.id),
      };
    })
    .filter((r) => r.dealsCount > 0 || Math.abs(r.overall.balance) >= 0.01)
    .sort((a, b) => b.dealsCount - a.dealsCount || a.name.localeCompare(b.name));

  const total = (pick: (r: (typeof rows)[number]) => number) => r2(rows.reduce((s, r) => s + pick(r), 0));
  return {
    ledgerStart: STORE_LEDGER_START_YMD,
    totals: {
      dealsCount: rows.reduce((s, r) => s + r.dealsCount, 0),
      payoutTotal: total((r) => r.payoutTotal),
      profit: total((r) => r.profit),
      dealExpenses: total((r) => r.dealExpenses),
      netProfit: total((r) => r.netProfit),
      storesOweUs: total((r) => (r.settlement === 'STORE_OWES' ? r.overall.balance : 0)),
      weOwe: total((r) => (r.settlement === 'WE_OWE' ? r.overall.balance : 0)),
    },
    stores: rows,
  };
}
