import { describe, expect, it } from 'vitest';
import { splitItemCosts } from '../src/services/calculation.service';

// Egasi (18.11.2026): bitta chekda 2 ta har xil tovar bo'lsa, har birining narxi alohida yoziladi —
// chek tannarxi tovarlarga shu narxlar NISBATIDA bo'linadi.
describe("splitItemCosts — chek tannarxini tovarlarga bo'lish", () => {
  it('narxlar nisbatida: #8107 misoli (iPhone 22,8 mln + kofe mashinka 8 mln, tannarx 24 024 000)', () => {
    const r = splitItemCosts([{ price: 22_800_000, quantity: 1 }, { price: 8_000_000, quantity: 1 }], 24_024_000);
    expect(r).toEqual({ shares: [17_784_000, 6_240_000], estimated: false });
  });

  it("faqat NISBAT muhim: yig'indi tannarxga teng bo'lishi shart emas", () => {
    expect(splitItemCosts([{ price: 228, quantity: 1 }, { price: 80, quantity: 1 }], 24_024_000).shares).toEqual([17_784_000, 6_240_000]);
  });

  it("soni hisobga olinadi; bo'laklar yig'indisi aniq tannarxga teng", () => {
    const r = splitItemCosts([{ price: 1_000_000, quantity: 2 }, { price: 1_000_000, quantity: 1 }], 10_000_000);
    expect(r.shares.reduce((a, b) => a + b, 0)).toBe(10_000_000);
    expect(Math.round(r.shares[0] / r.shares[1])).toBe(2);
  });

  it("narx kiritilmagan — teng bo'linadi va taxminiy deb belgilanadi", () => {
    expect(splitItemCosts([{ price: 0 }, { price: null }], 8_000_000)).toEqual({ shares: [4_000_000, 4_000_000], estimated: true });
    expect(splitItemCosts([{ price: 0 }], 8_000_000)).toEqual({ shares: [8_000_000], estimated: false });
  });

  it("bittasida narx bor — narxsizga o'rtacha narx beriladi, taxminiy", () => {
    expect(splitItemCosts([{ price: 6_000_000 }, { price: 0 }], 10_000_000)).toEqual({ shares: [5_000_000, 5_000_000], estimated: true });
  });

  it("bo'sh ro'yxat", () => {
    expect(splitItemCosts([], 5)).toEqual({ shares: [], estimated: false });
  });
});
