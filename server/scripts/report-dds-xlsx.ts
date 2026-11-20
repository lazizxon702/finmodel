/**
 * FAQAT O'QIYDI: saytdagi DDS (pul harakati) to'liq — xlsx, har bo'lim alohida varaqda.
 *   Xulosa · Hamma yozuvlar · Kirimlar · Chiqimlar · Naqd kassa · Karta · Hisob-raqam · Kategoriyalar · Kunlar · Kim bo'yicha
 *   tsrun scripts/report-dds-xlsx.ts <chiqish.xlsx>
 */
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};
const N = (v: unknown) => Math.round(Number(v) || 0);
const tk = (v: Date) => new Date(v.getTime() + 5 * 3600e3);
const dmy = (v: Date) => tk(v).toISOString().slice(0, 10).split('-').reverse().join('.');
const hm = (v: Date) => tk(v).toISOString().slice(11, 16);
const ACCOUNT: Record<string, string> = { CASH: 'Naqd kassa', BANK_CARD: 'Karta', SETTLEMENT_ACCOUNT: 'Hisob-raqam' };
const EXP: Record<string, string> = { OPEX: 'Operatsion xarajat', COGS: 'Tovar xaridi (tannarx)', CAPEX: 'Asosiy vosita', INCOME_TRANSFER: 'Kirim', OTHER: 'Boshqa' };
const SOURCE: Record<string, string> = {
  MANUAL: "Qo'lda kiritilgan", SYNC: 'Google jadvaldan', DEAL_CHECK: 'Chek xarajati (avtomatik)', SALE_PAYMENT: "Sotuv to'lovi", TRUST_PAYMENT: "Trust to'lovi",
  QODIR_PAYMENT: "Qodir aka to'lovi", STORE_PAYMENT: "Do'kon to'lovi", BOT: 'Telegram bot',
};
type Row = (string | number | null)[];

function addSheet(wb: ExcelJS.Workbook, name: string, title: string, sub: string, blocks: { head?: string; cols?: string[]; rows: Row[]; note?: string }[], firstWidth = 14) {
  const ws = wb.addWorksheet(name);
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([sub]).font = { italic: true, color: { argb: 'FF666666' } };
  for (const b of blocks) {
    ws.addRow([]);
    if (b.head) ws.addRow([b.head]).font = { bold: true, size: 12, color: { argb: 'FF1F3A8A' } };
    if (b.note) ws.addRow([b.note]).font = { italic: true, color: { argb: 'FF9A3412' } };
    if (b.cols) {
      const r = ws.addRow(b.cols);
      r.font = { bold: true };
      r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; });
    }
    for (const row of b.rows) {
      const r = ws.addRow(row);
      r.eachCell((c) => { if (typeof c.value === 'number') c.numFmt = '#,##0'; });
      if (String(row[0] ?? '').startsWith('JAMI')) r.font = { bold: true };
    }
  }
  ws.columns.forEach((c, i) => { c.width = i === 0 ? firstWidth : 18; });
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Chiqish fayli ko'rsatilmagan");
  const dds: any[] = await retry(() => prisma.ddsTransaction.findMany({
    include: { deal: { select: { dealNumber: true } }, createdBy: { select: { fullName: true, username: true } } },
    orderBy: [{ dateTime: 'asc' }, { createdAt: 'asc' }],
  }));
  const balances: any[] = await retry(() => prisma.accountBalance.findMany());
  const sub = `Hisobot vaqti: ${tk(new Date()).toISOString().slice(0, 16).replace('T', ' ')} (Toshkent). Manba: sayt bazasi, DDS — hamma yozuvlar (${dds.length} ta). Summalar so'mda.`;
  const isIn = (t: any) => t.type === 'INCOME';
  const total = (rows: any[]) => rows.reduce((s, t) => s + Number(t.amount), 0);
  const inc = dds.filter(isIn), exp = dds.filter((t) => !isIn(t));
  const wb = new ExcelJS.Workbook();

  const cols = ['DDS raqami', 'Sana', 'Vaqt', 'Turi', 'Hisob', 'Kirim', 'Chiqim', 'Xarajat turi', 'Kategoriya', 'Kim (kimdan / kimga)', 'Izoh', 'Manba', 'Chek №', 'Kim kiritgan'];
  const row = (t: any): Row => [
    t.txNumber, dmy(t.dateTime), hm(t.dateTime), isIn(t) ? 'Kirim' : 'Chiqim', ACCOUNT[t.account] || t.account, isIn(t) ? N(t.amount) : null, isIn(t) ? null : N(t.amount),
    EXP[t.expenseType] || t.expenseType, t.categoryName, t.sourcePerson || '', t.description || '', SOURCE[t.source] || t.source, t.deal?.dealNumber ?? null, t.createdBy?.fullName || t.createdBy?.username || '',
  ];
  const totalRow = (rows: any[]): Row => [`JAMI: ${rows.length} ta`, '', '', '', '', N(total(rows.filter(isIn))), N(total(rows.filter((t) => !isIn(t)))), '', '', '', '', '', null, ''];

  // ── 1. XULOSA ──
  const days = [...new Set(dds.map((t) => dmy(t.dateTime)))];
  addSheet(wb, 'Xulosa', 'PUL HARAKATI (DDS) — UMUMIY XULOSA', sub, [
    {
      head: 'JAMI', cols: ["Ko'rsatkich", 'Yozuvlar soni', 'Summa'],
      rows: [['Kirim', inc.length, N(total(inc))], ['Chiqim', exp.length, N(total(exp))], ['Farq (kirim − chiqim)', dds.length, N(total(inc) - total(exp))],
        ['Davr', null, null], [`   ${days[0] || ''} — ${days[days.length - 1] || ''}`, days.length, null]],
    },
    {
      head: "HISOBLAR BO'YICHA", cols: ['Hisob', 'Kirim', 'Chiqim', 'Farq (yozuvlar bo\'yicha)', 'Saytdagi qoldiq'],
      note: "\"Saytdagi qoldiq\" — sayt ko'rsatayotgan kassa qoldig'i. Yozuvlar bo'yicha farq bilan teng bo'lishi kerak; teng bo'lmasa — qoldiq qo'lda o'zgartirilgan yoki yozuv o'chirilgan.",
      rows: [
        ...Object.keys(ACCOUNT).map((a) => { const i = total(inc.filter((t) => t.account === a)), e = total(exp.filter((t) => t.account === a)); return [ACCOUNT[a], N(i), N(e), N(i - e), N(balances.find((b) => b.account === a)?.balance)] as Row; }),
        ['JAMI', N(total(inc)), N(total(exp)), N(total(inc) - total(exp)), N(balances.reduce((s, b) => s + Number(b.balance), 0))],
      ],
    },
    {
      head: "MANBA BO'YICHA (yozuv qayerdan kelgan)", cols: ['Manba', 'Yozuvlar soni', 'Kirim', 'Chiqim'],
      rows: [...new Set(dds.map((t) => t.source))].map((s) => { const g = dds.filter((t) => t.source === s); return [SOURCE[s] || s, g.length, N(total(g.filter(isIn))), N(total(g.filter((t) => !isIn(t))))] as Row; }),
    },
  ], 40);

  // ── 2–4. YOZUVLAR ──
  addSheet(wb, 'Hamma yozuvlar', 'DDS — HAMMA YOZUVLAR (sana bo\'yicha)', sub, [{ cols, rows: [...dds.map(row), totalRow(dds)] }]);
  addSheet(wb, 'Kirimlar', 'DDS — KIRIMLAR', sub, [{ cols, rows: [...inc.map(row), totalRow(inc)] }]);
  addSheet(wb, 'Chiqimlar', 'DDS — CHIQIMLAR', sub, [{ cols, rows: [...exp.map(row), totalRow(exp)] }]);

  // ── 5–7. HISOBLAR (yig'ilib boruvchi qoldiq bilan) ──
  for (const a of Object.keys(ACCOUNT)) {
    const g = dds.filter((t) => t.account === a);
    let run = 0;
    addSheet(wb, ACCOUNT[a], `DDS — ${ACCOUNT[a].toUpperCase()} (yozuvlar va yig'ilib boruvchi qoldiq)`, sub, [{
      cols: ['DDS raqami', 'Sana', 'Vaqt', 'Kirim', 'Chiqim', 'Qoldiq (yig\'ilib boruvchi)', 'Kategoriya', 'Kim (kimdan / kimga)', 'Izoh', 'Manba', 'Chek №'],
      rows: [
        ...g.map((t) => { run += isIn(t) ? Number(t.amount) : -Number(t.amount); return [t.txNumber, dmy(t.dateTime), hm(t.dateTime), isIn(t) ? N(t.amount) : null, isIn(t) ? null : N(t.amount), N(run), t.categoryName, t.sourcePerson || '', t.description || '', SOURCE[t.source] || t.source, t.deal?.dealNumber ?? null] as Row; }),
        [`JAMI: ${g.length} ta`, '', '', N(total(g.filter(isIn))), N(total(g.filter((t) => !isIn(t)))), N(run), '', '', '', '', null],
      ],
    }]);
  }

  // ── 8. KATEGORIYALAR ──
  const cat = new Map<string, any[]>();
  for (const t of dds) { const k = `${isIn(t) ? 'Kirim' : 'Chiqim'}|${EXP[t.expenseType] || t.expenseType}|${t.categoryName}`; cat.set(k, [...(cat.get(k) || []), t]); }
  addSheet(wb, 'Kategoriyalar', "DDS — KATEGORIYALAR BO'YICHA", sub, [{
    cols: ['Turi', 'Xarajat turi', 'Kategoriya', 'Yozuvlar soni', 'Summa', 'Naqd', 'Karta', 'Hisob-raqam'],
    rows: [...cat].sort((x, y) => x[0].split('|')[0].localeCompare(y[0].split('|')[0]) || total(y[1]) - total(x[1]))
      .map(([k, g]) => [...k.split('|'), g.length, N(total(g)), N(total(g.filter((t) => t.account === 'CASH'))), N(total(g.filter((t) => t.account === 'BANK_CARD'))), N(total(g.filter((t) => t.account === 'SETTLEMENT_ACCOUNT')))] as Row),
  }]);

  // ── 9. KUNLAR ──
  let acc = 0;
  addSheet(wb, 'Kunlar', "DDS — KUNLAR BO'YICHA", sub, [{
    cols: ['Sana', 'Yozuvlar', 'Kirim', 'Chiqim', 'Kun natijasi', "Yig'ilib boruvchi"],
    rows: [
      ...days.map((d) => { const g = dds.filter((t) => dmy(t.dateTime) === d); const i = total(g.filter(isIn)), e = total(g.filter((t) => !isIn(t))); acc += i - e; return [d, g.length, N(i), N(e), N(i - e), N(acc)] as Row; }),
      ['JAMI', dds.length, N(total(inc)), N(total(exp)), N(total(inc) - total(exp)), null],
    ],
  }]);

  // ── 10. KIM BO'YICHA ──
  const who = new Map<string, any[]>();
  for (const t of dds) { const k = (t.sourcePerson || '—').trim() || '—'; who.set(k, [...(who.get(k) || []), t]); }
  addSheet(wb, "Kim bo'yicha", "DDS — KIMDAN / KIMGA (\"Kim\" maydoni bo'yicha)", sub, [{
    note: "Ismlar DDS'da qanday yozilgan bo'lsa shunday guruhlangan — bir odam ikki xil yozilgan bo'lsa (masalan \"Умирзок\" va \"Умурзок\") alohida qatorda chiqadi.",
    cols: ['Kim', 'Yozuvlar soni', 'Kirim', 'Chiqim', 'Farq'],
    rows: [...who].sort((x, y) => total(y[1]) - total(x[1])).map(([k, g]) => { const i = total(g.filter(isIn)), e = total(g.filter((t) => !isIn(t))); return [k, g.length, N(i), N(e), N(i - e)] as Row; }),
  }], 34);

  await wb.xlsx.writeFile(out);
  console.log(`DDS: ${dds.length} yozuv (${days[0]} — ${days[days.length - 1]}); kirim ${inc.length} ta ${N(total(inc))}, chiqim ${exp.length} ta ${N(total(exp))}, farq ${N(total(inc) - total(exp))}`);
  for (const a of Object.keys(ACCOUNT)) { const i = total(inc.filter((t) => t.account === a)), e = total(exp.filter((t) => t.account === a)); console.log(`  ${ACCOUNT[a]}: yozuvlar bo'yicha ${N(i - e)} | saytdagi qoldiq ${N(balances.find((b) => b.account === a)?.balance)}`); }
  console.log(`manbalar: ${[...new Set(dds.map((t) => t.source))].join(', ')} | xarajat turlari: ${[...new Set(dds.map((t) => t.expenseType))].join(', ')}`);
  console.log(`Fayl: ${out}`);
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
