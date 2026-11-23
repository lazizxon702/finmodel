import { describe, it, expect } from 'vitest';
import {
  imeiProblem,
  isStaleDeal,
  luhnValid,
  normalizeContractNumber,
  normalizeUzPhone,
} from '../src/services/calculation.service';
import { collectDealImeis } from '../src/services/dealChecks.service';
import { requiredFieldsMissing } from '../src/routes/deals.routes';

// Egasi, 23.11.2026: chekda majburiy maydonlar, telefon formati, IMEI (15 raqam + Luhn), 3 kundan ortiq kutish.
describe('telefon +998 XX XXX XX XX', () => {
  it('turli yozilishlar bir xil formatga keladi', () => {
    for (const v of ['+998901234567', '998 90 123-45-67', '90 123 45 67', '+998 (90) 123 45 67']) {
      expect(normalizeUzPhone(v), v).toBe('+998 90 123 45 67');
    }
  });
  it("noto'g'ri raqamlar — null", () => {
    for (const v of ['', '-', '12345', '+7 901 234 56 78', '+99890123456']) expect(normalizeUzPhone(v), v).toBeNull();
  });
});

describe('shartnoma raqami', () => {
  it("bo'shliqsiz, katta harf", () => {
    expect(normalizeContractNumber(' ab 12-34 ')).toBe('AB12-34');
    expect(normalizeContractNumber('   ')).toBeNull();
  });
});

describe('IMEI', () => {
  it('Luhn: haqiqiy IMEI o\'tadi, bitta raqam o\'zgarsa — yo\'q', () => {
    expect(luhnValid('490154203237518')).toBe(true);
    expect(luhnValid('490154203237519')).toBe(false);
  });
  it('15 raqam va nazorat raqami', () => {
    expect(imeiProblem('490154203237518')).toBeNull();
    expect(imeiProblem('49015420323751')).toMatch(/15 ta raqam/);
    expect(imeiProblem('49015420323751A')).toMatch(/15 ta raqam/);
    expect(imeiProblem('490154203237519')).toMatch(/nazorat raqami/);
    expect(imeiProblem('')).toMatch(/kiritilmagan/);
  });
  it('chekdagi IMEI\'lar takrorsiz yig\'iladi', () => {
    expect(collectDealImeis({ imeiBarcode: '1', imei2: null, items: [{ imei1: '1', imei2: '2' }, { imei1: ' 3 ' }] })).toEqual(['1', '2', '3']);
  });
});

describe("3 kundan ortiq kutish", () => {
  const now = new Date('2026-11-23T12:00:00+05:00');
  it('Kutilmoqda / Sotib olish kerak — 3 kundan ko\'p bo\'lsa qizil', () => {
    expect(isStaleDeal('PENDING', '2026-11-20T11:00:00+05:00', now)).toBe(true);
    expect(isStaleDeal('NEED_TO_BUY', '2026-11-19T12:00:00+05:00', now)).toBe(true);
    expect(isStaleDeal('PENDING', '2026-11-21T12:00:00+05:00', now)).toBe(false);
  });
  it('boshqa holatlar hech qachon qizil emas', () => {
    expect(isStaleDeal('IN_WAREHOUSE', '2026-11-01', now)).toBe(false);
    expect(isStaleDeal('SOLD', '2026-11-01', now)).toBe(false);
  });
});

describe('majburiy maydonlar', () => {
  it("hammasi to'ldirilgan — null; yo'qlari sanab o'tiladi", () => {
    expect(requiredFieldsMissing({ customerName: 'Ali Valiyev', phone1: '+998 90 123 45 67', contractNumber: 'A1', hasProduct: true })).toBeNull();
    expect(requiredFieldsMissing({ customerName: 'Mijoz', phone1: null, contractNumber: null, hasProduct: false })).toBe(
      "To'ldirilmagan yoki noto'g'ri: mijoz F.I.Sh., telefon (+998 XX XXX XX XX), shartnoma raqami, tovar"
    );
  });
});
