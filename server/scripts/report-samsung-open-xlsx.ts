// FAQAT O'QIYDI: saytda hali "Kutilmoqda / Sotib olish kerak / Omborda" turgan Samsung cheklari — egasi xaridor va narxni to'ldiradi.
//   tsrun scripts/report-samsung-open-xlsx.ts <chiqish.xlsx>
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { prisma } from '../src/lib/prisma';

const STATUS: Record<string, string> = { PENDING: 'Kutilmoqda', NEED_TO_BUY: 'Sotib olish kerak', IN_WAREHOUSE: 'Omborda', IN_TRANSIT: "Yo'lda" };
const isSam = (s: string) => /samsung|galaxy|самсунг/i.test(s);

async function main() {
  const deals = await prisma.deal.findMany({
    where: { status: { in: ['PENDING', 'NEED_TO_BUY', 'IN_WAREHOUSE', 'IN_TRANSIT'] }, approvalStatus: { not: 'REJECTED' } },
    orderBy: { date: 'asc' },
    select: { dealNumber: true, date: true, status: true, approvalStatus: true, withdrawnLimit: true, totalPurchaseCost: true, productName: true,
      store: { select: { name: true } }, provider: { select: { name: true } }, items: { orderBy: { position: 'asc' }, select: { productName: true, imei1: true, quantity: true } } },
  });
  const sam = deals.filter((d) => {
    const names = d.items.length ? d.items.map((i) => i.productName) : [d.productName || ''];
    return names.length > 0 && names.every((n) => isSam(n));
  });
  const imeiCount = new Map<string, number>();
  for (const d of sam) for (const i of d.items) if (i.imei1) imeiCount.set(i.imei1, (imeiCount.get(i.imei1) || 0) + 1);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Samsung — to\'ldiring');
  ws.columns = [
    { header: 'Chek', width: 8 }, { header: 'Sana', width: 11 }, { header: "Do'kon", width: 18 }, { header: 'Provayder', width: 14 },
    { header: 'Tovar', width: 50 }, { header: 'Dona', width: 6 }, { header: 'IMEI', width: 34 }, { header: 'Saytdagi holat', width: 16 },
    { header: 'Tannarx', width: 13 }, { header: 'XARIDOR (to\'ldiring)', width: 20 }, { header: 'SOTUV NARXI (to\'ldiring)', width: 22 }, { header: 'SOTILGAN SANA', width: 15 }, { header: 'Izoh', width: 36 },
  ];
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const d of sam) {
    const qty = d.items.reduce((a, i) => a + (i.quantity || 1), 0) || 1;
    const imeis = d.items.map((i) => i.imei1).filter(Boolean) as string[];
    const notes: string[] = [];
    if (imeis.some((x) => (imeiCount.get(x) || 0) > 1)) notes.push('IMEI boshqa chekda ham bor');
    if (d.approvalStatus !== 'APPROVED') notes.push('Chek hali tasdiqlanmagan');
    if (!imeis.length) notes.push("IMEI yo'q");
    const r = ws.addRow([
      `#${d.dealNumber}`, d.date, d.store.name, d.provider.name,
      d.items.length ? d.items.map((i) => i.productName + ((i.quantity || 1) > 1 ? ` ×${i.quantity}` : '')).join('; ') : d.productName,
      qty, imeis.join(', '), STATUS[d.status] || d.status, Number(d.totalPurchaseCost), '', '', '', notes.join('; '),
    ]);
    for (const c of [10, 11, 12]) r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } };
  }
  ws.getColumn(2).numFmt = 'dd.mm.yyyy';
  ws.getColumn(9).numFmt = '#,##0';
  ws.addRow([]);
  const tot = ws.addRow(['JAMI', '', '', '', `${sam.length} chek`, sam.reduce((a, d) => a + (d.items.reduce((s, i) => s + (i.quantity || 1), 0) || 1), 0), '', '', sam.reduce((a, d) => a + Number(d.totalPurchaseCost), 0)]);
  tot.font = { bold: true };
  tot.getCell(9).numFmt = '#,##0';
  await wb.xlsx.writeFile(process.argv[2]);
  const byStatus: Record<string, number> = {};
  for (const d of sam) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  console.log(JSON.stringify({ deals: sam.length, units: sam.reduce((a, d) => a + (d.items.reduce((s, i) => s + (i.quantity || 1), 0) || 1), 0), cost: sam.reduce((a, d) => a + Number(d.totalPurchaseCost), 0), byStatus, dupImei: [...imeiCount].filter(([, n]) => n > 1).map(([k]) => k) }));
}
main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
