// DDS sahifasi uchun umumiy konstantalar.

/** Serverdagi tizim kategoriyalari (calculation.service.ts bilan bir xil nom — bu ma'lumot qiymati, tarjima qilinmaydi) */
export const TRUST_INCOME_CATEGORY = 'Trust 1 daromadi';
export const CHECK_EXPENSE_CATEGORY = 'Mijozga berilgan summa (Tovar xaridi)';

/** Do'kon hisob-kitobi kategoriyalari: do'kon bizga to'lasa — kirim; Qodir aka bizga to'lasa ham kirim */
export const STORE_INCOME_CATEGORY = "Do'kondan tushum";
export const QODIR_PAYMENT_CATEGORY = "Qodir aka to'lovi";

/** Server ham shu variantlarni Trust to'lovi deb tan oladi (ledger.service.ts → isTrustIncomeCategory) */
export function isTrustIncomeCategory(name?: string | null): boolean {
  const n = (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return n === TRUST_INCOME_CATEGORY.toLowerCase() || n === 'trust daromadi' || n === 'trust 1 daromad';
}

// Nomni solishtirish uchun: kichik harf, apostrof variantlarisiz, bitta bo'shliq
function normalizeCategory(name?: string | null): string {
  return (name || '')
    .toLowerCase()
    .replace(/[«»"'`ʻʼ’‘]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Do'kondan tushum" — do'konning bizga qarzini kamaytiradigan kirim (do'kon tanlash majburiy) */
export function isStoreIncomeCategory(name?: string | null): boolean {
  return normalizeCategory(name) === normalizeCategory(STORE_INCOME_CATEGORY);
}

/** "Qodir aka to'lovi" — Qodir akaning bizga qarzini kamaytiradigan kirim (ortig'i depozit) */
export function isQodirPaymentCategory(name?: string | null): boolean {
  return normalizeCategory(name) === normalizeCategory(QODIR_PAYMENT_CATEGORY);
}

/** Hisob-kitobga ta'sir qiladigan tizim kategoriyasimi (forma standart qiymati sifatida tanlanmaydi) */
export function isSettlementCategory(name?: string | null): boolean {
  return isTrustIncomeCategory(name) || isStoreIncomeCategory(name) || isQodirPaymentCategory(name);
}

/**
 * Boshlang'ich kategoriyalar — bazada hali yozuv bo'lmaganda ham ro'yxat bo'sh qolmasligi uchun.
 * Bular bazaga yoziladigan nomlar (ma'lumot), interfeys matni emas; serverdan kelgan ro'yxat bilan birlashtiriladi.
 */
export const DEFAULT_CATEGORIES: string[] = [
  TRUST_INCOME_CATEGORY,
  STORE_INCOME_CATEGORY,
  QODIR_PAYMENT_CATEGORY,
  CHECK_EXPENSE_CATEGORY,
  'Tovar xaridi (mijozlardan)',
  'Agent va hamkor komissiyasi',
  "UZIMEI ro'yxatdan o'tkazish",
  'Logistika va yetkazib berish',
  'Marketing va reklama',
  'Ish haqi (FOT)',
  'Ofis ijara va kommunal xizmatlar',
  'Aloqa va internet',
  'Ulgurji savdo tushumi',
  'Daftar tushumi',
  'Инвестиция Хасан',
  'Выкуп техники (клиенты)',
  'Выручка от оптовиков',
  'Boshqa xarajat',
];

export const DDS_ACCOUNTS = ['CASH', 'BANK_CARD', 'SETTLEMENT_ACCOUNT'] as const;
export type DdsAccount = (typeof DDS_ACCOUNTS)[number];

export const DDS_SOURCES = ['MANUAL', 'DEAL_CHECK', 'TRUST_PAYMENT', 'STORE_PAYMENT', 'QODIR_PAYMENT', 'SYNC'] as const;
export type DdsSource = (typeof DDS_SOURCES)[number];

export interface DdsBalances {
  CASH: number;
  BANK_CARD: number;
  SETTLEMENT_ACCOUNT: number;
  total: number;
}

// Serverdagi ruxsatlar (dds.routes.ts, sync.routes.ts) bilan bir xil
export const DDS_WRITE_ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'CFO'];
export const DDS_DELETE_ROLES = ['ADMIN', 'MANAGER', 'CFO'];
export const DDS_SYNC_ROLES = ['ADMIN', 'MANAGER'];
// Cheklarni DDS'ga ommaviy o'tkazish — faqat ADMIN
export const DDS_CHECK_TRANSFER_ROLES = ['ADMIN'];

/** "Cheklarni DDS'ga o'tkazish" oynasidagi boshlang'ich sana (egasi bergan: 10.11.2026 dan) */
export const CHECK_TRANSFER_DEFAULT_FROM = '2026-11-10';
