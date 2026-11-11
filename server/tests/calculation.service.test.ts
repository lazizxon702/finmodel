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
