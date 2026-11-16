/**
 * FAQAT O'QIYDI: Qodir aka / Daftar / Trust / Iman / Novza bo'yicha to'liq hisobot — har biri alohida varaqda (xlsx).
 *   tsrun scripts/report-stores-xlsx.ts <chiqish.xlsx>
 */
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { canonicalStoreName, isQodirStore, isTrustDeal } from '../src/services/calculation.service';

const prisma = new PrismaClient();
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};
const N = (v: unknown) => Math.round(Number(v) || 0);
const tk = (v: Date) => new Date(v.getTime() + 5 * 3600e3);
const dmy = (v: Date | null | undefined) => (v ? tk(v).toISOString().slice(0, 10).split('-').reverse().join('.') : '');
const STATUS: Record<string, string> = {
  NEED_TO_BUY: 'Olish kerak', PENDING: 'Kutilmoqda', IN_TRANSIT: "Yo'lda", IN_WAREHOUSE: 'Omborda', SOLD: 'Sotildi',
  MONEY_RECEIVED: 'Pul tushdi', PARTIAL_AMOUNT: "To'liq emas",
};
const ARRIVED = new Set(['IN_WAREHOUSE', 'IN_TRANSIT', 'SOLD', 'PARTIAL_AMOUNT']);
const NOT_ARRIVED = new Set(['NEED_TO_BUY', 'PENDING']);

type Row = (string | number | null)[];

function addSheet(wb: ExcelJS.Workbook, name: string, title: string, blocks: { head?: string; cols?: string[]; rows: Row[]; note?: string }[]) {
  const ws = wb.addWorksheet(name);
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([`Hisobot vaqti: ${tk(new Date()).toISOString().slice(0, 16).replace('T', ' ')} (Toshkent). Manba: sayt bazasi. Summalar so'mda.`]).font = { italic: true, color: { argb: 'FF666666' } };
  for (const b of blocks) {
    ws.addRow([]);
    if (b.head) {
      const r = ws.addRow([b.head]);
      r.font = { bold: true, size: 12, color: { argb: 'FF1F3A8A' } };
    }
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
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 34 : 18; });
  return ws;
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('Chiqish fayli ko\'rsatilmagan');
  const deals: any[] = await retry(() => prisma.deal.findMany({
    include: { store: true, provider: true, agency: true, agent: true, buyer: true },
    orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
  }));
  const storeLedger: any[] = await retry(() => prisma.storeLedgerEntry.findMany({ include: { store: true, ddsTransaction: true, deal: true }, orderBy: { dateTime: 'asc' } }));
  const trustLedger: any[] = await retry(() => prisma.trustLedgerEntry.findMany({ include: { ddsTransaction: true }, orderBy: { dateTime: 'asc' } }));
  const approved = deals.filter((d) => d.approvalStatus === 'APPROVED');

  const sum = (rows: any[], f: string) => rows.reduce((s, d) => s + (Number(d[f]) || 0), 0);
  const grp = (rows: any[], key: (d: any) => string) => {
    const m = new Map<string, any[]>();
    for (const d of rows) m.set(key(d), [...(m.get(key(d)) || []), d]);
    return m;
  };
  const whoBlock = (rows: any[]) => ({
    head: 'KIMLARDAN (agentlik / operator)',
    cols: ['Agentlik', 'Operator', 'Cheklar soni', 'Yechilgan limit', 'Mijozga berilgan', 'Agent ulushi'],
    rows: [
      ...[...grp(rows, (d) => `${d.agency?.name || '—'}|${d.agent?.name || '—'}`)]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, g]) => [k.split('|')[0], k.split('|')[1], g.length, N(sum(g, 'withdrawnLimit')), N(sum(g, 'calculatedAmount')), N(sum(g, 'agentAmount'))] as Row),
      ['JAMI', '', rows.length, N(sum(rows, 'withdrawnLimit')), N(sum(rows, 'calculatedAmount')), N(sum(rows, 'agentAmount'))],
    ],
  });
  const agencyBlock = (rows: any[]) => ({
    head: "AGENTLIKLAR BO'YICHA",
    cols: ['Agentlik', 'Cheklar soni', 'Yechilgan limit', 'Mijozga berilgan', 'Agent ulushi'],
    rows: [...grp(rows, (d) => d.agency?.name || '—')].sort((a, b) => b[1].length - a[1].length)
      .map(([k, g]) => [k, g.length, N(sum(g, 'withdrawnLimit')), N(sum(g, 'calculatedAmount')), N(sum(g, 'agentAmount'))] as Row),
  });
  const whenBlock = (rows: any[]) => ({
    head: "QACHON (kunlar bo'yicha)",
    cols: ['Sana', 'Cheklar soni', 'Yechilgan limit', 'Mijozga berilgan'],
    rows: [...grp(rows, (d) => dmy(d.date))].map(([k, g]) => [k, g.length, N(sum(g, 'withdrawnLimit')), N(sum(g, 'calculatedAmount'))] as Row),
  });
  const statusBlock = (rows: any[]) => ({
    head: 'TOVAR HOLATI (nimalar kelgan, nimalar qolgan)',
    cols: ['Holat', 'Cheklar soni', 'Yechilgan limit', 'Mijozga berilgan'],
    rows: [
      ...[...grp(rows, (d) => STATUS[d.status] || d.status)].map(([k, g]) => [k, g.length, N(sum(g, 'withdrawnLimit')), N(sum(g, 'calculatedAmount'))] as Row),
      ['JAMI', rows.length, N(sum(rows, 'withdrawnLimit')), N(sum(rows, 'calculatedAmount'))],
    ],
  });
  const goodsBlock = (rows: any[]) => {
    const a = rows.filter((d) => ARRIVED.has(d.status)), n = rows.filter((d) => NOT_ARRIVED.has(d.status)), m = rows.filter((d) => d.status === 'MONEY_RECEIVED');
    const sold = rows.filter((d) => d.status === 'SOLD'), wh = rows.filter((d) => d.status === 'IN_WAREHOUSE' || d.status === 'IN_TRANSIT' || d.status === 'PARTIAL_AMOUNT');
    return {
      head: 'TOVAR: QANCHA KELISHI KERAK / QANCHA KELGAN / QANCHA QOLGAN',
      cols: ["Ko'rsatkich", 'Cheklar soni', 'Yechilgan limit', 'Mijozga berilgan'],
      rows: [
        ['Kelishi kerak (hamma cheklar)', rows.length, N(sum(rows, 'withdrawnLimit')), N(sum(rows, 'calculatedAmount'))],
        ['Kelgan (omborda + sotilgan)', a.length, N(sum(a, 'withdrawnLimit')), N(sum(a, 'calculatedAmount'))],
        ['   shundan omborda turibdi', wh.length, N(sum(wh, 'withdrawnLimit')), N(sum(wh, 'calculatedAmount'))],
        ['   shundan sotilgan', sold.length, N(sum(sold, 'withdrawnLimit')), N(sum(sold, 'calculatedAmount'))],
        ['Tovar o\'rniga pul tushgan', m.length, N(sum(m, 'withdrawnLimit')), N(sum(m, 'calculatedAmount'))],
        ['Qolgan (kutilmoqda + olish kerak)', n.length, N(sum(n, 'withdrawnLimit')), N(sum(n, 'calculatedAmount'))],
      ] as Row[],
    };
  };
  const listCols = ['Chek №', 'Sana', "Do'kon", 'Provayder', 'Agentlik', 'Operator', 'Mijoz', 'Tovar', 'IMEI', 'Yechilgan limit', 'Mijozga berilgan', 'Agent ulushi', 'Bizning foyda', 'Holat', 'Sotuv narxi', 'Xaridor'];
  const listRow = (d: any): Row => [
    d.dealNumber, dmy(d.date), d.store?.name || '', d.provider?.name || '', d.agency?.name || '', d.agent?.name || '', d.customerName || '',
    d.productName || '', [d.imeiBarcode, d.imei2].filter(Boolean).join(' '), N(d.withdrawnLimit), N(d.calculatedAmount), N(d.agentAmount), N(d.profit),
    STATUS[d.status] || d.status, N(d.salePrice) || null, d.buyer?.name || '',
  ];
  const listTotal = (rows: any[], extra: Row = []): Row => [`JAMI: ${rows.length} ta chek`, '', '', '', '', '', '', '', '', N(sum(rows, 'withdrawnLimit')), N(sum(rows, 'calculatedAmount')), N(sum(rows, 'agentAmount')), N(sum(rows, 'profit')), '', N(sum(rows, 'salePrice')) || null, '', ...extra];

  const wb = new ExcelJS.Workbook();
  const summary: string[] = [];

  // ───────── 1. QODIR AKA ─────────
  {
    const rows = approved.filter((d) => isQodirStore(d.store?.name));
    const led = storeLedger.filter((e) => isQodirStore(e.store?.name));
    const debtBy = new Map<string, number>(led.filter((e) => e.type === 'DEBT' && e.dealId).map((e) => [e.dealId, Number(e.amount)]));
    const pays = led.filter((e) => e.type === 'PAYMENT');
    const must = [...debtBy.values()].reduce((s, v) => s + v, 0), paid = pays.reduce((s, e) => s + Number(e.amount), 0);
    summary.push(`Qodir aka: ${rows.length} chek, limit ${N(sum(rows, 'withdrawnLimit'))}, berishi kerak ${N(must)}, bergan ${N(paid)}, qoldiq ${N(must - paid)}`);
    addSheet(wb, 'Qodir aka', 'QODIR AKA — hisob-kitob (01.11.2026 dan)', [
      {
        head: 'PUL: QANCHA KELISHI KERAK / QANCHA KELGAN / QANCHA QOLGAN', cols: ["Ko'rsatkich", 'Summa'],
        note: 'Qodir aka bizga har chek uchun beradi: mijozga berilgan summa + agent ulushi + bizning foyda (Alif orqali 5%, Finsum 6%).',
        rows: [
          ['Cheklar soni', rows.length], ['Yechilgan limit jami', N(sum(rows, 'withdrawnLimit'))],
          ['   mijozga berilgan (chek)', N(sum(rows, 'calculatedAmount'))], ['   agent ulushi', N(sum(rows, 'agentAmount'))], ['   bizning foyda', N(sum(rows, 'profit'))],
          ['KELISHI KERAK (Qodir aka berishi kerak)', N(must)], ["KELGAN (Qodir aka bergan to'lovlar)", N(paid)], ['QOLGAN (Qodir aka qarzi)', N(must - paid)],
        ],
      },
      { head: "QODIR AKA BERGAN TO'LOVLAR", cols: ['Sana', 'Summa', 'DDS raqami', 'Izoh'], rows: pays.map((e) => [dmy(e.dateTime), N(e.amount), e.ddsTransaction?.txNumber || '', e.ddsTransaction?.description || e.note || ''] as Row) },
      whoBlock(rows), whenBlock(rows), statusBlock(rows),
      { head: "CHEKLAR RO'YXATI", cols: [...listCols, 'Qodir aka berishi kerak'], rows: [...rows.map((d) => [...listRow(d), N(debtBy.get(d.id))] as Row), listTotal(rows, [N(must)])] },
    ]);
  }

  // ───────── 2. DAFTAR (Denov, Jizzax) ─────────
  {
    const rows = approved.filter((d) => ['Denov', 'Jizzax'].includes(canonicalStoreName(d.store?.name) as string));
    const got = rows.filter((d) => d.daftarMoneyAt), dev = rows.filter((d) => d.devicePurchaseAmount != null), sold = rows.filter((d) => d.status === 'SOLD' && Number(d.salePrice) > 0);
    const spent = sum(rows, 'calculatedAmount') + sum(rows, 'agentAmount');
    summary.push(`Daftar: ${rows.length} chek, limit ${N(sum(rows, 'withdrawnLimit'))}, sarf ${N(spent)}, pul tushgan ${got.length} ta, qurilma olingan ${dev.length} ta, sotilgan ${sold.length} ta`);
    const stores = [...grp(rows, (d) => d.store?.name || '—')];
    addSheet(wb, 'Daftar', "DAFTAR — Denov va Jizzax (provayder Imanum)", [
      {
        head: "JAMI", cols: ["Ko'rsatkich", 'Cheklar soni', 'Summa'],
        note: "Pul tushgani, qurilma narxi va sotuv narxi saytda hali kiritilmagan bo'lsa 0 ko'rinadi — bu pul kelmagan degani EMAS, belgilanmagan degani.",
        rows: [
          ['Urilgan cheklar (yechilgan limit)', rows.length, N(sum(rows, 'withdrawnLimit'))],
          ...stores.map(([k, g]) => [`   ${k}`, g.length, N(sum(g, 'withdrawnLimit'))] as Row),
          ['Kompaniya sarflagan (mijozga + agentga)', rows.length, N(spent)],
          ['   mijozga berilgan', rows.length, N(sum(rows, 'calculatedAmount'))], ['   agent ulushi', rows.length, N(sum(rows, 'agentAmount'))],
          ['Daftardan pul tushgan deb belgilangan', got.length, N(sum(got, 'withdrawnLimit'))],
          ['Pul tushgani hali belgilanmagan', rows.length - got.length, N(sum(rows, 'withdrawnLimit') - sum(got, 'withdrawnLimit'))],
          ['Qurilma olingan (narxi kiritilgan)', dev.length, N(sum(dev, 'devicePurchaseAmount'))],
          ['Qurilma sotilgan (narxi kiritilgan)', sold.length, N(sum(sold, 'salePrice'))],
        ],
      },
      whoBlock(rows), whenBlock(rows), statusBlock(rows),
      {
        head: "CHEKLAR RO'YXATI", cols: [...listCols, 'Kompaniya sarfi', 'Pul tushgan sana', 'Qurilma narxi'],
        rows: [...rows.map((d) => [...listRow(d), N(Number(d.calculatedAmount) + Number(d.agentAmount)), dmy(d.daftarMoneyAt), d.devicePurchaseAmount == null ? null : N(d.devicePurchaseAmount)] as Row), listTotal(rows, [N(spent), '', N(sum(dev, 'devicePurchaseAmount')) || null])],
      },
    ]);
  }

  // ───────── 3. TRUST ─────────
  {
    const rows = approved.filter((d) => isTrustDeal(d.store?.name, d.provider?.name));
    const pays = trustLedger.filter((e) => e.type === 'PAYMENT');
    const paid = pays.reduce((s, e) => s + Number(e.amount), 0), limit = sum(rows, 'withdrawnLimit');
    summary.push(`Trust: ${rows.length} chek, limit ${N(limit)}, Trust bergan ${N(paid)}`);
    addSheet(wb, 'Trust', 'TRUST (Ishonch) — hisob-kitob', [
      {
        head: 'PUL: QANCHA KELISHI KERAK / QANCHA KELGAN / QANCHA QOLGAN', cols: ["Ko'rsatkich", 'Summa'],
        note: "Trust bizga har chek uchun TO'LIQ yechilgan limitni beradi; limitning 16% i — bizning foyda (egasi, 16.11.2026).",
        rows: [
          ['KELISHI KERAK (Trust berishi kerak)', N(limit)], ['KELGAN (Trust bergan)', N(paid)], ['QOLGAN (Trust qarzi)', N(limit - paid)],
          ['Bizning foyda (limitning 16% i)', N(limit * 0.16)],
        ],
      },
      { head: 'JAMI', cols: ["Ko'rsatkich", 'Summa'], rows: [['Cheklar soni', rows.length], ['Yechilgan limit', N(limit)], ['Mijozga berilgan', N(sum(rows, 'calculatedAmount'))], ['Agent ulushi', N(sum(rows, 'agentAmount'))], ['Bizning foyda (16%)', N(limit * 0.16)], ['Trust bergan pul', N(paid)]] },
      { head: 'TRUST BERGAN PULLAR', cols: ['Sana', 'Summa', 'DDS raqami', 'Izoh'], rows: pays.map((e) => [dmy(e.dateTime), N(e.amount), e.ddsTransaction?.txNumber || '', e.ddsTransaction?.description || e.note || ''] as Row) },
      agencyBlock(rows), whoBlock(rows), whenBlock(rows), statusBlock(rows),
      { head: "CHEKLAR RO'YXATI", cols: [...listCols, 'Trust berishi kerak'], rows: [...rows.map((d) => [...listRow(d), N(d.withdrawnLimit)] as Row), listTotal(rows, [N(limit)])] },
    ]);
  }

  // ───────── 4–5. IMAN, NOVZA ─────────
  const storeSheet = (name: string, title: string, match: (s: string) => boolean) => {
    const rows = approved.filter((d) => match(d.store?.name || ''));
    const led = storeLedger.filter((e) => match(e.store?.name || ''));
    const debt = led.filter((e) => e.type === 'DEBT').reduce((s, e) => s + Number(e.amount), 0), paid = led.filter((e) => e.type === 'PAYMENT').reduce((s, e) => s + Number(e.amount), 0);
    const sold = rows.filter((d) => d.status === 'SOLD');
    const buyerDebt = sum(sold, 'debtRemainder');
    summary.push(`${name}: ${rows.length} chek, limit ${N(sum(rows, 'withdrawnLimit'))}, kelgan ${rows.filter((d) => ARRIVED.has(d.status)).length}, qolgan ${rows.filter((d) => NOT_ARRIVED.has(d.status)).length}, sotilgan ${sold.length} (${N(sum(sold, 'salePrice'))})`);
    addSheet(wb, name, title, [
      goodsBlock(rows),
      {
        head: 'PUL', cols: ["Ko'rsatkich", 'Cheklar soni', 'Summa'],
        note: "Do'kon daftari 10.11.2026 dan yuritiladi — undan oldingi cheklar do'kon qarziga kirmagan.",
        rows: [
          ['Yechilgan limit jami', rows.length, N(sum(rows, 'withdrawnLimit'))], ['Mijozga berilgan jami', rows.length, N(sum(rows, 'calculatedAmount'))],
          ['Agent ulushi jami', rows.length, N(sum(rows, 'agentAmount'))],
          ["Do'kon daftari: do'kon bizga berishi kerak (10.11 dan)", led.filter((e) => e.type === 'DEBT').length, N(debt)],
          ["Do'kon daftari: do'kon bergan", led.filter((e) => e.type === 'PAYMENT').length, N(paid)], ["Do'kon daftari: qolgan", null, N(debt - paid)],
          ['Sotilgan tovarlar (sotuv narxi)', sold.length, N(sum(sold, 'salePrice'))], ['Sotuvdan foyda (saytdagi hisob)', sold.length, N(sum(sold, 'profit'))],
        ],
      },
      agencyBlock(rows), whoBlock(rows), whenBlock(rows), statusBlock(rows),
      { head: "CHEKLAR RO'YXATI", cols: listCols, rows: [...rows.map(listRow), listTotal(rows)] },
    ]);
    void buyerDebt;
  };
  storeSheet('Iman', "IMAN — do'konlar: Iman va Iman rebus", (s) => /^iman(\s|$)/i.test(s.trim()));
  storeSheet('Novza', "NOVZA — do'kon", (s) => canonicalStoreName(s) === 'Novza');

  await wb.xlsx.writeFile(out);
  console.log(summary.join('\n'));
  console.log(`Tasdiqlanmagan (hisobotga kirmagan) cheklar: ${deals.length - approved.length}`);
  console.log(`Fayl: ${out}`);
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
