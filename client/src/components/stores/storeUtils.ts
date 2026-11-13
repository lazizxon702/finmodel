// Do'konlar hisoboti (StoresPage, StoreDetailPage) uchun umumiy turlar va yordamchilar.
// API: GET /api/store-reports, /api/store-reports/:storeId, /api/store-reports/qodir.
import type { Tone } from '../ui';
import { QODIR_PAYMENT_CATEGORY, STORE_INCOME_CATEGORY } from '../dds/constants';
import { isQodirStore } from '../deals/dealUtils';

/**
 * Hisob-kitob yo'nalishi:
 *   STORE_OWES — do'kon bizga qarzdor (to'lov: DDS kirimi «Do'kondan tushum»)
 *   WE_OWE     — biz qarzdormiz, faqat «Qodir aka» (to'lov: DDS chiqimi «Qodir aka to'lovi»)
 *   TRUST      — Trust do'konlari, hisob-kitobi Trust daftarida
 */
export type Settlement = 'STORE_OWES' | 'WE_OWE' | 'TRUST';

export interface LedgerSums {
  debt: number;
  paid: number;
  balance: number;
}

export interface StoreReportRow {
  storeId: string;
  name: string;
  isActive: boolean;
  settlement: Settlement;
  dealsCount: number;
  withdrawnTotal: number;
  payoutTotal: number;
  profit: number;
  dealExpenses: number;
  netProfit: number;
  period: LedgerSums;
  overall: LedgerSums;
}

export interface StoreReportsResponse {
  period: { startDate?: string | null; endDate?: string | null };
  ledgerStart?: string | null;
  totals: {
    dealsCount: number;
    payoutTotal: number;
    profit: number;
    dealExpenses: number;
    netProfit: number;
    storesOweUs: number;
    weOwe: number;
  };
  stores: StoreReportRow[];
}

export interface StoreDealRow {
  id: string;
  dealNumber: number | string;
  date: string;
  dateLabel?: string | null;
  customerName: string | null;
  withdrawnLimit: number;
  calculatedAmount: number;
  profit: number;
  checkExpense: { id: string; txNumber: string; amount: number; dateLabel?: string | null } | null;
}

export interface StoreExpenseRow {
  id: string;
  txNumber: string;
  dateTime: string;
  dateLabel?: string | null;
  categoryName: string;
  expenseType?: string | null;
  account: string;
  amount: number;
  dealId?: string | null;
  dealNumber?: number | string | null;
}

export interface StoreLedgerEntry {
  id: string;
  type: 'DEBT' | 'PAYMENT';
  amount: number;
  dateTime: string;
  dateLabel?: string | null;
  note?: string | null;
  deal: { id: string; dealNumber: number | string; customerName: string | null } | null;
  ddsTransaction: { id: string; txNumber: string; account: string; categoryName?: string | null } | null;
}

export interface StoreDetailResponse {
  store: { id: string; name: string; isActive: boolean };
  settlement: Settlement;
  ledgerStart?: string | null;
  period: { startDate?: string | null; endDate?: string | null };
  summary: {
    dealsCount: number;
    withdrawnTotal: number;
    payoutTotal: number;
    profit: number;
    dealExpenses: number;
    netProfit: number;
  };
  ledger: { period: LedgerSums; overall: LedgerSums };
  deals: StoreDealRow[];
  expenses: StoreExpenseRow[];
  entries: StoreLedgerEntry[];
}

/** Yo'nalish rangi (dizayn tizimi): do'kon bizga qarzdor — warning, biz qarzdormiz — danger, Trust — violet */
export function settlementTone(settlement: Settlement): Tone {
  if (settlement === 'WE_OWE') return 'danger';
  if (settlement === 'TRUST') return 'violet';
  return 'warning';
}

/** Qoldiq rangi: qarz qolgan bo'lsa yo'nalish rangi, yopilgan (0 yoki ortiqcha to'langan) bo'lsa — success */
export function balanceTone(settlement: Settlement, balance: number | null | undefined): Tone {
  return Number(balance) > 0 ? settlementTone(settlement) : 'success';
}

/** Qarzni yopadigan DDS kategoriyasi (bazadagi nom — tarjima qilinmaydi). Trust uchun yo'q. */
export function settlementCategory(settlement: Settlement): string | null {
  if (settlement === 'STORE_OWES') return STORE_INCOME_CATEGORY;
  if (settlement === 'WE_OWE') return QODIR_PAYMENT_CATEGORY;
  return null;
}

/** Serverdagi isTrustName bilan bir xil: faqat ANIQ nom ("Trustbank" Trust emas) */
const TRUST_NAMES = new Set(['trust', 'trust 1', 'trust1', 'траст', 'траст 1']);
export function isTrustStoreName(name?: string | null): boolean {
  const n = (name || '')
    .toLowerCase()
    .replace(/[«»"'`ʻʼ’‘]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return TRUST_NAMES.has(n);
}

/** «Do'kondan tushum» kirimida tanlanadigan do'konmi: Qodir aka va Trust do'konlari kirmaydi */
export function isStoreIncomeCandidate(store: { name?: string | null; isActive?: boolean }): boolean {
  if (store.isActive === false) return false;
  return !isQodirStore(store.name) && !isTrustStoreName(store.name);
}
