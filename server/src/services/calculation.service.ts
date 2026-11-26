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
  /** Agentlik nomi — "Registratura" bo'lsa agent ulushi hisoblanmaydi (kompaniyada qoladi) */
  agencyName?: string | null;
}

export interface CommissionRuleItem {
  storeName?: string | null;
  providerName?: string | null;
  /** Faqat shu agentlik cheklariga (egasi, 26.11.2026). Bo'sh — hamma agentlik */
  agencyName?: string | null;
  /** Kompaniya ulushi (ulush: 0.22 = 22%) — diskontning shundan ortig'i agent foydasiga o'tadi */
  ratePercent: number;
  /** Bizning foydamiz (ulush). Bo'sh bo'lsa = ratePercent. Qodir aka: 0.22 dan 0.06 bizniki, 0.16 uniki */
  profitPercent?: number | null;
  /** Qoida amal qiladigan davr (shu lahzalar ham kiradi). Bo'sh — cheklanmagan */
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
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

/** DDS'da Qodir akaga to'lov (CHIQIM) yoziladigan kategoriya — uning daftaridagi qarzimizni kamaytiradi */
export const QODIR_PAYMENT_CATEGORY = "Qodir aka to'lovi";

/** DDS'da do'kondan kelgan pul (KIRIM) yoziladigan kategoriya — do'konning bizga qarzini kamaytiradi */
export const STORE_INCOME_CATEGORY = "Do'kondan tushum";

/**
 * Do'konlar bilan hisob-kitob daftari shu kundan (Asia/Tashkent) boshlanadi:
 * undan OLDINGI sanali bitimlarga qarz yozuvi yaratilmaydi. Egasi keyin o'zgartirishi mumkin — faqat shu yerda.
 */
export const STORE_LEDGER_START_YMD = '2026-11-10';

/** Nomni solishtirish uchun normallashtirish: kichik harf, ortiqcha bo'shliq va tirnoqlarsiz */
export function normalizeName(name?: string | null): string {
  return (name || '')
    .toLowerCase()
    .replace(/[«»"'`ʻʼ’‘]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

/** Kirill harflarini lotinga o'giradi, lotin harflarini o'zgartirmaydi (kichik harfda) */
export function transliterate(input?: string | null): string {
  let out = '';
  for (const ch of String(input || '').toLowerCase()) out += CYR_TO_LAT[ch] ?? ch;
  return out;
}

/**
 * Odam ismini solishtirish kaliti: kirill = lotin ("Гулнур" = "Gulnur"), x = h ("Xosila" = "Hosila"),
 * tinish belgilarsiz, bo'shliqlar bitta. Operator (Agent yozuvi) ismlari BITTA agentlik ichida shu kalit bo'yicha
 * yagona bo'ladi; turli agentliklardagi bir xil ismlar — boshqa-boshqa odam (egasi qarori, 14.11.2026).
 */
export function personNameKey(name?: string | null): string {
  return transliterate(name)
    .replace(/x/g, 'h')
    .replace(/[^a-z0-9\s]/g, '')
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
  'tursunqulova shahlo': 'Tursunqulova Shahlo',
  'tursunqulova shaxlo': 'Tursunqulova Shahlo',
  'tursunquruva shaxlo': 'Tursunqulova Shahlo',
  'tursunquruva shahlo': 'Tursunqulova Shahlo',
  greenbazar: 'Green Bazar',
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
  'payletar offline': 'Paylater offline',
  'payletar online': 'Paylater online',
  'paylater offline': 'Paylater offline',
  'paylater online': 'Paylater online',
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

/** Kategoriya "Trust 1 daromadi" mi (Trust bergan pul) */
export function isTrustIncomeCategory(categoryName?: string | null): boolean {
  const n = normalizeName(categoryName);
  return n === normalizeName(TRUST_INCOME_CATEGORY) || n === 'trust daromadi' || n === 'trust 1 daromad';
}

/** Kategoriya "Qodir aka to'lovi" mi (yozilish variantlari bilan) */
const QODIR_PAYMENT_NAMES = new Set([
  normalizeName(QODIR_PAYMENT_CATEGORY),
  'qodir aka tolov',
  'qodir akaga tolov',
  'qodir akaga tolovi',
  'qodir oka tolovi',
  'qodir oka tolov',
  // Jonli bazada shunday nom bilan kiritilgan (TX-1159): Qodir aka bergan pul — qarziga to'lov
  'qodir aka prixod',
  'qodir aka prihod',
  'qodir akadan prixod',
  'qodir oka prixod',
]);
export function isQodirPaymentCategory(categoryName?: string | null): boolean {
  return QODIR_PAYMENT_NAMES.has(normalizeName(categoryName));
}

/** Kategoriya "Do'kondan tushum" mi (yozilish variantlari bilan) */
const STORE_INCOME_NAMES = new Set([
  normalizeName(STORE_INCOME_CATEGORY),
  'dokondan tushumi',
  'dokon tushumi',
  'dokondan tushim',
  'dukondan tushum',
]);
export function isStoreIncomeCategory(categoryName?: string | null): boolean {
  return STORE_INCOME_NAMES.has(normalizeName(categoryName));
}

/**
 * Do'kon bilan hisob-kitob yo'nalishi:
 *   WE_OWE     — endi ishlatilmaydi (14.11.2026 gacha Qodir aka shunday edi; tur eski kod uchun qoldirilgan);
 *   TRUST      — Trust / Trust 1 do'koni: o'zining Trust daftari bor, do'kon daftariga yozilmaydi;
 *   STORE_OWES — qolgan barcha do'konlar: DO'KON bizdan qarzdor.
 */
export type StoreSettlement = 'WE_OWE' | 'STORE_OWES' | 'TRUST';
export function storeSettlementKind(storeName?: string | null): StoreSettlement {
  if (isTrustName(storeName)) return 'TRUST';
  // 14.11.2026 dan: Qodir aka ham BIZGA qarzdor (chek + agent ulushi + 6% foyda); 'WE_OWE' endi hech kimga berilmaydi
  return 'STORE_OWES';
}

/** Do'kon daftari boshlanadigan lahza: boshlanish kunining 00:00 i (Asia/Tashkent) */
export function storeLedgerStartDate(startYmd: string = STORE_LEDGER_START_YMD): Date {
  return new Date(`${startYmd}T00:00:00+05:00`);
}
/** Qodir aka bilan hisob-kitob boshlanadigan kun (boshqa do'konlardan alohida) */
export const QODIR_LEDGER_START_YMD = '2026-11-01';

/** Sana do'kon daftari boshlangan kunda yoki undan keyinmi */
export function isOnOrAfterStoreLedgerStart(
  date: Date | string | null | undefined,
  startYmd: string = STORE_LEDGER_START_YMD
): boolean {
  if (!date) return false;
  const d = new Date(date);
  return !isNaN(d.getTime()) && d.getTime() >= storeLedgerStartDate(startYmd).getTime();
}

/** Imanum provayderi (Imanium / Imaniom variantlari bilan) */
export function isImanumProvider(providerName?: string | null): boolean {
  return canonicalProviderName(providerName) === 'Imanum';
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Trust qarzi = yechilgan limit × 16%.  Misol: 10 000 000 → 1 600 000 */
/**
 * Trust bizga bitta chek uchun beradigan pul = TO'LIQ yechilgan limit (egasi, 16.11.2026: "16% — bizning foyda";
 * misol: limit 7 000 000 → Trust 7 000 000 beradi, sarf 5 880 000, foyda 1 120 000). Trust daftaridagi qarz shu summa.
 * calcTrustDebt (limit × 16%) esa Trust DAROMADI (Deal.trustDebtAmount, P&L) — nomi tarixiy.
 */
export function calcTrustReceivable(withdrawnLimit: number): number {
  const w = Number(withdrawnLimit) || 0;
  return w > 0 ? round2(w) : 0;
}

export function calcTrustDebt(withdrawnLimit: number): number {
  const w = Number(withdrawnLimit) || 0;
  return w > 0 ? round2(w * TRUST_RATE) : 0;
}

/**
 * Agent komissiyasi (foydasi) = Yechilgan limit × (Xarid diskonti − Kompaniya ulushi). Manfiy bo'lmaydi.
 * Misol: limit 10 000 000, diskont 30%, Imanum 25% → 500 000.
 */
export function calcAgentCommission(withdrawnLimit: number, purchaseDiscountPct: number, companyRate: number): number {
  const w = Number(withdrawnLimit) || 0;
  return Math.max(0, round2(w * ((Number(purchaseDiscountPct) || 0) - (Number(companyRate) || 0))));
}

/**
 * Kutilayotgan kompaniya foydasi = Yechilgan limit − Mijozga berilgan summa − Agent foydasi − hamkor ulushi.
 *   oddiy bitim:  limit × min(diskont, kompaniya ulushi)          (10 000 000, 30%, Imanum 25% → 2 500 000)
 *   Qodir aka:    22% dan 16% uniki, 6% bizniki                   (10 000 000 → 600 000)
 * Diskont kompaniya ulushidan kichik bo'lsa avval hamkor ulushi ayriladi; foyda manfiy bo'lmaydi.
 */
export function calcExpectedProfit(
  withdrawnLimit: number,
  purchaseDiscountPct: number,
  companyRate: number,
  profitRate: number
): number {
  const w = Number(withdrawnLimit) || 0;
  const disc = Number(purchaseDiscountPct) || 0;
  const rate = Number(companyRate) || 0;
  const partnerCut = Math.max(0, rate - (Number(profitRate) || 0));
  return Math.max(0, round2(w * (Math.min(disc, rate) - partnerCut)));
}

// ───────────────────────── Kompaniya ulushi qoidalari ─────────────────────────

/** Imanum: 03.11.2026 gacha (shu kun ham) 22%, 04.11.2026 dan 25% (Asia/Tashkent) — egasi qarori 14.11.2026 */
export const IMANUM_RATE_CHANGE_YMD = '2026-11-04';

/** 01.11–10.11.2026 hisobi egasining Google jadvaliga tenglashtirilgan davr oxiri va keyingi kun */
// Jadval: "Фин модел" → Сделки_и_Склад, 01.11–11.11.2026, 202 chek
const SHEET_PARITY_END_YMD = '2026-11-11';
const SHEET_PARITY_NEXT_YMD = '2026-11-12';

interface DefaultRule {
  kind: 'store' | 'provider';
  /** Normallashtirilgan nom bo'laklari; do'kon — aniq nom, provayder — nom ichida uchrasa */
  keys: string[];
  name: string;
  ratePercent: number;
  profitPercent?: number;
  validFromYmd?: string;
  validToYmd?: string;
}

/**
 * Standart qoidalar (egasi ro'yxati, 14.11.2026). Spravochnikda mos qoida bo'lmasa shular ishlaydi;
 * `scripts/seed-commission-rules.ts` shu ro'yxatni spravochnikka yozadi. Do'kon qoidasi provayder qoidasidan ustun.
 */
export const DEFAULT_COMMISSION_RULES: DefaultRule[] = [
  { kind: 'store', keys: ['qodir aka'], name: 'Qodir aka', ratePercent: 0.22, profitPercent: 0.06 },
  // Egasi (14.11 kech): 01–10.11 hisobi "Фин модел" jadvaliga tenglashtiriladi — o'sha davrda Green Bazar 35%, Variant 22%, Iman daftar 22%
  { kind: 'store', keys: ['green bazar'], name: 'Green Bazar', ratePercent: 0.35, validToYmd: SHEET_PARITY_END_YMD },
  { kind: 'store', keys: ['green bazar'], name: 'Green Bazar', ratePercent: 0.3, validFromYmd: SHEET_PARITY_NEXT_YMD },
  { kind: 'store', keys: ['tursunqulova shahlo'], name: 'Tursunqulova Shahlo', ratePercent: 0.22 },
  { kind: 'store', keys: ['trust', 'trust 1'], name: 'Trust', ratePercent: TRUST_RATE },
  { kind: 'provider', keys: ['6 oy'], name: '6 oylik Alif', ratePercent: 0.35 },
  { kind: 'provider', keys: ['alif online'], name: 'Alif Online', ratePercent: 0.27 },
  { kind: 'provider', keys: ['alif offline', 'alif of'], name: 'Alif Offline', ratePercent: 0.22 },
  { kind: 'provider', keys: ['alif nasiya'], name: 'Alif nasiya', ratePercent: 0.22 },
  { kind: 'provider', keys: ['imanum', 'imani', 'imanu'], name: 'Imanum', ratePercent: 0.22, validToYmd: '2026-11-03' },
  { kind: 'provider', keys: ['imanum', 'imani', 'imanu'], name: 'Imanum', ratePercent: 0.25, validFromYmd: IMANUM_RATE_CHANGE_YMD },
  { kind: 'provider', keys: ['variant offline', 'variyant offline'], name: 'Variant offline', ratePercent: 0.22 },
  { kind: 'provider', keys: ['vari'], name: 'Variant', ratePercent: 0.22, validToYmd: SHEET_PARITY_END_YMD },
  { kind: 'provider', keys: ['vari'], name: 'Variant', ratePercent: 0.27, validFromYmd: SHEET_PARITY_NEXT_YMD },
  { kind: 'provider', keys: ['iman daftar'], name: 'Iman daftar', ratePercent: 0.22, validToYmd: SHEET_PARITY_END_YMD },
  { kind: 'provider', keys: ['trust 1', 'trust'], name: 'Trust 1', ratePercent: TRUST_RATE },
  { kind: 'provider', keys: ['payme'], name: 'Payme', ratePercent: 0.2 },
  // Jadvalda Infin Bank 22% hisoblangan (#8094, #3730) — tenglashtirilgan davrda 22, keyin egasi ro'yxatidagi 15
  { kind: 'provider', keys: ['infin'], name: 'Infin Bank', ratePercent: 0.22, validToYmd: SHEET_PARITY_END_YMD },
  { kind: 'provider', keys: ['infin'], name: 'Infin Bank', ratePercent: 0.15, validFromYmd: SHEET_PARITY_NEXT_YMD },
  { kind: 'provider', keys: ['paylater offline'], name: 'Paylater offline', ratePercent: 0.22 },
  { kind: 'provider', keys: ['paylater online'], name: 'Paylater online', ratePercent: 0.27 },
  { kind: 'provider', keys: ['finsum', 'finsim'], name: 'Finsum Nasiya', ratePercent: 0.22 },
  // Birzum — 20% (egasi ro'yxati, 23.11.2026). Faqat shu kundan: eski Birzum cheklari qayta hisoblanmaydi
  { kind: 'provider', keys: ['birzum'], name: 'Birzum', ratePercent: 0.2, validFromYmd: '2026-11-23' },
];

// ───────────────────────── Chek ma'lumotlari tekshiruvi (egasi, 23.11.2026) ─────────────────────────

/**
 * O'zbekiston telefon raqami → "+998 90 123 45 67". Noto'g'ri bo'lsa null.
 * Qabul qilinadi: "+998901234567", "998 90 123-45-67", "90 123 45 67" (9 raqam).
 */
export function normalizeUzPhone(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('998') ? digits.slice(3) : digits.length === 9 ? digits : null;
  if (!local) return null;
  return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

/** Shartnoma raqami: bo'shliqsiz, katta harf ("ab 12-34" → "AB12-34"); bo'sh bo'lsa null */
export function normalizeContractNumber(value: unknown): string | null {
  const s = String(value ?? '').replace(/\s+/g, '').toUpperCase();
  return s ? s : null;
}

/** Luhn nazorat yig'indisi (IMEI'ning 15-raqami) */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** IMEI xatosi (o'zbekcha) yoki null: aniq 15 raqam va Luhn nazorat raqami to'g'ri */
export function imeiProblem(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!s) return "IMEI kiritilmagan";
  if (!/^\d{15}$/.test(s)) return `IMEI "${s}" — aniq 15 ta raqam bo'lishi kerak`;
  if (!luhnValid(s)) return `IMEI ${s} — nazorat raqami xato (noto'g'ri terilgan bo'lishi mumkin)`;
  return null;
}

/** Chek ilovalari turlari: shartnoma surati, provayder ilovasidan skrin, tasdiq xati */
export const DEAL_ATTACHMENT_KINDS = ['CONTRACT', 'APP_SCREENSHOT', 'CONFIRMATION'] as const;
export type DealAttachmentKind = (typeof DEAL_ATTACHMENT_KINDS)[number];

/** "Kutilmoqda" / "Sotib olish kerak" holatida necha kundan keyin chek qizil bo'ladi va egasiga xabar ketadi */
export const STALE_DEAL_DAYS = 3;
const STALE_STATUSES = new Set<string>([DealStatus.PENDING, DealStatus.NEED_TO_BUY]);
/** Chek uzoq kutib qoldimi: holati PENDING/NEED_TO_BUY va sanasidan 3 kundan ko'p o'tgan */
export function isStaleDeal(status: string | null | undefined, date: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!status || !STALE_STATUSES.has(status) || !date) return false;
  const t = new Date(date).getTime();
  return Number.isFinite(t) && now.getTime() - t > STALE_DEAL_DAYS * 24 * 60 * 60 * 1000;
}

/** Faktik berilgan summa farqi DDS kategoriyasi va standart bardosh (AppSetting "payout_tolerance" bilan almashtiriladi) */
export const ROUNDING_CATEGORY = 'Yaxlitlash farqi';
export const DEFAULT_PAYOUT_TOLERANCE = 100_000;

// ───────────────────────── Diskont chegaralari (egasi, 23.11.2026) ─────────────────────────

/** Maksimal diskont — undan yuqorisi faqat admin, sabab bilan */
export const MAX_DISCOUNT_PCT = 0.45;
/** Green Bazar: agentga qat'iy limit × 5% — diskont = kompaniya ulushi + 5% bo'lishi shart */
export const GREEN_BAZAR_AGENT_PCT = 0.05;
/** Yaxlitlash uchun bardosh (0.05 foiz punkti) */
const DISCOUNT_EPS = 0.0005;

export interface DiscountLimits {
  /** Minimal diskont = kompaniya ulushi (spravochnikdan) */
  minPct: number;
  maxPct: number;
  /** Aniq diskont (faqat Green Bazar) */
  exactPct: number | null;
  /** Xato matnidagi nom (provayder yoki do'kon) */
  label: string;
  /** Spravochnikda ham, standart ro'yxatda ham qoida topilmadi */
  missing: boolean;
}

/** Chek uchun ruxsat etilgan diskont oralig'i. Foiz spravochnikdan (resolveCommission), qotirilmagan. */
export function discountLimitsFor(
  storeName: string | null | undefined,
  providerName: string | null | undefined,
  rules: CommissionRuleItem[] = [],
  dealDate?: Date | string | null,
  agencyName?: string | null
): DiscountLimits {
  const c = resolveCommission(storeName, providerName, rules, dealDate, agencyName);
  // Yandex Split: agent ulushi yo'q — minimal diskont cheklanmaydi (spravochnikda foiz bo'lsa — o'sha), maksimal 45% qoladi
  if (isNoAgentProvider(providerName)) {
    return { minPct: c.rate, maxPct: MAX_DISCOUNT_PCT, exactPct: null, label: String(providerName || ''), missing: false };
  }
  const storeKey = normalizeName(canonicalStoreName(storeName));
  const isGreen = storeKey === 'green bazar';
  const storeLabelled = isGreen || isQodirStore(storeName) || isTrustName(storeName);
  const label = (storeLabelled ? canonicalStoreName(storeName) : canonicalProviderName(providerName)) || String(providerName || '');
  return {
    minPct: c.rate,
    maxPct: MAX_DISCOUNT_PCT,
    exactPct: isGreen && c.source !== 'NONE' ? round2((c.rate + GREEN_BAZAR_AGENT_PCT) * 10000) / 10000 : null,
    label,
    missing: c.source === 'NONE',
  };
}

const pctText = (v: number) => `${Math.round(v * 1000) / 10}`.replace(/\.0$/, '') + '%';

/**
 * Diskont qoidaga mos kelmasa — xato matni (o'zbekcha), mos kelsa null.
 * Misol: 0.26, "6 oylik Alif" (35%) → "Diskont 26% — 6 oylik Alif uchun minimal 35%. Agent bilan qayta kelishing."
 */
export function discountViolation(discountPct: number, limits: DiscountLimits): string | null {
  const d = Number(discountPct) || 0;
  if (limits.missing) {
    return `${limits.label || 'Bu provayder'} uchun foiz spravochnikda yo'q — administratorga ayting.`;
  }
  if (d > limits.maxPct + DISCOUNT_EPS) {
    return `Diskont ${pctText(d)} — maksimal ${pctText(limits.maxPct)}. Undan yuqorisi faqat admin ruxsati bilan.`;
  }
  if (limits.exactPct !== null) {
    if (Math.abs(d - limits.exactPct) > DISCOUNT_EPS) {
      return `Diskont ${pctText(d)} — ${limits.label} uchun diskont aniq ${pctText(limits.exactPct)} bo'lishi kerak (agentga 5%). Agent bilan qayta kelishing.`;
    }
    return null;
  }
  if (d < limits.minPct - DISCOUNT_EPS) {
    return `Diskont ${pctText(d)} — ${limits.label} uchun minimal ${pctText(limits.minPct)}. Agent bilan qayta kelishing.`;
  }
  return null;
}

export interface ResolvedCommission {
  /** Kompaniya ulushi (ulush) */
  rate: number;
  /** Bizning foydamiz (ulush) */
  profitRate: number;
  /** Qoida qayerdan olindi */
  source: 'RULE' | 'DEFAULT' | 'NONE';
  ruleName?: string;
}

/**
 * Qodir aka do'konida bizning foyda provayderga bog'liq (egasi, 16.11.2026; 01.11 dan hamma cheklarga):
 * Alif orqali (online/offline/nasiya) — 5%, qolganlari (Finsum va b.) — qoidadagi 6%. Ulush (22%) va agent foydasi o'zgarmaydi.
 */
export const QODIR_ALIF_PROFIT_RATE = 0.05;
function qodirProfitRate(storeKey: string, providerKey: string, providerRawKey: string, profitRate: number): number {
  if (storeKey !== 'qodir aka') return profitRate;
  return providerKey.includes('alif') || providerRawKey.includes('alif') ? QODIR_ALIF_PROFIT_RATE : profitRate;
}

const dayStart = (ymd: string) => new Date(`${ymd}T00:00:00+05:00`).getTime();
const dayEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999+05:00`).getTime();
const toTime = (v: Date | string | null | undefined): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
};

/**
 * Bitim uchun kompaniya ulushi va foyda foizini topadi.
 *   1) spravochnik qoidalari (faol, sanasi mos); 2) topilmasa — standart qoidalar; 3) bo'lmasa 0.
 * Tanlash tartibi: ustuvorlik (priority) → do'kon qoidasi provayder qoidasidan ustun → uzunroq (aniqroq) nom →
 * sanasi ko'rsatilgan qoida → kechroq boshlangan qoida.
 * Do'kon — kanonik nom ANIQ teng bo'lsa; provayder — kanonik nom ichida qoida nomi uchrasa.
 * Qoidada do'kon ham, provayder ham bo'lsa — IKKALASI mos kelishi shart.
 */
export function resolveCommission(
  storeName: string | null | undefined,
  providerName: string | null | undefined,
  rules: CommissionRuleItem[] = [],
  dealDate?: Date | string | null,
  agencyName?: string | null
): ResolvedCommission {
  const s = normalizeName(canonicalStoreName(storeName));
  const p = normalizeName(canonicalProviderName(providerName));
  const pRaw = normalizeName(providerName);
  const at = toTime(dealDate) ?? Date.now();

  interface Cand {
    rate: number;
    profitRate: number;
    priority: number;
    isStore: boolean;
    /** Agentlikka xos qoida (masalan Shaxzod) — umumiy provayder qoidasidan ustun */
    isAgency: boolean;
    len: number;
    from: number | null;
    dated: boolean;
    name?: string;
  }
  const better = (a: Cand, b: Cand) =>
    b.priority - a.priority ||
    Number(b.isStore) - Number(a.isStore) ||
    Number(b.isAgency) - Number(a.isAgency) ||
    b.len - a.len ||
    Number(b.dated) - Number(a.dated) ||
    (b.from ?? -Infinity) - (a.from ?? -Infinity);

  const fromRules: Cand[] = [];
  for (const r of rules) {
    const rs = normalizeName(canonicalStoreName(r.storeName));
    const rp = normalizeName(canonicalProviderName(r.providerName));
    if (!rs && !rp) continue;
    if (rs && rs !== s) continue;
    const ra = normalizeName(r.agencyName);
    if (ra && ra !== normalizeName(agencyName)) continue;
    if (rp && !(p.includes(rp) || pRaw.includes(rp))) continue;
    const from = toTime(r.validFrom);
    const to = toTime(r.validTo);
    if (from !== null && at < from) continue;
    if (to !== null && at > to) continue;
    const rate = Number(r.ratePercent) || 0;
    const profitRate = r.profitPercent === null || r.profitPercent === undefined ? rate : Number(r.profitPercent) || 0;
    fromRules.push({
      rate,
      profitRate,
      priority: Number(r.priority) || 0,
      isStore: !!rs,
      isAgency: !!ra,
      len: rs.length + rp.length,
      from,
      dated: from !== null || to !== null,
    });
  }
  if (fromRules.length) {
    const best = fromRules.sort(better)[0];
    return { rate: best.rate, profitRate: qodirProfitRate(s, p, pRaw, best.profitRate), source: 'RULE' };
  }

  const defaults: Cand[] = [];
  for (const d of DEFAULT_COMMISSION_RULES) {
    const key =
      d.kind === 'store'
        ? d.keys.find((k) => k === s)
        : // "trust" provayderi faqat aniq nom bo'yicha (Trustbank Trust emas)
          d.keys.find((k) => (k.startsWith('trust') ? p === k : p.includes(k) || pRaw.includes(k)));
    if (!key) continue;
    const from = d.validFromYmd ? dayStart(d.validFromYmd) : null;
    const to = d.validToYmd ? dayEnd(d.validToYmd) : null;
    if (from !== null && at < from) continue;
    if (to !== null && at > to) continue;
    defaults.push({
      rate: d.ratePercent,
      profitRate: d.profitPercent ?? d.ratePercent,
      priority: d.kind === 'store' ? 10 : 5,
      isStore: d.kind === 'store',
      isAgency: false,
      len: key.length,
      from,
      dated: from !== null || to !== null,
      name: d.name,
    });
  }
  if (defaults.length) {
    const best = defaults.sort(better)[0];
    return { rate: best.rate, profitRate: qodirProfitRate(s, p, pRaw, best.profitRate), source: 'DEFAULT', ruleName: best.name };
  }
  return { rate: 0, profitRate: 0, source: 'NONE' };
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

/**
 * Do'kon bilan hisob-kitob qarzi (bitta bitim) = "mijozga berilgan summa" (calculatedAmount), Qodir aka uchun ham.
 * 0 qaytadi: bitim tasdiqlanmagan, Trust do'koni (o'z daftari bor), bitim sanasi daftar boshlanishidan oldin, summa 0.
 * Yo'nalish (kim kimdan qarzdor) — storeSettlementKind.
 */
export function calcStoreDebt(input: StoreDebtInput): number {
  return calcStoreDebtParts(input).total;
}

export interface StoreDebtInput {
  calculatedAmount: number | string | { toString(): string };
  storeName?: string | null;
  approvalStatus?: string | null;
  date?: Date | string | null;
  /** Qodir aka uchun: agent foydasi va bizning 6% foydamiz ham uning qarziga qo'shiladi */
  agentAmount?: number | string | { toString(): string } | null;
  expectedProfit?: number | string | { toString(): string } | null;
  /** Sinov uchun: boshlanish kunini almashtirish (standart — STORE_LEDGER_START_YMD) */
  startYmd?: string;
}

/**
 * Do'kon qarzining tarkibi. Oddiy do'kon: faqat chek (mijozga berilgan summa).
 * Qodir aka (egasi qarori 14.11.2026): U bizga qarzdor — chek + agent ulushi + bizning 6% foyda, 3 alohida qism.
 *   Misol: limit 10 000 000, diskont 30% → 7 000 000 + 800 000 + 600 000 = 8 400 000.
 */
export function calcStoreDebtParts(input: StoreDebtInput): { check: number; agent: number; profit: number; total: number } {
  const zero = { check: 0, agent: 0, profit: 0, total: 0 };
  if (input.approvalStatus !== 'APPROVED') return zero;
  if (storeSettlementKind(input.storeName) === 'TRUST') return zero;
  const qodir = isQodirStore(input.storeName);
  // Qodir aka bilan hisob-kitob 01.11.2026 dan (egasi, 14.11.2026: "Qodir aka daftarini to'g'rila"); boshqa do'konlar — STORE_LEDGER_START_YMD
  const startYmd = input.startYmd ?? (qodir ? QODIR_LEDGER_START_YMD : STORE_LEDGER_START_YMD);
  if (!isOnOrAfterStoreLedgerStart(input.date, startYmd)) return zero;
  const check = Math.max(0, round2(Number(input.calculatedAmount) || 0));
  if (check <= 0) return zero;
  const agent = qodir ? Math.max(0, round2(Number(input.agentAmount) || 0)) : 0;
  const profit = qodir ? Math.max(0, round2(Number(input.expectedProfit) || 0)) : 0;
  return { check, agent, profit, total: round2(check + agent + profit) };
}

/** Bitim hisob-kitoblarga (foyda, DDS, qarzlar, dashboard) kiradimi — faqat ADMIN tasdiqlagani */
export function countsInTotals(approvalStatus?: string | null): boolean {
  return !approvalStatus || approvalStatus === 'APPROVED';
}

/** Kim kiritganiga qarab boshlang'ich tasdiqlash holati */
/**
 * Registratura (egasi, 16.11.2026): o'zi kelgan mijozlarga chek uradigan xodimlar jamoasi. Ularning cheklari shu nomli
 * agentlikka yoziladi; agent ulushi HECH KIMGA hisoblanmaydi — kompaniya foydasiga qo'shiladi.
 */
export const REGISTRATURA_AGENCY_NAME = 'Registratura';
export function isRegistraturaAgency(agencyName?: string | null): boolean {
  const n = normalizeName(agencyName);
  return n === 'registratura' || n === 'регистратура';
}

/**
 * Yandex Split (egasi, 23.11.2026): bu provayder orqali urilgan chekdan agentga foyda CHIQMAYDI — diskontning hammasi
 * kompaniya foydasi. Do'kon — faqat "Split RB" (juftlik), agentlik va operator — "Apple" (avtomatik qo'yiladi).
 */
export const YANDEX_STORE_NAME = 'Split RB';
export const YANDEX_AGENCY_NAME = 'Apple';
const NO_AGENT_PROVIDERS = new Set(['yandex split', 'yandex', 'yandeks split', 'яндекс сплит']);
export function isNoAgentProvider(providerName?: string | null): boolean {
  return NO_AGENT_PROVIDERS.has(normalizeName(providerName));
}

export function initialApprovalStatus(role?: string | null): 'PENDING_APPROVAL' | 'APPROVED' {
  // Egasi (20.11.2026): admin'dan boshqa KIM kiritsa ham chek admin tasdig'ini kutadi (tasdiqlangach chek xarajati DDS'ga o'zi yoziladi).
  // Rol berilmasa (ichki skriptlar) — avvalgidek darhol tasdiqlangan.
  return !role || role === 'ADMIN' ? 'APPROVED' : 'PENDING_APPROVAL';
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
/** Umumiy daftar yig'masi (Trust va do'kon daftarlari uchun): qarz, to'langan, qoldiq = qarz − to'langan */
export function summarizeLedger(entries: TrustLedgerLike[]) {
  let debt = 0;
  let paid = 0;
  for (const e of entries) {
    const a = Number(e.amount) || 0;
    if (e.type === 'DEBT') debt += a;
    else if (e.type === 'PAYMENT') paid += a;
  }
  const balance = round2(debt - paid);
  // Ortiqcha / oldindan berilgan pul — depozit: keyingi cheklar qarzi shundan avtomatik ayriladi
  return {
    debt: round2(debt),
    paid: round2(paid),
    balance,
    debtLeft: Math.max(0, balance),
    deposit: Math.max(0, round2(-balance)),
  };
}
/** Trust hisob-kitobi: Jami qarz, Trust bergan pul, Qoldiq */
export function summarizeTrustLedger(entries: TrustLedgerLike[]) {
  const s = summarizeLedger(entries);
  return { totalDebt: s.debt, totalPaid: s.paid, balance: s.balance };
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

/**
 * Chek tannarxini tovarlarga bo'ladi (egasi, 18.11.2026: bitta chekda 2 ta har xil tovar bo'lsa narxlar to'g'ri taqsimlansin).
 * Og'irlik = tovar narxi × soni (operator taxminiy kiritadi — yig'indi tannarxga teng bo'lishi shart emas, faqat NISBAT ishlatiladi).
 *   • hamma tovarda narx bor  → narx nisbatida;
 *   • hech birida narx yo'q   → soni nisbatida (teng), `estimated = true`;
 *   • ba'zisida bor           → narxsiz tovarga kiritilganlarning o'rtacha dona narxi beriladi, `estimated = true`.
 * Bo'laklar yig'indisi aniq `totalCost` ga teng (qoldiq tiyin oxirgi tovarga).
 */
export function splitItemCosts(
  items: { price?: number | string | null; quantity?: number | string | null }[],
  totalCost: number
): { shares: number[]; estimated: boolean } {
  const rows = (items || []).map((it) => ({ price: Math.max(0, Number(it.price) || 0), qty: Math.max(1, Math.floor(Number(it.quantity) || 1)) }));
  if (!rows.length) return { shares: [], estimated: false };
  const priced = rows.filter((r) => r.price > 0);
  let weights: number[];
  let estimated = false;
  if (priced.length === rows.length) {
    weights = rows.map((r) => r.price * r.qty);
  } else if (!priced.length) {
    weights = rows.map((r) => r.qty);
    estimated = rows.length > 1;
  } else {
    const avg = priced.reduce((s, r) => s + r.price * r.qty, 0) / priced.reduce((s, r) => s + r.qty, 0);
    weights = rows.map((r) => (r.price > 0 ? r.price : avg) * r.qty);
    estimated = true;
  }
  return { shares: allocateProportional(totalCost, weights), estimated };
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

// ─────────────────────────── Daftar "Ha" qoidasi ───────────────────────────

/** Daftar "Ha" bo'ladigan do'konlar (normallashtirilgan nom ichida uchrasa) — faqat Imanum provayderi bilan */
const DAFTAR_STORE_KEYS = ['denov', 'денов', 'jizzax', 'jizzah', 'жиззах', 'джизак'];
// 'iman daftar' — jonli bazadagi provayder nomi (#3728, Denov): egasi 15.11.2026 — do'koni Denov/Jizzax deb yozilgan chek Daftar hisoblanadi
const DAFTAR_PROVIDER_KEYS = ['imani', 'imanum', 'imanu', 'иманум', 'имани', 'iman daftar'];

/**
 * Egasi qarori (14.11.2026): Daftar "Ha" FAQAT provayder Imanum (Imanium) VA do'kon Denov yoki Jizzax bo'lganda.
 * Boshqa har qanday holatda Daftar "Ha" bo'lmaydi — qo'lda belgilash ham e'tiborga olinmaydi.
 */
export function isDaftarDeal(storeName?: string | null, providerName?: string | null): boolean {
  const s = normalizeName(canonicalStoreName(storeName));
  const p = normalizeName(canonicalProviderName(providerName));
  return DAFTAR_PROVIDER_KEYS.some((k) => p.includes(k)) && DAFTAR_STORE_KEYS.some((k) => s.includes(k));
}

/**
 * Daftar cheki bosqichlari (egasi tasdiqlagan, 15.11.2026):
 *   CHEQUE — chek urildi (kompaniya o'z pulidan sarfladi; ilovada pul tushganini tekshirish kerak)
 *   MONEY  — pul tushdi (ilovada tekshirildi; endi shu limitga qurilma olish kerak)
 *   DEVICE — qurilma olindi (omborda; narxi qo'lda kiritiladi)
 *   SOLD   — sotildi (foyda/zarar ma'lum)
 */
export type DaftarStage = 'CHEQUE' | 'MONEY' | 'DEVICE' | 'SOLD';

export function daftarStage(status?: string | null): DaftarStage {
  if (status === 'MONEY_RECEIVED') return 'MONEY';
  if (status === 'IN_WAREHOUSE' || status === 'IN_TRANSIT') return 'DEVICE';
  if (status === 'SOLD' || status === 'PARTIAL_AMOUNT') return 'SOLD';
  return 'CHEQUE';
}

export interface DaftarDealRow {
  status?: string | null;
  withdrawnLimit: number;
  calculatedAmount: number;
  agentAmount: number;
  /** Kompaniya sarflagani = mijozga berilgan + agent ulushi */
  totalPurchaseCost: number;
  /** Olingan qurilma narxi (qo'lda kiritiladi; kiritilmagan bo'lsa 0) */
  devicePurchaseAmount: number;
  salePrice: number;
  receivedFromBuyer: number;
  debtRemainder: number;
}

/** Bitta daftar chekida kompaniya sarflagan pul */
export function daftarSpent(d: Pick<DaftarDealRow, 'totalPurchaseCost' | 'calculatedAmount' | 'agentAmount'>): number {
  return Number(d.totalPurchaseCost) || (Number(d.calculatedAmount) || 0) + (Number(d.agentAmount) || 0);
}

/** Daftar chekining foyda/zarari: faqat sotilgach = sotilgan narx − kompaniya sarflagani; sotilmagan bo'lsa null */
export function daftarDealResult(d: DaftarDealRow): number | null {
  if (daftarStage(d.status) !== 'SOLD' || !(Number(d.salePrice) > 0)) return null;
  return round2(Number(d.salePrice) - daftarSpent(d));
}

/**
 * Daftar (Denov / Jizzax) yig'masi — qoidalar egasidan (15.11.2026), taxminsiz:
 *   • qurilma narxi va sotuv narxi QO'LDA kiritiladi;
 *   • foyda/zarar = sotilgan narx − kompaniya sarflagani (mijozga berilgan + agent ulushi), faqat sotilgach;
 *   • har bir chek bo'yicha alohida qurilma olinadi: qurilma olinmagan chekning limiti — "tovar olish kerak";
 *   • qoldiqlar: limit qoldig'i, ombordagi tovar, xaridorlar qarzi, pul qoldig'i (tushgan − sarflangan).
 */
export function summarizeDaftar(deals: DaftarDealRow[]) {
  const out = {
    dealsCount: deals.length,
    limitTotal: 0,
    /** Kompaniya sarflagani (hamma cheklar) */
    spentTotal: 0,
    stages: { CHEQUE: 0, MONEY: 0, DEVICE: 0, SOLD: 0 } as Record<DaftarStage, number>,
    /** Qurilma olingan cheklar (omborda + sotilgan): soni va kiritilgan qurilma narxlari yig'indisi */
    bought: { count: 0, amount: 0, missingPrice: 0 },
    /** Sotilgan: soni, sotuv narxi, xaridordan tushgan pul */
    sold: { count: 0, salePrice: 0, received: 0, missingPrice: 0 },
    /** Foyda/zarar — faqat sotilgan cheklar bo'yicha */
    profit: 0,
    /** Tovar olish kerak: qurilma hali olinmagan cheklar (pul tushishini kutayotgan + pul tushgan) */
    needToBuy: { count: 0, limit: 0, awaitingMoneyCount: 0, awaitingMoneyLimit: 0, readyCount: 0, readyLimit: 0 },
    balances: {
      /** Daftardagi limit qoldig'i — hali qurilma olinmagan limit */
      limitLeft: 0,
      /** Ombordagi tovar — olingan, sotilmagan qurilmalar narxi */
      inStock: 0,
      inStockCount: 0,
      /** Xaridorlar qarzi */
      buyerDebt: 0,
      /** Pul qoldig'i = xaridorlardan tushgan pul − kompaniya sarflagani */
      cash: 0,
    },
  };
  for (const d of deals) {
    const limit = Number(d.withdrawnLimit) || 0;
    const spent = daftarSpent(d);
    const device = Number(d.devicePurchaseAmount) || 0;
    const stage = daftarStage(d.status);
    out.limitTotal += limit;
    out.spentTotal += spent;
    out.stages[stage] += 1;
    if (stage === 'CHEQUE' || stage === 'MONEY') {
      out.needToBuy.count += 1;
      out.needToBuy.limit += limit;
      if (stage === 'CHEQUE') {
        out.needToBuy.awaitingMoneyCount += 1;
        out.needToBuy.awaitingMoneyLimit += limit;
      } else {
        out.needToBuy.readyCount += 1;
        out.needToBuy.readyLimit += limit;
      }
      out.balances.limitLeft += limit;
    } else {
      out.bought.count += 1;
      out.bought.amount += device;
      if (!device) out.bought.missingPrice += 1;
    }
    if (stage === 'DEVICE') {
      out.balances.inStock += device;
      out.balances.inStockCount += 1;
    }
    if (stage === 'SOLD') {
      const sale = Number(d.salePrice) || 0;
      out.sold.count += 1;
      out.sold.salePrice += sale;
      out.sold.received += Number(d.receivedFromBuyer) || 0;
      if (!sale) out.sold.missingPrice += 1;
      out.profit += daftarDealResult(d) ?? 0;
      out.balances.buyerDebt += Math.max(0, Number(d.debtRemainder) || 0);
    }
  }
  out.balances.cash = out.sold.received - out.spentTotal;
  return out;
}

// ─────────────────────────── Agent foydasi hisoblanmaydigan agentliklar ───────────────────────────

/**
 * Egasi qarori (14.11.2026): Anvar agentlar ro'yxatida ALOHIDA qator bo'lib turadi, lekin uning cheklaridan agent foydasi
 * HECH KIMGA hisoblanmaydi (agentga ham, kompaniyaga ham qo'shilmaydi). Bitimdagi saqlangan agentAmount / tannarx o'zgarmaydi —
 * qoida faqat HISOBOTLARDA qo'llanadi (Agentlar sahifasi, agent foydasi yig'malari).
 */
export const NO_AGENT_COMMISSION_AGENCIES = ['Anvar'];

export function isNoCommissionAgency(agencyName?: string | null): boolean {
  const key = personNameKey(agencyName);
  return !!key && NO_AGENT_COMMISSION_AGENCIES.some((n) => personNameKey(n) === key);
}

/** Hisobotga kiradigan agent foydasi: foydasi hisoblanmaydigan agentlik (Anvar) uchun 0 */
export function reportAgentAmount(agentAmount: unknown, agencyName?: string | null): number {
  return isNoCommissionAgency(agencyName) ? 0 : Number(agentAmount) || 0;
}

// ─────────────────────────── Operator ulushi (agent foydasidan) ───────────────────────────

export interface OperatorShareRule {
  /** Qoida qaysi agentlik (jamoa) uchun */
  agency: string;
  /** Oddiy foiz: har bir bitimning YECHILGAN LIMITIDAN operatorga */
  basePct: number;
  /** Operatorning shu OYdagi yechilgan limiti `monthlyLimitThreshold` dan oshgan qismiga foiz */
  bonusPct: number;
  /** Oylik chegara; 0 — bonus yo'q (har doim basePct) */
  monthlyLimitThreshold: number;
}

/**
 * Egasi qarori (14.11.2026, aniqlashtirilgan): Jahongir jamoasi (16.11 dan Asadbek, Nazirbek, Davlatbek ham — pastda). Operatorga har bir bitimning YECHILGAN LIMITIDAN 0.5%
 * (Muyassar 155 900 000 → 779 500; agent foydasidan EMAS);
 * operatorning bir oydagi yechilgan limiti 500 000 000 dan oshsa — oshgan qismiga 0.7%.
 * Bu summa agent foydasidan AYRILMAYDI, faqat hisobotda ko'rsatiladi.
 */
export const OPERATOR_SHARE_RULES: OperatorShareRule[] = [
  { agency: 'Jahongir', basePct: 0.5, bonusPct: 0.7, monthlyLimitThreshold: 500_000_000 },
  // Egasi (16.11.2026): Asadbek 1%, Nazirbek 1%, Davlatbek 0.7% — yechilgan limitdan, BONUSSIZ; agent foydasidan ayrilmaydi, faqat ko'rsatiladi
  { agency: 'Asadbek', basePct: 1, bonusPct: 1, monthlyLimitThreshold: 0 },
  { agency: 'Nazirbek', basePct: 1, bonusPct: 1, monthlyLimitThreshold: 0 },
  { agency: 'Davlatbek', basePct: 0.7, bonusPct: 0.7, monthlyLimitThreshold: 0 },
];

export function operatorShareRuleFor(agencyName?: string | null): OperatorShareRule | null {
  const key = personNameKey(agencyName);
  if (!key) return null;
  return OPERATOR_SHARE_RULES.find((r) => personNameKey(r.agency) === key) || null;
}

/** Toshkent vaqti bo'yicha oy kaliti (YYYY-MM) */
export function tashkentMonthKey(date: Date): string {
  return new Date(date.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 7);
}

/**
 * BITTA operatorning bitimlari bo'yicha ulushni bitimma-bitim hisoblaydi (id -> so'm, yaxlitlanmagan).
 * Bitimlar sana bo'yicha tartiblanadi; har oy uchun limit alohida yig'iladi. Chegarani kesib o'tgan bitim
 * ikkiga bo'linadi (limitning chegaragacha qismi basePct, oshgan qismi bonusPct).
 * Oyning to'liq bitimlari berilishi shart (aks holda chegara noto'g'ri sanaladi).
 */
export function calcOperatorShares(
  deals: { id: string; date: Date; withdrawnLimit: number; agentAmount: number }[],
  rule: OperatorShareRule
): Map<string, number> {
  const out = new Map<string, number>();
  const cumByMonth = new Map<string, number>();
  const sorted = [...deals].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  for (const d of sorted) {
    const month = tashkentMonthKey(d.date);
    const before = cumByMonth.get(month) || 0;
    const limit = Math.max(0, d.withdrawnLimit);
    cumByMonth.set(month, before + limit);
    // Chegara 0 — bonus yo'q: butun limit basePct bilan
    const below = rule.monthlyLimitThreshold > 0 ? Math.max(0, Math.min(limit, rule.monthlyLimitThreshold - before)) : limit;
    out.set(d.id, (below * rule.basePct + (limit - below) * rule.bonusPct) / 100);
  }
  return out;
}

export class CalculationService {
  // Yuqoridagi yagona qoidalarning statik ko'rinishi (CalculationService.xxx deb chaqirish uchun)
  static readonly TRUST_RATE = TRUST_RATE;
  static isTrustName = isTrustName;
  static isTrustDeal = isTrustDeal;
  static isQodirStore = isQodirStore;
  static isImanumProvider = isImanumProvider;
  static calcTrustDebt = calcTrustDebt;
  static calcTrustReceivable = calcTrustReceivable;
  static calcAgentCommission = calcAgentCommission;
  static calcCheckExpense = calcCheckExpense;
  static countsInTotals = countsInTotals;
  static initialApprovalStatus = initialApprovalStatus;
  static isRegistraturaAgency = isRegistraturaAgency;
  static balanceDelta = balanceDelta;
  static summarizeTrustLedger = summarizeTrustLedger;
  static summarizeLedger = summarizeLedger;
  static calcStoreDebt = calcStoreDebt;
  static calcStoreDebtParts = calcStoreDebtParts;
  static resolveCommission = resolveCommission;
  static calcExpectedProfit = calcExpectedProfit;
  static storeSettlementKind = storeSettlementKind;
  static normalizeDealItems = normalizeDealItems;
  static isDaftarDeal = isDaftarDeal;

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
    // Nomi tarixiy: bu KOMPANIYA ulushi (agentga diskontning shundan ortig'i qoladi). Qoidalar — resolveCommission.
    return resolveCommission(storeName, providerName, rules, dealDate).rate;
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

    // Daftar "Ha" faqat Imanum + Denov/Jizzax (egasi qarori, 14.11.2026); isDaftarManual endi e'tiborga olinmaydi
    const isDaftar = isDaftarDeal(sName, pName);
    const purchaseDiscountPct = withdrawn > 0 ? (withdrawn - calculated) / withdrawn : 0;
    const commission = resolveCommission(sName, pName, rules, input.date, input.agencyName);
    const ruleRate = commission.rate;

    // Agent foydasi = limit × (diskont − kompaniya ulushi); diskont ulushdan kichik bo'lsa 0 (manfiy bo'lmaydi)
    const agentShare = Math.max(0, withdrawn * (purchaseDiscountPct - ruleRate));
    // Registratura cheki: agent yo'q — uning ulushi kompaniyada qoladi (foydaga qo'shiladi)
    const noAgent = isRegistraturaAgency(input.agencyName) || isNoAgentProvider(pName);
    const agentAmount = noAgent ? 0 : agentShare;
    // Kutilayotgan foyda (holatga bog'liq emas): limit − mijozga berilgan − agent − hamkor ulushi
    const expectedProfit = round2(
      calcExpectedProfit(withdrawn, purchaseDiscountPct, ruleRate, commission.profitRate) + (noAgent ? agentShare : 0)
    );
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

    // Trust bizga yechilgan limitning 16% ini qarzdor bo'ladi (Trust daftari)
    const trustDebtAmount = isTrust ? calcTrustDebt(withdrawn) : 0;

    // FOYDA (egasi qarori 14.11.2026):
    //   • sotilgan tovar         — sotuv narxi − tannarx (mijozga berilgan + agent foydasi);
    //   • daftar "Ha" — qurilma SOTILGUNCHA 0; sotilgach foyda/zarar = sotuv narxi − kompaniya sarflagani (egasi, 15.11.2026);
    //   • qolgan hamma bitim     — kutilayotgan foyda avtomatik (limit × kompaniya ulushi; hamkor do'konlarda o'z foizi).
    const profitDeferred = isDaftar && !(status === DealStatus.SOLD && salePrice > 0);
    let profit = profitDeferred ? 0 : expectedProfit;
    let marginPct = withdrawn > 0 ? profit / withdrawn : 0;
    let debtRemainder = 0;

    if (status === DealStatus.SOLD) {
      if (salePrice > 0) {
        profit = salePrice - totalPurchaseCost;
        marginPct = profit / salePrice;
      }
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
      companyRate: ruleRate,
      profitRate: commission.profitRate,
      expectedProfit,
      profitDeferred,
      profit,
      marginPct,
      debtRemainder,
      paymentStatus,
    };
  }
}

/**
 * Sotilmagan (omborda turgan) bitimning foydasi va marjasi — calculateDeal'ning o'zi bilan, sotuv maydonlarisiz.
 * Sotuv omborga qaytarilganda ishlatiladi: foyda 0 emas (hamkor bonusi 5% + Trust 16%), PUT /api/deals/:id bergan qiymat bilan bir xil.
 */
export function calcUnsoldDealProfit(
  input: Omit<DealCalculationInput, 'salePrice' | 'receivedFromBuyer' | 'status'>,
  rules: CommissionRuleItem[] = []
): { profit: number; marginPct: number } {
  const r = CalculationService.calculateDeal(
    { ...input, salePrice: 0, receivedFromBuyer: 0, status: DealStatus.IN_WAREHOUSE },
    rules
  );
  return { profit: r.profit, marginPct: r.marginPct };
}

// ───────────────────────── Ko'p tovarli sotuv (Sale) ─────────────────────────

/**
 * Xaridorga qaytariladigan pulni hisoblar bo'yicha taqsimlaydi.
 *   • `payments` — sotuvning barcha to'lovlari (manfiylari — avvalgi qaytarishlar), ENG YANGISI BIRINCHI;
 *   • pul eng yangi (musbat) to'lov tushgan hisobdan boshlab olinadi;
 *   • har bir hisobdan ko'pi bilan shu hisobga sof tushgan summa (Σ to'lovlar) — sof tushum manfiy bo'lmaydi.
 * Qaytgan bo'laklar yig'indisi `total` dan kam bo'lsa — to'lovlar yetarli emas (chaqiruvchi xato beradi).
 */
export function allocateRefundByAccount<A extends string>(
  total: number,
  payments: { account: A; amount: number }[]
): { account: A; amount: number }[] {
  const net = new Map<A, number>();
  for (const p of payments) net.set(p.account, (net.get(p.account) || 0) + (Number(p.amount) || 0));
  const out: { account: A; amount: number }[] = [];
  const used = new Set<A>();
  let remaining = Math.max(0, Number(total) || 0);
  for (const p of payments) {
    if (remaining <= 0) break;
    if (!(Number(p.amount) > 0) || used.has(p.account)) continue;
    used.add(p.account);
    const take = Math.min(remaining, Math.max(0, net.get(p.account) || 0));
    if (take <= 0) continue;
    out.push({ account: p.account, amount: take });
    remaining -= take;
  }
  return out;
}

/** Sotuv tushumi (sotuv paytidagi to'lov) DDS kategoriyasi */
export const SALE_INCOME_CATEGORY = 'Sotuv tushumi (Tovar sotildi)';
/** Sotuv qarzining keyingi to'lovi DDS kategoriyasi */
export const SALE_DEBT_PAYMENT_CATEGORY = 'Qarzdorlik qaytarilishi (Kassa kirim)';
/** Qisman qaytarishda xaridorga qaytarilgan pul DDS kategoriyasi (COGS — OPEX'ga tushmaydi) */
export const SALE_REFUND_CATEGORY = 'Sotuv qaytarilishi (Xaridorga qaytarildi)';

/**
 * Umumiy summani og'irliklarga mutanosib taqsimlaydi.
 *   • har bir ulush butun so'mgacha yaxlitlanadi, qoldiq OXIRGI (og'irligi musbat) elementga tushadi — yig'indi doim aynan `total`;
 *   • og'irliklar yig'indisi 0 bo'lsa — teng taqsimlanadi;
 *   • manfiy / noto'g'ri og'irlik 0 deb olinadi; hech bir ulush manfiy bo'lmaydi.
 */
export function allocateProportional(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const t = Math.max(0, Number(total) || 0);
  let w = weights.map((x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0));
  let sum = w.reduce((s, x) => s + x, 0);
  if (sum <= 0) {
    w = w.map(() => 1);
    sum = n;
  }
  // Qoldiq og'irligi musbat bo'lgan oxirgi elementga tushadi (0 og'irlikli elementga tiyin yozilmaydi)
  let last = n - 1;
  while (last > 0 && w[last] <= 0) last--;
  const out: number[] = new Array(n).fill(0);
  let remaining = t;
  for (let i = 0; i < n; i++) {
    if (i === last) continue;
    const share = Math.min(remaining, Math.round((t * w[i]) / sum));
    out[i] = share;
    remaining -= share;
  }
  out[last] = remaining;
  return out;
}

/**
 * Summani "shiftlar"ga (caps) mutanosib taqsimlaydi, lekin hech bir ulush o'z shiftidan oshmaydi
 * (masalan olingan pulni tovarlarning narx ulushlariga: tovarga narxidan ko'p pul yozilmaydi).
 * total shiftlar yig'indisidan katta bo'lsa — ortig'i oxirgi elementda qoladi.
 */
export function allocateCapped(total: number, caps: number[]): number[] {
  const c = caps.map((x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : 0));
  const out = allocateProportional(total, c);
  let excess = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] > c[i]) {
      excess += out[i] - c[i];
      out[i] = c[i];
    }
  }
  for (let i = 0; i < out.length && excess > 0; i++) {
    const room = c[i] - out[i];
    if (room <= 0) continue;
    const add = Math.min(room, excess);
    out[i] += add;
    excess -= add;
  }
  if (excess > 0 && out.length) out[out.length - 1] += excess;
  return out;
}

/** To'lov holati: qarz qolmagan → PAID; qisman to'langan → PARTIAL; hech narsa to'lanmagan → DEBT */
export function salePaymentStatus(price: number, received: number): 'PAID' | 'PARTIAL' | 'DEBT' {
  const debt = (Number(price) || 0) - (Number(received) || 0);
  if (debt <= 0) return 'PAID';
  return (Number(received) || 0) > 0 ? 'PARTIAL' : 'DEBT';
}

/** Sotuv foydasi va marjasi: foyda = narx − tannarx; marja = foyda / narx */
export function calcSaleProfit(price: number, cost: number): { profit: number; marginPct: number } {
  const p = Number(price) || 0;
  const profit = p - (Number(cost) || 0);
  return { profit, marginPct: p > 0 ? profit / p : 0 };
}

export interface SaleShareInput {
  totalPrice: number;
  receivedAmount: number;
  /** Har bir bitimning tannarxi (totalPurchaseCost) — narx shu bo'yicha taqsimlanadi */
  costs: number[];
  /** Hisoblar bo'yicha sof olingan pul (to'lovlar − qaytarilganlar) */
  byAccount: { CASH: number; BANK_CARD: number; SETTLEMENT_ACCOUNT: number };
}

export interface SaleDealShare {
  priceShare: number;
  receivedShare: number;
  debtRemainder: number;
  profit: number;
  marginPct: number;
  paymentStatus: 'PAID' | 'PARTIAL' | 'DEBT';
  paidCashUzs: number;
  paidBank: number;
  paidTransfer: number;
}

/**
 * Sotuvning umumiy narxi va olingan pulini bitimlarga taqsimlaydi:
 *   narx — tannarxga mutanosib; olingan pul — narx ulushiga mutanosib; har bir bitimda
 *   olingan pul hisoblar (naqd / karta / hisob raqam) bo'yicha sotuvdagi nisbatda bo'linadi.
 */
export function calcSaleShares(input: SaleShareInput): SaleDealShare[] {
  const prices = allocateProportional(input.totalPrice, input.costs);
  const received = allocateCapped(Math.min(input.receivedAmount, input.totalPrice), prices);
  const acc = [input.byAccount.CASH, input.byAccount.BANK_CARD, input.byAccount.SETTLEMENT_ACCOUNT].map((x) =>
    Math.max(0, Number(x) || 0)
  );
  // Hisoblar bo'yicha ma'lumot yo'q bo'lsa (bo'lmasligi kerak) — hammasi naqdga yoziladi
  const accWeights = acc.some((x) => x > 0) ? acc : [1, 0, 0];
  return prices.map((priceShare, i) => {
    const receivedShare = received[i];
    const [paidCashUzs, paidBank, paidTransfer] = allocateProportional(receivedShare, accWeights);
    return {
      priceShare,
      receivedShare,
      debtRemainder: priceShare - receivedShare,
      ...calcSaleProfit(priceShare, input.costs[i]),
      paymentStatus: salePaymentStatus(priceShare, receivedShare),
      paidCashUzs,
      paidBank,
      paidTransfer,
    };
  });
}
