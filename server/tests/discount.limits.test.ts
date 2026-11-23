import { describe, it, expect } from 'vitest';
import { discountLimitsFor, discountViolation, CommissionRuleItem } from '../src/services/calculation.service';
import { checkDiscount, overrideReasonOf } from '../src/routes/deals.routes';

// Egasi, 23.11.2026: diskont provayder ulushidan past bo'lmasin, maksimal 45%, Green Bazar — agentga qat'iy 5%.
const v = (store: string, provider: string, disc: number, date = '2026-11-23', rules: CommissionRuleItem[] = []) =>
  discountViolation(disc, discountLimitsFor(store, provider, rules, date));

describe('diskont chegarasi', () => {
  it('6 oylik Alif 35%: 26% rad etiladi, matn egasi namunasidek', () => {
    expect(v('Novza', '6 oylik Alif', 0.26)).toBe('Diskont 26% — 6 oylik Alif uchun minimal 35%. Agent bilan qayta kelishing.');
    expect(v('Novza', '6 oylik Alif', 0.35)).toBeNull();
  });

  it('provayderlar minimal foizi', () => {
    const cases: [string, number][] = [
      ['Alif Offline', 0.22], ['Alif Online', 0.27], ['Trust 1', 0.16], ['Imanum', 0.25], ['Finsum Nasiya', 0.22],
      ['Variant', 0.27], ['Paylater offline', 0.22], ['Paylater online', 0.27], ['Payme', 0.2], ['Infin Bank', 0.15], ['Birzum', 0.2],
    ];
    for (const [p, min] of cases) {
      expect(v('Novza', p, min), p).toBeNull();
      expect(v('Novza', p, min - 0.01), p).toMatch(/minimal/);
    }
  });

  it('maksimal 45%', () => {
    expect(v('Novza', 'Alif Offline', 0.45)).toBeNull();
    expect(v('Novza', 'Alif Offline', 0.46)).toMatch(/maksimal 45%/);
  });

  it('Qodir aka: minimal 22% (agentga diskont − 22%)', () => {
    expect(v('Qodir aka', 'Alif Offline', 0.22)).toBeNull();
    expect(v('Qodir aka', 'Alif 6 oylik', 0.2)).toMatch(/Qodir aka uchun minimal 22%/);
  });

  it("Green Bazar: diskont aniq 35% (ulush 30 + agentga 5)", () => {
    expect(v('Green Bazar', 'Alif Offline', 0.35)).toBeNull();
    expect(v('Green Bazar', 'Alif Offline', 0.38)).toMatch(/aniq 35%/);
    expect(v('Green Bazar', 'Alif Offline', 0.3)).toMatch(/aniq 35%/);
  });

  it("spravochnikdagi qoida ustun (qotirilmagan)", () => {
    const rules: CommissionRuleItem[] = [{ providerName: 'Payme', ratePercent: 0.3, priority: 5 } as any];
    expect(v('Novza', 'Payme', 0.25, '2026-11-23', rules)).toMatch(/minimal 30%/);
  });

  it("qoida yo'q provayder — saqlanmaydi", () => {
    expect(v('Novza', 'Nomalum Bank', 0.3)).toMatch(/spravochnikda yo'q/);
  });

  it("yaxlitlash: 7 000 000 × 35% dan bir necha so'm farq o'tadi", () => {
    expect(v('Novza', '6 oylik Alif', (7_000_000 - 4_550_010) / 7_000_000)).toBeNull();
  });
});

describe('admin chetlab o\'tishi', () => {
  const input = { storeName: 'Novza', providerName: '6 oylik Alif', withdrawn: 10_000_000, calculated: 7_400_000, date: '2026-11-23' };
  it('registrator — 400, chetlab o\'tib bo\'lmaydi', () => {
    const r = checkDiscount('REGISTRATURA', { overrideReason: 'juda muhim sabab' }, input, []);
    expect(r).toMatchObject({ ok: false, overridable: false });
  });
  it('admin sababsiz — 400, sabab bilan — o\'tadi va sabab qaytadi', () => {
    expect(checkDiscount('ADMIN', {}, input, [])).toMatchObject({ ok: false, overridable: true });
    expect(checkDiscount('ADMIN', { overrideReason: '  egasi ruxsat berdi ' }, input, [])).toMatchObject({
      ok: true,
      override: { reason: 'egasi ruxsat berdi' },
    });
  });
  it('sabab kamida 5 belgi', () => {
    expect(overrideReasonOf('ADMIN', { overrideReason: 'ok' })).toBeNull();
  });
});

describe('Yandex Split (egasi, 23.11.2026): agentga foyda yo\'q', () => {
  it('agent ulushi 0, diskontning hammasi bizning foyda', async () => {
    const { CalculationService } = await import('../src/services/calculation.service');
    const c = CalculationService.calculateDeal({ customerLimit: 10_000_000, withdrawnLimit: 10_000_000, calculatedAmount: 7_000_000, storeName: 'Split RB', providerName: 'Yandex Split', agencyName: 'Apple', date: '2026-11-23' } as any, []);
    expect(c.agentAmount).toBe(0);
    expect(c.profit).toBe(3_000_000);
    expect(c.totalPurchaseCost).toBe(7_000_000);
  });
  it("foizi spravochnikda bo'lmasa ham saqlanadi; maksimal 45% qoladi", () => {
    expect(v('Split RB', 'Yandex Split', 0.3)).toBeNull();
    expect(v('Split RB', 'Yandex Split', 0.5)).toMatch(/maksimal 45%/);
  });
});
