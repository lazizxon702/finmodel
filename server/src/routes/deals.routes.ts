import { Router, Response } from 'express';
import { AccountType, ApprovalStatus, DdsSource, DealStatus, PaymentStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { requireAdminConfirm } from '../lib/security';
import { emitRealtime } from '../lib/realtime';
import {
  CalculationService,
  calcOperatorShares,
  reportAgentAmount,
  operatorShareRuleFor,
  formatTashkentDateTime,
  initialApprovalStatus,
  isQodirStore,
  normalizeDealItems,
  tashkentDayRange,
  discountLimitsFor,
  discountViolation,
  type CommissionRuleItem,
} from '../services/calculation.service';
import { ensureOperatorRecord } from '../services/team.service';
import { APPROVED_ONLY, dealScopeWhere, isScopedRole } from '../services/access.service';
import {
  LedgerError,
  approveDeal,
  createCheckExpenseInTx,
  getAccountBalances,
  rejectDeal,
  syncStoreDebtForDeal,
  syncTrustDebtForDeal,
} from '../services/ledger.service';
import {
  applySaleToDeals,
  assertDealNotInSale,
  guardDealNotClaimed,
  loadActiveCommissionRules,
  lockSale,
} from '../services/sale.service';
import { pushDealToGoogleSheets } from '../services/sheetsSync.service';
import { notifyAdmins } from '../services/notification.service';

const router = Router();

type AuthUser = NonNullable<AuthRequest['user']>;

// ════════════════════════════════════════════════════════════════════
//  SOF (bazasiz) YORDAMCHI FUNKSIYALAR — boshqa routelar va testlar shu yerdan import qiladi
// ════════════════════════════════════════════════════════════════════

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOON_MS = 12 * 60 * 60 * 1000;

/** So'rovga tushunarli status bilan javob beriladigan xato */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Asia/Tashkent bo'yicha kun: "YYYY-MM-DD" */
export function tashkentYmd(value: Date | string | number): string {
  return new Date(new Date(value).getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Toshkent vaqti bo'yicha kun boshidan o'tgan millisekundlar */
function tashkentMsOfDay(d: Date): number {
  return (((d.getTime() + TASHKENT_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
}

/**
 * Sana "faqat kun" belgisimi: Toshkent vaqti aniq 12:00:00.000.
 * Klient sanani `YYYY-MM-DDT12:00:00+05:00` ko'rinishida yuboradi — bu haqiqiy vaqt emas, faqat kun.
 */
export function isNoonMarker(value: Date | string): boolean {
  const d = new Date(value);
  return !isNaN(d.getTime()) && tashkentMsOfDay(d) === NOON_MS;
}

/** Berilgan kun (YYYY-MM-DD, Toshkent) + boshqa sananing Toshkent soat:daqiqa:soniyasi */
export function combineTashkentDayAndTime(ymd: string, timeSource: Date): Date {
  const dayStart = new Date(`${ymd}T00:00:00.000+05:00`);
  return new Date(dayStart.getTime() + tashkentMsOfDay(timeSource));
}

type ParsedDateInput =
  | { kind: 'none' }
  | { kind: 'day'; ymd: string; legacyMarker: boolean }
  | { kind: 'exact'; date: Date };

/** Klientdan kelgan sanani tahlil qiladi: bo'sh / faqat kun / aniq vaqt */
export function parseDealDateInput(raw: unknown): ParsedDateInput {
  if (raw === undefined || raw === null || raw === '') return { kind: 'none' };
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    if (isNaN(new Date(`${s}T00:00:00.000+05:00`).getTime())) throw new HttpError(400, "Sana noto'g'ri formatda");
    return { kind: 'day', ymd: s, legacyMarker: false };
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new HttpError(400, "Sana noto'g'ri formatda");
  if (isNoonMarker(d)) return { kind: 'day', ymd: tashkentYmd(d), legacyMarker: true };
  return { kind: 'exact', date: d };
}

/**
 * Yangi bitim sanasi: klient faqat kunni yuboradi, shuning uchun
 * berilgan kun + HOZIRGI Toshkent soat:daqiqasi saqlanadi (vaqt yo'qolmasin).
 */
export function resolveDealDateForCreate(raw: unknown, now: Date = new Date()): Date {
  const p = parseDealDateInput(raw);
  if (p.kind === 'none') return now;
  if (p.kind === 'exact') return p.date;
  return combineTashkentDayAndTime(p.ymd, now);
}

/**
 * Tahrirlashda sana: kun o'zgarmagan bo'lsa saqlangan sana-vaqt o'zgarmaydi;
 * kun o'zgargan bo'lsa — yangi kun + bitimning avvalgi soat:daqiqasi.
 * Eski klient formani UTC kuni bilan to'ldiradi, shuning uchun 12:00 belgili sanada UTC kuni ham "o'zgarmagan" hisoblanadi.
 */
export function resolveDealDateForUpdate(raw: unknown, existing: Date): Date {
  const p = parseDealDateInput(raw);
  if (p.kind === 'none') return existing;
  if (p.kind === 'exact') return p.date;
  if (p.ymd === tashkentYmd(existing)) return existing;
  if (p.legacyMarker && p.ymd === existing.toISOString().slice(0, 10)) return existing;
  return combineTashkentDayAndTime(p.ymd, existing);
}

/**
 * Bitimning ko'rsatiladigan sana-vaqti. Eski yozuvlarda vaqt aniq 12:00:00 (faqat kun saqlangan):
 * agar createdAt o'sha Toshkent kunida bo'lsa — haqiqiy vaqt createdAt dan olinadi, aks holda date dan.
 */
export function dealDisplayDate(deal: { date: Date | string; createdAt?: Date | string | null }): Date {
  const date = new Date(deal.date);
  if (deal.createdAt && isNoonMarker(date)) {
    const created = new Date(deal.createdAt);
    if (!isNaN(created.getTime()) && tashkentYmd(created) === tashkentYmd(date)) return created;
  }
  return date;
}

/** "DD.MM.YYYY HH:mm" (Asia/Tashkent) */
export function dealDateTimeLabel(deal: { date: Date | string; createdAt?: Date | string | null }): string {
  return formatTashkentDateTime(dealDisplayDate(deal));
}

/** Sana oralig'i filtri: "YYYY-MM-DD" — Toshkent kuni chegaralari bilan; to'liq ISO — o'zicha */
/**
 * OPERATOR uchun ulush (faqat qoida bor jamoa — Jahongir): bitim id -> so'm. Oylik chegara to'g'ri sanalishi uchun
 * operatorning BARCHA tasdiqlangan bitimlari olinadi. Boshqa rol yoki qoidasiz jamoa — rule: null.
 */
async function operatorSharesForUser(user: NonNullable<AuthRequest['user']>) {
  const none = { rule: null as ReturnType<typeof operatorShareRuleFor>, shares: new Map<string, number>() };
  if (user.role !== Role.OPERATOR) return none;
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { parentAgent: { select: { agency: { select: { name: true } } } } },
  });
  const rule = operatorShareRuleFor(me?.parentAgent?.agency?.name);
  if (!rule) return none;
  const own = await prisma.deal.findMany({
    where: await scopedDealWhere(user, APPROVED_ONLY),
    select: { id: true, date: true, withdrawnLimit: true },
  });
  const shares = calcOperatorShares(
    own.map((d) => ({ id: d.id, date: d.date, withdrawnLimit: Number(d.withdrawnLimit), agentAmount: 0 })),
    rule
  );
  return { rule, shares };
}

export function dateRangeWhere(startDate?: unknown, endDate?: unknown): Prisma.DateTimeFilter | undefined {
  const bound = (v: unknown, isEnd: boolean): Date | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const r = tashkentDayRange(isEnd ? null : s, isEnd ? s : null);
      return isEnd ? r.end : r.start;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d;
  };
  const gte = bound(startDate, false);
  const lte = bound(endDate, true);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/** Ism/telefon o'rniga yozilgan to'ldirgichlar ("Mijoz", "-") — bular ma'lumot emas */
const CUSTOMER_PLACEHOLDERS = new Set(['mijoz', 'клиент', '-', '—', '–', '.']);

/** Mijoz ismi/telefonini tozalaydi: bo'sh yoki to'ldirgich bo'lsa null */
export function cleanCustomerText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  if (!s || CUSTOMER_PLACEHOLDERS.has(s.toLowerCase())) return null;
  return s;
}

/**
 * Doiradagi bitimni o'zgartirish/o'chirish mumkinmi. Mumkin bo'lsa null, aks holda xato matni (403).
 *   tahrirlash: OPERATOR/AGENT — faqat hali tasdiqlanmagan (APPROVED bo'lmagan) bitim;
 *   o'chirish:  ADMIN/MANAGER — istalgan; OPERATOR/AGENT — faqat PENDING_APPROVAL; qolganlar — yo'q.
 */
export function dealWriteDenial(
  action: 'edit' | 'delete',
  role: Role | string,
  approvalStatus: ApprovalStatus | string
): string | null {
  // Registratura: o'zgartirish va o'chirish umuman yo'q (egasi, 16.11.2026) — faqat kiritadi, admin tasdiqlaydi
  if (role === Role.REGISTRATURA) {
    return action === 'edit'
      ? "Registratura bitimni tahrirlay olmaydi — administratorga murojaat qiling"
      : "Registratura bitimni o'chira olmaydi — administratorga murojaat qiling";
  }
  const scoped = isScopedRole(role);
  // Tasdiqlangan chekni FAQAT admin o'zgartiradi yoki o'chiradi (egasi, 23.11.2026); admin — sabab bilan (PUT da tekshiriladi)
  if (approvalStatus === 'APPROVED' && role !== Role.ADMIN) {
    return action === 'edit'
      ? "Tasdiqlangan chekni faqat administrator o'zgartira oladi — administratorga murojaat qiling"
      : "Tasdiqlangan chekni faqat administrator o'chira oladi";
  }
  if (action === 'edit') return null;
  if (role === Role.ADMIN || role === Role.MANAGER) return null;
  if (scoped) {
    return approvalStatus === 'PENDING_APPROVAL'
      ? null
      : "Faqat hali tasdiqlanmagan (kutilayotgan) bitimni o'chira olasiz";
  }
  return "Bitimni o'chirish uchun huquqingiz yetarli emas";
}

/** Tahrirdan keyingi tasdiqlash holati: OPERATOR/AGENT rad etilgan bitimni tuzatsa — yana tasdiqqa qaytadi */
export function approvalAfterEdit(role: Role | string, current: ApprovalStatus | string): ApprovalStatus {
  if (isScopedRole(role) && current === 'REJECTED') return 'PENDING_APPROVAL';
  return current as ApprovalStatus;
}

/** Chek xarajatini (DDS chiqimi) yozishga ruxsati bor rollar */
export const EXPENSE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.CFO];

const ACCOUNT_VALUES = Object.values(AccountType) as string[];
const ACCOUNT_ERROR =
  "Hisob turi noto'g'ri: CASH (naqd kassa), BANK_CARD (bank kartasi) yoki SETTLEMENT_ACCOUNT (hisob raqam) bo'lishi kerak";

/** Hisob turini tekshiradi ("cash" → "CASH"); noto'g'ri bo'lsa 400 */
export function parseAccount(value: unknown, fallback: AccountType = AccountType.CASH): AccountType {
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value).trim().toUpperCase();
  if (!ACCOUNT_VALUES.includes(s)) throw new HttpError(400, ACCOUNT_ERROR);
  return s as AccountType;
}

const APPROVAL_VALUES = Object.values(ApprovalStatus) as string[];

/**
 * `approvalStatus` query filtri: "APPROVED", "PENDING_APPROVAL,REJECTED", "all".
 * Berilmasa `fallback` qaytadi (undefined — filtrsiz).
 */
export function parseApprovalFilter(
  raw: unknown,
  fallback?: Prisma.DealWhereInput
): Prisma.DealWhereInput | undefined {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const s = String(raw).trim();
  if (s.toLowerCase() === 'all') return undefined;
  const parts = s
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  if (!parts.length) return fallback;
  for (const p of parts) {
    if (!APPROVAL_VALUES.includes(p)) {
      throw new HttpError(400, "approvalStatus noto'g'ri: PENDING_APPROVAL, APPROVED, REJECTED yoki all bo'lishi kerak");
    }
  }
  return { approvalStatus: { in: parts as ApprovalStatus[] } };
}

// ── Dashboard KPI ───────────────────────────────────────────────────

export const KPI_METRICS = [
  'totalDeals',
  'totalLimitVolume',
  'totalAgentCommission',
  'totalBuyoutExpense',
  'totalPayout',
  'grossMargin',
  'totalQodirChekExpense',
] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

export interface KpiDealLike {
  withdrawnLimit: unknown;
  agentAmount: unknown;
  totalPurchaseCost: unknown;
  calculatedAmount: unknown;
  store?: { name?: string | null } | null;
}

const n = (v: unknown): number => Number(v) || 0;

/** Bitta bitimning shu ko'rsatkichdagi ulushi */
export function kpiDealValue(metric: KpiMetric, d: KpiDealLike): number {
  switch (metric) {
    case 'totalDeals':
      return 1;
    case 'totalLimitVolume':
      return n(d.withdrawnLimit);
    case 'totalAgentCommission':
      return n(d.agentAmount);
    case 'totalBuyoutExpense':
      return n(d.totalPurchaseCost);
    case 'totalPayout':
      return n(d.calculatedAmount);
    case 'grossMargin':
      return n(d.withdrawnLimit) - n(d.calculatedAmount);
    case 'totalQodirChekExpense':
      return isQodirStore(d.store?.name) ? n(d.calculatedAmount) + n(d.agentAmount) : 0;
  }
}

/**
 * Dashboard KPI — swot-daily va kpi-details ikkalasi ham SHU funksiyadan foydalanadi,
 * shuning uchun kartadagi son va tarkib ro'yxatining jami doim bir xil chiqadi.
 */
export function computeKpi(deals: KpiDealLike[]): Record<KpiMetric, number> {
  let totalLimitVolume = 0;
  let totalAgentCommission = 0;
  let totalBuyoutExpense = 0;
  let totalPayout = 0;
  let totalQodirChekExpense = 0;
  for (const d of deals) {
    totalLimitVolume += kpiDealValue('totalLimitVolume', d);
    totalAgentCommission += kpiDealValue('totalAgentCommission', d);
    totalBuyoutExpense += kpiDealValue('totalBuyoutExpense', d);
    totalPayout += kpiDealValue('totalPayout', d);
    totalQodirChekExpense += kpiDealValue('totalQodirChekExpense', d);
  }
  return {
    totalDeals: deals.length,
    totalLimitVolume,
    totalAgentCommission,
    totalBuyoutExpense,
    totalPayout,
    grossMargin: totalLimitVolume - totalPayout,
    totalQodirChekExpense,
  };
}

// ── Ko'p mahsulotli bitim ───────────────────────────────────────────

type NormalizedItems = ReturnType<typeof normalizeDealItems>;

/** So'rovdagi mahsulotlar ro'yxati: yangi `items` yoki eski `deviceItems`. Massiv bo'lmasa undefined. */
export function pickItemsInput(body: any): any[] | undefined {
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.deviceItems)) return body.deviceItems;
  return undefined;
}

/** Deal.deviceItems (Json) — eski klient o'qiydigan ko'rinish (imeiBarcode kaliti bilan) */
export function toDeviceItemsJson(items: NormalizedItems['items']) {
  return items.map((it) => ({
    id: String(it.position + 1),
    productName: it.productName,
    color: it.color || '',
    storageGb: it.storageGb || '',
    quantity: it.quantity,
    imeiBarcode: it.imei1 || '',
    imei1: it.imei1 || '',
    imei2: it.imei2 || '',
    price: it.price,
  }));
}

interface LegacyProductFields {
  productName?: unknown;
  quantity?: unknown;
  imeiBarcode?: unknown;
  imei2?: unknown;
  color?: unknown;
  storageGb?: unknown;
}

const strOrNull = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

/**
 * Mahsulotlar ro'yxatini va Deal'ning eski yagona maydonlarini (productName, quantity, imeiBarcode ...)
 * bir-biriga mos holda tayyorlaydi. Ro'yxat berilmasa — eski yagona maydonlardan bitta mahsulot yasaladi.
 */
export function buildDealProducts(itemsInput: any[] | undefined, legacy: LegacyProductFields) {
  let norm = normalizeDealItems(itemsInput || []);
  if (!norm.items.length) {
    norm = normalizeDealItems([
      {
        productName: strOrNull(legacy.productName),
        color: strOrNull(legacy.color),
        storageGb: strOrNull(legacy.storageGb),
        imei1: strOrNull(legacy.imeiBarcode),
        imei2: strOrNull(legacy.imei2),
        quantity: legacy.quantity as any,
      },
    ]);
  }
  const has = norm.items.length > 0;
  return {
    items: norm.items,
    productName: has ? norm.productName : strOrNull(legacy.productName),
    quantity: has ? norm.quantity : Math.max(1, Math.floor(Number(legacy.quantity) || 1)),
    imeiBarcode: has ? norm.imeiBarcode : strOrNull(legacy.imeiBarcode),
    imei2: has ? norm.imei2 : strOrNull(legacy.imei2),
    color: has ? norm.color : strOrNull(legacy.color),
    storageGb: has ? norm.storageGb : strOrNull(legacy.storageGb),
  };
}

/** Javobdagi `items`: DealItem qatorlari (position bo'yicha); yo'q bo'lsa eski maydonlardan yig'iladi */
export function dealItemsView(deal: any) {
  const rows: any[] = Array.isArray(deal?.items) ? [...deal.items] : [];
  if (rows.length) {
    return rows
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((it) => ({
        id: it.id || null,
        position: it.position || 0,
        productName: it.productName,
        color: it.color || null,
        storageGb: it.storageGb || null,
        imei1: it.imei1 || null,
        imeiBarcode: it.imei1 || null,
        imei2: it.imei2 || null,
        quantity: Number(it.quantity) || 1,
        price: Number(it.price) || 0,
      }));
  }
  const raw = Array.isArray(deal?.deviceItems) && deal.deviceItems.length ? deal.deviceItems : undefined;
  const built = buildDealProducts(raw, {
    productName: deal?.productName,
    quantity: deal?.quantity,
    imeiBarcode: deal?.imeiBarcode,
    imei2: deal?.imei2,
    color: deal?.color,
    storageGb: deal?.storageGb,
  });
  return built.items.map((it) => ({
    id: null,
    position: it.position,
    productName: it.productName,
    color: it.color,
    storageGb: it.storageGb,
    imei1: it.imei1,
    imeiBarcode: it.imei1,
    imei2: it.imei2,
    quantity: it.quantity,
    price: it.price,
  }));
}

/**
 * Registratura xodimi pul ustunlaridan FAQAT yechilgan limit va MIJOZGA TO'LOVNI (limit − diskont %) ko'radi.
 * Egasi (20.11.2026): "28% dan urilgan chek 28% da hisoblanishi kerak" — ilgari "xarid xarajati" ko'rsatilardi, u esa
 * mijozga to'lov + agent ulushi (Imanumda limit − 25%) bo'lgani uchun noto'g'ri foiz bo'lib ko'rinardi va agent ulushini oshkor qilardi.
 * Foyda, agent ulushi, xarid xarajati va boshqalar yuborilmaydi (0).
 */
const HIDDEN_FINANCE_FIELDS = [
  'profit', 'marginPct', 'agentAmount', 'agentPct', 'totalPurchaseCost', 'trustDebtAmount',
  'qodirDebt', 'qodirBalance', 'greenBazarBalance', 'trustBalance', 'totalExtraBalance', 'extraDaftar', 'devicePurchaseAmount',
] as const;
const HIDDEN_TOTALS_FIELDS = [
  'totalAgentAmount', 'totalPurchaseCost', 'totalProfit', 'totalDaftar', 'totalQodirDebt', 'totalQodirBalance',
  'totalGreenBazarBalance', 'totalTrustBalance', 'totalExtraBalance', 'warehouseCostSum', 'cogsSum', 'totalQodirChekExpense',
] as const;
export function hidesDealFinance(role?: Role | string | null): boolean {
  return role === Role.REGISTRATURA;
}
/** Rolga qarab bitim ko'rinishidan moliyaviy maydonlarni olib tashlaydi (0 qilib yuboradi) */
export function maskDealForRole<T extends Record<string, any>>(dto: T, role?: Role | string | null): T {
  if (!hidesDealFinance(role)) return dto;
  const out: Record<string, any> = { ...dto, financeHidden: true };
  for (const f of HIDDEN_FINANCE_FIELDS) if (f in out) out[f] = 0;
  return out as T;
}
export function maskTotalsForRole<T extends Record<string, any>>(totals: T, role?: Role | string | null): T {
  if (!hidesDealFinance(role)) return totals;
  const out: Record<string, any> = { ...totals, financeHidden: true };
  for (const f of HIDDEN_TOTALS_FIELDS) if (f in out) out[f] = 0;
  return out as T;
}

/** Bitimni klientga yuboriladigan ko'rinishga keltiradi (items, dateTimeLabel, tozalangan ism/telefon) */
export function serializeDeal(deal: any) {
  const { ddsTransactions, ...rest } = deal;
  const check = Array.isArray(ddsTransactions) ? ddsTransactions[0] : undefined;
  return {
    ...rest,
    customerName: cleanCustomerText(deal.customerName),
    customerPhone1: cleanCustomerText(deal.customerPhone1),
    customerPhone2: cleanCustomerText(deal.customerPhone2),
    items: dealItemsView(deal),
    dateYmd: tashkentYmd(deal.date),
    dateTimeLabel: dealDateTimeLabel(deal),
    ...(ddsTransactions !== undefined
      ? {
          checkExpense: check
            ? {
                id: check.id,
                txNumber: check.txNumber,
                amount: Number(check.amount),
                account: check.account,
                dateTime: check.dateTime,
              }
            : null,
        }
      : {}),
  };
}

// ════════════════════════════════════════════════════════════════════
//  BAZA BILAN ISHLAYDIGAN YORDAMCHILAR
// ════════════════════════════════════════════════════════════════════

/** ?mine=1 — "O'zimning cheklarim": foydalanuvchi registrator bo'lgan yoki o'zi kiritgan cheklar (egasi, 20.11.2026) */
export function mineWhere(user: { id: string }, mine: unknown): Prisma.DealWhereInput | undefined {
  if (mine !== '1' && mine !== 'true' && mine !== true) return undefined;
  return { OR: [{ registratorId: user.id }, { createdById: user.id }] };
}

/** Ruxsat doirasi + qo'shimcha shartlar (doira har doim AND bilan qo'shiladi — OR bilan aralashib ketmaydi) */
export async function scopedDealWhere(
  user: AuthUser,
  ...extra: (Prisma.DealWhereInput | undefined)[]
): Promise<Prisma.DealWhereInput> {
  // Registratura (egasi, 16.11.2026): Bitimlar sahifasida HAMMA cheklarni ko'radi (boshqa bo'limlarda doirasi o'z jamoasi bo'lib qoladi)
  const scope = user.role === Role.REGISTRATURA ? {} : await dealScopeWhere(user);
  return { AND: [scope, ...(extra.filter(Boolean) as Prisma.DealWhereInput[])] };
}

const DEAL_INCLUDE = {
  store: true,
  provider: true,
  agency: true,
  agent: true,
  buyer: true,
  items: { orderBy: { position: 'asc' as const } },
  createdBy: { select: { id: true, fullName: true, username: true, role: true } },
  registrator: { select: { id: true, fullName: true, username: true } },
  approvedBy: { select: { id: true, fullName: true, role: true } },
  ddsTransactions: {
    where: { source: DdsSource.DEAL_CHECK },
    select: { id: true, txNumber: true, amount: true, account: true, dateTime: true },
  },
} satisfies Prisma.DealInclude;

/** Doiradagi bitim; doiradan tashqarida yoki yo'q bo'lsa null (→ 404) */
async function findScopedDeal(user: AuthUser, id: string) {
  return prisma.deal.findFirst({ where: await scopedDealWhere(user, { id }), include: DEAL_INCLUDE });
}

/** Faol komissiya qoidalari — sotuvni omborga qaytarish ham aynan shu yuklagichni ishlatadi (sale.service) */
const getActiveRules = () => loadActiveCommissionRules();

/** Admin qoidani chetlab o'tganda yoziladigan sabab — kamida 5 belgi */
export function overrideReasonOf(role: Role | string, body: any): string | null {
  if (role !== Role.ADMIN) return null;
  const r = String(body?.overrideReason ?? body?.editReason ?? '').replace(/\s+/g, ' ').trim();
  return r.length >= 5 ? r : null;
}

/** Tarixda ko'rsatiladigan maydonlar (Batafsil → O'zgarishlar tarixi). money — Telegram ogohlantirishi uchun */
export const HISTORY_FIELDS: { key: string; label: string; money?: boolean; pick?: (v: any) => unknown }[] = [
  { key: 'date', label: 'Sana', pick: (v) => v?.dateYmd ?? null },
  { key: 'store', label: "Do'kon", money: true, pick: (v) => v?.store?.name ?? null },
  { key: 'provider', label: 'Provayder', money: true, pick: (v) => v?.provider?.name ?? null },
  { key: 'customerLimit', label: 'Mijoz limiti' },
  { key: 'withdrawnLimit', label: 'Yechilgan limit', money: true },
  { key: 'purchaseDiscountPct', label: 'Diskont', money: true },
  { key: 'calculatedAmount', label: 'Mijozga', money: true },
  { key: 'agentAmount', label: 'Agentga', money: true },
  { key: 'profit', label: 'Foyda' },
  { key: 'agency', label: 'Agent', pick: (v) => v?.agency?.name ?? null },
  { key: 'agent', label: 'Operator', pick: (v) => v?.agent?.name ?? null },
  { key: 'customerName', label: 'Mijoz' },
  { key: 'customerPhone1', label: 'Telefon' },
  { key: 'productName', label: 'Tovar' },
  { key: 'imeiBarcode', label: 'IMEI' },
  { key: 'status', label: 'Tovar holati' },
  { key: 'approvalStatus', label: 'Tasdiq' },
  { key: 'note', label: 'Izoh' },
];

function historyValue(f: (typeof HISTORY_FIELDS)[number], v: any): string | number | null {
  const raw = f.pick ? f.pick(v) : v?.[f.key];
  if (raw === undefined || raw === null || raw === '') return null;
  return typeof raw === 'number' ? raw : String(raw);
}
function sameValue(a: string | number | null, b: string | number | null): boolean {
  if (a === null || b === null) return a === b;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '') return Math.abs(na - nb) < 1e-6;
  return String(a) === String(b);
}

/** Ikki bitim ko'rinishi orasidagi o'zgargan maydonlar */
export function diffDealViews(oldV: any, newV: any) {
  const out: { field: string; label: string; from: string | number | null; to: string | number | null; money: boolean }[] = [];
  for (const f of HISTORY_FIELDS) {
    const a = historyValue(f, oldV);
    const b = historyValue(f, newV);
    if (!sameValue(a, b)) out.push({ field: f.key, label: f.label, from: a, to: b, money: !!f.money });
  }
  return out;
}

/** Tarix qiymatini matnga: diskont — foiz, summalar — bo'shliq bilan */
export function fmtHistory(field: string, v: string | number | null): string {
  if (v === null || v === undefined) return '—';
  if (field === 'purchaseDiscountPct') return `${Math.round(Number(v) * 1000) / 10}%`;
  if (['customerLimit', 'withdrawnLimit', 'calculatedAmount', 'agentAmount', 'profit'].includes(field)) {
    return Math.round(Number(v)).toLocaleString('ru-RU').replace(/ /g, ' ');
  }
  return String(v);
}

/**
 * Diskont chegarasi (egasi, 23.11.2026): minimal — provayder/do'kon ulushi (spravochnik), maksimal 45%, Green Bazar — aniq ulush + 5%.
 * Buzilsa: admin sabab bilan o'tkazishi mumkin (sabab bitim tarixiga yoziladi), qolganlarga 400.
 */
export function checkDiscount(
  role: Role | string,
  body: any,
  input: { storeName: string; providerName: string; withdrawn: number; calculated: number; date: Date | string },
  rules: CommissionRuleItem[]
): { ok: true; override: { rule: string; reason: string } | null } | { ok: false; error: string; overridable: boolean } {
  const w = Number(input.withdrawn) || 0;
  if (w <= 0) return { ok: true, override: null };
  const disc = (w - (Number(input.calculated) || 0)) / w;
  const violation = discountViolation(disc, discountLimitsFor(input.storeName, input.providerName, rules, input.date));
  if (!violation) return { ok: true, override: null };
  const reason = overrideReasonOf(role, body);
  if (reason) return { ok: true, override: { rule: violation, reason } };
  return { ok: false, error: violation, overridable: role === Role.ADMIN };
}

/** Summani o'qiydi: bo'sh → 0; son bo'lmasa yoki manfiy bo'lsa 400 */
function toAmount(value: unknown, label: string): number {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) throw new HttpError(400, `${label} noto'g'ri: manfiy bo'lmagan son kiriting`);
  return num;
}

function parseDealStatus(value: unknown): DealStatus | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const s = String(value);
  if (!(Object.values(DealStatus) as string[]).includes(s)) throw new HttpError(400, "Bitim holati noto'g'ri");
  return s as DealStatus;
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** Xatoni tushunarli javobga aylantiradi (Prisma ichki matni va fayl yo'llari klientga chiqmaydi) */
function sendError(res: Response, error: any, fallback: string) {
  if (error instanceof HttpError || error instanceof LedgerError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (isPrismaCode(error, 'P2003')) {
    return res.status(400).json({ error: "Bog'liq yozuv topilmadi (foydalanuvchi, agentlik, agent yoki xaridor noto'g'ri)" });
  }
  if (isPrismaCode(error, 'P2025')) {
    return res.status(404).json({ error: 'Bitim topilmadi' });
  }
  console.error(fallback + ':', error);
  return res.status(500).json({ error: fallback });
}

function safeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

async function writeAudit(userId: string, entityId: string, action: string, oldValues?: unknown, newValues?: unknown) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        entity: 'Deal',
        entityId,
        action,
        ...(oldValues !== undefined ? { oldValues: safeJson(oldValues) } : {}),
        ...(newValues !== undefined ? { newValues: safeJson(newValues) } : {}),
      },
    });
  } catch (e: any) {
    console.error('Audit log yozishda xatolik:', e.message);
  }
}

/** Google Sheets'ga faqat tasdiqlangan bitim yuboriladi (tasdiqlanmagani jadval hisobiga kirmasin) */
function pushToSheetsIfApproved(deal: any) {
  if (deal?.approvalStatus !== 'APPROVED') return;
  pushDealToGoogleSheets(deal).catch((err) =>
    console.error('[GoogleSheets Push] Bitimni sheetsga yuborishda xatolik:', err.message)
  );
}

const TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 };

/** Bitim raqamini navbat bilan berish uchun advisory lock kaliti (DDS TX raqami 778899 dan farqli) */
const DEAL_NUMBER_LOCK = 778811;

class DealNumberConflict extends Error {}

/**
 * Bitimni noyob raqam bilan yaratadi. Poyga holati: tranzaksiya ichida advisory lock olinadi,
 * shuning uchun parallel so'rovlar bir xil raqam olmaydi; qulfsiz yozuvchi (bot, import) bilan
 * to'qnashsa — P2002 da qayta uriniladi.
 */
async function createWithDealNumber<T>(
  requestedNumber: number | null,
  build: (tx: Prisma.TransactionClient, dealNumber: number) => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${DEAL_NUMBER_LOCK})`);
        let dealNumber = requestedNumber;
        if (!dealNumber) {
          const last = await tx.deal.aggregate({ _max: { dealNumber: true } });
          dealNumber = (last._max.dealNumber || 3500) + 1;
        }
        return build(tx, dealNumber);
      }, TX_OPTIONS);
    } catch (e) {
      if (e instanceof DealNumberConflict) {
        if (requestedNumber) throw new HttpError(409, `№${requestedNumber} raqamli bitim allaqachon mavjud`);
        if (attempt < 4) continue;
        throw new HttpError(409, "Bitim raqamini band qilib bo'lmadi — qayta urinib ko'ring");
      }
      throw e;
    }
  }
}

function listSearchWhere(search: unknown): Prisma.DealWhereInput | undefined {
  const s = String(search || '').trim();
  if (!s) return undefined;
  const or: Prisma.DealWhereInput[] = [
    { customerName: { contains: s, mode: 'insensitive' } },
    { customerPhone1: { contains: s, mode: 'insensitive' } },
    { customerPhone2: { contains: s, mode: 'insensitive' } },
    { productName: { contains: s, mode: 'insensitive' } },
    { imeiBarcode: { contains: s, mode: 'insensitive' } },
    { imei2: { contains: s, mode: 'insensitive' } },
    { sellerName: { contains: s, mode: 'insensitive' } },
    { note: { contains: s, mode: 'insensitive' } },
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
  return { OR: or };
}

const SORTABLE = new Set([
  'dealNumber',
  'date',
  'createdAt',
  'updatedAt',
  'customerName',
  'customerLimit',
  'withdrawnLimit',
  'calculatedAmount',
  'agentAmount',
  'totalPurchaseCost',
  'salePrice',
  'profit',
  'status',
  'approvalStatus',
]);

/** KPI so'rovlari uchun yagona tartib — swot-daily va kpi-details bir xil ketma-ketlikda jamlaydi */
const KPI_ORDER: Prisma.DealOrderByWithRelationInput[] = [{ date: 'asc' }, { dealNumber: 'asc' }];

/** KPI davri filtri: doira + faqat tasdiqlangan + sana (Toshkent) + do'kon/provayder */
function kpiPeriodWhere(scope: Prisma.DealWhereInput, q: any): Prisma.DealWhereInput {
  const and: Prisma.DealWhereInput[] = [scope, APPROVED_ONLY];
  if (q.period === 'today') {
    const today = tashkentYmd(new Date());
    and.push({ date: dateRangeWhere(today, today) });
  } else {
    const range = dateRangeWhere(q.startDate, q.endDate);
    if (range) and.push({ date: range });
  }
  if (q.storeId) and.push({ storeId: String(q.storeId) });
  if (q.providerId) and.push({ providerId: String(q.providerId) });
  return { AND: and };
}

// ════════════════════════════════════════════════════════════════════
//  ROUTELAR
// ════════════════════════════════════════════════════════════════════

// GET /api/deals — doiradagi BARCHA bitimlar (tasdiqlanmaganlari ham), approvalStatus bilan
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as any;
    const pageNum = Math.max(1, parseInt(q.page, 10) || 1);
    const limitNum = Math.min(5000, Math.max(1, parseInt(q.limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const filters: Prisma.DealWhereInput = {};
    const range = dateRangeWhere(q.startDate, q.endDate);
    if (range) filters.date = range;
    const status = parseDealStatus(q.status);
    if (status) filters.status = status;
    if (q.paymentStatus) {
      if (!(Object.values(PaymentStatus) as string[]).includes(String(q.paymentStatus))) {
        throw new HttpError(400, "To'lov holati noto'g'ri");
      }
      filters.paymentStatus = q.paymentStatus as PaymentStatus;
    }
    if (q.storeId) filters.storeId = String(q.storeId);
    if (q.providerId) filters.providerId = String(q.providerId);
    if (q.agencyId) filters.agencyId = String(q.agencyId);
    if (q.agentId) filters.agentId = String(q.agentId);
    if (q.daftar === 'true') filters.isDaftar = true;
    if (q.daftar === 'false') filters.isDaftar = false;

    const where = await scopedDealWhere(
      req.user!,
      filters,
      listSearchWhere(q.search),
      parseApprovalFilter(q.approvalStatus),
      mineWhere(req.user!, q.mine)
    );

    const sortBy = SORTABLE.has(String(q.sortBy)) ? String(q.sortBy) : 'dealNumber';
    const sortOrder = String(q.sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';

    const [totalCount, deals] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
        include: DEAL_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limitNum,
      }),
    ]);

    // Ulush qoidasi bor jamoa operatori: har bir chekda agent summasi o'rniga o'z ulushi (tasdiqlanmagan chek — 0)
    const { rule: operatorShareRule, shares } = await operatorSharesForUser(req.user!);

    return res.json({
      deals: deals.map((d) => {
        const dto = maskDealForRole(serializeDeal(d), req.user!.role);
        return operatorShareRule ? { ...dto, operatorShare: Math.round(shares.get(d.id) || 0) } : dto;
      }),
      operatorShareRule,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error: any) {
    return sendError(res, error, 'Bitimlarni yuklashda xatolik');
  }
});

// GET /api/deals/pending-count — tasdiq kutayotgan bitimlar soni (doira bo'yicha)
router.get('/pending-count', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const scope = await dealScopeWhere(req.user!);
    const [count, rejectedCount] = await Promise.all([
      prisma.deal.count({ where: { AND: [scope, { approvalStatus: 'PENDING_APPROVAL' }] } }),
      prisma.deal.count({ where: { AND: [scope, { approvalStatus: 'REJECTED' }] } }),
    ]);
    return res.json({ count, rejectedCount });
  } catch (error: any) {
    return sendError(res, error, 'Kutilayotgan bitimlar sonini olishda xatolik');
  }
});

// GET /api/deals/totals — yig'ma summalar (doira + faqat tasdiqlangan bitimlar)
router.get('/totals', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as any;
    const filters: Prisma.DealWhereInput = {};
    const range = dateRangeWhere(q.startDate, q.endDate);
    if (range) filters.date = range;
    if (q.storeId) filters.storeId = String(q.storeId);
    if (q.providerId) filters.providerId = String(q.providerId);
    if (q.agencyId) filters.agencyId = String(q.agencyId);

    const deals = await prisma.deal.findMany({
      where: await scopedDealWhere(req.user!, APPROVED_ONLY, filters, mineWhere(req.user!, (req.query as any).mine)),
      select: {
        id: true,
        customerLimit: true,
        withdrawnLimit: true,
        agentAmount: true,
        totalPurchaseCost: true,
        calculatedAmount: true,
        remainingLimit: true,
        differenceAmount: true,
        extraDaftar: true,
        qodirDebt: true,
        qodirBalance: true,
        greenBazarBalance: true,
        trustBalance: true,
        totalExtraBalance: true,
        salePrice: true,
        profit: true,
        receivedFromBuyer: true,
        debtRemainder: true,
        status: true,
        store: { select: { name: true } },
        agency: { select: { name: true } },
      },
    });

    const totals = deals.reduce(
      (acc, d) => {
        acc.dealCount += 1;
        acc.totalLimit += n(d.customerLimit);
        acc.totalWithdrawn += n(d.withdrawnLimit);
        // Anvar cheklaridan agent foydasi hech kimga hisoblanmaydi (egasi qarori, 14.11.2026)
        acc.totalAgentAmount += reportAgentAmount(d.agentAmount, d.agency?.name);
        acc.totalPurchaseCost += n(d.totalPurchaseCost);
        acc.totalCalculatedAmount += n(d.calculatedAmount);
        acc.totalRemainingLimit += n(d.remainingLimit);
        acc.totalDifference += n(d.differenceAmount);
        acc.totalDaftar += n(d.extraDaftar);
        acc.totalQodirDebt += n(d.qodirDebt);
        acc.totalQodirBalance += n(d.qodirBalance);
        acc.totalGreenBazarBalance += n(d.greenBazarBalance);
        acc.totalTrustBalance += n(d.trustBalance);
        acc.totalExtraBalance += n(d.totalExtraBalance);
        acc.totalSalePrice += n(d.salePrice);
        acc.totalProfit += n(d.profit);
        acc.totalReceived += n(d.receivedFromBuyer);
        acc.totalDebtRemainder += n(d.debtRemainder);

        const qodirExpense = kpiDealValue('totalQodirChekExpense', d);
        if (isQodirStore(d.store?.name)) {
          acc.totalQodirChekExpense += qodirExpense;
          acc.qodirChekDealCount += 1;
        }

        if (d.status === DealStatus.IN_WAREHOUSE || d.status === DealStatus.IN_TRANSIT) {
          acc.warehouseCostSum += n(d.totalPurchaseCost);
          acc.warehouseCount += 1;
        }
        if (d.status === DealStatus.SOLD) {
          acc.cogsSum += n(d.totalPurchaseCost);
          acc.soldCount += 1;
        }
        return acc;
      },
      {
        dealCount: 0,
        totalLimit: 0,
        totalWithdrawn: 0,
        totalAgentAmount: 0,
        totalPurchaseCost: 0,
        totalCalculatedAmount: 0,
        totalRemainingLimit: 0,
        totalDifference: 0,
        totalDaftar: 0,
        totalQodirDebt: 0,
        totalQodirBalance: 0,
        totalGreenBazarBalance: 0,
        totalTrustBalance: 0,
        totalExtraBalance: 0,
        totalSalePrice: 0,
        totalProfit: 0,
        totalReceived: 0,
        totalDebtRemainder: 0,
        warehouseCostSum: 0,
        warehouseCount: 0,
        cogsSum: 0,
        soldCount: 0,
        totalQodirChekExpense: 0,
        qodirChekDealCount: 0,
      }
    );

    // OPERATOR (faqat ulush qoidasi bor jamoa — Jahongir): agent komissiyasi o'rniga O'Z ulushi ko'rsatiladi
    const { rule: operatorShareRule, shares } = await operatorSharesForUser(req.user!);
    const operatorShare = Math.round(deals.reduce((sum, d) => sum + (shares.get(d.id) || 0), 0));

    return res.json({ ...maskTotalsForRole(totals, req.user!.role), operatorShareRule, operatorShare });
  } catch (error: any) {
    return sendError(res, error, 'Jami summalarni hisoblashda xatolik');
  }
});

// GET /api/deals/swot-daily — kunlik SWOT yig'masi (doira + faqat tasdiqlangan bitimlar)
router.get('/swot-daily', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as any;
    const user = req.user!;
    const scope = await dealScopeWhere(user);
    const todayStr = tashkentYmd(new Date());

    const [deals, allDealsForToday, liquidTxs] = await Promise.all([
      prisma.deal.findMany({
        where: kpiPeriodWhere(scope, q),
        include: { store: true, provider: true, agency: true },
        orderBy: KPI_ORDER,
      }),
      prisma.deal.findMany({
        where: kpiPeriodWhere(scope, { startDate: todayStr, endDate: todayStr }),
        include: { store: true },
        orderBy: KPI_ORDER,
      }),
      // Kassa qoldig'i kompaniya ma'lumoti — OPERATOR/AGENT ga ko'rsatilmaydi
      isScopedRole(user.role)
        ? Promise.resolve([] as { type: string; amount: Prisma.Decimal }[])
        : prisma.ddsTransaction.findMany({ select: { type: true, amount: true } }),
    ]);

    let liquidCash = 0;
    liquidTxs.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'INCOME') liquidCash += amt;
      else liquidCash -= amt;
    });

    // 1. Yuqori KPI kartalari — yagona funksiya (kpi-details ham shundan foydalanadi)
    const topKPI = computeKpi(deals);
    const totalLimitVolume = topKPI.totalLimitVolume;

    // Xarid holati
    let needToBuyCount = 0;
    let needToBuyTotal = 0;
    let boughtGoodsTotal = 0;
    let boughtGoodsCount = 0;
    const boughtGoodsSet = new Set<string>();

    const dailyMap: { [dateStr: string]: any } = {};
    const providerMap: { [name: string]: { count: number; volume: number; commission: number } } = {};
    const storeMap: { [name: string]: { count: number; volume: number; commission: number } } = {};
    const agencyMap: { [name: string]: { count: number; volume: number; commission: number } } = {};

    deals.forEach((d) => {
      const limit = n(d.withdrawnLimit);
      const agentFee = n(d.agentAmount);
      const buyout = n(d.totalPurchaseCost);
      const payout = n(d.calculatedAmount);
      const discountPct = n(d.purchaseDiscountPct);
      const agentRate = n(d.agentPct);

      if (d.status === DealStatus.NEED_TO_BUY) {
        needToBuyCount += 1;
        needToBuyTotal += buyout;
      } else {
        boughtGoodsCount += 1;
        boughtGoodsTotal += buyout;
        if (d.productName) boughtGoodsSet.add(d.productName);
      }

      // Kun kaliti — Asia/Tashkent bo'yicha
      const dKey = d.date ? tashkentYmd(d.date) : "Noma'lum";
      if (!dailyMap[dKey]) {
        dailyMap[dKey] = {
          date: dKey,
          dealsCount: 0,
          limitTotal: 0,
          agentFeeTotal: 0,
          buyoutTotal: 0,
          payoutTotal: 0,
          discounts: [] as number[],
          agentRates: [] as number[],
          extraDaftarTotal: 0,
          extraDaftarCount: 0,
          qodirDebtTotal: 0,
          qodirDebtCount: 0,
          qodirChekExpenseTotal: 0,
          greenBazarTotal: 0,
          qodirBalTotal: 0,
          trustTotal: 0,
          trustCount: 0,
          extraBalanceTotal: 0,
          physicalItemsQty: 0,
          physicalItems: [] as string[],
        };
      }

      const day = dailyMap[dKey];
      day.dealsCount += 1;
      day.limitTotal += limit;
      day.agentFeeTotal += agentFee;
      day.buyoutTotal += buyout;
      day.payoutTotal += payout;
      day.discounts.push(discountPct);
      day.agentRates.push(agentRate);

      const eDaftar = n(d.extraDaftar);
      if (eDaftar > 0) {
        day.extraDaftarTotal += eDaftar;
        day.extraDaftarCount += 1;
      }

      const qDebt = n(d.qodirDebt);
      if (qDebt > 0) {
        day.qodirDebtTotal += qDebt;
        day.qodirDebtCount += 1;
      }

      day.greenBazarTotal += n(d.greenBazarBalance);
      day.qodirBalTotal += n(d.qodirBalance);

      const eTrust = n(d.trustBalance);
      if (eTrust > 0) {
        day.trustTotal += eTrust;
        day.trustCount += 1;
      }

      day.extraBalanceTotal += n(d.totalExtraBalance);
      day.qodirChekExpenseTotal += kpiDealValue('totalQodirChekExpense', d);

      if (d.isActualDeviceSale) {
        day.physicalItemsQty += Number(d.quantity) || 1;
        if (d.productName) day.physicalItems.push(d.productName);
      }

      const provName = d.provider?.name || 'Boshqa';
      if (!providerMap[provName]) providerMap[provName] = { count: 0, volume: 0, commission: 0 };
      providerMap[provName].count += 1;
      providerMap[provName].volume += limit;
      providerMap[provName].commission += agentFee;

      const stName = d.store?.name || 'Boshqa';
      if (!storeMap[stName]) storeMap[stName] = { count: 0, volume: 0, commission: 0 };
      storeMap[stName].count += 1;
      storeMap[stName].volume += limit;
      storeMap[stName].commission += agentFee;

      const agName = d.agency?.name || 'Mustaqil';
      if (!agencyMap[agName]) agencyMap[agName] = { count: 0, volume: 0, commission: 0 };
      agencyMap[agName].count += 1;
      agencyMap[agName].volume += limit;
      agencyMap[agName].commission += agentFee;
    });

    const dailyRows = Object.values(dailyMap)
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .map((row: any) => {
        const c = row.dealsCount || 1;
        const discountAvg = row.discounts.length
          ? row.discounts.reduce((a: number, b: number) => a + b, 0) / row.discounts.length
          : 0;
        const agentRateAvg = row.agentRates.length
          ? row.agentRates.reduce((a: number, b: number) => a + b, 0) / row.agentRates.length
          : 0;
        const organicBuyoutTotal = row.buyoutTotal - row.extraBalanceTotal;
        const expenseHasan = row.payoutTotal - row.qodirDebtTotal - row.greenBazarTotal;
        const expenseQodir = row.qodirDebtTotal;

        return {
          date: row.date,
          dealsCount: row.dealsCount,
          limitTotal: row.limitTotal,
          limitAvg: Math.round(row.limitTotal / c),
          agentFeeTotal: row.agentFeeTotal,
          agentFeeAvg: Math.round(row.agentFeeTotal / c),
          buyoutTotal: row.buyoutTotal,
          buyoutAvg: Math.round(row.buyoutTotal / c),
          payoutTotal: row.payoutTotal,
          payoutAvg: Math.round(row.payoutTotal / c),
          discountAvg,
          agentRateAvg,
          extraDaftarTotal: row.extraDaftarTotal,
          extraDaftarCount: row.extraDaftarCount,
          qodirDebtTotal: row.qodirDebtTotal,
          qodirDebtCount: row.qodirDebtCount,
          qodirChekExpenseTotal: row.qodirChekExpenseTotal || 0,
          greenBazarTotal: row.greenBazarTotal,
          qodirBalTotal: row.qodirBalTotal,
          trustTotal: row.trustTotal,
          trustCount: row.trustCount,
          extraBalanceTotal: row.extraBalanceTotal,
          organicBuyoutTotal,
          physicalItemsQty: row.physicalItemsQty,
          physicalItemsList: row.physicalItems.length ? row.physicalItems.join(', ') : '-',
          expenseHasan,
          expenseQodir,
        };
      });

    const formatSegment = (map: { [k: string]: { count: number; volume: number; commission: number } }) =>
      Object.entries(map)
        .map(([name, val]) => ({
          name,
          count: val.count,
          volume: val.volume,
          commission: val.commission,
          sharePct: totalLimitVolume > 0 ? val.volume / totalLimitVolume : 0,
        }))
        .sort((a, b) => b.volume - a.volume);

    const todayKPI = { ...computeKpi(allDealsForToday), date: todayStr };

    const orderBuyout = {
      needToBuyCount,
      needToBuyTotal,
      boughtGoodsCount,
      boughtGoodsTotal,
      boughtGoodsList: Array.from(boughtGoodsSet).slice(0, 8),
      liquidCash,
    };

    return res.json({
      summary: topKPI,
      topKPI,
      todayKPI,
      todayStr,
      orderBuyout,
      orderBuyoutAnalytics: orderBuyout,
      dailyRows,
      segmentations: {
        providers: formatSegment(providerMap),
        stores: formatSegment(storeMap),
        agencies: formatSegment(agencyMap),
      },
    });
  } catch (error: any) {
    return sendError(res, error, 'SWOT aggregatsiyasida xatolik');
  }
});

// GET /api/deals/kpi-details?metric=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Dashboard KPI kartasini tashkil etuvchi bitimlar. `total` — swot-daily dagi KPI qiymatiga aynan teng.
router.get('/kpi-details', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as any;
    const metric = String(q.metric || '') as KpiMetric;
    if (!KPI_METRICS.includes(metric)) {
      throw new HttpError(400, `metric noto'g'ri. Ruxsat etilgan qiymatlar: ${KPI_METRICS.join(', ')}`);
    }

    const scope = await dealScopeWhere(req.user!);
    const rows = await prisma.deal.findMany({
      where: kpiPeriodWhere(scope, q),
      select: {
        id: true,
        dealNumber: true,
        date: true,
        createdAt: true,
        customerName: true,
        customerPhone1: true,
        customerPhone2: true,
        withdrawnLimit: true,
        agentAmount: true,
        totalPurchaseCost: true,
        calculatedAmount: true,
        store: { select: { name: true } },
        provider: { select: { name: true } },
        agency: { select: { name: true } },
      },
      orderBy: KPI_ORDER,
    });

    const total = computeKpi(rows)[metric];
    const list = rows
      .map((d) => ({
        id: d.id,
        dealNumber: d.dealNumber,
        date: d.date,
        dateTimeLabel: dealDateTimeLabel(d),
        customerName: cleanCustomerText(d.customerName),
        customerPhone1: cleanCustomerText(d.customerPhone1),
        customerPhone2: cleanCustomerText(d.customerPhone2),
        storeName: d.store?.name || null,
        providerName: d.provider?.name || null,
        agencyName: d.agency?.name || null,
        withdrawnLimit: n(d.withdrawnLimit),
        calculatedAmount: n(d.calculatedAmount),
        agentAmount: n(d.agentAmount),
        totalPurchaseCost: n(d.totalPurchaseCost),
        value: kpiDealValue(metric, d),
      }))
      // Ko'rsatkichga hissa qo'shmagan (0) bitimlar ro'yxatga kirmaydi; "bitimlar soni"da hammasi
      .filter((d) => metric === 'totalDeals' || d.value !== 0)
      .reverse();

    return res.json({
      metric,
      startDate: q.period === 'today' ? tashkentYmd(new Date()) : q.startDate || null,
      endDate: q.period === 'today' ? tashkentYmd(new Date()) : q.endDate || null,
      total,
      count: list.length,
      deals: list,
    });
  } catch (error: any) {
    return sendError(res, error, 'KPI tarkibini yuklashda xatolik');
  }
});

// GET /api/deals/:id — doiradan tashqaridagi bitim 404
// GET /api/deals/my-defaults — yangi chek formasi uchun avtomatik qiymatlar (kim kiritayotganiga qarab)
//   { agencyId, agencyName, agentId, agentName, registratorId, registratorName, lockAgency, lockAgent }
// GET /api/deals/discount-rule?storeId&providerId&date — formadagi diskont chegarasi (min/maks/aniq, spravochnikdan)
router.get('/discount-rule', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { storeId, providerId, date } = req.query as Record<string, string | undefined>;
    if (!storeId || !providerId) return res.status(400).json({ error: "Do'kon yoki provayder tanlanmagan" });
    const [store, provider, rules] = await Promise.all([
      prisma.store.findUnique({ where: { id: String(storeId) }, select: { name: true } }),
      prisma.provider.findUnique({ where: { id: String(providerId) }, select: { name: true } }),
      getActiveRules(),
    ]);
    if (!store || !provider) return res.status(404).json({ error: "Do'kon yoki provayder topilmadi" });
    const at = date ? new Date(`${String(date).slice(0, 10)}T12:00:00+05:00`) : new Date();
    return res.json(discountLimitsFor(store.name, provider.name, rules, isNaN(at.getTime()) ? new Date() : at));
  } catch (error: any) {
    return sendError(res, error, 'Diskont qoidasini olishda xatolik');
  }
});

router.get('/my-defaults', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const out = { agencyId: null as string | null, agencyName: null as string | null, agentId: null as string | null, agentName: null as string | null,
      registratorId: null as string | null, registratorName: null as string | null, lockAgency: false, lockAgent: false };
    if (user.role === Role.OPERATOR) {
      const link = await ensureOperatorRecord(user.id);
      if (link) Object.assign(out, link, { lockAgency: true, lockAgent: true });
    } else if (user.role === Role.AGENT) {
      const me = await prisma.user.findUnique({ where: { id: user.id }, select: { agency: { select: { id: true, name: true } } } });
      if (me?.agency) Object.assign(out, { agencyId: me.agency.id, agencyName: me.agency.name, lockAgency: true });
    } else if (user.role === Role.REGISTRATURA) {
      // Registrator agent va operatorni o'zi tanlaydi (qulflanmaydi); registrator — o'zi
      Object.assign(out, { registratorId: user.id, registratorName: user.fullName });
    }
    return res.json(out);
  } catch (error: any) {
    return sendError(res, error, 'Standart qiymatlarni olishda xatolik');
  }
});

// GET /api/deals/:id/history — chek tarixi: kim, qachon, qaysi maydon, eski → yangi, sabab (egasi, 23.11.2026)
router.get('/:id/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const deal = await prisma.deal.findFirst({ where: await scopedDealWhere(user, { id: req.params.id }), select: { id: true } });
    if (!deal) return res.status(404).json({ error: 'Bitim topilmadi' });
    const logs = await prisma.auditLog.findMany({
      where: { entity: 'Deal', entityId: deal.id },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { fullName: true } } },
    });
    // Registratorga pul maydonlari ko'rsatilmaydi (Bitimlar sahifasidagi kabi)
    const hideMoney = user.role === Role.REGISTRATURA;
    const items = logs.map((l) => {
      const nv: any = l.newValues || {};
      const changes =
        l.action === 'UPDATE'
          ? diffDealViews(l.oldValues, nv)
              .filter((c) => !(hideMoney && (c.money || c.field === 'profit' || c.field === 'customerLimit')))
              .map((c) => ({ ...c, fromText: fmtHistory(c.field, c.from), toText: fmtHistory(c.field, c.to) }))
          : [];
      const reason =
        l.action === 'UPDATE' ? nv._reason || null
        : l.action === 'OVERRIDE' ? nv.reason || null
        : l.action === 'REJECT' ? nv.rejectReason || null
        : null;
      return {
        id: l.id,
        action: l.action,
        at: l.createdAt,
        atLabel: formatTashkentDateTime(l.createdAt),
        by: l.user?.fullName || null,
        reason,
        rule: l.action === 'OVERRIDE' && !hideMoney ? nv.rule || null : null,
        changes,
      };
    });
    // Hech narsa o'zgarmagan tahrirlar (faqat saqlash bosilgan) ko'rsatilmaydi
    return res.json(items.filter((i) => i.action !== 'UPDATE' || i.changes.length || i.reason));
  } catch (error: any) {
    return sendError(res, error, 'Chek tarixini olishda xatolik');
  }
});

router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const deal = await prisma.deal.findFirst({
      where: await scopedDealWhere(req.user!, { id: req.params.id }),
      include: { ...DEAL_INCLUDE, botDeal: true },
    });
    if (!deal) return res.status(404).json({ error: 'Bitim topilmadi' });
    return res.json(maskDealForRole(serializeDeal(deal), req.user!.role));
  } catch (error: any) {
    return sendError(res, error, 'Bitimni olishda xatolik');
  }
});

/** Kuzatuvchi (VIEWER) bitimlarni faqat ko'radi — qo'shish, tahrirlash va o'chirish taqiqlangan (egasi, 15.11.2026) */
function denyViewer(req: AuthRequest, res: Response, next: () => void) {
  if (req.user?.role === Role.VIEWER) return res.status(403).json({ error: "Kuzatuvchi roli bitimlarni faqat ko'ra oladi — o'zgartirish huquqi yo'q" });
  return next();
}

// POST /api/deals — yangi bitim. OPERATOR/AGENT kiritgani PENDING_APPROVAL, qolganlarniki darhol APPROVED
router.post('/', authenticateToken, denyViewer, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const user = req.user!;
    const scoped = isScopedRole(user.role);

    if (!body.storeId || !body.providerId) {
      return res.status(400).json({ error: "Do'kon yoki provayder tanlanmagan" });
    }
    const [store, provider, rules] = await Promise.all([
      prisma.store.findUnique({ where: { id: String(body.storeId) } }),
      prisma.provider.findUnique({ where: { id: String(body.providerId) } }),
      getActiveRules(),
    ]);
    if (!store || !provider) {
      return res.status(400).json({ error: "Do'kon yoki provayder tanlanmagan" });
    }

    const approvalStatus = initialApprovalStatus(user.role);
    const isApproved = approvalStatus === 'APPROVED';
    const now = new Date();
    const date = resolveDealDateForCreate(body.date, now);

    const customerLimit = toAmount(body.customerLimit, 'Mijoz limiti');
    const withdrawnLimit = toAmount(body.withdrawnLimit, 'Yechilgan limit');
    const calculatedAmount = toAmount(body.calculatedAmount, 'Mijozga beriladigan summa');
    const salePrice = toAmount(body.salePrice, 'Sotuv narxi');
    const receivedFromBuyer = toAmount(body.receivedFromBuyer, 'Xaridordan olingan summa');

    // Omborga qabul qilish uchun: NEED_TO_BUY aniq berilmagan bo'lsa PENDING (Kutilmoqda)
    // Admin'dan boshqa rollarda tovar holati tanlanmaydi — har doim "Kutilmoqda" (egasi, 20.11.2026)
    const initialStatus = user.role === Role.ADMIN ? parseDealStatus(body.status) || DealStatus.PENDING : DealStatus.PENDING;

    // AGENT (yoki agent jamoasidagi OPERATOR) agentlikni bermasa — o'z agentligi qo'yiladi
    let agencyId: string | null = body.agencyId ? String(body.agencyId) : null;
    if (!agencyId && scoped) {
      const me = await prisma.user.findUnique({
        where: { id: user.id },
        select: { agencyId: true, parentAgent: { select: { agencyId: true } } },
      });
      agencyId = me?.agencyId || me?.parentAgent?.agencyId || null;
    }
    // Registrator (egasi, 20.11.2026): chek kiritganda AGENTNI MAJBURIY tanlaydi (operator — ixtiyoriy, shu agentlikdan);
    // agent ulushi odatdagidek o'sha agentga hisoblanadi (registratorga ko'rsatilmaydi), registraturaga ulush yo'q.
    let agentId: string | null = body.agentId ? String(body.agentId) : null;
    let agencyName: string | null = null;
    if (user.role === Role.REGISTRATURA) {
      const picked = body.agencyId ? await prisma.agency.findUnique({ where: { id: String(body.agencyId) }, select: { id: true, name: true } }) : null;
      if (!picked) return res.status(400).json({ error: 'Agent tanlanishi shart' });
      agencyId = picked.id;
      agencyName = picked.name;
      if (agentId) {
        const ok = await prisma.agent.findFirst({ where: { id: agentId, agencyId: picked.id }, select: { id: true } });
        if (!ok) agentId = null;
      }
    } else {
      if (user.role === Role.OPERATOR) {
        // Operator: agentlik va operator formadan tanlanmaydi — o'z agenti va o'zi avtomatik (egasi, 20.11.2026)
        const link = await ensureOperatorRecord(user.id);
        if (link) {
          agencyId = link.agencyId;
          agentId = link.agentId;
        }
      } else if (user.role === Role.AGENT) {
        // Agent: agentlik — o'ziniki; operatorni faqat o'z agentligidan tanlaydi
        const me = await prisma.user.findUnique({ where: { id: user.id }, select: { agencyId: true } });
        if (me?.agencyId) {
          agencyId = me.agencyId;
          if (agentId) {
            const ok = await prisma.agent.findFirst({ where: { id: agentId, agencyId: me.agencyId }, select: { id: true } });
            if (!ok) agentId = null;
          }
        }
      }
      if (agencyId) agencyName = (await prisma.agency.findUnique({ where: { id: agencyId }, select: { name: true } }))?.name || null;
    }

    // Registrator (eski "sotuvchi"): registrator o'zi kiritsa — o'zi; admin ro'yxatdan tanlashi mumkin; operator/agent kiritmaydi
    let registratorId: string | null = null;
    let registratorName: string | null = null;
    if (user.role === Role.REGISTRATURA) {
      registratorId = user.id;
      registratorName = user.fullName;
    } else if (user.role === Role.ADMIN && body.registratorId) {
      const reg = await prisma.user.findFirst({ where: { id: String(body.registratorId), role: Role.REGISTRATURA }, select: { id: true, fullName: true } });
      if (!reg) return res.status(400).json({ error: 'Registrator topilmadi' });
      registratorId = reg.id;
      registratorName = reg.fullName;
    }

    const products = buildDealProducts(pickItemsInput(body), body);

    const discountCheck = checkDiscount(
      user.role,
      body,
      { storeName: store.name, providerName: provider.name, withdrawn: withdrawnLimit, calculated: calculatedAmount, date },
      rules
    );
    if ('error' in discountCheck) {
      return res.status(400).json({ error: discountCheck.error, code: 'DISCOUNT_RULE', overridable: discountCheck.overridable });
    }

    const calcResult = CalculationService.calculateDeal(
      {
        customerLimit,
        withdrawnLimit,
        calculatedAmount,
        storeName: store.name,
        providerName: provider.name,
        isDaftarManual: body.isDaftar !== undefined ? body.isDaftar === true || body.isDaftar === 'true' : undefined,
        productName: products.productName || undefined,
        quantity: products.quantity,
        imeiBarcode: products.imeiBarcode || undefined,
        salePrice,
        receivedFromBuyer,
        status: initialStatus,
        date,
        agencyName,
      },
      rules
    );

    // Chek xarajati: OPERATOR/AGENT uchun e'tiborga olinmaydi (faqat admin tasdiqlaganda yoziladi);
    // boshqa rollarda — faqat xarajat yozish huquqi bor rollar uchun
    const wantsExpense = Boolean(body.autoDdsExpense) && isApproved && EXPENSE_ROLES.includes(user.role);
    const expenseAccount = wantsExpense ? parseAccount(body.ddsAccount) : AccountType.CASH;

    // Bitim raqamini qo'lda berish faqat cheklanmagan rollar uchun
    const requestedNumber = !scoped && Number.isInteger(Number(body.dealNumber)) && Number(body.dealNumber) > 0
      ? Number(body.dealNumber)
      : null;

    const result = await createWithDealNumber(requestedNumber, async (tx, dealNumber) => {
      let created;
      try {
        created = await tx.deal.create({
          data: {
            dealNumber,
            date,
            // Registratura: sotuvchi — har doim xodimning o'zi (formadagi standart qiymat emas)
            // Sotuvchi matni: registrator bo'lsa — uning ismi; admin qo'lda yozishi mumkin; boshqa rollarda — kiritgan odam
            sellerName: registratorName || (user.role === Role.ADMIN ? strOrNull(body.sellerName) || user.fullName : user.fullName),
            registratorId,
            createdById: user.id,
            providerId: provider.id,
            isDaftar: calcResult.isDaftar,
            customerName: cleanCustomerText(body.customerName),
            customerPhone1: cleanCustomerText(body.customerPhone1),
            customerPhone2: cleanCustomerText(body.customerPhone2),
            contractUrl: strOrNull(body.contractUrl),
            passportPhotoUrl: strOrNull(body.passportPhotoUrl),
            storeId: store.id,
            customerLimit,
            withdrawnLimit,
            agentAmount: calcResult.agentAmount,
            totalPurchaseCost: calcResult.totalPurchaseCost,
            purchaseDiscountPct: calcResult.purchaseDiscountPct,
            agentPct: calcResult.agentPct,
            calculatedAmount,
            remainingLimit: calcResult.remainingLimit,
            differenceAmount: calcResult.differenceAmount,
            isActualDeviceSale: calcResult.isActualDeviceSale,
            productName: products.productName,
            quantity: products.quantity,
            imeiBarcode: products.imeiBarcode,
            imei2: products.imei2,
            color: products.color,
            storageGb: products.storageGb,
            deviceItems: products.items.length ? toDeviceItemsJson(products.items) : Prisma.DbNull,
            statusChangeReason:
              strOrNull(body.statusChangeReason) ||
              (initialStatus === DealStatus.PENDING ? 'Omborga qabul qilish kutilmoqda' : null),
            debtDueDate: body.debtDueDate ? new Date(body.debtDueDate) : null,
            status: calcResult.status,
            agencyId,
            agentId,
            extraDaftar: calcResult.extraDaftar,
            qodirDebt: calcResult.qodirDebt,
            qodirBalance: calcResult.qodirBalance,
            greenBazarBalance: calcResult.greenBazarBalance,
            trustBalance: calcResult.trustBalance,
            totalExtraBalance: calcResult.totalExtraBalance,
            trustDebtAmount: calcResult.trustDebtAmount,
            buyerId: body.buyerId ? String(body.buyerId) : null,
            saleDate: body.saleDate ? new Date(body.saleDate) : null,
            salePrice,
            paidTransfer: toAmount(body.paidTransfer, "O'tkazma to'lovi"),
            paidCashUzs: toAmount(body.paidCashUzs, "Naqd to'lov (UZS)"),
            paidCashUsd: toAmount(body.paidCashUsd, "Naqd to'lov (USD)"),
            paidBank: toAmount(body.paidBank, "Bank to'lovi"),
            exchangeRate: toAmount(body.exchangeRate, 'Valyuta kursi') || 1,
            profit: calcResult.profit,
            marginPct: calcResult.marginPct,
            receivedFromBuyer,
            debtRemainder: calcResult.debtRemainder,
            paymentStatus: calcResult.paymentStatus,
            note: strOrNull(body.note),
            approvalStatus,
            approvedById: isApproved ? user.id : null,
            approvedAt: isApproved ? now : null,
          },
        });
      } catch (e) {
        if (isPrismaCode(e, 'P2002')) throw new DealNumberConflict();
        throw e;
      }

      if (products.items.length) {
        await tx.dealItem.createMany({ data: products.items.map((it) => ({ ...it, dealId: created.id })) });
      }

      let trustDebt = 0;
      let storeDebt = 0;
      let check: Awaited<ReturnType<typeof createCheckExpenseInTx>> | null = null;
      if (isApproved) {
        // Darhol tasdiqlangan bitim: Trust qarzi va (so'ralgan bo'lsa) chek xarajati shu tranzaksiyada
        trustDebt = await syncTrustDebtForDeal(tx, created.id);
        // Do'kon bilan hisob-kitob qarzi (mijozga berilgan summa) do'kon daftariga yoziladi
        storeDebt = await syncStoreDebtForDeal(tx, created.id);
        if (wantsExpense) {
          check = await createCheckExpenseInTx(tx, created.id, {
            account: expenseAccount,
            createdById: user.id,
            sourcePerson: user.fullName,
          });
        }
      }
      return { id: created.id, trustDebt, storeDebt, check };
    });

    const newDeal = await prisma.deal.findUnique({ where: { id: result.id }, include: DEAL_INCLUDE });
    const view = serializeDeal(newDeal);

    await writeAudit(user.id, result.id, 'CREATE', undefined, view);
    if (discountCheck.override) await writeAudit(user.id, result.id, 'OVERRIDE', undefined, discountCheck.override);

    emitRealtime('deals:updated', { id: result.id, action: 'created', approvalStatus });
    if (result.check?.created) emitRealtime('dds:updated', {});
    if (result.trustDebt > 0) emitRealtime('trust:updated', {});
    if (result.storeDebt > 0) emitRealtime('stores:updated', {});

    pushToSheetsIfApproved(newDeal);

    return res.status(201).json({
      ...maskDealForRole(view, user.role),
      ...(result.check
        ? { checkExpenseResult: { created: result.check.created, skippedReason: result.check.skippedReason } }
        : {}),
    });
  } catch (error: any) {
    return sendError(res, error, 'Bitim yaratishda xatolik');
  }
});

// PUT /api/deals/:id — tahrirlash. OPERATOR/AGENT: faqat o'z doirasidagi va tasdiqlanmagan bitim
router.put('/:id', authenticateToken, denyViewer, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const user = req.user!;

    const existing = await findScopedDeal(user, id);
    if (!existing) return res.status(404).json({ error: 'Bitim topilmadi' });

    const denial = dealWriteDenial('edit', user.role, existing.approvalStatus);
    if (denial) return res.status(403).json({ error: denial });

    const storeId = body.storeId ? String(body.storeId) : existing.storeId;
    const providerId = body.providerId ? String(body.providerId) : existing.providerId;
    const [store, provider, rules] = await Promise.all([
      prisma.store.findUnique({ where: { id: storeId } }),
      prisma.provider.findUnique({ where: { id: providerId } }),
      getActiveRules(),
    ]);
    if (!store || !provider) return res.status(400).json({ error: "Do'kon yoki provayder xato" });

    // Tasdiqlangan chek: admin ham faqat sabab bilan o'zgartiradi (sabab tarixga yoziladi)
    const editReason = existing.approvalStatus === 'APPROVED' ? overrideReasonOf(user.role, body) : null;
    if (existing.approvalStatus === 'APPROVED' && !editReason) {
      return res.status(400).json({
        error: "Tasdiqlangan chekni o'zgartirish sababini yozing (kamida 5 belgi)",
        code: 'EDIT_REASON',
        overridable: true,
      });
    }

    const newStatus = parseDealStatus(body.status);
    if (newStatus && newStatus !== existing.status) {
      if (!body.statusChangeReason || !String(body.statusChangeReason).trim()) {
        return res.status(400).json({ error: "Holatni o'zgartirish sababi (izoh) kiritilishi shart!" });
      }
    }

    const given = (key: string) => body[key] !== undefined;
    const amountOr = (key: string, label: string, current: Prisma.Decimal) =>
      given(key) ? toAmount(body[key], label) : current;

    const customerLimit = amountOr('customerLimit', 'Mijoz limiti', existing.customerLimit);
    const withdrawnLimit = amountOr('withdrawnLimit', 'Yechilgan limit', existing.withdrawnLimit);
    const calculatedAmount = amountOr('calculatedAmount', 'Mijozga beriladigan summa', existing.calculatedAmount);
    const salePrice = amountOr('salePrice', 'Sotuv narxi', existing.salePrice);
    const receivedFromBuyer = amountOr('receivedFromBuyer', 'Xaridordan olingan summa', existing.receivedFromBuyer);

    const date = resolveDealDateForUpdate(body.date, existing.date);

    // Mahsulotlar: ro'yxat berilsa to'liq almashtiriladi; berilmasa va bitim ko'pi bilan bitta mahsulotli
    // bo'lsa — eski yagona maydonlardan qayta yig'iladi; ko'p mahsulotli bitimda eski maydonlar tegilmaydi.
    const legacy = {
      productName: given('productName') ? body.productName : existing.productName,
      quantity: given('quantity') ? body.quantity : existing.quantity,
      imeiBarcode: given('imeiBarcode') ? body.imeiBarcode : existing.imeiBarcode,
      imei2: given('imei2') ? body.imei2 : existing.imei2,
      color: given('color') ? body.color : existing.color,
      storageGb: given('storageGb') ? body.storageGb : existing.storageGb,
    };
    const itemsInput = pickItemsInput(body);
    const legacyTouched = ['productName', 'quantity', 'imeiBarcode', 'imei2', 'color', 'storageGb'].some(given);
    const replaceItems = itemsInput !== undefined || (legacyTouched && existing.items.length <= 1);
    const products = replaceItems
      ? buildDealProducts(itemsInput, legacy)
      : {
          items: null,
          productName: existing.productName,
          quantity: existing.quantity,
          imeiBarcode: existing.imeiBarcode,
          imei2: existing.imei2,
          color: existing.color,
          storageGb: existing.storageGb,
        };

    // Registrator: faqat admin o'zgartiradi (ro'yxatdan tanlaydi yoki bo'shatadi)
    let putRegistrator: { id: string; fullName: string } | null = null;
    if (given('registratorId') && user.role === Role.ADMIN && body.registratorId) {
      putRegistrator = await prisma.user.findFirst({ where: { id: String(body.registratorId), role: Role.REGISTRATURA }, select: { id: true, fullName: true } });
      if (!putRegistrator) return res.status(400).json({ error: 'Registrator topilmadi' });
    }

    // Agentlik nomi hisobga ta'sir qiladi (Registratura: agent ulushi yo'q)
    const putAgencyId = given('agencyId') ? (body.agencyId ? String(body.agencyId) : null) : existing.agencyId;
    const putAgencyName = putAgencyId
      ? (await prisma.agency.findUnique({ where: { id: putAgencyId }, select: { name: true } }))?.name || null
      : null;

    // Diskont chegarasi — faqat pul/do'kon/provayder/sana o'zgarganda (eski cheklar boshqa sabab bilan tahrirlanaversin)
    const discountTouched =
      Number(withdrawnLimit) !== Number(existing.withdrawnLimit) ||
      Number(calculatedAmount) !== Number(existing.calculatedAmount) ||
      storeId !== existing.storeId ||
      providerId !== existing.providerId;
    const discountCheck = discountTouched
      ? checkDiscount(
          user.role,
          body,
          { storeName: store.name, providerName: provider.name, withdrawn: Number(withdrawnLimit), calculated: Number(calculatedAmount), date },
          rules
        )
      : { ok: true as const, override: null as { rule: string; reason: string } | null };
    if ('error' in discountCheck) {
      return res.status(400).json({ error: discountCheck.error, code: 'DISCOUNT_RULE', overridable: discountCheck.overridable });
    }

    const calcResult = CalculationService.calculateDeal(
      {
        customerLimit: Number(customerLimit),
        withdrawnLimit: Number(withdrawnLimit),
        calculatedAmount: Number(calculatedAmount),
        storeName: store.name,
        providerName: provider.name,
        isDaftarManual: given('isDaftar') ? body.isDaftar === true || body.isDaftar === 'true' : existing.isDaftar,
        productName: products.productName || undefined,
        quantity: products.quantity,
        imeiBarcode: products.imeiBarcode || undefined,
        salePrice: Number(salePrice),
        receivedFromBuyer: Number(receivedFromBuyer),
        status: newStatus || existing.status,
        date,
        agencyName: putAgencyName,
      },
      rules
    );

    // Tasdiqlash maydonlari PUT orqali o'zgarmaydi (faqat /approve va /reject).
    // Istisno: OPERATOR/AGENT rad etilgan bitimni tuzatsa — yana tasdiqqa (PENDING_APPROVAL) qaytadi.
    const nextApproval = approvalAfterEdit(user.role, existing.approvalStatus);
    const resubmitted = nextApproval !== existing.approvalStatus;

    const data: Prisma.DealUncheckedUpdateInput = {
      date,
      sellerName: putRegistrator ? putRegistrator.fullName : strOrNull(body.sellerName) || existing.sellerName,
      ...(given('registratorId') && user.role === Role.ADMIN ? { registratorId: putRegistrator ? putRegistrator.id : null } : {}),
      providerId,
      isDaftar: calcResult.isDaftar,
      customerName: given('customerName') ? cleanCustomerText(body.customerName) : existing.customerName,
      customerPhone1: given('customerPhone1') ? cleanCustomerText(body.customerPhone1) : existing.customerPhone1,
      customerPhone2: given('customerPhone2') ? cleanCustomerText(body.customerPhone2) : existing.customerPhone2,
      contractUrl: given('contractUrl') ? strOrNull(body.contractUrl) : existing.contractUrl,
      passportPhotoUrl: given('passportPhotoUrl') ? strOrNull(body.passportPhotoUrl) : existing.passportPhotoUrl,
      storeId,
      customerLimit,
      withdrawnLimit,
      agentAmount: calcResult.agentAmount,
      totalPurchaseCost: calcResult.totalPurchaseCost,
      purchaseDiscountPct: calcResult.purchaseDiscountPct,
      agentPct: calcResult.agentPct,
      calculatedAmount,
      remainingLimit: calcResult.remainingLimit,
      differenceAmount: calcResult.differenceAmount,
      isActualDeviceSale: calcResult.isActualDeviceSale,
      productName: products.productName,
      quantity: products.quantity,
      imeiBarcode: products.imeiBarcode,
      imei2: products.imei2,
      color: products.color,
      storageGb: products.storageGb,
      statusChangeReason: given('statusChangeReason') ? strOrNull(body.statusChangeReason) : existing.statusChangeReason,
      debtDueDate: given('debtDueDate') ? (body.debtDueDate ? new Date(body.debtDueDate) : null) : existing.debtDueDate,
      status: calcResult.status,
      agencyId: given('agencyId') ? (body.agencyId ? String(body.agencyId) : null) : existing.agencyId,
      agentId: given('agentId') ? (body.agentId ? String(body.agentId) : null) : existing.agentId,
      extraDaftar: calcResult.extraDaftar,
      qodirDebt: calcResult.qodirDebt,
      qodirBalance: calcResult.qodirBalance,
      greenBazarBalance: calcResult.greenBazarBalance,
      trustBalance: calcResult.trustBalance,
      totalExtraBalance: calcResult.totalExtraBalance,
      trustDebtAmount: calcResult.trustDebtAmount,
      buyerId: given('buyerId') ? (body.buyerId ? String(body.buyerId) : null) : existing.buyerId,
      saleDate: body.saleDate ? new Date(body.saleDate) : existing.saleDate,
      salePrice,
      paidTransfer: amountOr('paidTransfer', "O'tkazma to'lovi", existing.paidTransfer),
      paidCashUzs: amountOr('paidCashUzs', "Naqd to'lov (UZS)", existing.paidCashUzs),
      paidCashUsd: amountOr('paidCashUsd', "Naqd to'lov (USD)", existing.paidCashUsd),
      paidBank: amountOr('paidBank', "Bank to'lovi", existing.paidBank),
      exchangeRate: given('exchangeRate') ? toAmount(body.exchangeRate, 'Valyuta kursi') || 1 : existing.exchangeRate,
      profit: calcResult.profit,
      marginPct: calcResult.marginPct,
      receivedFromBuyer,
      debtRemainder: calcResult.debtRemainder,
      paymentStatus: calcResult.paymentStatus,
      note: given('note') ? strOrNull(body.note) : existing.note,
    };
    // Ko'p tovarli sotuvga kirgan bitim: sotuv maydonlari sotuvdan ulush bo'yicha yoziladi — bu yerda o'zgarmaydi
    if (existing.saleId) {
      Object.assign(data, {
        status: existing.status,
        saleDate: existing.saleDate,
        buyerId: existing.buyerId,
        salePrice: existing.salePrice,
        receivedFromBuyer: existing.receivedFromBuyer,
        debtRemainder: existing.debtRemainder,
        paymentStatus: existing.paymentStatus,
        profit: existing.profit,
        marginPct: existing.marginPct,
        paidTransfer: existing.paidTransfer,
        paidCashUzs: existing.paidCashUzs,
        paidCashUsd: existing.paidCashUsd,
        paidBank: existing.paidBank,
        debtDueDate: existing.debtDueDate,
      } satisfies Prisma.DealUncheckedUpdateInput);
    }
    const saleCostChanged =
      !!existing.saleId && Number(calcResult.totalPurchaseCost) !== Number(existing.totalPurchaseCost);
    if (products.items) {
      data.deviceItems = products.items.length ? toDeviceItemsJson(products.items) : Prisma.DbNull;
    }
    if (resubmitted) {
      data.approvalStatus = nextApproval;
      data.rejectReason = null;
      data.approvedById = null;
      data.approvedAt = null;
    }

    const hadTrustEntry = await prisma.trustLedgerEntry.count({ where: { dealId: id } });
    const hadStoreEntry = await prisma.storeLedgerEntry.count({ where: { dealId: id } });

    const { trustDebt, storeDebt } = await prisma.$transaction(async (tx) => {
      // Sotuvdagi bitim: avval sotuv qulflanadi (to'lov/qaytarish bilan bir xil tartib — o'zaro qulflanish bo'lmaydi)
      if (existing.saleId) await lockSale(tx, existing.saleId);
      // Shartli yozuv: bitimning sotuvga tegishliligi o'qilgandan beri o'zgarmagan bo'lishi shart — aks holda
      // parallel createSale / returnSale yozgan sotuv maydonlari eski qiymatlar bilan ustidan yozilib ketardi
      try {
        await tx.deal.update({ where: { id, saleId: existing.saleId }, data });
      } catch (e) {
        if (!isPrismaCode(e, 'P2025')) throw e;
        const now = await tx.deal.findUnique({ where: { id }, select: { id: true } });
        if (!now) throw e;
        throw new HttpError(409, "Bitimning sotuv holati shu vaqtda o'zgardi — sahifani yangilab, qayta urinib ko'ring");
      }
      if (products.items) {
        await tx.dealItem.deleteMany({ where: { dealId: id } });
        if (products.items.length) {
          await tx.dealItem.createMany({ data: products.items.map((it) => ({ ...it, dealId: id })) });
        }
      }
      // Limit / do'kon / provayder o'zgargan bo'lishi mumkin — Trust qarzi daftar bilan qayta moslanadi
      const trustDebt = await syncTrustDebtForDeal(tx, id);
      // Mijozga berilgan summa / do'kon / sana / tasdiq holati o'zgargan bo'lishi mumkin — do'kon daftari ham qayta moslanadi
      const storeDebt = await syncStoreDebtForDeal(tx, id);
      // Tannarx o'zgargan bo'lsa — sotuvdagi barcha tovarlarning narx/pul ulushlari qayta taqsimlanadi
      if (saleCostChanged && existing.saleId) await applySaleToDeals(tx, existing.saleId);
      return { trustDebt, storeDebt };
    }, TX_OPTIONS);

    const updated = await prisma.deal.findUnique({ where: { id }, include: DEAL_INCLUDE });
    const view = serializeDeal(updated);

    const oldView = serializeDeal(existing);
    await writeAudit(user.id, id, 'UPDATE', oldView, { ...view, _reason: editReason || discountCheck.override?.reason || null });
    if (discountCheck.override) await writeAudit(user.id, id, 'OVERRIDE', undefined, discountCheck.override);
    // Tasdiqlangan chekda pul maydoni o'zgarsa — egasiga (adminlarga) Telegram/push (egasi, 23.11.2026)
    if (existing.approvalStatus === 'APPROVED') {
      const moneyChanges = diffDealViews(oldView, view).filter((c) => c.money);
      if (moneyChanges.length) {
        void notifyAdmins({
          title: `Chek #${existing.dealNumber} o'zgartirildi`,
          lines: [
            `Kim: ${user.fullName}`,
            ...moneyChanges.map((c) => `${c.label}: ${fmtHistory(c.field, c.from)} → ${fmtHistory(c.field, c.to)}`),
            `Sabab: ${editReason || '—'}`,
          ],
        });
      }
    }

    emitRealtime('deals:updated', { id, action: 'updated', approvalStatus: updated?.approvalStatus });
    if (trustDebt > 0 || hadTrustEntry > 0) emitRealtime('trust:updated', {});
    if (storeDebt > 0 || hadStoreEntry > 0) emitRealtime('stores:updated', {});

    pushToSheetsIfApproved(updated);

    return res.json(view);
  } catch (error: any) {
    return sendError(res, error, 'Bitimni yangilashda xatolik');
  }
});

// POST /api/deals/:id/approve — faqat ADMIN. Bitim hisob-kitobga qo'shiladi, Trust qarzi va chek xarajati yoziladi
router.post('/:id/approve', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const account = parseAccount(req.body?.account);

    let result;
    try {
      result = await approveDeal(id, { id: user.id, fullName: user.fullName }, { account });
    } catch (e) {
      // Bir vaqtda ikki marta bosilgan: ikkinchi so'rov chek xarajatining noyoblik cheklovi (dealId+source) ga uriladi
      if (isPrismaCode(e, 'P2002')) throw new HttpError(409, 'Bitim allaqachon tasdiqlangan');
      throw e;
    }

    const [deal, balances] = await Promise.all([
      prisma.deal.findUnique({ where: { id }, include: DEAL_INCLUDE }),
      getAccountBalances(),
    ]);
    await writeAudit(user.id, id, 'APPROVE', undefined, { approvalStatus: 'APPROVED', account });
    pushToSheetsIfApproved(deal);

    return res.json({
      success: true,
      deal: serializeDeal(deal),
      trustDebt: result.trustDebt,
      check: result.check,
      balances,
    });
  } catch (error: any) {
    return sendError(res, error, 'Bitimni tasdiqlashda xatolik');
  }
});

// POST /api/deals/:id/reject — faqat ADMIN
router.post('/:id/reject', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const reason = strOrNull(req.body?.reason) || undefined;

    await rejectDeal(id, { id: user.id, fullName: user.fullName }, reason);

    const deal = await prisma.deal.findUnique({ where: { id }, include: DEAL_INCLUDE });
    await writeAudit(user.id, id, 'REJECT', undefined, { approvalStatus: 'REJECTED', rejectReason: reason || null });

    return res.json({ success: true, deal: serializeDeal(deal) });
  } catch (error: any) {
    return sendError(res, error, 'Bitimni rad etishda xatolik');
  }
});

// POST /api/deals/:id/expense-to-dds — chek summasini DDS chiqimiga yozish ("Rasxod qilish")
// Idempotent: bitta bitim uchun faqat bir marta yoziladi. Qodir aka cheki xarajatga olinmaydi.
router.post(
  '/:id/expense-to-dds',
  authenticateToken,
  requireRoles(EXPENSE_ROLES),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const body = req.body || {};
      const account = parseAccount(body.account);

      let amount: number | undefined;
      if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
        const parsed = Number(body.amount);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new HttpError(400, "Xarajat summasi noto'g'ri: 0 dan katta son kiriting");
        }
        amount = parsed;
      }

      const deal = await findScopedDeal(user, id);
      if (!deal) return res.status(404).json({ error: 'Bitim topilmadi' });
      if (deal.approvalStatus !== 'APPROVED') {
        return res.status(409).json({
          error: 'Bitim hali tasdiqlanmagan — chek xarajati faqat administrator tasdiqlagandan keyin yoziladi',
        });
      }

      // Mijozga berilgan summa 0 bo'lsa, klient yuborgan boshqa summa (masalan xarid xarajati) xarajat qilinmaydi
      const useAmount = Number(deal.calculatedAmount) > 0 && amount && amount > 0 ? amount : undefined;

      let result: Awaited<ReturnType<typeof createCheckExpenseInTx>>;
      try {
        result = await prisma.$transaction(
          (tx) =>
            createCheckExpenseInTx(tx, id, {
              account,
              amount: useAmount,
              createdById: user.id,
              sourcePerson: user.fullName,
            }),
          TX_OPTIONS
        );
      } catch (e) {
        // Tugma bir vaqtda ikki marta bosilgan: ikkinchi so'rov noyoblik cheklovi (dealId+source) ga uriladi —
        // dublikat yozilmaydi, mavjud yozuv qaytariladi
        if (!isPrismaCode(e, 'P2002')) throw e;
        const existingTx = await prisma.ddsTransaction.findFirst({ where: { dealId: id, source: DdsSource.DEAL_CHECK } });
        if (!existingTx) throw e;
        result = { transaction: existingTx, created: false, skippedReason: null };
      }

      if (result.created) {
        emitRealtime('dds:updated', { id: result.transaction?.id });
        emitRealtime('deals:updated', { id, action: 'expense' });
      }

      const balances = await getAccountBalances();
      const message = result.created
        ? `№${deal.dealNumber} chek bo'yicha ${Number(result.transaction!.amount).toLocaleString('ru-RU')} UZS DDS chiqimiga yozildi`
        : result.transaction
          ? `№${deal.dealNumber} chek xarajati avval yozilgan (${result.transaction.txNumber}) — qayta yozilmadi`
          : result.skippedReason || 'Xarajat yozilmadi';

      return res.status(result.created ? 201 : 200).json({
        success: true,
        transaction: result.transaction,
        created: result.created,
        skippedReason: result.skippedReason,
        balances,
        message,
      });
    } catch (error: any) {
      return sendError(res, error, 'Xarajat qilishda xatolik');
    }
  }
);

// DELETE /api/deals/all — barcha bitimlarni tozalash (faqat ADMIN + tasdiqlash kodi)
router.delete('/all', authenticateToken, requireRoles([Role.ADMIN]), requireAdminConfirm, async (req: AuthRequest, res: Response) => {
  try {
    // Sotuvlar (Sale) bor ekan bitimlar ommaviy o'chirilmaydi: sotuv, uning to'lovlari va DDS kirimlari "egasiz" qolardi.
    // Tekshiruv o'chirish bilan bitta tranzaksiyada — parallel yaratilgan sotuv ham ushlanadi (hammasi bekor bo'ladi).
    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.deal.deleteMany({});
      const salesCount = await tx.sale.count();
      if (salesCount > 0) {
        throw new HttpError(
          409,
          `Bazada ${salesCount} ta sotuv bor — bitimlarni ommaviy o'chirib bo'lmaydi. Avval barcha sotuvlarni Sotuvlar bo'limida omborga qaytaring.`
        );
      }
      return deleted;
    }, TX_OPTIONS);
    emitRealtime('deals:updated', { action: 'deleted-all' });
    emitRealtime('trust:updated', {});
    emitRealtime('stores:updated', {});
    return res.json({
      success: true,
      deletedCount: result.count,
      message: "Barcha bitimlar o'chirildi. Barcha ko'rsatkichlar 0 qilindi.",
    });
  } catch (error: any) {
    return sendError(res, error, 'Bitimlarni tozalashda xatolik');
  }
});

// DELETE /api/deals/:id — ADMIN/MANAGER: istalgan; OPERATOR/AGENT: faqat o'z doirasidagi kutilayotgan bitim
router.delete('/:id', authenticateToken, denyViewer, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const existing = await findScopedDeal(user, id);
    if (!existing) return res.status(404).json({ error: 'Bitim topilmadi' });

    const denial = dealWriteDenial('delete', user.role, existing.approvalStatus);
    if (denial) return res.status(403).json({ error: denial });
    // Sotuvga kirgan bitim o'chirilmaydi — avval sotuv Sotuvlar bo'limida qaytariladi
    await assertDealNotInSale(existing.saleId);

    const hadTrustEntry = await prisma.trustLedgerEntry.count({ where: { dealId: id } });
    // Mahsulotlar va Trust qarzi yozuvi kaskad bilan o'chadi; yozilgan DDS chiqimi (to'langan pul) saqlanib qoladi.
    // Shartli o'chirish: tekshiruvdan keyin parallel sotuvga kirgan bitim o'chirilmaydi (409)
    await guardDealNotClaimed(id, () => prisma.deal.delete({ where: { id, saleId: null } }));

    await writeAudit(user.id, id, 'DELETE', serializeDeal(existing));

    emitRealtime('deals:updated', { id, action: 'deleted' });
    if (hadTrustEntry > 0) emitRealtime('trust:updated', {});
    // Do'kon daftaridagi qarz yozuvi ham kaskad bilan o'chgan bo'lishi mumkin
    emitRealtime('stores:updated', {});

    return res.json({ success: true, message: "Bitim o'chirildi" });
  } catch (error: any) {
    return sendError(res, error, "Bitimni o'chirishda xatolik");
  }
});

export default router;
