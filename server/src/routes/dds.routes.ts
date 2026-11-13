import { Router, Response, NextFunction } from 'express';
import { AccountType, DdsSource, ExpenseCategoryType, Prisma, Role, TransactionType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { requireAdminConfirm } from '../lib/security';
import { emitRealtime } from '../lib/realtime';
import { isScopedRole } from '../services/access.service';
import {
  CHECK_EXPENSE_CATEGORY,
  QODIR_PAYMENT_CATEGORY,
  STORE_INCOME_CATEGORY,
  TRUST_INCOME_CATEGORY,
  balanceDelta,
  formatTashkentDateTime,
  tashkentDayRange,
} from '../services/calculation.service';
import {
  LedgerError,
  applyPendingCheckExpenses,
  createDds,
  deleteDds,
  getAccountBalances,
  getTrustLedger,
  isQodirPaymentCategory,
  isStoreIncomeCategory,
  isTrustIncomeCategory,
  listPendingCheckExpenses,
  rebuildAccountBalances,
} from '../services/ledger.service';

/**
 * DDS (pul harakati) routelari. Yozish/o'chirish FAQAT ledger servis orqali:
 * DDS yozuvi, hisob qoldig'i (AccountBalance) va Trust daftari bitta DB tranzaksiyasida o'zgaradi.
 *
 *   GET    /api/dds                   — ro'yxat (dateTimeLabel, source, deal {id, dealNumber})
 *   GET    /api/dds/categories        — kategoriya nomlari (?detailed=true → obyektlar)
 *   GET    /api/dds/summary           — davr aylanmasi + haqiqiy hisob qoldiqlari (balances)
 *   POST   /api/dds                   — yangi kirim/chiqim → { ...tranzaksiya, balances, trust }
 *                                       ("Do'kondan tushum" kirimida body.storeId majburiy; "Qodir aka to'lovi" — chiqim)
 *   POST   /api/dds/rebuild-balances  — qoldiqlarni DDS yozuvlaridan qayta hisoblash (ADMIN)
 *   GET    /api/dds/check-expenses/preview — DDS'ga yozilmagan chek xarajatlari, sanadan boshlab (ADMIN)
 *   POST   /api/dds/check-expenses/apply   — ularni DDS'ga ommaviy yozish, bitim sanasi bilan (ADMIN)
 *   DELETE /api/dds/all               — hammasini o'chirish (ADMIN + tasdiqlash kodi)
 *   DELETE /api/dds/:id               — bitta yozuvni o'chirish (qoldiq orqaga qaytadi)
 */
const router = Router();

const WRITE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.CFO];
const DELETE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.CFO];

const TYPES = Object.values(TransactionType) as string[];
const ACCOUNTS = Object.values(AccountType) as string[];
const EXPENSE_TYPES = Object.values(ExpenseCategoryType) as string[];

/** Bitta tranzaksiya uchun yuqori chegara: undan kattasi — ortiqcha nol terilgan xato (va float aniqligi buziladi) */
export const MAX_DDS_AMOUNT = 1_000_000_000_000;

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const tashkentToday = () => new Date(Date.now() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);

/** OPERATOR va AGENT pul harakatini ko'ra olmaydi */
const denyScopedRoles = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || isScopedRole(req.user.role)) {
    return res.status(403).json({ error: "Sizda pul harakati (DDS) bo'limini ko'rish huquqi yo'q" });
  }
  next();
};

/**
 * Summani o'qiydi: son yoki "1 200 000", "1,200,000", "1.200.000", "1 200 000,50", "1200000.5", "1 200 000 so'm".
 * Tushunib bo'lmasa NaN qaytaradi (0 ga aylantirib yubormaydi — avval shu sababli 0 so'mlik yozuvlar paydo bo'lardi).
 */
export function parseAmountInput(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  // Bo'shliq (oddiy, NBSP, tor NBSP), apostrof va pastki chiziq — minglik ajratgichlar
  let s = value.replace(/[\s  '’ʻ`_]/g, '');
  s = s.replace(/(som|sum|uzs|сум|сўм)$/i, '');
  if (!s) return NaN;
  if (/^\d+$/.test(s)) return Number(s);
  // 1,200,000 yoki 1.200.000 — bir xil ajratgich, har guruhda 3 ta raqam → butun son
  if (/^\d{1,3}(,\d{3})+$/.test(s) || /^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  // 1,200,000.50
  if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) return Number(s.replace(/,/g, ''));
  // 1.200.000,50
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  // 1200000.50 yoki 1200000,50
  if (/^\d+[.,]\d+$/.test(s)) return Number(s.replace(',', '.'));
  return NaN;
}

/** Forma sanasi → Date. Faqat sana kelsa: bugun bo'lsa hozirgi vaqt, aks holda Toshkent bo'yicha 12:00. */
function resolveDateTime(input: unknown): Date | undefined {
  if (input === undefined || input === null || input === '') return undefined; // ledger hozirgi vaqtni qo'yadi
  if (input instanceof Date) return input;
  const s = String(input).trim();
  const today = tashkentToday();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s === today ? new Date() : new Date(`${s}T12:00:00+05:00`);
  }
  // Formada vaqt maydoni yo'q — u doim "T12:00:00+05:00" yuboradi. Bugungi sana bo'lsa haqiqiy vaqtni yozamiz,
  // aks holda ro'yxatda hamma yozuv "12:00" bo'lib ko'rinadi (ertalab kiritilgani esa kelajak vaqtiga tushadi).
  if (s === `${today}T12:00:00+05:00`) return new Date();
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    throw new LedgerError("Sana noto'g'ri formatda (YYYY-MM-DD yoki to'liq ISO ko'rinishida bo'lishi kerak)");
  }
  return d;
}

/** ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD → Toshkent kuni chegaralari */
function queryDayRange(startDate: unknown, endDate: unknown) {
  const ymd = (v: unknown) => {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || '').trim());
    return m ? m[1] : null;
  };
  return tashkentDayRange(ymd(startDate), ymd(endDate));
}

type DdsRow = Prisma.DdsTransactionGetPayload<{ include: { deal: { select: { id: true; dealNumber: true } } } }>;

/** Klientga ketadigan ko'rinish: summa — son, sana — Toshkent vaqti bilan yorliq */
function serializeTx(tx: DdsRow | (Omit<DdsRow, 'deal'> & { deal?: DdsRow['deal'] })) {
  return {
    id: tx.id,
    txNumber: tx.txNumber,
    dateTime: tx.dateTime,
    dateTimeLabel: formatTashkentDateTime(tx.dateTime), // DD.MM.YYYY HH:mm (Asia/Tashkent)
    type: tx.type,
    account: tx.account,
    expenseType: tx.expenseType,
    categoryName: tx.categoryName,
    sourcePerson: tx.sourcePerson,
    amount: Number(tx.amount),
    description: tx.description,
    createdById: tx.createdById,
    createdAt: tx.createdAt,
    source: tx.source, // MANUAL | DEAL_CHECK | TRUST_PAYMENT | SYNC | QODIR_PAYMENT | STORE_PAYMENT
    dealId: tx.dealId,
    deal: tx.deal ? { id: tx.deal.id, dealNumber: tx.deal.dealNumber } : null,
  };
}

/** Xatoni tushunarli javobga aylantiradi (Prisma ichki matni va fayl yo'llari klientga chiqmaydi) */
function sendError(res: Response, error: any, fallback: string) {
  if (error instanceof LedgerError) return res.status(error.status).json({ error: error.message });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: "Bir xil yozuv allaqachon mavjud. Sahifani yangilab, qayta urinib ko'ring" });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: "Bog'langan yozuv (foydalanuvchi yoki bitim) bazada topilmadi" });
    }
    if (error.code === 'P2025') return res.status(404).json({ error: 'Tranzaksiya topilmadi' });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

// GET /api/dds
router.get('/', authenticateToken, denyScopedRoles, async (req: AuthRequest, res: Response) => {
  try {
    const {
      type,
      account,
      expenseType,
      categoryName,
      source,
      startDate,
      endDate,
      search,
      page = '1',
      limit = '500',
      sortOrder = 'desc',
    } = req.query as any;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(5000, Math.max(1, parseInt(limit, 10) || 500));
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.DdsTransactionWhereInput = {
      amount: { gt: 0 },
    };
    const enumFilter = (value: any, allowed: string[], label: string) => {
      const v = String(value).toUpperCase();
      if (!allowed.includes(v)) throw new LedgerError(`Filtr qiymati noto'g'ri: ${label}`);
      return v;
    };
    if (type) where.type = enumFilter(type, TYPES, 'type') as TransactionType;
    if (account) where.account = enumFilter(account, ACCOUNTS, 'account') as AccountType;
    if (expenseType) where.expenseType = enumFilter(expenseType, EXPENSE_TYPES, 'expenseType') as ExpenseCategoryType;
    if (source) where.source = enumFilter(source, Object.values(DdsSource), 'source') as DdsSource;
    if (categoryName) where.categoryName = { contains: String(categoryName), mode: 'insensitive' };

    // Sana filtri — Toshkent kuni bo'yicha (00:00 dan 23:59:59.999 gacha, UTC+5)
    const range = queryDayRange(startDate, endDate);
    if (range.start || range.end) {
      where.dateTime = { ...(range.start ? { gte: range.start } : {}), ...(range.end ? { lte: range.end } : {}) };
    }

    if (search) {
      const q = String(search);
      where.OR = [
        { txNumber: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { categoryName: { contains: q, mode: 'insensitive' } },
        { sourcePerson: { contains: q, mode: 'insensitive' } },
      ];
    }

    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [totalCount, transactions] = await Promise.all([
      prisma.ddsTransaction.count({ where }),
      prisma.ddsTransaction.findMany({
        where,
        include: { deal: { select: { id: true, dealNumber: true } } },
        orderBy: [{ dateTime: orderDir }, { createdAt: orderDir }],
        skip,
        take: limitNum,
      }),
    ]);

    return res.json({
      transactions: transactions.map(serializeTx),
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error: any) {
    return sendError(res, error, 'DDS tranzaksiyalarini yuklashda xatolik');
  }
});

// GET /api/dds/categories — kategoriya nomlari. ?detailed=true → [{ name, type, expenseType, system }]
router.get('/categories', authenticateToken, denyScopedRoles, async (req: AuthRequest, res: Response) => {
  try {
    const raw = await prisma.ddsTransaction.groupBy({
      by: ['categoryName', 'type', 'expenseType'],
      _count: { _all: true },
    });

    // Tizim kategoriyalari doim ro'yxatda: Trust to'lovi (KIRIM), chek xarajati (CHIQIM),
    // Qodir akaga to'lov (CHIQIM, COGS) va do'kondan tushum (KIRIM)
    const system = [
      { name: TRUST_INCOME_CATEGORY, type: TransactionType.INCOME, expenseType: ExpenseCategoryType.INCOME_TRANSFER },
      { name: CHECK_EXPENSE_CATEGORY, type: TransactionType.EXPENSE, expenseType: ExpenseCategoryType.COGS },
      { name: QODIR_PAYMENT_CATEGORY, type: TransactionType.EXPENSE, expenseType: ExpenseCategoryType.COGS },
      { name: STORE_INCOME_CATEGORY, type: TransactionType.INCOME, expenseType: ExpenseCategoryType.INCOME_TRANSFER },
    ];
    const byName = new Map<string, { name: string; type: string; expenseType: string; system: boolean; count: number }>();
    for (const s of system) byName.set(s.name, { ...s, system: true, count: 0 });
    for (const r of raw) {
      const name = (r.categoryName || '').trim();
      if (!name) continue;
      // "Trust daromadi" kabi variantlar yagona tizim nomiga birlashadi
      const key =
        r.type === TransactionType.INCOME && isTrustIncomeCategory(name)
          ? TRUST_INCOME_CATEGORY
          : r.type === TransactionType.EXPENSE && isQodirPaymentCategory(name)
            ? QODIR_PAYMENT_CATEGORY
            : r.type === TransactionType.INCOME && isStoreIncomeCategory(name)
              ? STORE_INCOME_CATEGORY
              : name;
      const existing = byName.get(key);
      if (existing) {
        existing.count += r._count._all;
        continue;
      }
      byName.set(key, { name: key, type: r.type, expenseType: r.expenseType, system: false, count: r._count._all });
    }

    const list = Array.from(byName.values()).sort(
      (a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name)
    );
    const detailed = ['true', '1'].includes(String((req.query as any).detailed || '').toLowerCase());
    return res.json(detailed ? list : list.map((c) => c.name));
  } catch (error: any) {
    return sendError(res, error, 'Kategoriyalarni yuklashda xatolik');
  }
});

// GET /api/dds/summary
router.get('/summary', authenticateToken, denyScopedRoles, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query as any;
    const range = queryDayRange(startDate, endDate);

    const where: Prisma.DdsTransactionWhereInput = { amount: { gt: 0 } };
    if (range.start || range.end) {
      where.dateTime = { ...(range.start ? { gte: range.start } : {}), ...(range.end ? { lte: range.end } : {}) };
    }

    const [periodTx, allGrouped, balances] = await Promise.all([
      prisma.ddsTransaction.findMany({
        where,
        select: { type: true, account: true, expenseType: true, categoryName: true, amount: true, source: true },
      }),
      prisma.ddsTransaction.groupBy({ by: ['account', 'type'], _sum: { amount: true } }),
      getAccountBalances(),
    ]);

    let totalIncome = 0;
    let totalExpense = 0;
    let totalCogs = 0;
    let totalOpex = 0;
    let totalTransferOut = 0;
    let trustReceived = 0;

    // Davr ichidagi aylanma — hisoblar kesimida
    const periodFlow: Record<string, { income: number; expense: number; net: number }> = {};
    for (const a of ACCOUNTS) periodFlow[a] = { income: 0, expense: 0, net: 0 };

    const categoryMap: { [cat: string]: { amount: number; type: ExpenseCategoryType } } = {};

    for (const tx of periodTx) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === TransactionType.INCOME) {
        totalIncome += amt;
        periodFlow[tx.account].income += amt;
        if (tx.source === DdsSource.TRUST_PAYMENT) trustReceived += amt;
      } else {
        totalExpense += amt;
        periodFlow[tx.account].expense += amt;

        if (tx.expenseType === ExpenseCategoryType.COGS) totalCogs += amt;
        else if (tx.expenseType === ExpenseCategoryType.OPEX) totalOpex += amt;
        else totalTransferOut += amt;

        const cat = tx.categoryName || 'Boshqa';
        if (!categoryMap[cat]) {
          categoryMap[cat] = { amount: 0, type: tx.expenseType };
        }
        categoryMap[cat].amount += amt;
      }
    }
    for (const a of ACCOUNTS) periodFlow[a].net = periodFlow[a].income - periodFlow[a].expense;

    // Tekshiruv: AccountBalance (saqlangan qoldiq) barcha DDS yozuvlari yig'indisiga tengmi.
    // Farq bo'lsa — kimdir DDS'ni ledger servisni chetlab yozgan/o'chirgan (masalan Sheets sinxronizatsiyasi).
    const computedBalances: Record<string, number> = {};
    for (const a of ACCOUNTS) computedBalances[a] = 0;
    for (const g of allGrouped) computedBalances[g.account] += balanceDelta(g.type, Number(g._sum.amount) || 0);
    computedBalances.total = ACCOUNTS.reduce((s, a) => s + computedBalances[a], 0);

    const balanceDrift: Record<string, number> = {};
    for (const a of [...ACCOUNTS, 'total']) {
      balanceDrift[a] = Math.round(((computedBalances[a] || 0) - (Number((balances as any)[a]) || 0)) * 100) / 100;
    }
    const balancesInSync = Object.values(balanceDrift).every((d) => Math.abs(d) < 0.01);
    if (!balancesInSync) {
      console.warn('[DDS] Hisob qoldiqlari DDS yozuvlari bilan mos emas (farq):', balanceDrift);
    }

    const netCashFlow = totalIncome - totalExpense;

    const classificationLabel = (t: ExpenseCategoryType) =>
      t === ExpenseCategoryType.COGS
        ? "O'zgaruvchan (COGS)"
        : t === ExpenseCategoryType.OPEX
          ? 'Operatsion (OPEX)'
          : "Pul o'tkazmasi";

    const categoriesBreakdown = Object.entries(categoryMap)
      .map(([catName, data]) => ({
        categoryName: catName,
        classification: classificationLabel(data.type),
        expenseType: data.type,
        amount: data.amount,
        sharePct: totalExpense > 0 ? data.amount / totalExpense : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return res.json({
      // Davr aylanmasi (sana filtri bo'lmasa — butun davr)
      totalIncome,
      totalExpense,
      totalCogs,
      totalOpex,
      totalTransferOut,
      trustReceived,
      netCashFlow,
      periodFlow,
      // Haqiqiy joriy qoldiqlar — AccountBalance jadvalidan (sana filtriga bog'liq emas)
      cashBalance: (balances as any).CASH,
      cardBalance: (balances as any).BANK_CARD,
      settlementBalance: (balances as any).SETTLEMENT_ACCOUNT,
      totalLiquidity: balances.total,
      balances,
      // Nazorat: DDS yozuvlaridan qayta hisoblangan qoldiq va saqlangan qoldiq orasidagi farq
      computedBalances,
      balanceDrift,
      balancesInSync,
      categoriesBreakdown,
    });
  } catch (error: any) {
    return sendError(res, error, 'DDS hisobotini olishda xatolik');
  }
});

// POST /api/dds — yangi kirim/chiqim (ledger servis orqali: qoldiq va Trust daftari ham yangilanadi)
router.post('/', authenticateToken, requireRoles(WRITE_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    const type = String(body.type ?? '').trim().toUpperCase();
    const account = String(body.account ?? '').trim().toUpperCase();
    const categoryName = typeof body.categoryName === 'string' ? body.categoryName.trim() : '';
    const rawExpenseType = String(body.expenseType ?? '').trim().toUpperCase();

    if (!type || !account || !categoryName || body.amount === undefined || body.amount === null || body.amount === '') {
      throw new LedgerError("Majburiy maydonlar to'ldirilmagan: operatsiya turi, hisob, kategoriya va summa");
    }

    const amount = parseAmountInput(body.amount);
    if (Number.isNaN(amount)) {
      throw new LedgerError("Summa noto'g'ri kiritilgan — faqat son bo'lishi kerak (masalan: 1 200 000)");
    }
    if (amount <= 0) throw new LedgerError("Summa 0 dan katta bo'lishi kerak");
    if (amount > MAX_DDS_AMOUNT) {
      throw new LedgerError("Summa juda katta (1 000 000 000 000 so'mdan oshmasligi kerak) — nollar sonini tekshiring");
    }

    if (rawExpenseType && !EXPENSE_TYPES.includes(rawExpenseType)) {
      throw new LedgerError("Xarajat toifasi noto'g'ri (COGS, OPEX yoki INCOME_TRANSFER bo'lishi kerak)");
    }
    // Kirimda xarajat toifasi ma'nosiz — forma standart "COGS" ni yuborib qo'ysa ham INCOME_TRANSFER yoziladi
    const expenseType = type === TransactionType.INCOME ? ExpenseCategoryType.INCOME_TRANSFER : rawExpenseType || undefined;

    if (type === TransactionType.EXPENSE && isTrustIncomeCategory(categoryName)) {
      throw new LedgerError(`"${TRUST_INCOME_CATEGORY}" kategoriyasi faqat KIRIM uchun (Trust bergan pul)`);
    }

    // Token eskirgan bo'lishi mumkin (baza tiklangan / foydalanuvchi o'chirilgan) — aks holda FK xatosi (500) chiqardi
    const author = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, fullName: true } });
    if (!author) {
      return res.status(401).json({ error: 'Sessiya eskirgan — tizimga qaytadan kiring' });
    }

    const sourcePerson =
      (typeof body.sourcePerson === 'string' && body.sourcePerson.trim()) || author.fullName || req.user!.fullName;
    const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;

    const created = await createDds({
      dateTime: resolveDateTime(body.dateTime),
      type,
      account,
      expenseType,
      categoryName,
      sourcePerson,
      amount: Math.round(amount * 100) / 100,
      description,
      createdById: author.id,
      // "Do'kondan tushum" kirimi uchun: qaysi do'konning qarzi kamayadi (ledger tekshiradi)
      storeId: typeof body.storeId === 'string' && body.storeId.trim() ? body.storeId.trim() : null,
    });

    const isTrustPayment = created.source === DdsSource.TRUST_PAYMENT;
    const [balances, trustLedger] = await Promise.all([
      getAccountBalances(),
      isTrustPayment ? getTrustLedger() : Promise.resolve(null),
    ]);

    return res.status(201).json({
      ...serializeTx(created),
      balances,
      // Faqat Trust to'lovida: Trust hisob-kitobining yangi holati { totalDebt, totalPaid, balance }
      trust: trustLedger ? trustLedger.overall : null,
    });
  } catch (error: any) {
    return sendError(res, error, 'Tranzaksiyani saqlashda kutilmagan xatolik yuz berdi');
  }
});

// POST /api/dds/rebuild-balances — hisob qoldiqlarini barcha DDS yozuvlaridan qayta hisoblaydi (ADMIN)
router.post('/rebuild-balances', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const before = await getAccountBalances();
    await rebuildAccountBalances();
    const balances = await getAccountBalances();
    emitRealtime('dds:updated', { rebuilt: true });
    return res.json({ success: true, before, balances });
  } catch (error: any) {
    return sendError(res, error, 'Qoldiqlarni qayta hisoblashda xatolik');
  }
});

/** from (majburiy) / to (ixtiyoriy) — YYYY-MM-DD; bitim sanasi Toshkent kuni bo'yicha olinadi */
function checkExpenseRange(fromRaw: unknown, toRaw: unknown) {
  const ymd = (value: unknown, label: string, required: boolean): string | null => {
    const s = value === undefined || value === null ? '' : String(value).trim();
    if (!s) {
      if (required) throw new LedgerError(`"${label}" sanasi majburiy (YYYY-MM-DD ko'rinishida)`);
      return null;
    }
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
    if (!d || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      throw new LedgerError(`"${label}" sanasi noto'g'ri — YYYY-MM-DD ko'rinishida bo'lishi kerak (masalan 2026-11-10)`);
    }
    return s;
  };
  const from = ymd(fromRaw, 'from', true)!;
  const to = ymd(toRaw, 'to', false);
  if (to && to < from) throw new LedgerError('"to" sanasi "from" sanasidan oldin bo\'lishi mumkin emas');
  return { from, to, range: tashkentDayRange(from, to) };
}

// GET /api/dds/check-expenses/preview?from=YYYY-MM-DD&to=YYYY-MM-DD — DDS'ga hali yozilmagan chek xarajatlari (ADMIN)
router.get('/check-expenses/preview', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, range } = checkExpenseRange((req.query as any).from, (req.query as any).to);
    const pending = await listPendingCheckExpenses(range);
    return res.json({
      from,
      to,
      count: pending.count,
      total: pending.total,
      items: pending.items.map((i) => ({
        dealId: i.dealId,
        dealNumber: i.dealNumber,
        date: i.date,
        dateLabel: formatTashkentDateTime(i.date),
        customerName: i.customerName,
        storeName: i.storeName,
        amount: i.amount,
      })),
      // Qodir aka cheklari xarajatga olinmaydi; total — bitimlardagi "mijozga berilgan summa" yig'indisi
      qodirSkipped: { count: pending.qodirCount, total: pending.qodirTotal },
      zeroSkipped: { count: pending.zeroCount },
    });
  } catch (error: any) {
    return sendError(res, error, "Chek xarajatlari ro'yxatini yuklashda xatolik");
  }
});

// POST /api/dds/check-expenses/apply { from, to?, account? } — chek xarajatlarini DDS'ga ommaviy yozish (ADMIN).
// Har bir yozuv BITIM SANASI bilan yoziladi. Idempotent: yozilgani qayta yozilmaydi.
router.post('/check-expenses/apply', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const { range } = checkExpenseRange(body.from, body.to);

    const rawAccount = body.account === undefined || body.account === null ? '' : String(body.account).trim().toUpperCase();
    if (rawAccount && !ACCOUNTS.includes(rawAccount)) {
      throw new LedgerError("Hisob turi noto'g'ri (CASH, BANK_CARD yoki SETTLEMENT_ACCOUNT bo'lishi kerak)");
    }
    const account = (rawAccount || AccountType.CASH) as AccountType;

    // Token eskirgan bo'lishi mumkin — aks holda har bir yozuv FK xatosi bilan yiqilardi
    const author = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true } });
    if (!author) return res.status(401).json({ error: 'Sessiya eskirgan — tizimga qaytadan kiring' });

    // Ko'rsatilgan ro'yxat bilan hozirgi holat mos kelishi shart — orada yangi bitim tasdiqlangan bo'lsa,
    // foydalanuvchi ko'rmagan summa yozilib ketmasin.
    if (body.expectedCount !== undefined || body.expectedTotal !== undefined) {
      const now = await listPendingCheckExpenses(range);
      const expCount = Number(body.expectedCount);
      const expTotal = Number(body.expectedTotal);
      if (now.count !== expCount || Math.abs(now.total - expTotal) > 0.5) {
        return res.status(409).json({
          error: "Ro'yxat o'zgargan — «Ko'rsatish» tugmasini qayta bosing va yangi ro'yxatni tekshiring",
          count: now.count,
          total: now.total,
        });
      }
    }

    const result = await applyPendingCheckExpenses(range, { account, createdById: author.id });
    const balances = await getAccountBalances();
    return res.json({
      success: result.failed.length === 0,
      created: result.created,
      skipped: result.skipped,
      total: result.total,
      failed: result.failed,
      balances,
    });
  } catch (error: any) {
    return sendError(res, error, "Chek xarajatlarini DDS'ga yozishda xatolik");
  }
});

// DELETE /api/dds/all — barcha tranzaksiyalarni o'chirish (qoldiqlar 0, Trust to'lovlari ham o'chadi)
router.delete('/all', authenticateToken, requireRoles([Role.ADMIN]), requireAdminConfirm, async (req: AuthRequest, res: Response) => {
  try {
    // Trust daftaridagi PAYMENT yozuvlari DDS bilan birga o'chadi (onDelete: Cascade)
    const result = await prisma.ddsTransaction.deleteMany({});
    await rebuildAccountBalances();
    const balances = await getAccountBalances();
    emitRealtime('dds:updated', { cleared: true });
    emitRealtime('trust:updated', {});
    emitRealtime('stores:updated', {});
    return res.json({
      success: true,
      deletedCount: result.count,
      balances,
      message: "Barcha kirim-chiqim operatsiyalari o'chirildi. Balans 0 qilindi.",
    });
  } catch (error: any) {
    return sendError(res, error, 'Tranzaksiyalarni tozalashda xatolik');
  }
});

// DELETE /api/dds/:id — yozuvni o'chiradi, hisob qoldig'i va Trust to'lovi orqaga qaytadi
router.delete('/:id', authenticateToken, requireRoles(DELETE_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const removed = await deleteDds(req.params.id);
    const balances = await getAccountBalances();
    return res.json({
      success: true,
      message: "Tranzaksiya o'chirildi",
      deleted: { id: removed.id, txNumber: removed.txNumber, amount: Number(removed.amount), source: removed.source },
      balances,
    });
  } catch (error: any) {
    return sendError(res, error, "Tranzaksiyani o'chirishda xatolik");
  }
});

export default router;
