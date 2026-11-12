import { describe, expect, it } from 'vitest';
import { MAX_DDS_AMOUNT, parseAmountInput } from '../src/routes/dds.routes';
import { classifyOpexCategory, decomposeDealProfit } from '../src/routes/finances.routes';

describe("DDS: summani o'qish (parseAmountInput)", () => {
  it('son va oddiy satr', () => {
    expect(parseAmountInput(150000)).toBe(150000);
    expect(parseAmountInput('150000')).toBe(150000);
    expect(parseAmountInput(' 150000 ')).toBe(150000);
    expect(parseAmountInput(1200000.5)).toBe(1200000.5);
  });

  it("bo'shliq bilan ajratilgan minglik: \"1 200 000\"", () => {
    expect(parseAmountInput('1 200 000')).toBe(1_200_000);
    expect(parseAmountInput('1 200 000')).toBe(1_200_000); // NBSP
    expect(parseAmountInput('1 200 000')).toBe(1_200_000); // tor NBSP
    expect(parseAmountInput("1 200 000 so'm")).toBe(1_200_000);
    expect(parseAmountInput('1 200 000 UZS')).toBe(1_200_000);
  });

  it('vergul / nuqta bilan ajratilgan minglik: "1,200,000", "1.200.000"', () => {
    expect(parseAmountInput('1,200,000')).toBe(1_200_000);
    expect(parseAmountInput('1.200.000')).toBe(1_200_000);
    expect(parseAmountInput('12,500')).toBe(12_500);
    expect(parseAmountInput("1'200'000")).toBe(1_200_000);
  });

  it('kasr qismi', () => {
    expect(parseAmountInput('1 200 000,50')).toBe(1_200_000.5);
    expect(parseAmountInput('1,200,000.50')).toBe(1_200_000.5);
    expect(parseAmountInput('1.200.000,50')).toBe(1_200_000.5);
    expect(parseAmountInput('1200000.5')).toBe(1_200_000.5);
    expect(parseAmountInput('1200,5')).toBe(1200.5);
  });

  it("tushunarsiz qiymat → NaN (jimgina 0 ga aylanmaydi)", () => {
    for (const bad of ['', '   ', 'abc', '12abc', '1,2,3', '-5000', '1..2', null, undefined, {}, [], true, NaN, Infinity]) {
      expect(Number.isNaN(parseAmountInput(bad)), String(bad)).toBe(true);
    }
  });

  it('yuqori chegara aniq butun sonlar oralig\'ida', () => {
    expect(MAX_DDS_AMOUNT).toBeLessThan(Number.MAX_SAFE_INTEGER / 1000);
  });
});

describe("Moliya: OPEX kategoriyasini guruhlash (ruscha va o'zbekcha)", () => {
  it('agent va hamkor komissiyasi', () => {
    expect(classifyOpexCategory('Комиссии агентов и партнеров')).toBe('agentPayouts');
    expect(classifyOpexCategory('Agent va hamkor komissiyasi')).toBe('agentPayouts');
  });

  it('logistika', () => {
    expect(classifyOpexCategory('Логистика и доставка')).toBe('logisticsExpenses');
    expect(classifyOpexCategory('Logistika va yetkazib berish')).toBe('logisticsExpenses');
  });

  it('ish haqi', () => {
    expect(classifyOpexCategory('ФОТ (Зарплата и бонусы)')).toBe('payrollExpenses');
    expect(classifyOpexCategory('Ish haqi (FOT)')).toBe('payrollExpenses');
    expect(classifyOpexCategory('Фотосессия')).not.toBe('payrollExpenses');
  });

  it('marketing', () => {
    expect(classifyOpexCategory('Маркетинг и реклама')).toBe('marketingExpenses');
    expect(classifyOpexCategory('Marketing va reklama')).toBe('marketingExpenses');
  });

  it("ofis va ma'muriy (bank komissiyasi agent komissiyasiga tushmaydi)", () => {
    expect(classifyOpexCategory('Связь, интернет и софт')).toBe('officeAndAdmin');
    expect(classifyOpexCategory('Ofis ijara va kommunal xizmatlar')).toBe('officeAndAdmin');
    expect(classifyOpexCategory('Aloqa va internet')).toBe('officeAndAdmin');
    expect(classifyOpexCategory('Банковские комиссии и эквайринг')).toBe('officeAndAdmin');
  });

  it('boshqalar', () => {
    expect(classifyOpexCategory('Boshqa xarajat')).toBe('otherOpex');
    expect(classifyOpexCategory('Прочие операционные расходы')).toBe('otherOpex');
    expect(classifyOpexCategory(null)).toBe('otherOpex');
  });
});

describe('Moliya: bitim foydasining tarkibi (decomposeDealProfit)', () => {
  const base = { status: 'NEED_TO_BUY', salePrice: 0, withdrawnLimit: 0, totalPurchaseCost: 0, trustDebtAmount: 0, profit: 0 };

  it('Trust bitimi: foyda = yechilgan limitning 16% i', () => {
    const p = decomposeDealProfit({ ...base, storeName: 'Trust', withdrawnLimit: 10_000_000, trustDebtAmount: 1_600_000, profit: 1_600_000 });
    expect(p).toMatchObject({ tradeMargin: 0, partnerBonus: 0, trustIncome: 1_600_000, expected: 1_600_000, difference: 0 });
  });

  it('Qodir aka / Green Bazar: xarid summasining 5% i', () => {
    for (const storeName of ['Qodir aka', 'Qodir oka', 'Green Bazar']) {
      const p = decomposeDealProfit({ ...base, storeName, totalPurchaseCost: 8_000_000, profit: 400_000 });
      expect(p.partnerBonus, storeName).toBe(400_000);
      expect(p.difference, storeName).toBe(0);
    }
  });

  it('sotilgan bitim: savdo marjasi = sotuv narxi − yechilgan limit', () => {
    const p = decomposeDealProfit({ ...base, status: 'SOLD', storeName: 'Chilonzor', salePrice: 9_000_000, withdrawnLimit: 8_000_000, profit: 1_000_000 });
    expect(p).toMatchObject({ tradeMargin: 1_000_000, expected: 1_000_000, difference: 0 });
  });

  it('sotuv narxi kiritilmagan SOLD bitimda marja tan olinmaydi', () => {
    const p = decomposeDealProfit({ ...base, status: 'SOLD', storeName: 'Chilonzor', salePrice: 0, withdrawnLimit: 8_000_000, profit: 0 });
    expect(p.tradeMargin).toBe(0);
    expect(p.difference).toBe(0);
  });

  it("saqlangan foyda qoidadan farq qilsa — farq ko'rinadi", () => {
    const p = decomposeDealProfit({ ...base, storeName: 'Trust', withdrawnLimit: 10_000_000, trustDebtAmount: 1_600_000, profit: 0 });
    expect(p.expected).toBe(1_600_000);
    expect(p.difference).toBe(-1_600_000);
  });
});
