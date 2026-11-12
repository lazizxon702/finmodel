import {
  AccountType,
  DdsSource,
  ExpenseCategoryType,
  Prisma,
  TransactionType,
  TrustEntryType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emitRealtime } from '../lib/realtime';
import {
  CHECK_EXPENSE_CATEGORY,
  TRUST_INCOME_CATEGORY,
  balanceDelta,
  calcCheckExpense,
  calcTrustDebt,
  isTrustDeal,
  normalizeName,
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

/** Kategoriya "Trust 1 daromadi" mi (Trust bergan pul) */
export function isTrustIncomeCategory(categoryName?: string | null): boolean {
  const n = normalizeName(categoryName);
  return n === normalizeName(TRUST_INCOME_CATEGORY) || n === 'trust daromadi' || n === 'trust 1 daromad';
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
}

/**
 * DDS tranzaksiyasini yozadi va:
 *   1) tegishli kassa/karta/hisob qoldig'ini o'zgartiradi (kirim → +, chiqim → −);
 *   2) agar bu Trust bergan pul bo'lsa ("Trust 1 daromadi" kirimi) — Trust qarzidan ayiradi.
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
  const source = trustPayment ? DdsSource.TRUST_PAYMENT : input.source || DdsSource.MANUAL;

  const txNumber = await nextTxNumber(tx);
  const created = await tx.ddsTransaction.create({
    data: {
      txNumber,
      dateTime,
      type: type as TransactionType,
      account: account as AccountType,
      expenseType: expenseType as ExpenseCategoryType,
      categoryName: trustPayment ? TRUST_INCOME_CATEGORY : categoryName,
      sourcePerson: (input.sourcePerson || '').trim() || 'Tizim',
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

  return created;
}

/** DDS yozuvi (tranzaksiya bilan o'ralgan) + real vaqt hodisalari */
export async function createDds(input: CreateDdsInput) {
  const created = await prisma.$transaction((tx) => createDdsInTx(tx, input));
  emitRealtime('dds:updated', { id: created.id });
  if (created.source === DdsSource.TRUST_PAYMENT) emitRealtime('trust:updated', {});
  return created;
}

/** DDS yozuvini o'chiradi va qoldiqni (hamda Trust to'lovini) orqaga qaytaradi */
export async function deleteDds(id: string) {
  const removed = await prisma.$transaction(async (tx) => {
    const existing = await tx.ddsTransaction.findUnique({ where: { id } });
    if (!existing) throw new LedgerError('Tranzaksiya topilmadi', 404);
    // Trust daftaridagi bog'liq PAYMENT yozuvi onDelete: Cascade orqali o'chadi
    await tx.ddsTransaction.delete({ where: { id } });
    await applyBalance(tx, existing.account, -balanceDelta(existing.type, Number(existing.amount)));
    return existing;
  });
  emitRealtime('dds:updated', { id });
  if (removed.source === DdsSource.TRUST_PAYMENT) emitRealtime('trust:updated', {});
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
 * Chek xarajati: mijozga berilgan summa DDS CHIQIMI bo'lib yoziladi (Qodir aka cheki — istisno).
 * Bitta bitim uchun faqat bir marta yoziladi; qayta chaqirilsa mavjud yozuv qaytadi.
 */
export async function createCheckExpenseInTx(
  tx: Tx,
  dealId: string,
  opts: { account?: AccountType | string; amount?: number; createdById?: string | null; sourcePerson?: string | null } = {}
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
    dateTime: new Date(),
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
    const check = await createCheckExpenseInTx(tx, dealId, {
      account: opts.account,
      createdById: admin.id,
      sourcePerson: admin.fullName,
    });
    return { deal: updated, trustDebt, check };
  });

  emitRealtime('deals:updated', { id: dealId, approvalStatus: 'APPROVED' });
  if (result.check.created) emitRealtime('dds:updated', {});
  if (result.trustDebt > 0) emitRealtime('trust:updated', {});

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
