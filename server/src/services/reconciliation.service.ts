/**
 * Provayder bilan sverka (egasi, 23.11.2026, 9-blok).
 *   parseStatement — provayder vipiskasi (Excel .xlsx yoki CSV) → sarlavhalar, qatorlar, ustunlar taxmini;
 *   matchStatement — vipiska qatorlarini bizning cheklar bilan solishtiradi:
 *     1) shartnoma raqami, 2) IMEI, 3) summa (yechilgan limit) + sana (±3 kun) bo'yicha.
 *   Natija: mos kelgan; summasi farq qilgan; provayderda bor — bizda yo'q; bizda bor — provayderda yo'q.
 */
import ExcelJS from 'exceljs';
import { normalizeContractNumber } from './calculation.service';

export type ColumnKey = 'date' | 'amount' | 'imei' | 'contract';
export type Mapping = Partial<Record<ColumnKey, number>>;

export interface ParsedStatement {
  headers: string[];
  rows: unknown[][];
  guess: Mapping;
}

const cellValue = (v: any): unknown => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return String(v.text);
    return null;
  }
  return v;
};

const GUESS: Record<ColumnKey, RegExp> = {
  contract: /shartnoma|договор|contract|dogovor|номер\s*дог|№\s*дог/i,
  imei: /imei|имей/i,
  date: /sana|дата|date|kun|vaqt|время/i,
  amount: /summa|сумма|amount|limit|лимит|sum\b|сум/i,
};

/** Sarlavhalardan ustunlarni taxmin qiladi (har ustun bitta maydonga) */
export function guessMapping(headers: string[]): Mapping {
  const out: Mapping = {};
  const used = new Set<number>();
  for (const key of ['contract', 'imei', 'date', 'amount'] as ColumnKey[]) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && GUESS[key].test(h || ''));
    if (i >= 0) {
      out[key] = i;
      used.add(i);
    }
  }
  return out;
}

function fromTable(table: unknown[][]): ParsedStatement {
  // Sarlavha qatori: dastlabki 15 qatordan birinchisi — kamida 2 ta matnli katak
  let h = table.findIndex((r, i) => i < 15 && r.filter((c) => typeof c === 'string' && c.trim()).length >= 2);
  if (h < 0) h = 0;
  const width = Math.max(0, ...table.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => String(table[h]?.[i] ?? '').trim() || `Ustun ${i + 1}`);
  const rows = table.slice(h + 1).filter((r) => r.some((c) => c !== null && String(c).trim() !== ''));
  return { headers, rows, guess: guessMapping(headers) };
}

/** Excel (.xlsx) yoki CSV faylini o'qiydi (birinchi varaq) */
export async function parseStatement(fileName: string, data: Buffer): Promise<ParsedStatement> {
  const name = fileName.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = data.toString('utf8').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const sep = (lines[0]?.match(/;/g)?.length || 0) >= (lines[0]?.match(/,/g)?.length || 0) ? ';' : ',';
    return fromTable(lines.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim() || null)));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Faylda varaq yo'q");
  const table: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = (row.values as any[]).slice(1).map(cellValue);
    table.push(vals);
  });
  return fromTable(table);
}

/** "12 345 678,50" / 12345678.5 → son; bo'lmasa null */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\s ]/g, '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  // "7,000,000" — minglik ajratuvchi; "7000000,50" — o'nlik vergul
  const norm = s.includes('.') || /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Date / "dd.mm.yyyy" / "yyyy-mm-dd" / Excel seriya raqami → Date; bo'lmasa null */
export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && v > 30000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000));
  const s = String(v ?? '').trim();
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T12:00:00+05:00`);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+05:00`);
  return null;
}

export interface StatementRow {
  row: number;
  date: Date | null;
  amount: number | null;
  imei: string | null;
  contract: string | null;
}

/** Jadval qatorlarini tanlangan ustunlar bo'yicha o'qiydi; summasi yo'q qatorlar (jami, bo'sh) tashlanadi */
export function toStatementRows(rows: unknown[][], mapping: Mapping): StatementRow[] {
  const get = (r: unknown[], k: ColumnKey) => (mapping[k] === undefined ? null : r[mapping[k]!]);
  return rows
    .map((r, i) => ({
      row: i + 1,
      date: toDate(get(r, 'date')),
      amount: toNumber(get(r, 'amount')),
      imei: (String(get(r, 'imei') ?? '').match(/\d{14,16}/) || [null])[0],
      contract: normalizeContractNumber(get(r, 'contract')),
    }))
    .filter((r) => r.amount !== null && r.amount > 0);
}

export interface OurDeal {
  id: string;
  dealNumber: number;
  date: Date;
  amount: number;
  contractNumber: string | null;
  imeis: string[];
  customerName: string | null;
}

const DAY = 86_400_000;
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 1;
/** Shartnoma raqamini solishtirish kaliti: faqat harf va raqam ("TR-1" = "tr 1") */
const contractKey = (v: string | null) => (v || '').replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();

export function matchStatement(stmt: StatementRow[], deals: OurDeal[], dateWindowDays = 3) {
  const free = new Set(deals.map((d) => d.id));
  const matched: any[] = [];
  const mismatched: any[] = [];
  const providerOnly: any[] = [];
  const view = (d: OurDeal) => ({ dealId: d.id, dealNumber: d.dealNumber, date: d.date, ourAmount: d.amount, customerName: d.customerName });
  const take = (pred: (d: OurDeal) => boolean) => {
    const cands = deals.filter((d) => free.has(d.id) && pred(d));
    return cands;
  };

  for (const r of stmt) {
    let d: OurDeal | undefined;
    let by = '';
    if (r.contract) {
      const k = contractKey(r.contract);
      d = k ? take((x) => contractKey(x.contractNumber) === k)[0] : undefined;
      if (d) by = 'contract';
    }
    if (!d && r.imei) {
      d = take((x) => x.imeis.includes(r.imei!))[0];
      if (d) by = 'imei';
    }
    if (!d) {
      const c = take((x) => sameAmount(x.amount, r.amount!) && (!r.date || Math.abs(x.date.getTime() - r.date.getTime()) <= dateWindowDays * DAY));
      if (r.date) c.sort((a, b) => Math.abs(a.date.getTime() - r.date!.getTime()) - Math.abs(b.date.getTime() - r.date!.getTime()));
      d = c[0];
      if (d) by = 'amount';
    }
    const src = { row: r.row, providerDate: r.date, providerAmount: r.amount, imei: r.imei, contract: r.contract };
    if (!d) {
      providerOnly.push(src);
      continue;
    }
    free.delete(d.id);
    const item = { ...src, ...view(d), by, diff: Math.round(((r.amount || 0) - d.amount) * 100) / 100 };
    (sameAmount(d.amount, r.amount!) ? matched : mismatched).push(item);
  }
  const oursOnly = deals.filter((d) => free.has(d.id)).map(view);
  return { matched, mismatched, providerOnly, oursOnly };
}
