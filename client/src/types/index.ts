export type Role =
  | 'ADMIN'
  | 'MANAGER'
  | 'CASHIER'
  | 'OPERATOR'
  | 'VIEWER'
  | 'CFO'
  | 'COO'
  | 'CALL_CENTER_HEAD'
  | 'CALL_CENTER_AGENT'
  | 'STOREKEEPER'
  | 'SELLER'
  | 'HR_MANAGER'
  | 'AGENT';

export type DealStatus =
  | 'IN_WAREHOUSE'
  | 'SOLD'
  | 'IN_TRANSIT'
  | 'PENDING'
  | 'NEED_TO_BUY'
  | 'MONEY_RECEIVED'
  | 'PARTIAL_AMOUNT';

export type PaymentStatus = 'PAID' | 'DEBT' | 'PARTIAL';

// Bitimni tasdiqlash holati (operator kiritadi → agent/admin tasdiqlaydi)
export type ApprovalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  telegramId?: string;
  isActive: boolean;
  // Agentlik bog'lanishi (AGENT va uning OPERATORlari uchun)
  agencyId?: string | null;
  agencyName?: string | null;
  // Operator qaysi agentga tegishli
  parentAgentId?: string | null;
  // Telegram akkaunt ulanganmi
  telegramLinked?: boolean;
}

export interface Store {
  id: string;
  name: string;
  contactPhone?: string;
  address?: string;
}

export interface Provider {
  id: string;
  name: string;
  defaultDiscount: number;
  isDaftarDefault: boolean;
}

export interface Agency {
  id: string;
  name: string;
  phone?: string;
  agents?: Agent[];
}

export interface Agent {
  id: string;
  agencyId: string;
  name: string;
  phone?: string;
}

export interface Buyer {
  id: string;
  name: string;
  phone?: string;
  isWholesale: boolean;
}

export interface Partner {
  id: string;
  name: string;
  phone?: string;
}

export interface CommissionRule {
  id: string;
  name: string;
  storeId?: string;
  store?: Store;
  providerId?: string;
  provider?: Provider;
  ratePercent: number;
  priority: number;
  isActive: boolean;
}

// Bitim ichidagi tovar qatori
export interface DealItem {
  id: string;
  position: number;
  productName: string;
  color?: string | null;
  storageGb?: number | null;
  imei1?: string | null;
  imei2?: string | null;
  quantity: number;
  price: number;
  /** Server imei1 ni eski nom bilan ham qaytaradi */
  imeiBarcode?: string | null;
}

export interface Deal {
  id: string;
  dealNumber: number;
  date: string;
  sellerName: string;
  providerId: string;
  provider?: Provider;
  isDaftar: boolean;
  customerName?: string;
  customerPhone1?: string;
  customerPhone2?: string;
  contractUrl?: string;
  passportPhotoUrl?: string;
  storeId: string;
  store?: Store;
  customerLimit: number;
  withdrawnLimit: number;
  agentAmount: number;
  totalPurchaseCost: number;
  purchaseDiscountPct: number;
  agentPct: number;
  calculatedAmount: number;
  remainingLimit: number;
  differenceAmount: number;
  isActualDeviceSale: boolean;
  productName?: string;
  quantity: number;
  imeiBarcode?: string;
  status: DealStatus;
  agencyId?: string;
  agency?: Agency;
  agentId?: string;
  agent?: Agent;
  extraDaftar: number;
  qodirDebt: number;
  qodirBalance: number;
  greenBazarBalance: number;
  trustBalance: number;
  totalExtraBalance: number;
  buyerId?: string;
  buyer?: Buyer;
  saleDate?: string;
  salePrice: number;
  paidTransfer: number;
  paidCashUzs: number;
  paidCashUsd: number;
  paidBank: number;
  exchangeRate: number;
  profit: number;
  marginPct: number;
  receivedFromBuyer: number;
  debtRemainder: number;
  paymentStatus: PaymentStatus;
  note?: string;
  // --- Tasdiqlash va Trust ---
  approvalStatus?: ApprovalStatus;
  approvedAt?: string | null;
  rejectReason?: string | null;
  trustDebtAmount?: number;
  /** Server tayyorlab beradigan "DD.MM.YYYY HH:mm" (Asia/Tashkent) */
  dateTimeLabel?: string;
  imei2?: string | null;
  items?: DealItem[];
  createdBy?: { id: string; fullName: string; role: Role } | null;
  // --- Bitimlar sahifasi uchun qo'shimcha (server serializeDeal qaytaradi) ---
  /** Bitim kuni "YYYY-MM-DD" (Asia/Tashkent) — tahrir formasi uchun */
  dateYmd?: string;
  approvedBy?: { id: string; fullName: string; role: Role } | null;
  /** DDS'ga yozilgan chek xarajati (yo'q bo'lsa null) */
  checkExpense?: {
    id: string;
    txNumber: string;
    amount: number;
    account: 'CASH' | 'BANK_CARD' | 'SETTLEMENT_ACCOUNT';
    dateTime: string;
  } | null;
  color?: string | null;
  statusChangeReason?: string | null;
  debtDueDate?: string | null;
  createdAt?: string;
}

export interface DdsTransaction {
  id: string;
  txNumber: string;
  dateTime: string;
  type: 'INCOME' | 'EXPENSE';
  account: 'CASH' | 'BANK_CARD' | 'SETTLEMENT_ACCOUNT';
  expenseType: 'COGS' | 'OPEX' | 'INCOME_TRANSFER';
  categoryName: string;
  sourcePerson: string;
  amount: number;
  description?: string;
  // Server qo'shimcha maydonlari (GET /api/dds)
  /** DD.MM.YYYY HH:mm (Asia/Tashkent) */
  dateTimeLabel?: string;
  /** Yozuv manbasi */
  source?: 'MANUAL' | 'DEAL_CHECK' | 'TRUST_PAYMENT' | 'SYNC';
  dealId?: string | null;
  deal?: { id: string; dealNumber: number | string } | null;
}

export interface DebtRecord {
  id: string;
  debtorName: string;
  roleDescription?: string;
  telegram?: string;
  contactPhone?: string;
  amountUsd: number;
  amountUzs: number;
  remainingAmount: number;
  note?: string;
  weOwe: boolean;
  isConfirmed: boolean;
  debtReason?: string;
  contractDate?: string;
  repaymentDate?: string;
}

export interface HandoverChecklist {
  id: string;
  orderNum: number;
  title: string;
  comment?: string;
  status: string;
  actDone: boolean;
  applicationTaken: boolean;
}

export interface StaffKPIPlan {
  id: string;
  roleName: string;
  reportType: string;
  reportFormat: string;
  kpiDetails: string;
}

export interface EmployeeSalary {
  id: string;
  employeeName: string;
  position: string;
  baseSalary: number;
  bonusAmount: number;
  totalAmount: number;
  paymentDate?: string;
  isPaid: boolean;
  note?: string;
}
