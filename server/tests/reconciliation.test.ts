import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  guessMapping,
  matchStatement,
  parseStatement,
  toDate,
  toNumber,
  toStatementRows,
  type OurDeal,
} from '../src/services/reconciliation.service';

// 9-blok (egasi, 23.11.2026): provayder vipiskasi bilan cheklarni solishtirish.
const deal = (n: number, ymd: string, amount: number, extra: Partial<OurDeal> = {}): OurDeal => ({
  id: 'd' + n, dealNumber: n, date: new Date(`${ymd}T12:00:00+05:00`), amount, contractNumber: null, imeis: [], customerName: null, ...extra,
});

describe('qiymatlarni o\'qish', () => {
  it('summa va sana', () => {
    expect(toNumber('12 345 678,50')).toBe(12345678.5);
    expect(toNumber('7,000,000')).toBe(7000000);
    expect(toNumber(5)).toBe(5);
    expect(toNumber('jami')).toBeNull();
    expect(toDate('13.11.2026')?.toISOString().slice(0, 10)).toBe('2026-11-13');
    expect(toDate('2026-11-13')?.toISOString().slice(0, 10)).toBe('2026-11-13');
    expect(toDate(46339)?.toISOString().slice(0, 10)).toBe('2026-11-13'); // Excel seriya raqami
  });
  it('ustun taxmini', () => {
    expect(guessMapping(['№', 'Дата', 'Сумма лимита', 'IMEI', 'Номер договора'])).toEqual({ date: 1, amount: 2, imei: 3, contract: 4 });
  });
});

describe('solishtirish', () => {
  const ours = [
    deal(1, '2026-11-10', 7_000_000, { contractNumber: 'TR-1' }),
    deal(2, '2026-11-11', 5_000_000, { imeis: ['490154203237518'] }),
    deal(3, '2026-11-12', 3_000_000),
    deal(4, '2026-11-14', 9_000_000),
  ];
  const stmt = toStatementRows(
    [
      ['10.11.2026', '7 000 000', '', 'tr 1'], // shartnoma bo'yicha — mos
      ['11.11.2026', '5 100 000', '490154203237518', ''], // IMEI bo'yicha — summa farq
      ['13.11.2026', '3000000', '', ''], // summa + sana (±3 kun) — mos
      ['13.11.2026', '4 000 000', '', ''], // bizda yo'q
      ['', 'Jami', '', ''], // summasiz qator — tashlanadi
    ],
    { date: 0, amount: 1, imei: 2, contract: 3 }
  );
  const r = matchStatement(stmt, ours);
  it("to'rt ro'yxat", () => {
    expect(r.matched.map((x: any) => [x.dealNumber, x.by])).toEqual([[1, 'contract'], [3, 'amount']]);
    expect(r.mismatched).toEqual([expect.objectContaining({ dealNumber: 2, by: 'imei', diff: 100_000 })]);
    expect(r.providerOnly).toEqual([expect.objectContaining({ providerAmount: 4_000_000 })]);
    expect(r.oursOnly.map((x: any) => x.dealNumber)).toEqual([4]);
  });
  it('sana oynasidan tashqari summa mos kelmaydi', () => {
    const far = toStatementRows([['25.11.2026', '9 000 000']], { date: 0, amount: 1 });
    expect(matchStatement(far, [deal(4, '2026-11-14', 9_000_000)]).providerOnly).toHaveLength(1);
  });
});

describe('Excel fayl', () => {
  it('sarlavha qatori topiladi (tepada sarlavhasiz qatorlar bo\'lsa ham)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Vipiska');
    ws.addRow(['Trust — vipiska']);
    ws.addRow([]);
    ws.addRow(['Дата', 'Сумма', 'IMEI']);
    ws.addRow([new Date('2026-11-10T07:00:00Z'), 7000000, '490154203237518']);
    ws.addRow([new Date('2026-11-11T07:00:00Z'), 5000000, null]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const p = await parseStatement('trust.xlsx', buf);
    expect(p.headers).toEqual(['Дата', 'Сумма', 'IMEI']);
    expect(p.rows).toHaveLength(2);
    expect(p.guess).toMatchObject({ date: 0, amount: 1, imei: 2 });
    const rows = toStatementRows(p.rows, p.guess);
    expect(rows.map((x) => x.amount)).toEqual([7_000_000, 5_000_000]);
    expect(rows[0].imei).toBe('490154203237518');
  });
  it('CSV (; bilan)', async () => {
    const p = await parseStatement('a.csv', Buffer.from('Sana;Summa\n10.11.2026;7 000 000\n'));
    expect(p.guess).toMatchObject({ date: 0, amount: 1 });
    expect(toStatementRows(p.rows, p.guess)[0].amount).toBe(7_000_000);
  });
});
