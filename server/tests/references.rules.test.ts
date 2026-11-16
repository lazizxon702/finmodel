import { describe, it, expect, vi } from 'vitest';

// Sof funksiyalar tekshiriladi — baza soxta
vi.mock('../src/lib/prisma', () => ({ prisma: {} }));

import { parseRuleBody, tashkentDayStart, tashkentDayEnd } from '../src/routes/references.routes';

const ok = (r: any) => {
  if ('error' in r) throw new Error(r.error);
  return r.data;
};

describe('parseRuleBody', () => {
  const base = { name: 'Qoida', providerId: 'p1', ratePercent: 0.22 };

  it("to'g'ri ulushni qabul qiladi", () => {
    const d = ok(parseRuleBody({ ...base, profitPercent: 0.06 }));
    expect(d.ratePercent).toBe(0.22);
    expect(d.profitPercent).toBe(0.06);
    expect(d.priority).toBeUndefined(); // jimgina 1 ga tushmaydi
  });

  it('22 (foiz) yuborilsa rad etadi', () => {
    expect('error' in parseRuleBody({ ...base, ratePercent: 22 })).toBe(true);
    expect('error' in parseRuleBody({ ...base, profitPercent: 6 })).toBe(true);
  });

  it("manfiy ulushni rad etadi, 0 va 1 ni qabul qiladi", () => {
    expect('error' in parseRuleBody({ ...base, ratePercent: -0.1 })).toBe(true);
    expect(ok(parseRuleBody({ ...base, ratePercent: 0 })).ratePercent).toBe(0);
    expect(ok(parseRuleBody({ ...base, ratePercent: 1 })).ratePercent).toBe(1);
  });

  it("do'kon ham provayder ham bo'lmasa rad etadi", () => {
    expect('error' in parseRuleBody({ name: 'x', ratePercent: 0.2 })).toBe(true);
  });

  it('sanalar Toshkent kuni chegarasida saqlanadi, validTo kunni qamrab oladi', () => {
    const d = ok(parseRuleBody({ ...base, validFrom: '2026-11-01', validTo: '2026-11-30' }));
    expect(d.validFrom.toISOString()).toBe('2026-10-31T19:00:00.000Z');
    expect(d.validTo.toISOString()).toBe('2026-11-30T18:59:59.999Z');
  });

  it('validFrom > validTo bo\'lsa rad etadi, bir kun bo\'lsa qabul qiladi', () => {
    expect('error' in parseRuleBody({ ...base, validFrom: '2026-12-01', validTo: '2026-11-01' })).toBe(true);
    expect('error' in parseRuleBody({ ...base, validFrom: '2026-11-05', validTo: '2026-11-05' })).toBe(false);
  });

  it("yaroqsiz sanani rad etadi", () => {
    expect(tashkentDayStart('01.11.2026')).toBeNull();
    expect(tashkentDayEnd('2026-13-40')).toBeNull();
  });

  it("PUT: yuborilmagan maydonlar o'zgarishsiz qoladi", () => {
    const current = {
      name: 'Eski', storeId: 's1', providerId: null, ratePercent: 0.22, profitPercent: 0.06,
      validFrom: new Date('2026-10-31T19:00:00Z'), validTo: null,
    };
    const d = ok(parseRuleBody({ ratePercent: 0.25 }, current));
    expect(d.name).toBe('Eski');
    expect(d.storeId).toBe('s1');
    expect(d.profitPercent).toBe(0.06);
    expect(d.validFrom).toEqual(current.validFrom);
    expect(d.priority).toBeUndefined();
  });

  it("PUT: profitPercent: null foydani tozalaydi", () => {
    const d = ok(parseRuleBody({ profitPercent: null }, { name: 'a', storeId: 's', ratePercent: 0.2, profitPercent: 0.1 }));
    expect(d.profitPercent).toBeNull();
  });
});
