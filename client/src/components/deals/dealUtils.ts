// Bitimlar sahifasi uchun umumiy turlar va yordamchi funksiyalar.
import type { Deal, Role } from '../../types';
import { formatDateTime } from '../../utils/format';

export type AccountCode = 'CASH' | 'BANK_CARD' | 'SETTLEMENT_ACCOUNT';
export const ACCOUNT_CODES: AccountCode[] = ['CASH', 'BANK_CARD', 'SETTLEMENT_ACCOUNT'];

export type ApprovalFilter = 'all' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export const DEAL_STATUSES = ['PENDING', 'IN_WAREHOUSE', 'NEED_TO_BUY', 'IN_TRANSIT', 'SOLD', 'MONEY_RECEIVED'] as const;

/** Forma va ko'rinishdagi bitta mahsulot qatori */
export interface ItemView {
  productName: string;
  color: string;
  storageGb: string;
  imei1: string;
  imei2: string;
  quantity: number;
  price: number;
}

/** Sahifa yuqorisidagi xabar (alert o'rniga) */
export interface Notice {
  tone: 'success' | 'warning' | 'danger' | 'info';
  text: string;
}

type TFn = (key: string, vars?: Record<string, string | number | null | undefined>) => string;

/** Server xatosi: `{error}` matni AYNAN ko'rsatiladi; javob bo'lmasa — tarmoq xatosi */
export function apiError(err: any, t: TFn): string {
  const serverText = err?.response?.data?.error;
  if (typeof serverText === 'string' && serverText.trim()) return serverText;
  if (err?.response) return t('errors.server');
  return t('errors.network');
}

/** Bo'sh, "-" yoki "—" qiymatlarni bo'sh satrga keltiradi */
export function cleanText(value: unknown): string {
  if (value === undefined || value === null) return '';
  const s = String(value).trim();
  return s === '-' || s === '—' ? '' : s;
}

export function dealPhones(deal: Pick<Deal, 'customerPhone1' | 'customerPhone2'>): string[] {
  return [cleanText(deal.customerPhone1), cleanText(deal.customerPhone2)].filter(Boolean);
}

/** Sana + aniq vaqt: server yorlig'i, bo'lmasa klientda Asia/Tashkent bo'yicha */
export function dealDateTime(deal: Pick<Deal, 'dateTimeLabel' | 'date'>): string {
  return deal.dateTimeLabel || formatDateTime(deal.date);
}

/** "Qodir aka" do'koni — cheki xarajatga olinmaydi (server ham shunday hisoblaydi) */
export function isQodirStore(name?: string | null): boolean {
  const s = (name || '').toLowerCase();
  return s.includes('qodir') || s.includes('кодир') || s.includes('қодир');
}

/** Bitim mahsulotlari: server `items`, bo'lmasa eski `deviceItems`, bo'lmasa yagona maydonlar */
export function dealItems(deal: Deal): ItemView[] {
  const anyDeal = deal as any;
  const source: any[] =
    Array.isArray(deal.items) && deal.items.length
      ? deal.items
      : Array.isArray(anyDeal.deviceItems) && anyDeal.deviceItems.length
        ? anyDeal.deviceItems
        : [];
  if (source.length) {
    return source.map((it) => ({
      productName: cleanText(it.productName),
      color: cleanText(it.color),
      storageGb: cleanText(it.storageGb),
      imei1: cleanText(it.imei1 || it.imeiBarcode),
      imei2: cleanText(it.imei2),
      quantity: Math.max(1, Number(it.quantity) || 1),
      price: Number(it.price) || 0,
    }));
  }
  const name = cleanText(deal.productName);
  const imei1 = cleanText(deal.imeiBarcode);
  if (!name && !imei1) return [];
  return [
    {
      productName: name,
      color: cleanText(anyDeal.color),
      storageGb: cleanText(anyDeal.storageGb),
      imei1,
      imei2: cleanText(deal.imei2),
      quantity: Math.max(1, Number(deal.quantity) || 1),
      price: 0,
    },
  ];
}

/** Ro'yxat uchun qisqa ko'rinish: birinchi mahsulot + qolganlari soni ("iPhone 15 +1") */
export function productSummary(deal: Deal): { first: string; extra: number; imei: string; full: string } {
  const items = dealItems(deal);
  if (!items.length) return { first: '', extra: 0, imei: '', full: '' };
  return {
    first: items[0].productName,
    extra: items.length - 1,
    imei: items[0].imei1,
    full: items.map((it) => it.productName).filter(Boolean).join(' + '),
  };
}

// --- Ruxsatlar (server qoidalarining ko'zgusi; yakuniy tekshiruv baribir serverda) ---

export function isScopedRole(role?: Role | string | null): boolean {
  return role === 'OPERATOR' || role === 'AGENT';
}

const EXPENSE_ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'CFO'];

export function canUseExpense(role?: Role | string | null): boolean {
  return !!role && EXPENSE_ROLES.includes(role);
}

export interface DealPermissions {
  edit: boolean;
  remove: boolean;
  approve: boolean;
  reject: boolean;
  expense: boolean;
}

export function dealPermissions(role: Role | string | null | undefined, deal: Deal): DealPermissions {
  const status = deal.approvalStatus || 'APPROVED';
  const scoped = isScopedRole(role);
  const admin = role === 'ADMIN';
  return {
    // OPERATOR/AGENT: faqat hali tasdiqlanmagan bitim
    edit: scoped ? status !== 'APPROVED' : role !== 'VIEWER',
    remove: admin || role === 'MANAGER' || (scoped && status === 'PENDING_APPROVAL'),
    approve: admin && status !== 'APPROVED',
    reject: admin && status === 'PENDING_APPROVAL',
    expense: canUseExpense(role) && status === 'APPROVED' && !deal.checkExpense,
  };
}
