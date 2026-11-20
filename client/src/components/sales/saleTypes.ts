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

/**
 * Sotiladigan birlik: yoki butun chek, yoki ko'p tovarli chekning BITTA tovar qatori.
 * Chekda 2+ tovar qatori bo'lib, hammasining id'si bo'lsa — har qator alohida birlik
 * (tovarlar turli xaridorga sotilishi mumkin, server chekni o'zi bo'ladi).
 */
export interface SaleUnit {
  /** Butun chek: dealId; chek qismi: dealId + ':' + itemId */
  key: string;
  dealId: string;
  /** Chek qismi bo'lsa — DealItem id; butun chek bo'lsa — null */
  itemId: string | null;
  dealNumber?: number | string | null;
  storeName?: string | null;
  productName?: string | null;
  color?: string | null;
  storageGb?: number | string | null;
  imeis: string[];
  quantity: number;
  /** Tannarx: butun chekda purchaseCost, chek qismida costShare */
  cost: number;
  /** true — ko'p tovarli chekning bir qismi (to'liq tanlanmasa chek bo'linadi) */
  partOfCheck: boolean;
  /** true — chekda tovar narxlari kiritilmagan, tannarx ulushi taxminiy */
  costEstimated: boolean;
  /** Qidiruv matni (kichik harflarda): tovar nomi, IMEI, chek №, do'kon */
  searchText: string;
}

const clean = (v: unknown): string => {
  const s = String(v ?? '').trim();
  return s === '-' ? '' : s;
};

/** Ombor qatorlarini sotiladigan birliklarga yoyadi */
export function buildSaleUnits(stock: StockRow[]): SaleUnit[] {
  const units: SaleUnit[] = [];
  for (const row of stock) {
    const items: any[] = Array.isArray(row.items) ? row.items : [];
    const dealTag = row.dealNumber != null ? `№${row.dealNumber} #${row.dealNumber}` : '';
    const splittable = items.length >= 2 && items.every((it) => it && it.id != null && String(it.id) !== '');
    if (!splittable) {
      units.push({
        key: row.id,
        dealId: row.id,
        itemId: null,
        dealNumber: row.dealNumber,
        storeName: row.storeName,
        productName: row.productName,
        color: row.color,
        storageGb: row.storageGb,
        imeis: stockImeis(row),
        quantity: Math.max(1, num(row.quantity) || 1),
        cost: num(row.purchaseCost),
        partOfCheck: false,
        costEstimated: false,
        searchText: stockSearchText(row),
      });
      continue;
    }
    for (const it of items) {
      const imeis = uniq([it.imei1, it.imei2, it.imei]);
      const name = clean(it.productName) || clean(row.productName);
      units.push({
        key: `${row.id}:${it.id}`,
        dealId: row.id,
        itemId: String(it.id),
        dealNumber: row.dealNumber,
        storeName: row.storeName,
        productName: name,
        color: clean(it.color),
        storageGb: clean(it.storageGb),
        imeis,
        quantity: Math.max(1, num(it.quantity) || 1),
        cost: num(it.costShare),
        partOfCheck: true,
        costEstimated: Boolean(it.costEstimated),
        searchText: [name, clean(it.color), clean(it.storageGb), row.storeName, dealTag, ...imeis]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      });
    }
  }
  return units;
}

/** Model nomi (ko'rsatish uchun): "1ta", "2 шт" kabi son qo'shimchalari olib tashlanadi */
export function stockModelLabel(row: { productName?: string | null }): string {
  const raw = String(row.productName ?? '').replace(/\s+/g, ' ').trim();
  const cleaned = raw.replace(/\b\d+\s*(ta|шт|sht|dona)\b\.?/gi, '').replace(/\s+/g, ' ').replace(/\s+\+\s+/g, ' + ').trim();
  return cleaned || raw || '—';
}

/** Bir xil model qatorlarini bitta guruhga yig'ish kaliti (registr va bo'shliqlar farq qilmaydi) */
export function stockModelKey(row: { productName?: string | null }): string {
  return stockModelLabel(row).toLowerCase().replace(/[^a-z0-9а-яёўқғҳ+]+/gi, '');
}

export interface StockGroup {
  key: string;
  label: string;
  rows: SaleUnit[];
}

/** Birliklarni model bo'yicha guruhlaydi: ko'p donalisi birinchi, ichida — bitim № bo'yicha (eskisi oldin) */
export function groupStock(units: SaleUnit[]): StockGroup[] {
  const map = new Map<string, StockGroup>();
  for (const unit of units) {
    const key = stockModelKey(unit);
    const g = map.get(key) || { key, label: stockModelLabel(unit), rows: [] };
    g.rows.push(unit);
    map.set(key, g);
  }
  const groups = Array.from(map.values());
  // "+" avval butun (bitta tovarli) cheklarni oladi — ko'p tovarli chek keraksiz bo'linib ketmasin; keyin chek № bo'yicha
  for (const g of groups)
    g.rows.sort((a, b) => Number(Boolean((a as any).partOfCheck)) - Number(Boolean((b as any).partOfCheck)) || num(a.dealNumber) - num(b.dealNumber));
  return groups.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
}

/**
 * Tanlangan birliklardan POST /api/sales tanasidagi dealIds / partial ni tuzadi:
 * chekning hamma birligi tanlangan (yoki chek bitta birlik) → dealIds; aks holda → partial { dealId, itemIds }.
 */
export function buildSaleSelection(
  allUnits: SaleUnit[],
  selectedKeys: string[]
): { dealIds: string[]; partial: { dealId: string; itemIds: string[] }[] } {
  const totalByDeal = new Map<string, number>();
  for (const u of allUnits) totalByDeal.set(u.dealId, (totalByDeal.get(u.dealId) || 0) + 1);
  const pickedByDeal = new Map<string, SaleUnit[]>();
  for (const key of selectedKeys) {
    const u = allUnits.find((x) => x.key === key);
    if (!u) continue;
    const list = pickedByDeal.get(u.dealId) || [];
    list.push(u);
    pickedByDeal.set(u.dealId, list);
  }
  const dealIds: string[] = [];
  const partial: { dealId: string; itemIds: string[] }[] = [];
  for (const [dealId, picked] of pickedByDeal) {
    const whole = picked.some((u) => !u.itemId) || picked.length >= (totalByDeal.get(dealId) || 0);
    if (whole) dealIds.push(dealId);
    else partial.push({ dealId, itemIds: picked.map((u) => u.itemId as string) });
  }
  return { dealIds, partial };
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
