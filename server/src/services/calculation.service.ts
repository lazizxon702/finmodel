import { DealStatus, PaymentStatus } from '@prisma/client';

export interface DealCalculationInput {
  customerLimit: number;
  withdrawnLimit: number;
  calculatedAmount: number;
  storeName: string;
  providerName: string;
  isDaftarManual?: boolean;
  productName?: string;
  quantity?: number;
  imeiBarcode?: string;
  salePrice?: number;
  receivedFromBuyer?: number;
  status?: DealStatus;
  date?: Date | string | null;
}

export interface CommissionRuleItem {
  storeName?: string | null;
  providerName?: string | null;
  ratePercent: number;
  priority: number;
}

// ════════════════════════════════════════════════════════════════════
//  YAGONA BIZNES QOIDALARI (sahifa va routelarda takrorlanmasin — shu yerdan import qiling)
// ════════════════════════════════════════════════════════════════════

/** Trust bizga qarzdor bo'ladigan ulush: yechilgan limitning 16% i */
export const TRUST_RATE = 0.16;

/** DDS'da Trust to'lovi yoziladigan kategoriya nomi */
export const TRUST_INCOME_CATEGORY = 'Trust 1 daromadi';

/** DDS'da chek (mijozga to'lov) xarajati yoziladigan kategoriya nomi */
export const CHECK_EXPENSE_CATEGORY = 'Mijozga berilgan summa (Tovar xaridi)';

/** Nomni solishtirish uchun normallashtirish: kichik harf, ortiqcha bo'shliq va tirnoqlarsiz */
export function normalizeName(name?: string | null): string {
  return (name || '')
    .toLowerCase()
    .replace(/[«»"'`ʻʼ’‘]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Spravochnikdagi dublikat yozuvlarning yagona (kanonik) nomlari.
 * Kalit — normallashtirilgan variant, qiymat — bazada saqlanadigan yagona nom.
 * Migratsiya skripti (scripts/merge-references.ts) va Sheets importi ham shu jadvaldan foydalanadi.
 */
export const STORE_ALIASES: Record<string, string> = {
  'qodir aka': 'Qodir aka',
  'qodir oka': 'Qodir aka',
  'кодир ака': 'Qodir aka',
  'кодир ока': 'Qodir aka',
  'қодир ака': 'Qodir aka',
  'қодир ока': 'Qodir aka',
  'green bazar': 'Green Bazar',
  'planet phone': 'Planet Phone',
  'variant shahlo': 'Variant Shahlo',
  'trust': 'Trust',
  'маргилон медиа парк': 'Маргилон Медиа парк',
};

export const PROVIDER_ALIASES: Record<string, string> = {
  imanum: 'Imanum',
  imanium: 'Imanum',
  imaniom: 'Imanum',
  иманум: 'Imanum',
  иманиум: 'Imanum',
  'alif offline': 'Alif Offline',
  'alif online': 'Alif Online',
  'trust 1': 'Trust 1',
  trust1: 'Trust 1',
};

export const AGENCY_ALIASES: Record<string, string> = {
  асадбек: 'Asadbek',
  asadbek: 'Asadbek',
  назирбек: 'Nazirbek',
  nazirbek: 'Nazirbek',
  жахонгир: 'Jahongir',
  jahongir: 'Jahongir',
  jaxongir: 'Jahongir',
  анвар: 'Anvar',
  anvar: 'Anvar',
  фарида: 'Farida',
  farida: 'Farida',
  macmobi: 'MacMobi',
};

/** Lug'atdan xavfsiz qidirish ("constructor" kabi nomlar Object xossasiga tushib qolmasin) */
function lookupAlias(map: Record<string, string>, name?: string | null): string {
  const key = normalizeName(name);
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : (name || '').trim();
}

export function canonicalStoreName(name?: string | null): string {
  return lookupAlias(STORE_ALIASES, name);
}
export function canonicalProviderName(name?: string | null): string {
  return lookupAlias(PROVIDER_ALIASES, name);
}
export function canonicalAgencyName(name?: string | null): string {
  return lookupAlias(AGENCY_ALIASES, name);
}

/** "Trust" / "Trust 1" — faqat ANIQ nom bo'yicha (masalan "Trustbank" yoki "Entrust" Trust emas) */
const TRUST_NAMES = new Set(['trust', 'trust 1', 'trust1', 'траст', 'траст 1']);
export function isTrustName(name?: string | null): boolean {
  return TRUST_NAMES.has(normalizeName(name));
}
/** Bitim Trust orqali yechilganmi: do'kon YOKI provayder nomi aniq Trust / Trust 1 */
export function isTrustDeal(storeName?: string | null, providerName?: string | null): boolean {
  return isTrustName(storeName) || isTrustName(providerName);
}

/** "Qodir aka" do'koni (barcha yozilish variantlari: Qodir oka, Кодир ока ...) */
export function isQodirStore(storeName?: string | null): boolean {
  return canonicalStoreName(storeName) === 'Qodir aka';
}

/** Imanum provayderi (Imanium / Imaniom variantlari bilan) */
export function isImanumProvider(providerName?: string | null): boolean {
  return canonicalProviderName(providerName) === 'Imanum';
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Trust qarzi = yechilgan limit × 16%.  Misol: 10 000 000 → 1 600 000 */
export function calcTrustDebt(withdrawnLimit: number): number {
  const w = Number(withdrawnLimit) || 0;
  return w > 0 ? round2(w * TRUST_RATE) : 0;
}

/** Agent komissiyasi (foydasi) = Yechilgan limit × (Xarid diskonti − Agent foizi) */
export function calcAgentCommission(withdrawnLimit: number, purchaseDiscountPct: number, agentRate: number): number {
  const w = Number(withdrawnLimit) || 0;
  return round2(w * ((Number(purchaseDiscountPct) || 0) - (Number(agentRate) || 0)));
}

/**
 * Chek uchun mijozga berilgan summa — ADMIN tasdiqlaganda DDS CHIQIMI bo'ladigan summa.
 * Istisno: Qodir aka cheki xarajatga olinmaydi (0 qaytadi).
 */
export function calcCheckExpense(input: { calculatedAmount: number; storeName?: string | null }): number {
  if (isQodirStore(input.storeName)) return 0;
  const amt = Number(input.calculatedAmount) || 0;
  return amt > 0 ? round2(amt) : 0;
}

/** Bitim hisob-kitoblarga (foyda, DDS, qarzlar, dashboard) kiradimi — faqat ADMIN tasdiqlagani */
export function countsInTotals(approvalStatus?: string | null): boolean {
  return !approvalStatus || approvalStatus === 'APPROVED';
}

/** Kim kiritganiga qarab boshlang'ich tasdiqlash holati */
export function initialApprovalStatus(role?: string | null): 'PENDING_APPROVAL' | 'APPROVED' {
  return role === 'OPERATOR' || role === 'AGENT' ? 'PENDING_APPROVAL' : 'APPROVED';
}

/** DDS yozuvi hisob qoldig'ini qanchaga o'zgartiradi: kirim → +, chiqim → − */
export function balanceDelta(type: 'INCOME' | 'EXPENSE' | string, amount: number): number {
  const a = Math.abs(Number(amount) || 0);
  return type === 'INCOME' ? a : -a;
}

export interface TrustLedgerLike {
  type: 'DEBT' | 'PAYMENT' | string;
  amount: number | string | { toString(): string };
}
/** Trust hisob-kitobi: Jami qarz, Trust bergan pul, Qoldiq */
export function summarizeTrustLedger(entries: TrustLedgerLike[]) {
  let totalDebt = 0;
  let totalPaid = 0;
  for (const e of entries) {
    const a = Number(e.amount) || 0;
    if (e.type === 'DEBT') totalDebt += a;
    else if (e.type === 'PAYMENT') totalPaid += a;
  }
  return { totalDebt: round2(totalDebt), totalPaid: round2(totalPaid), balance: round2(totalDebt - totalPaid) };
}

export interface DealItemInput {
  productName?: string | null;
  color?: string | null;
  storageGb?: string | null;
  imei1?: string | null;
  imeiBarcode?: string | null;
  imei2?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
}
/**
 * Ko'p mahsulotli bitim: mahsulotlar ro'yxatini tozalaydi va Deal'ning eski yagona maydonlari
 * (productName, quantity, imeiBarcode ...) uchun yig'ma qiymatlarni qaytaradi — eski bitimlar buzilmaydi.
 */
export function normalizeDealItems(items: DealItemInput[] | null | undefined) {
  const clean = (items || [])
    .map((it, i) => ({
      position: i,
      productName: (it.productName || '').trim(),
      color: (it.color || '').trim() || null,
      storageGb: (it.storageGb || '').toString().trim() || null,
      imei1: (it.imei1 || it.imeiBarcode || '').toString().trim() || null,
      imei2: (it.imei2 || '').toString().trim() || null,
      quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
      price: Math.max(0, Number(it.price) || 0),
    }))
    .filter((it) => it.productName || it.imei1)
    .map((it, i) => ({ ...it, position: i, productName: it.productName || 'Mahsulot' }));

  const first = clean[0];
  return {
    items: clean,
    quantity: clean.reduce((s, it) => s + it.quantity, 0) || 1,
    totalPrice: round2(clean.reduce((s, it) => s + it.price * it.quantity, 0)),
    productName: clean.length ? clean.map((it) => it.productName).join(' + ') : null,
    imeiBarcode: first?.imei1 || null,
    imei2: first?.imei2 || null,
    color: first?.color || null,
    storageGb: first?.storageGb || null,
  };
}

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
/** Sana + soat:daqiqa, Asia/Tashkent (UTC+5): "DD.MM.YYYY HH:mm" */
export function formatTashkentDateTime(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}.${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}
/** Asia/Tashkent bo'yicha kun chegaralari (UTC Date sifatida) — sana oralig'i filtrlari uchun */
export function tashkentDayRange(fromYmd?: string | null, toYmd?: string | null) {
  const start = fromYmd ? new Date(`${fromYmd}T00:00:00+05:00`) : undefined;
  const end = toYmd ? new Date(`${toYmd}T23:59:59.999+05:00`) : undefined;
  return {
    start: start && !isNaN(start.getTime()) ? start : undefined,
    end: end && !isNaN(end.getTime()) ? end : undefined,
  };
}

export class CalculationService {
  // Yuqoridagi yagona qoidalarning statik ko'rinishi (CalculationService.xxx deb chaqirish uchun)
  static readonly TRUST_RATE = TRUST_RATE;
  static isTrustName = isTrustName;
  static isTrustDeal = isTrustDeal;
  static isQodirStore = isQodirStore;
  static isImanumProvider = isImanumProvider;
  static calcTrustDebt = calcTrustDebt;
  static calcAgentCommission = calcAgentCommission;
  static calcCheckExpense = calcCheckExpense;
  static countsInTotals = countsInTotals;
  static initialApprovalStatus = initialApprovalStatus;
  static balanceDelta = balanceDelta;
  static summarizeTrustLedger = summarizeTrustLedger;
  static normalizeDealItems = normalizeDealItems;

  /**
   * Determine whether the deal is a "Daftar" provider
   */
  static isDaftarProvider(providerName: string): boolean {
    const p = (providerName || '').trim().toLowerCase();
    return p.includes('imani') || p.includes('imanum') || p.includes('imanu');
  }

  /**
   * Match dynamic agent rate X based on store, provider, and deal date
   */
  static getAgentRate(
    storeName: string,
    providerName: string,
    rules: CommissionRuleItem[],
    dealDate?: Date | string | null
  ): number {
    const s = (storeName || '').trim().toLowerCase();
    const p = (providerName || '').trim().toLowerCase();

    // Check custom rules sorted by priority descending
    const sorted = [...rules].sort((a, b) => b.priority - a.priority);
    for (const r of sorted) {
      if (r.storeName && s.includes(r.storeName.toLowerCase())) {
        return r.ratePercent;
      }
      if (r.providerName && p.includes(r.providerName.toLowerCase())) {
        return r.ratePercent;
      }
    }

    // Default fallback rules from Google Sheets formula:
    // REGEXMATCH(LOWER(TO_TEXT(N)), "green bazar") -> 35%
    if (s.includes('green bazar')) return 0.35;

    // REGEXMATCH(LOWER(TO_TEXT(G)), "6 oylik|6 oy") -> 35%
    if (p.includes('6 oylik') || p.includes('6 oy')) return 0.35;

    // REGEXMATCH(LOWER(TO_TEXT(N)), "qodir") -> 22%
    if (isQodirStore(s) || s.includes('qodir')) return 0.22;

    // REGEXMATCH(LOWER(TO_TEXT(G)), "alif online|vari") -> 27%
    if (p.includes('alif online') || p.includes('vari')) return 0.27;

    // AND(REGEXMATCH(LOWER(TO_TEXT(G)), "imani|imanu"), date >= 2026-11-03) -> 25%
    const isIman = p.includes('imani') || p.includes('imanu');
    if (isIman && dealDate) {
      const d = new Date(dealDate);
      if (!isNaN(d.getTime()) && d >= new Date('2026-11-03T00:00:00.000Z')) {
        return 0.25;
      }
    }

    // REGEXMATCH(LOWER(TO_TEXT(G)), "imani|imanu|alif offline|alif nasiya") -> 22%
    if (isIman || p.includes('alif of') || p.includes('alif offline') || p.includes('alif nasiya')) return 0.22;

    // REGEXMATCH(LOWER(TO_TEXT(G)), "payme") -> 20%
    if (p.includes('payme')) return 0.20;

    // REGEXMATCH(LOWER(TO_TEXT(G)), "trust") -> 16%
    if (isTrustDeal(s, p)) return TRUST_RATE;

    return 0;
  }

  /**
   * Check if actual physical device is sold
   */
  static isActualDeviceSale(storeName: string, providerName: string): boolean {
    const s = (storeName || '').trim().toLowerCase();
    const p = (providerName || '').trim().toLowerCase();

    const allowedProviders = ['imanium', 'imanu', 'imanum', 'imaniom', 'alif offline', 'alif online'];
    const allowedStores = [
      'gorkiy', 'samarqand', 'chilonzor', 'angren', 'margulon',
      'media park angren', 'media park chilonzor', 'media park margulon', 'novza',
      'margilon', "marg'ilon", 'маргилон'
    ];

    const matchProv = allowedProviders.some((prov) => p.includes(prov));
    const matchStore = allowedStores.some((store) => s.includes(store));

    return matchProv && matchStore;
  }

  /**
   * Complete calculation for a deal record
   */
  static calculateDeal(input: DealCalculationInput, rules: CommissionRuleItem[] = []) {
    const limit = Number(input.customerLimit) || 0;
    const withdrawn = Number(input.withdrawnLimit) || 0;
    const calculated = Number(input.calculatedAmount) || 0;
    const sName = input.storeName || '';
    const pName = input.providerName || '';

    const isDaftar = input.isDaftarManual !== undefined ? input.isDaftarManual : this.isDaftarProvider(pName);
    const purchaseDiscountPct = withdrawn > 0 ? (withdrawn - calculated) / withdrawn : 0;
    const ruleRate = this.getAgentRate(sName, pName, rules, input.date);

    const agentAmount = withdrawn * (purchaseDiscountPct - ruleRate);
    const totalPurchaseCost = agentAmount + calculated;
    const agentPct = withdrawn > 0 ? agentAmount / withdrawn : 0;
    const remainingLimit = limit - withdrawn;
    const differenceAmount = withdrawn - calculated;

    const isActual = this.isActualDeviceSale(sName, pName);

    // Status logic: if not explicitly set, determine from isActual
    let status = input.status;
    if (!status) {
      status = isActual ? DealStatus.PENDING : DealStatus.NEED_TO_BUY;
    }

    // Extra balances
    const extraDaftar = isDaftar ? withdrawn : 0;
    const sLower = sName.toLowerCase();
    const isQodir = isQodirStore(sName);
    const qodirDebt = isQodir ? calculated : 0;
    const qodirBalance = isQodir ? withdrawn * 0.05 : 0;
    const greenBazarBalance = sLower.includes('green bazar') ? withdrawn * (1 - 0.30) : 0;
    // Trust faqat aniq nom bo'yicha aniqlanadi (Trust, Trust 1) — substring emas
    const isTrust = isTrustDeal(sName, pName);
    const trustBalance = isTrust ? withdrawn * (1 - 0.012) : 0;
    const totalExtraBalance = extraDaftar + qodirBalance + greenBazarBalance + trustBalance;

    // Sales and profit calculations
    const salePrice = Number(input.salePrice) || 0;
    const receivedFromBuyer = Number(input.receivedFromBuyer) || 0;

    // Rule 1: Qodir aka / oka yoki Green Bazar bo'lsa xarid summasidan 5% foydaga o'tkaziladi
    const isQodirOrGreen = isQodir || sLower.includes('qodir') || sLower.includes('green bazar');
    const partnerBonus5Pct = isQodirOrGreen ? totalPurchaseCost * 0.05 : 0;

    // Rule 2: Trust 1 yoki Trust cheklaridan urilgan tranzaksiyalarda avtomatik tarzda 16% foydaga o'tishi kerak
    // Trust bizga yechilgan limitning 16% ini qarzdor bo'ladi — bu bitim foydasiga ham kiradi
    const trustDebtAmount = isTrust ? calcTrustDebt(withdrawn) : 0;
    const trustProfit16Pct = isTrust ? (withdrawn > 0 ? trustDebtAmount : calculated * TRUST_RATE) : 0;

    let profit = partnerBonus5Pct + trustProfit16Pct;
    let marginPct = isTrust ? 0.16 : 0;
    let debtRemainder = 0;

    if (status === DealStatus.SOLD) {
      // Sotuv narxi - Yechilgan limit + 5% hamkor bonusi (agar Qodir aka/Green Bazar) + 16% Trust foydasi
      profit = (salePrice - (calculated + differenceAmount)) + partnerBonus5Pct + trustProfit16Pct;
      marginPct = salePrice > 0 ? profit / salePrice : (isTrust ? 0.16 : 0);
      debtRemainder = salePrice - receivedFromBuyer;
    }

    let paymentStatus: PaymentStatus = PaymentStatus.PARTIAL;
    if (salePrice > 0) {
      if (receivedFromBuyer >= salePrice) {
        paymentStatus = PaymentStatus.PAID;
      } else if (receivedFromBuyer === 0) {
        paymentStatus = PaymentStatus.DEBT;
      } else {
        paymentStatus = PaymentStatus.PARTIAL;
      }
    }

    return {
      isDaftar,
      purchaseDiscountPct,
      agentAmount,
      totalPurchaseCost,
      agentPct,
      remainingLimit,
      differenceAmount,
      isActualDeviceSale: isActual,
      status,
      extraDaftar,
      qodirDebt,
      qodirBalance,
      greenBazarBalance,
      trustBalance,
      trustDebtAmount,
      isTrust,
      totalExtraBalance,
      profit,
      marginPct,
      debtRemainder,
      paymentStatus,
    };
  }
}
