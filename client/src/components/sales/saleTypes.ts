// Sotuvlar (ko'p tovarli sotuv) uchun umumiy turlar va yordamchi funksiyalar.
// Server shartnomasi: GET/POST /api/sales, PUT /api/sales/:id, POST /api/sales/:id/payments|return.
import type { Tone } from '../ui';

export type SalePaymentType = 'CASH' | 'BANK_CARD' | 'SETTLEMENT_ACCOUNT' | 'DEBT';
export type SaleAccountType = 'CASH' | 'BANK_CARD' | 'SETTLEMENT_ACCOUNT';
export type SalePaymentStatus = 'PAID' | 'PARTIAL' | 'DEBT';

export const SALE_PAYMENT_TYPES: SalePaymentType[] = ['CASH', 'BANK_CARD', 'SETTLEMENT_ACCOUNT', 'DEBT'];
export const SALE_ACCOUNT_TYPES: SaleAccountType[] = ['CASH', 'BANK_CARD', 'SETTLEMENT_ACCOUNT'];

/** Standart ustama: sotuv narxi = tannarx × 1.12 (eski bitta tovarli formadagi qoida) */
export const DEFAULT_MARKUP = 1.12;

export interface SaleDevice {
  productName?: string | null;
  color?: string | null;
  storageGb?: number | string | null;
  imei1?: string | null;
  imei2?: string | null;
  quantity?: number | null;
}

export interface SaleItem {
  dealId: string;
  dealNumber: number | string | null;
  storeId?: string | null;
  storeName?: string | null;
  productName?: string | null;
  imei?: string | null;
  devices?: SaleDevice[];
  cost: number;
  priceShare: number;
  received: number;
  debt: number;
  profit: number;
}

export interface SalePayment {
  id: string;
  amount: number;
  date?: string | null;
  dateLabel?: string | null;
  accountType?: string | null;
  note?: string | null;
  txNumber?: number | string | null;
}

export interface SaleRow {
  id: string;
  /** true — eski bitta tovarli sotuv (id = bitim id, saleNumber yo'q) */
  legacy: boolean;
  saleNumber: number | null;
  saleDate?: string | null;
  dateLabel?: string | null;
  buyerName?: string | null;
  itemsCount: number;
  totalPrice: number;
  totalCost: number;
  profit: number;
  marginPct: number;
  receivedAmount: number;
  debtRemainder: number;
  paymentStatus: SalePaymentStatus;
  paymentType: SalePaymentType | null;
  debtDueDate?: string | null;
  note?: string | null;
  items: SaleItem[];
  payments: SalePayment[];
}

export interface SalesTotals {
  count: number;
  itemsCount: number;
  totalPrice: number;
  totalCost: number;
  profit: number;
  received: number;
  debt: number;
}

export const EMPTY_TOTALS: SalesTotals = {
  count: 0,
  itemsCount: 0,
  totalPrice: 0,
  totalCost: 0,
  profit: 0,
  received: 0,
  debt: 0,
};

/** Ombordagi qator (GET /api/inventory?status=IN_WAREHOUSE) — faqat forma ishlatadigan maydonlar */
export interface StockRow {
  id: string;
  dealNumber?: number | string | null;
  storeName?: string | null;
  productName?: string | null;
  imei?: string | null;
  imei2?: string | null;
  color?: string | null;
  storageGb?: number | string | null;
  items?: any[];
  purchaseCost?: number | string | null;
  quantity?: number | null;
}

export const num = (v: unknown): number => Number(v) || 0;

const uniq = (list: (string | null | undefined)[]): string[] => {
  const out: string[] = [];
  for (const raw of list) {
    const v = String(raw ?? '').trim();
    if (v && v !== '-' && !out.includes(v)) out.push(v);
  }
  return out;
};

/** Ombor qatoridagi barcha IMEI'lar (asosiy maydonlar + qurilmalar ro'yxati) */
export function stockImeis(row: StockRow): string[] {
  const devices = Array.isArray(row.items) ? row.items : [];
  return uniq([
    row.imei,
    row.imei2,
    ...devices.flatMap((d: any) => [d?.imei1, d?.imei2, d?.imei]),
  ]);
}

/** Ombor qatori bo'yicha qidiruv matni: model, IMEI, bitim №, do'kon */
export function stockSearchText(row: StockRow): string {
  const devices = Array.isArray(row.items) ? row.items : [];
  return [
    row.productName,
    row.color,
    row.storeName,
    row.dealNumber != null ? `№${row.dealNumber} #${row.dealNumber}` : '',
    ...devices.flatMap((d: any) => [d?.productName, d?.color]),
    ...stockImeis(row),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Sotuv qatoridagi tovarning barcha IMEI'lari */
export function saleItemImeis(item: SaleItem): string[] {
  const devices = Array.isArray(item.devices) ? item.devices : [];
  return uniq([...devices.flatMap((d) => [d?.imei1, d?.imei2]), item.imei]);
}

export function paymentStatusTone(status?: string | null): Tone {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'PARTIAL':
      return 'warning';
    case 'DEBT':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function paymentTypeTone(type?: string | null): Tone {
  switch (type) {
    case 'CASH':
      return 'success';
    case 'BANK_CARD':
      return 'info';
    case 'SETTLEMENT_ACCOUNT':
      return 'brand';
    case 'DEBT':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Sotuvning ko'rinadigan raqami: yangi sotuvda sotuv №, eskisida bitim № */
export function saleDisplayNumber(sale: SaleRow): string {
  if (!sale.legacy && sale.saleNumber != null) return String(sale.saleNumber);
  const dealNumber = sale.items?.[0]?.dealNumber;
  return dealNumber != null ? String(dealNumber) : '—';
}

/**
 * Eski (legacy) sotuvni mavjud tahrirlash/o'chirish oynalari kutadigan ombor qatori ko'rinishiga keltiradi
 * (o'sha oynalar PUT|DELETE /api/inventory/:id/sale bilan ishlaydi).
 */
export function legacyInventoryShape(sale: SaleRow) {
  const first = sale.items?.[0];
  return {
    id: sale.id,
    dealNumber: first?.dealNumber ?? '',
    productName: first?.productName ?? '',
    storeName: first?.storeName ?? '',
    purchaseCost: num(sale.totalCost),
    salePrice: num(sale.totalPrice),
    debtRemainder: num(sale.debtRemainder),
    receivedFromBuyer: num(sale.receivedAmount),
    saleDate: sale.saleDate ?? null,
    debtDueDate: sale.debtDueDate ?? null,
    note: sale.note ?? '',
    buyerName: sale.buyerName ?? '',
  };
}
