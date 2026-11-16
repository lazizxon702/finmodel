/**
 * Bir nechta xlsx hisobotni BITTA faylga yig'adi (har varaq alohida, tartib argumentlar bo'yicha). Bazaga tegmaydi.
 *   tsrun scripts/merge-xlsx.ts <chiqish.xlsx> <a.xlsx> <b.xlsx> ... [--skip="Varaq nomi,..."] [--first="Varaq nomi,..."]
 */
import ExcelJS from 'exceljs';

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=').split(',').map((s) => s.trim()).filter(Boolean);
  const skip = new Set(opt('skip'));
  const first = opt('first');
  const files = args.filter((a) => !a.startsWith('--'));
  const out = files.shift();
  if (!out || !files.length) throw new Error('Foydalanish: merge-xlsx.ts <chiqish> <fayl1> <fayl2> ...');

  const sheets: ExcelJS.Worksheet[] = [];
  for (const f of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(f);
    wb.eachSheet((ws) => { if (!skip.has(ws.name)) sheets.push(ws); });
  }
  sheets.sort((a, b) => {
    const ia = first.indexOf(a.name), ib = first.indexOf(b.name);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });

  const outWb = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const src of sheets) {
    let name = src.name;
    for (let i = 2; used.has(name); i++) name = `${src.name} (${i})`;
    used.add(name);
    const ws = outWb.addWorksheet(name);
    src.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
    src.eachRow({ includeEmpty: true }, (row, n) => {
      const r = ws.getRow(n);
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const c = r.getCell(col);
        c.value = cell.value;
        if (cell.font) c.font = cell.font;
        if (cell.fill) c.fill = cell.fill;
        if (cell.numFmt) c.numFmt = cell.numFmt;
      });
      r.commit();
    });
  }
  await outWb.xlsx.writeFile(out);
  console.log(`Varaqlar (${used.size}): ${[...used].join(' | ')}`);
  console.log(`Fayl: ${out}`);
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; });
