import { describe, it, expect } from 'vitest';
import {
  CalculationService,
  TRUST_RATE,
  balanceDelta,
  calcAgentCommission,
  calcCheckExpense,
  calcTrustDebt,
  canonicalAgencyName,
  canonicalProviderName,
  canonicalStoreName,
  countsInTotals,
  formatTashkentDateTime,
  initialApprovalStatus,
  isQodirStore,
  isTrustDeal,
  isTrustName,
  normalizeDealItems,
  summarizeTrustLedger,
} from '../src/services/calculation.service';
import {
  QODIR_PAYMENT_CATEGORY,
  STORE_INCOME_CATEGORY,
  STORE_LEDGER_START_YMD,
  calcStoreDebt,
  isOnOrAfterStoreLedgerStart,
  isQodirPaymentCategory,
  isStoreIncomeCategory,
  isTrustIncomeCategory,
  storeLedgerStartDate,
  storeSettlementKind,
  summarizeLedger,
} from '../src/services/calculation.service';

describe('Trust 16% qarzi', () => {
  it('10 000 000 yechilsa Trust qarzi 1 600 000', () => {
    expect(TRUST_RATE).toBe(0.16);
    expect(calcTrustDebt(10_000_000)).toBe(1_600_000);
  });

  it('0 yoki manfiy limitda qarz yo\'q', () => {
    expect(calcTrustDebt(0)).toBe(0);
    expect(calcTrustDebt(-5)).toBe(0);
  });

  it('Trust faqat aniq nom bo\'yicha aniqlanadi (substring emas)', () => {
    expect(isTrustName('Trust')).toBe(true);
    expect(isTrustName(' trust 1 ')).toBe(true);
    expect(isTrustName('TRUST  1')).toBe(true);
    expect(isTrustName('Trustbank')).toBe(false);
    expect(isTrustName('Entrust')).toBe(false);
    expect(isTrustName('Trust 12')).toBe(false);
    expect(isTrustDeal('Novza', 'Trust 1')).toBe(true);
    expect(isTrustDeal('Trust', 'Alif Online')).toBe(true);
    expect(isTrustDeal('Novza', 'Trustbank nasiya')).toBe(false);
  });

  it('calculateDeal Trust bitimida trustDebtAmount = 16% qaytaradi', () => {
    const r = CalculationService.calculateDeal({
      customerLimit: 12_000_000,
      withdrawnLimit: 10_000_000,
      calculatedAmount: 7_000_000,
      storeName: 'Trust',
      providerName: 'Trust 1',
    });
    expect(r.isTrust).toBe(true);
    expect(r.trustDebtAmount).toBe(1_600_000);
    // bitim foydasiga ham xuddi shu summa kiradi — "Sof foyda" va P&L zid kelmaydi
    expect(r.profit).toBe(1_600_000);
  });

  it('Trust bo\'lmagan bitimda Trust qarzi 0', () => {
    const r = CalculationService.calculateDeal({
      customerLimit: 12_000_000,
      withdrawnLimit: 10_000_000,
      calculatedAmount: 7_000_000,
      storeName: 'Novza',
      providerName: 'Trustbank',
    });
    expect(r.isTrust).toBe(false);
    expect(r.trustDebtAmount).toBe(0);
  });
});

describe('Trust hisob-kitobi (daftar)', () => {
  it('Trust bergan pul (DDS kirimi) qarzni kamaytiradi', () => {
    const afterDeal = summarizeTrustLedger([{ type: 'DEBT', amount: 1_600_000 }]);
    expect(afterDeal).toEqual({ totalDebt: 1_600_000, totalPaid: 0, balance: 1_600_000 });

    const afterPayment = summarizeTrustLedger([
      { type: 'DEBT', amount: 1_600_000 },
      { type: 'DEBT', amount: 800_000 },
      { type: 'PAYMENT', amount: 1_000_000 },
    ]);
    expect(afterPayment).toEqual({ totalDebt: 2_400_000, totalPaid: 1_000_000, balance: 1_400_000 });
  });

  it('Decimal/satr summalar bilan ham ishlaydi', () => {
    const r = summarizeTrustLedger([
      { type: 'DEBT', amount: '1600000' },
      { type: 'PAYMENT', amount: { toString: () => '600000.50' } },
    ]);
    expect(r.balance).toBe(999_999.5);
  });
});

describe('DDS → hisob qoldig\'i', () => {
  it('kirim ko\'paytiradi, chiqim kamaytiradi', () => {
    expect(balanceDelta('INCOME', 500_000)).toBe(500_000);
    expect(balanceDelta('EXPENSE', 500_000)).toBe(-500_000);
    // manfiy kiritilgan summa ishorani teskari qilmaydi
    expect(balanceDelta('EXPENSE', -500_000)).toBe(-500_000);
  });
});

describe('Chek xarajati (mijozga to\'lov)', () => {
  it('oddiy do\'konda mijozga berilgan summa xarajat bo\'ladi', () => {
    expect(calcCheckExpense({ calculatedAmount: 7_000_000, storeName: 'Novza' })).toBe(7_000_000);
  });

  it('Qodir aka cheki xarajatga olinmaydi (barcha yozilishlar)', () => {
    for (const name of ['Qodir aka', 'Qodir oka', 'qodir  AKA', 'Кодир ока', 'Кодир ака']) {
      expect(isQodirStore(name)).toBe(true);
      expect(calcCheckExpense({ calculatedAmount: 7_000_000, storeName: name })).toBe(0);
    }
    expect(isQodirStore('Qodirov do\'koni')).toBe(false);
  });

  it('0 summada xarajat yozilmaydi', () => {
    expect(calcCheckExpense({ calculatedAmount: 0, storeName: 'Novza' })).toBe(0);
  });
});

describe('Agent komissiyasi', () => {
  it('Yechilgan limit × (Xarid diskonti − Agent foizi)', () => {
    expect(calcAgentCommission(10_000_000, 0.3, 0.22)).toBe(800_000);
    expect(calcAgentCommission(10_000_000, 0.16, 0.16)).toBe(0);
  });

  it('calculateDeal dagi agentAmount shu formulaga teng', () => {
    const r = CalculationService.calculateDeal({
      customerLimit: 10_000_000,
      withdrawnLimit: 10_000_000,
      calculatedAmount: 7_000_000, // diskont 30%
      storeName: 'Novza',
      providerName: 'Alif nasiya', // agent foizi 22%
    });
    expect(r.purchaseDiscountPct).toBeCloseTo(0.3, 10);
    expect(r.agentAmount).toBeCloseTo(calcAgentCommission(10_000_000, 0.3, 0.22), 2);
    expect(r.totalPurchaseCost).toBeCloseTo(7_800_000, 2);
  });
});

describe('Ko\'p mahsulotli bitim', () => {
  it('ikki qurilma bitta chekka biriktiriladi', () => {
    const r = normalizeDealItems([
      { productName: 'iPhone 15', color: 'Black', storageGb: '128', imei1: '111', imei2: '112', price: 9_000_000 },
      { productName: 'Samsung TV 43', quantity: 2, price: 4_000_000 },
    ]);
    expect(r.items).toHaveLength(2);
    expect(r.quantity).toBe(3);
    expect(r.totalPrice).toBe(17_000_000);
    expect(r.productName).toBe('iPhone 15 + Samsung TV 43');
    // eski yagona maydonlar birinchi mahsulotdan olinadi — eski bitimlar buzilmaydi
    expect(r.imeiBarcode).toBe('111');
    expect(r.imei2).toBe('112');
    expect(r.items[1].position).toBe(1);
  });

  it('bo\'sh qatorlar tashlab yuboriladi, eski imeiBarcode maydoni ham tushuniladi', () => {
    const r = normalizeDealItems([{ productName: '  ' }, { productName: 'Redmi 13', imeiBarcode: '999' }]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].imei1).toBe('999');
    expect(r.quantity).toBe(1);
  });

  it('mahsulotsiz bitim ham ishlaydi', () => {
    const r = normalizeDealItems(undefined);
    expect(r.items).toEqual([]);
    expect(r.quantity).toBe(1);
    expect(r.productName).toBeNull();
  });
});

describe('Tasdiqlash', () => {
  it('operator/agent bitimi tasdiq kutadi, admin bitimi darhol tasdiqlangan', () => {
    expect(initialApprovalStatus('OPERATOR')).toBe('PENDING_APPROVAL');
    expect(initialApprovalStatus('AGENT')).toBe('PENDING_APPROVAL');
    expect(initialApprovalStatus('ADMIN')).toBe('APPROVED');
    expect(initialApprovalStatus('MANAGER')).toBe('APPROVED');
  });

  it('faqat tasdiqlangan bitim hisob-kitobga kiradi', () => {
    expect(countsInTotals('APPROVED')).toBe(true);
    expect(countsInTotals('PENDING_APPROVAL')).toBe(false);
    expect(countsInTotals('REJECTED')).toBe(false);
  });
});

describe('Spravochnik: yagona nomlar', () => {
  it('dublikatlar bitta nomga keltiriladi', () => {
    expect(canonicalStoreName('Qodir oka')).toBe('Qodir aka');
    expect(canonicalStoreName('Кодир ока')).toBe('Qodir aka');
    expect(canonicalStoreName('Green bazar')).toBe('Green Bazar');
    expect(canonicalProviderName('Imanium')).toBe('Imanum');
    expect(canonicalProviderName('imanum')).toBe('Imanum');
    expect(canonicalProviderName('Alif offline')).toBe('Alif Offline');
    expect(canonicalAgencyName('Назирбек')).toBe('Nazirbek');
    expect(canonicalAgencyName('Жахонгир')).toBe('Jahongir');
    expect(canonicalStoreName('Novza')).toBe('Novza');
  });
});

describe('Sana va vaqt (Asia/Tashkent)', () => {
  it('UTC vaqtni Toshkent vaqtiga o\'giradi', () => {
    expect(formatTashkentDateTime('2026-11-09T19:30:00.000Z')).toBe('10.11.2026 00:30');
    expect(formatTashkentDateTime('2026-11-09T07:05:00.000Z')).toBe('09.11.2026 12:05');
    expect(formatTashkentDateTime(null)).toBe('');
  });
});

describe("Do'konlar bilan hisob-kitob (do'kon daftari)", () => {
  const approved = { approvalStatus: 'APPROVED', date: '2026-11-11T07:00:00.000Z' };

  it("yo'nalish: Qodir aka — biz qarzdormiz, Trust — o'z daftari, qolganlar — do'kon qarzdor", () => {
    expect(storeSettlementKind('Qodir aka')).toBe('WE_OWE');
    expect(storeSettlementKind('Кодир ока')).toBe('WE_OWE');
    expect(storeSettlementKind('Trust')).toBe('TRUST');
    expect(storeSettlementKind('trust 1')).toBe('TRUST');
    expect(storeSettlementKind('Novza')).toBe('STORE_OWES');
    expect(storeSettlementKind('Trustbank')).toBe('STORE_OWES');
    expect(storeSettlementKind(null)).toBe('STORE_OWES');
  });

  it("qarz = mijozga berilgan summa — oddiy do'kon uchun ham, Qodir aka uchun ham", () => {
    expect(calcStoreDebt({ ...approved, calculatedAmount: 3_500_000, storeName: 'Novza' })).toBe(3_500_000);
    expect(calcStoreDebt({ ...approved, calculatedAmount: 2_000_000, storeName: 'Qodir oka' })).toBe(2_000_000);
    expect(calcStoreDebt({ ...approved, calculatedAmount: '1234.567', storeName: 'Angren' })).toBe(1234.57);
  });

  it("qarz yozilmaydi: tasdiqlanmagan, Trust do'koni, summa 0 yoki manfiy", () => {
    expect(calcStoreDebt({ ...approved, approvalStatus: 'PENDING_APPROVAL', calculatedAmount: 1_000_000, storeName: 'Novza' })).toBe(0);
    expect(calcStoreDebt({ ...approved, approvalStatus: 'REJECTED', calculatedAmount: 1_000_000, storeName: 'Novza' })).toBe(0);
    expect(calcStoreDebt({ ...approved, approvalStatus: undefined, calculatedAmount: 1_000_000, storeName: 'Novza' })).toBe(0);
    expect(calcStoreDebt({ ...approved, calculatedAmount: 1_000_000, storeName: 'Trust' })).toBe(0);
    expect(calcStoreDebt({ ...approved, calculatedAmount: 0, storeName: 'Novza' })).toBe(0);
    expect(calcStoreDebt({ ...approved, calculatedAmount: -5, storeName: 'Novza' })).toBe(0);
  });

  it('daftar 10.11.2026 (Toshkent) dan boshlanadi: undan oldingi bitimga qarz yozilmaydi', () => {
    expect(STORE_LEDGER_START_YMD).toBe('2026-11-10');
    expect(storeLedgerStartDate().toISOString()).toBe('2026-11-09T19:00:00.000Z');
    // 09.11.2026 23:59 (Toshkent) — oldin; 10.11.2026 00:00 (Toshkent) — ichida
    expect(isOnOrAfterStoreLedgerStart('2026-11-09T18:59:59.999Z')).toBe(false);
    expect(isOnOrAfterStoreLedgerStart('2026-11-09T19:00:00.000Z')).toBe(true);
    expect(isOnOrAfterStoreLedgerStart(null)).toBe(false);
    expect(isOnOrAfterStoreLedgerStart('bugun')).toBe(false);

    const base = { approvalStatus: 'APPROVED', calculatedAmount: 1_000_000, storeName: 'Novza' };
    expect(calcStoreDebt({ ...base, date: '2026-11-09T18:59:59.999Z' })).toBe(0);
    expect(calcStoreDebt({ ...base, date: '2026-11-09T19:00:00.000Z' })).toBe(1_000_000);
    expect(calcStoreDebt({ ...base, date: null })).toBe(0);
    // Boshlanish kuni almashtirilsa (egasi keyin o'zgartirishi mumkin) qoida shunga moslashadi
    expect(calcStoreDebt({ ...base, date: '2026-11-05T07:00:00.000Z', startYmd: '2026-11-01' })).toBe(1_000_000);
    expect(isOnOrAfterStoreLedgerStart('2026-11-11T07:00:00.000Z', '2026-12-01')).toBe(false);
  });

  it("DDS kategoriyalari: yozilish variantlari bilan taniladi, o'xshash nomlar adashtirilmaydi", () => {
    expect(isQodirPaymentCategory(QODIR_PAYMENT_CATEGORY)).toBe(true);
    expect(isQodirPaymentCategory("  qodir AKA  to`lovi ")).toBe(true);
    expect(isQodirPaymentCategory('Qodir akaga to‘lov')).toBe(true);
    expect(isQodirPaymentCategory('Qodir aka')).toBe(false);
    expect(isQodirPaymentCategory(null)).toBe(false);

    expect(isStoreIncomeCategory(STORE_INCOME_CATEGORY)).toBe(true);
    expect(isStoreIncomeCategory('DOʻKONDAN TUSHUM')).toBe(true);
    expect(isStoreIncomeCategory("Do'kon ijarasi")).toBe(false);
    expect(isStoreIncomeCategory('')).toBe(false);

    expect(isTrustIncomeCategory('Trust 1 daromadi')).toBe(true);
    expect(isTrustIncomeCategory(STORE_INCOME_CATEGORY)).toBe(false);
  });

  it("umumiy daftar yig'masi: qoldiq = qarz − to'langan; Trust yig'masi shu asosda", () => {
    expect(summarizeLedger([])).toEqual({ debt: 0, paid: 0, balance: 0 });
    const entries = [
      { type: 'DEBT', amount: 3_500_000 },
      { type: 'DEBT', amount: '1200000' },
      { type: 'PAYMENT', amount: 1_000_000 },
      { type: 'BOSHQA', amount: 999 },
    ];
    expect(summarizeLedger(entries)).toEqual({ debt: 4_700_000, paid: 1_000_000, balance: 3_700_000 });
    expect(summarizeTrustLedger(entries)).toEqual({ totalDebt: 4_700_000, totalPaid: 1_000_000, balance: 3_700_000 });
    // Ortiqcha to'lov — manfiy qoldiq (yashirilmaydi)
    expect(summarizeLedger([{ type: 'PAYMENT', amount: 500 }]).balance).toBe(-500);
  });
});
