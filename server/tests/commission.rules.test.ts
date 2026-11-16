import { describe, it, expect } from 'vitest';
import { DealStatus } from '@prisma/client';
import {
  CalculationService,
  CommissionRuleItem,
  DEFAULT_COMMISSION_RULES,
  calcAgentCommission,
  calcExpectedProfit,
  calcStoreDebt,
  calcStoreDebtParts,
  summarizeDaftar,
  resolveCommission,
  storeSettlementKind,
  summarizeLedger,
} from '../src/services/calculation.service';

// 14.11.2026 egasi qarorlari: kompaniya ulushi (rate), bizning foydamiz (profitRate), agent foydasi, kutilayotgan foyda.
// Barcha foizlar ulush ko'rinishida (0.22 = 22%).

const rate = (store: string | null, provider: string | null, date?: string | null, rules: CommissionRuleItem[] = []) =>
  resolveCommission(store, provider, rules, date);

describe('resolveCommission: standart ro\'yxat (spravochnik bo\'sh)', () => {
  it("do'konlar: Qodir aka 22% (bizniki 6%), Green Bazar 30%, Tursunqulova Shahlo 22%, Trust 16%", () => {
    expect(rate('Qodir aka', 'Boshqa')).toMatchObject({ rate: 0.22, profitRate: 0.06, source: 'DEFAULT' });
    expect(rate('Qodir oka', 'Boshqa')).toMatchObject({ rate: 0.22, profitRate: 0.06 });
    expect(rate('Кодир ока', 'Boshqa')).toMatchObject({ rate: 0.22, profitRate: 0.06 });
    expect(rate('Green Bazar', 'Boshqa')).toMatchObject({ rate: 0.3, profitRate: 0.3 });
    expect(rate('green bazar', 'Boshqa')).toMatchObject({ rate: 0.3 });
    expect(rate('Tursunqulova Shahlo', 'Boshqa')).toMatchObject({ rate: 0.22, profitRate: 0.22 });
    expect(rate('Tursunquruva shaxlo', 'Boshqa')).toMatchObject({ rate: 0.22 });
    expect(rate('Trust', 'Boshqa')).toMatchObject({ rate: 0.16, profitRate: 0.16 });
    expect(rate('Trust 1', 'Boshqa')).toMatchObject({ rate: 0.16 });
  });

  it('Qodir aka: Alif orqali foydamiz 5%, Finsum va boshqalar 6% (egasi, 16.11.2026)', () => {
    for (const p of ['Alif Offline', 'Alif Online', 'Alif nasiya', 'alif of']) {
      expect(rate('Qodir aka', p), p).toMatchObject({ rate: 0.22, profitRate: 0.05 });
    }
    expect(rate('Qodir aka', 'Finsum Nasiya')).toMatchObject({ rate: 0.22, profitRate: 0.06 });
    // spravochnik qoidasi (22 / 6) bo'lsa ham Alif 5%
    const rules: CommissionRuleItem[] = [{ storeName: 'Qodir aka', ratePercent: 0.22, profitPercent: 0.06 } as CommissionRuleItem];
    expect(rate('Qodir aka', 'Alif Offline', null, rules)).toMatchObject({ rate: 0.22, profitRate: 0.05, source: 'RULE' });
    expect(rate('Qodir aka', 'Finsum', null, rules)).toMatchObject({ profitRate: 0.06 });
    // boshqa do'konda Alif o'zgarmaydi
    expect(rate('Novza', 'Alif Offline').profitRate).toBe(0.22);
  });

  it('provayderlar: har bir qator standart ro\'yxatdagidek', () => {
    const cases: [string, number][] = [
      ['6 oylik Alif', 0.35],
      ['Alif Online', 0.27],
      ['Alif Offline', 0.22],
      ['alif offline', 0.22],
      ['Alif nasiya', 0.22],
      ['Variant offline', 0.22],
      ['Variant (online)', 0.27],
      ['Variant', 0.27],
      ['Trust 1', 0.16],
      ['Trust', 0.16],
      ['Payme', 0.2],
      ['Infin Bank', 0.15],
      ['Paylater offline', 0.22],
      ['Paylater online', 0.27],
      ['Payletar online', 0.27],
      ['Finsum', 0.22],
      ['Finsum Nasiya', 0.22],
    ];
    for (const [provider, expected] of cases) {
      const r = rate('Novza', provider, '2026-11-14T07:00:00.000Z');
      expect(r.rate, provider).toBe(expected);
      expect(r.profitRate, provider).toBe(expected); // profit foizi berilmasa = ulush
      expect(r.source, provider).toBe('DEFAULT');
    }
  });

  it("noma'lum do'kon va provayder — ulush 0, manba NONE", () => {
    expect(rate('Novza', 'Noma\'lum')).toEqual({ rate: 0, profitRate: 0, source: 'NONE' });
    expect(rate(null, null)).toEqual({ rate: 0, profitRate: 0, source: 'NONE' });
  });

  it('"Trustbank" Trust emas (do\'kon ham, provayder ham)', () => {
    expect(rate('Trustbank', 'Boshqa').source).toBe('NONE');
    expect(rate('Novza', 'Trustbank')).toEqual({ rate: 0, profitRate: 0, source: 'NONE' });
    expect(rate('Entrust', 'Entrust 1').rate).toBe(0);
  });

  it("standart ro'yxatda Imanum uchun ikkita davr bor (22% gacha, 25% dan)", () => {
    const imanum = DEFAULT_COMMISSION_RULES.filter((r) => r.name === 'Imanum');
    expect(imanum).toHaveLength(2);
    expect(imanum.map((r) => r.ratePercent).sort()).toEqual([0.22, 0.25]);
  });
});

describe('resolveCommission: Imanum 03.11 / 04.11.2026 (Asia/Tashkent)', () => {
  it('03.11.2026 va undan oldin — 22%', () => {
    expect(rate('Novza', 'Imanum', '2026-11-03T00:00:00.000Z').rate).toBe(0.22);
    expect(rate('Novza', 'Imanum', '2026-10-15T07:00:00.000Z').rate).toBe(0.22);
    expect(rate('Novza', 'Imanium', '2026-11-02T07:00:00.000Z').rate).toBe(0.22);
  });

  it('04.11.2026 va undan keyin — 25%', () => {
    expect(rate('Novza', 'Imanum', '2026-11-04T00:00:00.000Z').rate).toBe(0.25); // 05:00 Toshkent, 04.11
    expect(rate('Novza', 'Imanum', '2026-11-10T07:00:00.000Z').rate).toBe(0.25);
    expect(rate('Novza', 'Imaniom', '2026-11-14T07:00:00.000Z').rate).toBe(0.25);
  });

  it('Toshkent kechqurun oralig\'i: 03.11 23:59:59.999 hali 22%, 04.11 00:00 dan 25%', () => {
    expect(rate('Novza', 'Imanum', '2026-11-03T18:00:00.000Z').rate).toBe(0.22); // 03.11 23:00
    expect(rate('Novza', 'Imanum', '2026-11-03T18:59:59.999Z').rate).toBe(0.22); // 03.11 23:59:59.999
    expect(rate('Novza', 'Imanum', '2026-11-03T19:00:00.000Z').rate).toBe(0.25); // 04.11 00:00
    expect(rate('Novza', 'Imanum', '2026-11-03T20:00:00.000Z').rate).toBe(0.25); // 04.11 01:00
    expect(rate('Novza', 'Imanum', '2026-11-04T19:30:00.000Z').rate).toBe(0.25); // 05.11 00:30
  });

  it('sana Date obyekti bo\'lsa ham xuddi shunday', () => {
    expect(resolveCommission('Novza', 'Imanum', [], new Date('2026-11-03T18:59:59.999Z')).rate).toBe(0.22);
    expect(resolveCommission('Novza', 'Imanum', [], new Date('2026-11-03T19:00:00.000Z')).rate).toBe(0.25);
  });

  it("do'kon qoidasi Imanum davridan ustun: Qodir aka + Imanum = 22%", () => {
    expect(rate('Qodir aka', 'Imanum', '2026-11-10T07:00:00.000Z')).toMatchObject({ rate: 0.22, profitRate: 0.06 });
  });
});

describe('resolveCommission: tanlash tartibi', () => {
  it("do'kon qoidasi provayder qoidasidan ustun (standart): Green Bazar + Alif Online = 30%, Trust do'koni + Imanum = 16%", () => {
    expect(rate('Green Bazar', 'Alif Online').rate).toBe(0.3);
    expect(rate('Trust', 'Imanum', '2026-11-10T07:00:00.000Z').rate).toBe(0.16);
  });

  it("spravochnik qoidasi standartdan ustun va source = RULE", () => {
    const rules: CommissionRuleItem[] = [{ providerName: 'Imanum', ratePercent: 0.3, priority: 0 }];
    const r = rate('Novza', 'Imanum', '2026-11-10T07:00:00.000Z', rules);
    expect(r).toMatchObject({ rate: 0.3, profitRate: 0.3, source: 'RULE' });
    // Mos kelmaydigan qoida — standartga qaytadi
    expect(rate('Novza', 'Payme', '2026-11-10T07:00:00.000Z', rules)).toMatchObject({ rate: 0.2, source: 'DEFAULT' });
  });

  it("spravochnik qoidasida profitPercent berilsa — alohida, berilmasa — ulushga teng", () => {
    expect(rate('Novza', 'Payme', null, [{ providerName: 'Payme', ratePercent: 0.25, profitPercent: 0.1, priority: 0 }])).toMatchObject({
      rate: 0.25,
      profitRate: 0.1,
    });
    expect(rate('Novza', 'Payme', null, [{ providerName: 'Payme', ratePercent: 0.25, profitPercent: null, priority: 0 }]).profitRate).toBe(0.25);
    expect(rate('Novza', 'Payme', null, [{ providerName: 'Payme', ratePercent: 0.25, profitPercent: 0, priority: 0 }]).profitRate).toBe(0);
  });

  it("ustuvorlik (priority) birinchi: balandroq ustuvorlikdagi provayder qoidasi do'kon qoidasidan ustun", () => {
    const rules: CommissionRuleItem[] = [
      { storeName: 'Novza', ratePercent: 0.1, priority: 0 },
      { providerName: 'Alif Online', ratePercent: 0.33, priority: 5 },
    ];
    expect(rate('Novza', 'Alif Online', null, rules).rate).toBe(0.33);
  });

  it("ustuvorlik teng bo'lsa do'kon qoidasi provayder qoidasidan ustun", () => {
    const rules: CommissionRuleItem[] = [
      { providerName: 'Alif Online', ratePercent: 0.33, priority: 1 },
      { storeName: 'Novza', ratePercent: 0.1, priority: 1 },
    ];
    expect(rate('Novza', 'Alif Online', null, rules).rate).toBe(0.1);
    // Boshqa do'konda do'kon qoidasi mos kelmaydi — provayder qoidasi ishlaydi
    expect(rate('Angren', 'Alif Online', null, rules).rate).toBe(0.33);
  });

  it("aniqroq (uzunroq) nom ustun: 'Alif Online' qoidasi 'Alif' qoidasidan", () => {
    const rules: CommissionRuleItem[] = [
      { providerName: 'Alif', ratePercent: 0.1, priority: 0 },
      { providerName: 'Alif Online', ratePercent: 0.4, priority: 0 },
    ];
    expect(rate('Novza', 'Alif Online', null, rules).rate).toBe(0.4);
    expect(rate('Novza', 'Alif nasiya', null, rules).rate).toBe(0.1);
  });

  it("qoidada do'kon ham, provayder ham bo'lsa — IKKALASI mos kelishi shart", () => {
    const rules: CommissionRuleItem[] = [{ storeName: 'Novza', providerName: 'Alif Online', ratePercent: 0.2, priority: 0 }];
    expect(rate('Novza', 'Alif Online', null, rules)).toMatchObject({ rate: 0.2, source: 'RULE' });
    // Faqat bittasi mos — spravochnik qoidasi ishlamaydi, standart (Alif Online 27%) qoladi
    expect(rate('Chilonzor', 'Alif Online', null, rules)).toMatchObject({ rate: 0.27, source: 'DEFAULT' });
    expect(rate('Novza', 'Payme', null, rules)).toMatchObject({ rate: 0.2, source: 'DEFAULT' });
    expect(rate('Novza', 'Payme', null, rules).rate).toBe(0.2);
  });

  it("do'kon+provayder qoidasi faqat-do'kon qoidasidan aniqroq (uzunroq nom) bo'lib ustun", () => {
    const rules: CommissionRuleItem[] = [
      { storeName: 'Novza', ratePercent: 0.1, priority: 0 },
      { storeName: 'Novza', providerName: 'Alif Online', ratePercent: 0.2, priority: 0 },
    ];
    expect(rate('Novza', 'Alif Online', null, rules).rate).toBe(0.2);
    expect(rate('Novza', 'Payme', null, rules).rate).toBe(0.1);
  });

  it("do'kon spravochnikda kanonik nom bilan solishtiriladi (Qodir oka = Qodir aka)", () => {
    const rules: CommissionRuleItem[] = [{ storeName: 'Qodir aka', ratePercent: 0.5, profitPercent: 0.2, priority: 0 }];
    expect(rate('Qodir oka', 'Payme', null, rules)).toMatchObject({ rate: 0.5, profitRate: 0.2, source: 'RULE' });
  });
});

describe('resolveCommission: sanali spravochnik qoidalari', () => {
  const dated: CommissionRuleItem[] = [
    { providerName: 'Payme', ratePercent: 0.5, priority: 0, validFrom: '2026-12-01T00:00:00+05:00', validTo: '2026-12-31T23:59:59.999+05:00' },
  ];

  it('davr ichida ishlaydi (chegaralar ham kiradi), tashqarisida — standart', () => {
    expect(rate('Novza', 'Payme', '2026-12-15T07:00:00.000Z', dated)).toMatchObject({ rate: 0.5, source: 'RULE' });
    expect(rate('Novza', 'Payme', '2026-11-30T19:00:00.000Z', dated).rate).toBe(0.5); // 01.12 00:00 Toshkent
    expect(rate('Novza', 'Payme', '2026-12-31T18:59:59.999Z', dated).rate).toBe(0.5); // 31.12 23:59:59.999 Toshkent
    expect(rate('Novza', 'Payme', '2026-11-30T18:59:59.999Z', dated)).toMatchObject({ rate: 0.2, source: 'DEFAULT' });
    expect(rate('Novza', 'Payme', '2026-12-31T19:00:00.000Z', dated)).toMatchObject({ rate: 0.2, source: 'DEFAULT' });
  });

  it("faqat validFrom yoki faqat validTo bilan ham ishlaydi", () => {
    const from: CommissionRuleItem[] = [{ providerName: 'Payme', ratePercent: 0.3, priority: 0, validFrom: '2026-12-01T00:00:00+05:00' }];
    expect(rate('Novza', 'Payme', '2027-03-01T07:00:00.000Z', from).rate).toBe(0.3);
    expect(rate('Novza', 'Payme', '2026-11-20T07:00:00.000Z', from).rate).toBe(0.2);
    const to: CommissionRuleItem[] = [{ providerName: 'Payme', ratePercent: 0.3, priority: 0, validTo: '2026-12-01T00:00:00+05:00' }];
    expect(rate('Novza', 'Payme', '2026-11-20T07:00:00.000Z', to).rate).toBe(0.3);
    expect(rate('Novza', 'Payme', '2026-12-05T07:00:00.000Z', to).rate).toBe(0.2);
  });

  it('sanali qoida sanasiz qoidadan ustun; sanalilar ichida kechroq boshlangani', () => {
    const rules: CommissionRuleItem[] = [
      { providerName: 'Payme', ratePercent: 0.1, priority: 0 },
      { providerName: 'Payme', ratePercent: 0.2, priority: 0, validFrom: '2026-11-01T00:00:00+05:00' },
      { providerName: 'Payme', ratePercent: 0.3, priority: 0, validFrom: '2026-11-10T00:00:00+05:00' },
    ];
    expect(rate('Novza', 'Payme', '2026-11-12T07:00:00.000Z', rules).rate).toBe(0.3);
    expect(rate('Novza', 'Payme', '2026-11-05T07:00:00.000Z', rules).rate).toBe(0.2);
    expect(rate('Novza', 'Payme', '2026-10-05T07:00:00.000Z', rules).rate).toBe(0.1);
  });
});

describe('Agent foydasi va kutilayotgan foyda', () => {
  it('calcAgentCommission = limit × (diskont − ulush), manfiy emas', () => {
    expect(calcAgentCommission(10_000_000, 0.3, 0.25)).toBe(500_000);
    expect(calcAgentCommission(10_000_000, 0.3, 0.22)).toBe(800_000);
    expect(calcAgentCommission(10_000_000, 0.1, 0.25)).toBe(0);
    expect(calcAgentCommission(0, 0.3, 0.25)).toBe(0);
  });

  it('calcExpectedProfit: limit × (min(diskont, ulush) − (ulush − profit foizi)), manfiy emas', () => {
    expect(calcExpectedProfit(10_000_000, 0.3, 0.25, 0.25)).toBe(2_500_000);
    expect(calcExpectedProfit(10_000_000, 0.3, 0.22, 0.06)).toBe(600_000);
    // Diskont ulushdan kichik: foyda = limit × diskont
    expect(calcExpectedProfit(10_000_000, 0.1, 0.25, 0.25)).toBe(1_000_000);
    // Qodir aka: diskont 10% — hamkor ulushi (16%) ham qoplanmaydi → 0, manfiy emas
    expect(calcExpectedProfit(10_000_000, 0.1, 0.22, 0.06)).toBe(0);
    expect(calcExpectedProfit(0, 0.3, 0.25, 0.25)).toBe(0);
  });

  it("calculateDeal: diskont ulushdan kichik bo'lsa agent 0, foyda manfiy emas", () => {
    const r = CalculationService.calculateDeal({
      customerLimit: 10_000_000,
      withdrawnLimit: 10_000_000,
      calculatedAmount: 9_000_000,
      storeName: 'Novza',
      providerName: 'Imanum',
      isDaftarManual: false,
      date: '2026-11-10T07:00:00.000Z',
    });
    expect(r.agentAmount).toBe(0);
    expect(r.expectedProfit).toBe(1_000_000);
    expect(r.profit).toBe(1_000_000);

    const q = CalculationService.calculateDeal({
      customerLimit: 10_000_000,
      withdrawnLimit: 10_000_000,
      calculatedAmount: 9_000_000,
      storeName: 'Qodir aka',
      providerName: 'Alif Online',
      date: '2026-11-10T07:00:00.000Z',
    });
    expect(q.agentAmount).toBe(0);
    expect(q.expectedProfit).toBe(0);
    expect(q.profit).toBe(0);
  });
});

describe('calculateDeal: ishlangan misollar (limit 10 000 000, mijozga 7 000 000)', () => {
  const base = { customerLimit: 10_000_000, withdrawnLimit: 10_000_000, calculatedAmount: 7_000_000 };

  it('Imanum, 04.11.2026 dan keyin: agent 500 000, foyda 2 500 000', () => {
    for (const date of ['2026-11-04T00:00:00.000Z', '2026-11-03T19:00:00.000Z', '2026-11-12T07:00:00.000Z']) {
      const r = CalculationService.calculateDeal({
        ...base,
        storeName: 'Novza',
        providerName: 'Imanum',
        isDaftarManual: false,
        status: DealStatus.MONEY_RECEIVED,
        date,
      });
      expect(r.companyRate, date).toBe(0.25);
      expect(r.agentAmount, date).toBeCloseTo(500_000, 2);
      expect(r.expectedProfit, date).toBeCloseTo(2_500_000, 2);
      expect(r.profit, date).toBeCloseTo(2_500_000, 2);
      expect(r.totalPurchaseCost, date).toBeCloseTo(7_500_000, 2);
    }
  });

  it('Imanum, 03.11.2026 gacha: ulush 22% — agent 800 000, foyda 2 200 000', () => {
    for (const date of ['2026-11-03T00:00:00.000Z', '2026-11-03T18:59:59.999Z']) {
      const r = CalculationService.calculateDeal({
        ...base,
        storeName: 'Novza',
        providerName: 'Imanum',
        isDaftarManual: false,
        date,
      });
      expect(r.companyRate, date).toBe(0.22);
      expect(r.agentAmount, date).toBeCloseTo(800_000, 2);
      expect(r.expectedProfit, date).toBeCloseTo(2_200_000, 2);
    }
  });

  it('Qodir aka do\'koni: agent 800 000, foyda 600 000 (22% dan 6% bizniki)', () => {
    const r = CalculationService.calculateDeal({
      ...base,
      storeName: 'Qodir aka',
      providerName: 'Imanum',
      isDaftarManual: false,
      date: '2026-11-11T07:00:00.000Z',
    });
    expect(r.companyRate).toBe(0.22);
    expect(r.profitRate).toBe(0.06);
    expect(r.agentAmount).toBeCloseTo(800_000, 2);
    expect(r.expectedProfit).toBeCloseTo(600_000, 2);
    expect(r.profit).toBeCloseTo(600_000, 2);

    // Qarz tarkibi: chek 7 000 000 + agent 800 000 + foyda 600 000 = 8 400 000
    const parts = calcStoreDebtParts({
      calculatedAmount: 7_000_000,
      agentAmount: r.agentAmount,
      expectedProfit: r.expectedProfit,
      storeName: 'Qodir aka',
      approvalStatus: 'APPROVED',
      date: '2026-11-11T07:00:00.000Z',
    });
    expect(parts.check).toBe(7_000_000);
    expect(parts.agent).toBeCloseTo(800_000, 2);
    expect(parts.profit).toBeCloseTo(600_000, 2);
    expect(parts.total).toBeCloseTo(8_400_000, 2);
  });

  it("Trust: foyda oddiy qoida bo'yicha limitning 16% i (ustiga qo'shilmaydi), trustDebtAmount = limit × 16%", () => {
    const r = CalculationService.calculateDeal({
      ...base,
      calculatedAmount: 8_000_000,
      storeName: 'Trust',
      providerName: 'Alif Online',
      isDaftarManual: false,
      date: '2026-11-11T07:00:00.000Z',
    });
    expect(r.isTrust).toBe(true);
    expect(r.companyRate).toBe(0.16);
    expect(r.trustDebtAmount).toBe(1_600_000);
    expect(r.expectedProfit).toBeCloseTo(1_600_000, 2);
    expect(r.profit).toBeCloseTo(1_600_000, 2);

    // Provayderi Trust 1 bo'lgan oddiy do'kon bitimi ham xuddi shunday
    const p = CalculationService.calculateDeal({
      ...base,
      calculatedAmount: 8_000_000,
      storeName: 'Novza',
      providerName: 'Trust 1',
      isDaftarManual: false,
      date: '2026-11-11T07:00:00.000Z',
    });
    expect(p.trustDebtAmount).toBe(1_600_000);
    expect(p.profit).toBeCloseTo(1_600_000, 2);
  });

  it('"5% hamkor bonusi" yo\'q: Green Bazar bitimi — foyda faqat qoida bo\'yicha', () => {
    const r = CalculationService.calculateDeal({
      ...base,
      calculatedAmount: 6_000_000, // diskont 40%
      storeName: 'Green Bazar',
      providerName: 'Alif Online',
      isDaftarManual: false,
      date: '2026-11-12T07:00:00.000Z', // 01–11.11 jadvalga tenglashtirilgan (Green Bazar 35%), 12.11 dan 30%
    });
    expect(r.companyRate).toBe(0.3);
    expect(r.agentAmount).toBeCloseTo(1_000_000, 2);
    expect(r.profit).toBeCloseTo(3_000_000, 2);
  });
});

describe('calculateDeal: daftar (Imanum) — foyda pul tushguncha kechiktiriladi', () => {
  const deal = {
    customerLimit: 10_000_000,
    withdrawnLimit: 10_000_000,
    calculatedAmount: 7_000_000,
    storeName: 'Denov', // Daftar "Ha" faqat Imanum + Denov/Jizzax
    providerName: 'Imanum',
    date: '2026-11-10T07:00:00.000Z',
  };

  it("daftar va pul tushmagan (PENDING / IN_WAREHOUSE / NEED_TO_BUY) — foyda 0, profitDeferred, kutilayotgani saqlanadi", () => {
    for (const status of [DealStatus.PENDING, DealStatus.IN_WAREHOUSE, DealStatus.NEED_TO_BUY]) {
      const r = CalculationService.calculateDeal({ ...deal, status });
      expect(r.isDaftar, status).toBe(true);
      expect(r.profitDeferred, status).toBe(true);
      expect(r.profit, status).toBe(0);
      expect(r.expectedProfit, status).toBeCloseTo(2_500_000, 2);
    }
    // Holat berilmasa (standart PENDING / NEED_TO_BUY) ham
    expect(CalculationService.calculateDeal(deal).profit).toBe(0);
  });

  it("daftar: foyda/zarar faqat qurilma SOTILGACH = sotilgan narx − kompaniya sarflagani (egasi, 15.11.2026)", () => {
    // "Pul tushdi" (2-bosqich) va "qurilma olindi" (3-bosqich) — hali foyda yo'q
    for (const status of [DealStatus.MONEY_RECEIVED, DealStatus.IN_WAREHOUSE]) {
      const r = CalculationService.calculateDeal({ ...deal, status });
      expect(r.profitDeferred, status).toBe(true);
      expect(r.profit, status).toBe(0);
    }
    // limit 10 mln, mijozga 7 mln + agent 0.5 mln = 7.5 mln sarflandi; qurilma 9 mln ga sotildi → +1.5 mln
    const sold = CalculationService.calculateDeal({ ...deal, status: DealStatus.SOLD, salePrice: 9_000_000, receivedFromBuyer: 9_000_000 });
    expect(sold.profitDeferred).toBe(false);
    expect(sold.profit).toBeCloseTo(1_500_000, 2);
    // 7 mln ga sotilsa — zarar
    expect(CalculationService.calculateDeal({ ...deal, status: DealStatus.SOLD, salePrice: 7_000_000 }).profit).toBeCloseTo(-500_000, 2);
  });

  it('summarizeDaftar: tovar olingan, sotilgan, foyda, tovar olish kerak, qoldiqlar', () => {
    const base = { withdrawnLimit: 10_000_000, calculatedAmount: 7_000_000, agentAmount: 500_000, totalPurchaseCost: 7_500_000, devicePurchaseAmount: 0, salePrice: 0, receivedFromBuyer: 0, debtRemainder: 0 };
    const s = summarizeDaftar([
      { ...base, status: 'NEED_TO_BUY' }, // 1: chek urildi
      { ...base, status: 'MONEY_RECEIVED' }, // 2: pul tushdi
      { ...base, status: 'IN_WAREHOUSE', devicePurchaseAmount: 9_800_000 }, // 3: qurilma olindi
      { ...base, status: 'SOLD', devicePurchaseAmount: 9_900_000, salePrice: 9_000_000, receivedFromBuyer: 6_000_000, debtRemainder: 3_000_000 }, // 4: sotildi
    ]);
    expect(s.stages).toEqual({ CHEQUE: 1, MONEY: 1, DEVICE: 1, SOLD: 1 });
    expect(s.bought).toEqual({ count: 2, amount: 19_700_000, missingPrice: 0 });
    expect(s.sold).toMatchObject({ count: 1, salePrice: 9_000_000, received: 6_000_000 });
    expect(s.profit).toBe(1_500_000);
    expect(s.needToBuy).toMatchObject({ count: 2, limit: 20_000_000, awaitingMoneyCount: 1, readyCount: 1 });
    expect(s.balances).toEqual({ limitLeft: 20_000_000, inStock: 9_800_000, inStockCount: 1, buyerDebt: 3_000_000, cash: 6_000_000 - 30_000_000 });
  });

  it("Daftar faqat Imanum + Denov/Jizzax: qo'lda belgilash e'tiborga olinmaydi", () => {
    // Alif Online — qo'lda "Ha" qilinsa ham daftar emas
    const alif = CalculationService.calculateDeal({ ...deal, providerName: 'Alif Online', isDaftarManual: true, status: DealStatus.PENDING });
    expect(alif.isDaftar).toBe(false);
    expect(alif.profitDeferred).toBe(false);
    // Imanum, lekin do'kon Novza — daftar emas
    const novza = CalculationService.calculateDeal({ ...deal, storeName: 'Novza', status: DealStatus.PENDING });
    expect(novza.isDaftar).toBe(false);
    expect(novza.profit).toBeCloseTo(2_500_000, 2);
    // Imanum + Jizzax — daftar; qo'lda "Yo'q" qilinsa ham
    const jizzax = CalculationService.calculateDeal({ ...deal, storeName: 'Jizzax', isDaftarManual: false, status: DealStatus.PENDING });
    expect(jizzax.isDaftar).toBe(true);
    expect(jizzax.profit).toBe(0);
    expect(CalculationService.isDaftarDeal('Денов', 'Imanium')).toBe(true);
    expect(CalculationService.isDaftarDeal('Denov', 'Iman daftar')).toBe(true);
    expect(CalculationService.isDaftarDeal('Novza', 'Iman daftar')).toBe(false);
  });

  it('daftar bo\'lmagan bitim holatidan qat\'i nazar kutilayotgan foydani oladi', () => {
    const r = CalculationService.calculateDeal({
      ...deal,
      providerName: 'Alif Online',
      status: DealStatus.NEED_TO_BUY,
    });
    expect(r.isDaftar).toBe(false);
    expect(r.profit).toBeCloseTo(2_700_000, 2); // limit × min(30%, 27%)
  });
});

describe('calculateDeal: sotilgan bitim foydasi', () => {
  const deal = {
    customerLimit: 10_000_000,
    withdrawnLimit: 10_000_000,
    calculatedAmount: 7_000_000,
    storeName: 'Denov', // Daftar "Ha" faqat Imanum + Denov/Jizzax
    providerName: 'Imanum',
    date: '2026-11-10T07:00:00.000Z',
  };

  it("SOLD va sotuv narxi > 0: foyda = narx − (mijozga berilgan + agent foydasi), bonussiz", () => {
    const r = CalculationService.calculateDeal({ ...deal, status: DealStatus.SOLD, salePrice: 9_000_000, receivedFromBuyer: 9_000_000 });
    expect(r.totalPurchaseCost).toBeCloseTo(7_500_000, 2);
    expect(r.profit).toBeCloseTo(1_500_000, 2);
    expect(r.marginPct).toBeCloseTo(1_500_000 / 9_000_000, 6);
    // Daftar cheki sotilgach foyda kechiktirilmaydi
    expect(r.profitDeferred).toBe(false);
    expect(r.debtRemainder).toBe(0);
  });

  it("SOLD, narx kiritilmagan (0): kutilayotgan foydaga tushadi (daftar bo'lmasa)", () => {
    const r = CalculationService.calculateDeal({ ...deal, providerName: 'Alif Online', status: DealStatus.SOLD, salePrice: 0 });
    expect(r.profit).toBeCloseTo(2_700_000, 2);
  });

  it("SOLD, narx tannarxdan past — foyda manfiy bo'lishi mumkin (haqiqiy zarar)", () => {
    const r = CalculationService.calculateDeal({ ...deal, status: DealStatus.SOLD, salePrice: 7_000_000, receivedFromBuyer: 3_000_000 });
    expect(r.profit).toBeCloseTo(-500_000, 2);
    expect(r.debtRemainder).toBe(4_000_000);
  });
});

describe("Do'kon qarzi tarkibi (calcStoreDebtParts)", () => {
  const ok = { approvalStatus: 'APPROVED', date: '2026-11-11T07:00:00.000Z' };

  it('Qodir aka: chek + agent ulushi + bizning 6% foyda', () => {
    const p = calcStoreDebtParts({ ...ok, calculatedAmount: 7_000_000, agentAmount: 800_000, expectedProfit: 600_000, storeName: 'Qodir aka' });
    expect(p).toEqual({ check: 7_000_000, agent: 800_000, profit: 600_000, total: 8_400_000 });
    expect(calcStoreDebt({ ...ok, calculatedAmount: 7_000_000, agentAmount: 800_000, expectedProfit: 600_000, storeName: 'Qodir oka' })).toBe(8_400_000);
    // satr/Decimal ko'rinishidagi qiymatlar
    expect(calcStoreDebtParts({ ...ok, calculatedAmount: '7000000', agentAmount: '800000', expectedProfit: '600000.00', storeName: 'Кодир ока' }).total).toBe(8_400_000);
  });

  it("boshqa do'konlar: faqat chek (agent va foyda e'tiborga olinmaydi)", () => {
    const p = calcStoreDebtParts({ ...ok, calculatedAmount: 7_000_000, agentAmount: 800_000, expectedProfit: 600_000, storeName: 'Novza' });
    expect(p).toEqual({ check: 7_000_000, agent: 0, profit: 0, total: 7_000_000 });
  });

  it("shartlar avvalgidek: tasdiqlanmagan, Trust, daftar boshlanishidan oldin, summa 0 — hammasi 0", () => {
    const zero = { check: 0, agent: 0, profit: 0, total: 0 };
    const q = { calculatedAmount: 7_000_000, agentAmount: 800_000, expectedProfit: 600_000, storeName: 'Qodir aka' };
    expect(calcStoreDebtParts({ ...ok, ...q, approvalStatus: 'PENDING_APPROVAL' })).toEqual(zero);
    expect(calcStoreDebtParts({ ...ok, ...q, approvalStatus: 'REJECTED' })).toEqual(zero);
    expect(calcStoreDebtParts({ ...ok, ...q, storeName: 'Trust' })).toEqual(zero);
    // Qodir aka hisob-kitobi 01.11.2026 dan (boshqa do'konlar 10.11 dan)
    expect(calcStoreDebtParts({ ...ok, ...q, date: '2026-10-31T18:59:59.999Z' })).toEqual(zero);
    expect(calcStoreDebtParts({ ...ok, ...q, date: '2026-11-05T07:00:00.000Z' }).total).toBe(8_400_000);
    expect(calcStoreDebtParts({ ...ok, ...q, storeName: 'Novza', date: '2026-11-09T18:59:59.999Z' })).toEqual(zero);
    expect(calcStoreDebtParts({ ...ok, ...q, calculatedAmount: 0 })).toEqual(zero);
  });

  it("agent va foyda berilmasa yoki manfiy bo'lsa — faqat chek", () => {
    expect(calcStoreDebtParts({ ...ok, calculatedAmount: 2_000_000, storeName: 'Qodir aka' }).total).toBe(2_000_000);
    expect(calcStoreDebtParts({ ...ok, calculatedAmount: 2_000_000, agentAmount: -5, expectedProfit: -7, storeName: 'Qodir aka' }).total).toBe(2_000_000);
  });

  it("Qodir aka endi 'WE_OWE' emas — hamma do'kon bizga qarzdor, faqat Trust alohida", () => {
    expect(storeSettlementKind('Qodir aka')).toBe('STORE_OWES');
    expect(storeSettlementKind('Trust')).toBe('TRUST');
    expect(storeSettlementKind('Novza')).toBe('STORE_OWES');
  });
});

describe('summarizeLedger: qarz qoldig\'i va depozit', () => {
  it('qarz > to\'langan: debtLeft = qoldiq, deposit = 0', () => {
    expect(summarizeLedger([{ type: 'DEBT', amount: 1000 }, { type: 'PAYMENT', amount: 400 }])).toEqual({
      debt: 1000,
      paid: 400,
      balance: 600,
      debtLeft: 600,
      deposit: 0,
    });
  });

  it("to'langan > qarz: qoldiq manfiy, debtLeft = 0, deposit = ortiqcha summa", () => {
    expect(summarizeLedger([{ type: 'DEBT', amount: 100 }, { type: 'PAYMENT', amount: 250 }])).toEqual({
      debt: 100,
      paid: 250,
      balance: -150,
      debtLeft: 0,
      deposit: 150,
    });
  });

  it("aynan teng yoki bo'sh: ikkalasi 0", () => {
    expect(summarizeLedger([{ type: 'DEBT', amount: 100 }, { type: 'PAYMENT', amount: 100 }])).toMatchObject({ balance: 0, debtLeft: 0, deposit: 0 });
    expect(summarizeLedger([])).toEqual({ debt: 0, paid: 0, balance: 0, debtLeft: 0, deposit: 0 });
  });

  it("faqat to'lov (oldindan berilgan pul) — butun summa depozit", () => {
    expect(summarizeLedger([{ type: 'PAYMENT', amount: '500000.50' }])).toMatchObject({ balance: -500_000.5, debtLeft: 0, deposit: 500_000.5 });
  });
});

describe('Registratura: agent ulushi hisoblanmaydi, kompaniyada qoladi (egasi, 16.11.2026)', () => {
  const base = { customerLimit: 10_000_000, withdrawnLimit: 10_000_000, calculatedAmount: 7_000_000, storeName: 'Novza', providerName: 'Alif Offline', date: '2026-11-16T07:00:00.000Z' };

  it('oddiy chek: limit 10 mln, diskont 30%, ulush 22% → agent 800 000, foyda 2 200 000', () => {
    const r = CalculationService.calculateDeal({ ...base, agencyName: 'Jahongir' });
    expect(Math.round(r.agentAmount)).toBe(800_000);
    expect(Math.round(r.expectedProfit)).toBe(2_200_000);
    expect(Math.round(r.totalPurchaseCost)).toBe(7_800_000);
  });

  it('Registratura cheki: agent 0, foyda 3 000 000 (800 000 kompaniyada qoladi)', () => {
    for (const agencyName of ['Registratura', 'registratura', 'Регистратура']) {
      const r = CalculationService.calculateDeal({ ...base, agencyName });
      expect(r.agentAmount).toBe(0);
      expect(r.agentPct).toBe(0);
      expect(Math.round(r.expectedProfit)).toBe(3_000_000);
      expect(Math.round(r.totalPurchaseCost)).toBe(7_000_000);
    }
  });

  it("agentlik berilmasa hisob o'zgarmaydi", () => {
    const r = CalculationService.calculateDeal(base);
    expect(Math.round(r.agentAmount)).toBe(800_000);
  });
});
