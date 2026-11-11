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

export class CalculationService {
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
    if (s.includes('qodir')) return 0.22;

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
    if (p.includes('trust')) return 0.16;

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
      'media park angren', 'media park chilonzor', 'media park margulon', 'novza'
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
    const pLower = pName.toLowerCase();
    const qodirDebt = (sLower.includes('qodir aka') || sLower.includes('qodir oka')) ? calculated : 0;
    const qodirBalance = sLower.includes('qodir aka') ? withdrawn * 0.05 : 0;
    const greenBazarBalance = sLower.includes('green bazar') ? withdrawn * (1 - 0.30) : 0;
    const trustBalance = (sLower.includes('trust 1') || sLower.includes('trust') || pLower.includes('trust 1') || pLower.includes('trust')) ? withdrawn * (1 - 0.012) : 0;
    const totalExtraBalance = extraDaftar + qodirBalance + greenBazarBalance + trustBalance;

    // Sales and profit calculations
    const salePrice = Number(input.salePrice) || 0;
    const receivedFromBuyer = Number(input.receivedFromBuyer) || 0;

    // Rule 1: Qodir aka / oka yoki Green Bazar bo'lsa xarid summasidan 5% foydaga o'tkaziladi
    const isQodirOrGreen = sLower.includes('qodir') || sLower.includes('green bazar');
    const partnerBonus5Pct = isQodirOrGreen ? totalPurchaseCost * 0.05 : 0;

    // Rule 2: Trust 1 yoki Trust cheklaridan urilgan tranzaksiyalarda avtomatik tarzda 16% foydaga o'tishi kerak
    const isTrust = sLower.includes('trust 1') || sLower.includes('trust') || pLower.includes('trust 1') || pLower.includes('trust');
    const trustProfit16Pct = isTrust ? (withdrawn > 0 ? withdrawn * 0.16 : calculated * 0.16) : 0;

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
      totalExtraBalance,
      profit,
      marginPct,
      debtRemainder,
      paymentStatus,
    };
  }
}
