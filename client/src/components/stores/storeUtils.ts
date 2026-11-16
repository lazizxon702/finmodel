// Do'konlar hisoboti (StoresPage, StoreDetailPage) uchun umumiy turlar va yordamchilar.
// API: GET /api/store-reports, /api/store-reports/:storeId, /api/store-reports/qodir.
import type { Tone } from '../ui';
import { QODIR_PAYMENT_CATEGORY, STORE_INCOME_CATEGORY } from '../dds/constants';
import { isQodirStore } from '../deals/dealUtils';

/**
 * Hisob-kitob yo'nalishi:
 *   STORE_OWES — do'kon bizga qarzdor (to'lov: DDS kirimi «Do'kondan tushum»)
 *              «Qodir aka» ham shu yo'nalishda (14.11.2026 dan): to'lov — DDS kirimi «Qodir aka to'lovi»
 *   TRUST      — Trust do'konlari, hisob-kitobi Trust daftarida
 */
export type Settlement = 'STORE_OWES' | 'TRUST';

export interface LedgerSums {
  debt: number;
  paid: number;
  balance: number;
  /** Do'kon hali qarzdor: max(0, balance) */
  debtLeft: number;
  /** Oldindan to'langan ortiqcha summa: max(0, −balance) */
  deposit: number;
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
    storeDeposits: number;
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
  agentAmount?: number;
  /** Qarz tarkibi: chek + agent ulushi + 6% foyda (oddiy do'konda agent va foyda 0) */
  debtParts?: { check: number; agent: number; profit: number; total: number } | null;
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

/** Yo'nalish rangi (dizayn tizimi): do'kon bizga qarzdor — warning, Trust — violet */
export function settlementTone(settlement: Settlement): Tone {
  return settlement === 'TRUST' ? 'violet' : 'warning';
}

/** Qoldiq rangi: qarz qolgan bo'lsa warning, yopilgan bo'lsa success, depozit bo'lsa info */
export function balanceTone(settlement: Settlement, debtLeft: number | null | undefined, deposit?: number | null): Tone {
  if (Number(debtLeft) > 0) return settlementTone(settlement);
  return Number(deposit) > 0 ? 'info' : 'success';
}

/** Qarzni yopadigan DDS kategoriyasi (bazadagi nom — tarjima qilinmaydi). Qodir aka uchun alohida. Trust uchun yo'q. */
export function settlementCategory(settlement: Settlement, storeName?: string | null): string | null {
  if (settlement !== 'STORE_OWES') return null;
  return isQodirStore(storeName) ? QODIR_PAYMENT_CATEGORY : STORE_INCOME_CATEGORY;
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

/** «Do'kondan tushum» kirimida tanlanadigan do'konmi: Qodir aka kiradi, Trust do'konlari kirmaydi */
export function isStoreIncomeCandidate(store: { name?: string | null; isActive?: boolean }): boolean {
  if (store.isActive === false) return false;
  return !isTrustStoreName(store.name);
}
