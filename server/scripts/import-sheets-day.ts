/**
 * Google Sheets'dagi "Сделки_и_Склад" varag'idan BITTA KUNNING yetishmayotgan bitimlarini import qilish.
 * Bazada bor bitimlar HECH QACHON yangilanmaydi — faqat yo'qlari qo'shiladi.
 *
 *   npx ts-node --transpile-only scripts/import-sheets-day.ts --date=09.11.2026            (DRY-RUN: faqat ro'yxat)
 *   npx ts-node --transpile-only scripts/import-sheets-day.ts --date=09.11.2026 --apply    (bazaga yozadi)
 *
 * Qo'shimcha:
 *   --url=<havola>   boshqa Google Sheets hujjati (standart: sheetsSync.service DEFAULT_SHEETS_URL)
 *   --cache          Google'dan yuklab bo'lmasa server/temp_live_download.xlsx kabi ESKI lokal nusxadan foydalanishga ruxsat
 *                    (standart: ruxsat yo'q — yuklab bo'lmasa skript aniq xato bilan to'xtaydi)
 *
 * Dublikat himoyasi (sheetsSync.service): bitim raqami (ID) + "barmoq izi" (kun + yechilgan limit + do'kon + telefon/ism).
 * Do'kon / provayder / agentlik kanonik nom bo'yicha solishtiriladi — spravochnik birlashtirilgan bo'lsa ham, bo'lmasa ham ishlaydi.
 * Natija FinModel/backups/sheets-import-dry-run.txt (yoki sheets-import-apply-<vaqt>.txt) fayliga ham yoziladi.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { tashkentDayRange } from '../src/services/calculation.service';
import {
  DEFAULT_SHEETS_URL,
  SheetRowSummary,
  SheetSkippedRow,
  SheetsDownloadError,
  extractSheetId,
  findSheetsCacheFile,
  formatYmd,
  parseDayArg,
  syncDealsFromGoogleSheets,
} from '../src/services/sheetsSync.service';

const argValue = (name: string): string | null => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
};
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const cut = (s: string | null | undefined, max: number) => {
  const v = (s || '').trim();
  if (!v) return '—';
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
};

const lines: string[] = [];
function out(line = '') {
  lines.push(line);
  console.log(line);
}

function table(headers: string[], rows: (string | number)[][], rightAlign: number[] = []) {
  const all = [headers, ...rows.map((r) => r.map((c) => String(c)))];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => (r[i] || '').length)));
  const render = (r: string[]) =>
    '  ' + r.map((c, i) => (rightAlign.includes(i) ? (c || '').padStart(widths[i]) : (c || '').padEnd(widths[i]))).join('  │  ').trimEnd();
  out(render(headers));
  out('  ' + widths.map((w) => '─'.repeat(w)).join('──┼──'));
  for (const r of all.slice(1)) out(render(r));
}

/** Baza manzili (parol/loginlarsiz) */
function describeDatabase(): string {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
  } catch (e) {
    return "(DATABASE_URL o'qilmadi)";
  }
}

const ROW_HEADERS = ['Qator', '№', 'Bitim #', 'Sana', 'Mijoz', 'Telefon', "Do'kon", 'Provayder', 'Agentlik / agent', 'Yechilgan limit', "Mijozga to'lov", 'Mahsulot'];
const ROW_RIGHT = [0, 1, 2, 9, 10];
const rowCells = (r: SheetRowSummary): (string | number)[] => [
  r.rowNumber,
  r.seq || '—',
  r.sheetId === null ? `${r.dealNumber}*` : r.dealNumber,
  r.date ? formatYmd(r.date) : '—',
  cut(r.customerName, 22),
  cut(r.customerPhone, 16),
  cut(r.storeName, 20),
  cut(r.providerName, 16),
  cut([r.agencyName, r.agentName].filter(Boolean).join(' / '), 24),
  fmt(r.withdrawnLimit),
  fmt(r.calculatedAmount),
  cut(r.productName, 36),
];

function printRows(rows: SheetRowSummary[]) {
  table(ROW_HEADERS, rows.map(rowCells), ROW_RIGHT);
  if (rows.some((r) => r.sheetId === null)) out('  * varaqda ID bo\'sh yoki takror — raqam "8000 + №" sxemasi bo\'yicha berilgan');
  for (const r of rows) for (const n of r.notes) out(`  ! ${r.rowNumber}-qator (bitim #${r.dealNumber}): ${n}`);
}

function printSkipped(rows: SheetSkippedRow[]) {
  table([...ROW_HEADERS, 'Sabab'], rows.map((r) => [...rowCells(r), r.reason]), ROW_RIGHT);
  for (const r of rows) for (const n of r.notes) out(`  ! ${r.rowNumber}-qator (bitim #${r.dealNumber}): ${n}`);
}

/** Ekranga chiqqan natijani FinModel/backups ichiga ham saqlaydi (xato bilan tugaganda ham — eskirgan fayl qolib ketmasin) */
function saveOutput(apply: boolean, startedAt: Date) {
  const dir = path.resolve(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, apply ? `sheets-import-apply-${startedAt.toISOString().replace(/[:.]/g, '-')}.txt` : 'sheets-import-dry-run.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  console.log(`\nNatija saqlandi: ${file}`);
}

async function main() {
  const APPLY = hasFlag('apply');
  const ALLOW_CACHE = hasFlag('cache');
  const startedAt = new Date();

  const dateArg = argValue('date');
  if (!dateArg) {
    console.error('Xato: --date majburiy. Masalan:  npx ts-node --transpile-only scripts/import-sheets-day.ts --date=09.11.2026');
    process.exitCode = 2;
    return;
  }
  const day = parseDayArg(dateArg);
  if (!day) {
    console.error(`Xato: --date noto'g'ri: "${dateArg}". Kutilgan format: DD.MM.YYYY (masalan 09.11.2026) yoki YYYY-MM-DD.`);
    process.exitCode = 2;
    return;
  }
  const url = argValue('url') || DEFAULT_SHEETS_URL;
  const sheetId = extractSheetId(url);

  out('═══════════════════════════════════════════════════════════════════════');
  out(` GOOGLE SHEETS → BAZA: ${formatYmd(day)} KUNINING YETISHMAYOTGAN BITIMLARI`);
  out('═══════════════════════════════════════════════════════════════════════');
  out(APPLY ? ">>> YOZISH rejimi (--apply): yetishmayotgan bitimlar bazaga qo'shiladi" : '>>> DRY-RUN: bazaga HECH NARSA yozilmaydi. Yozish uchun: --apply');
  out(`Baza:    ${describeDatabase()}`);
  out(`Hujjat:  https://docs.google.com/spreadsheets/d/${sheetId || '?'}  (varaq: "Сделки_и_Склад")`);
  out(`Vaqt:    ${startedAt.toISOString()}`);
  out('');

  const dbCount = async () => {
    const { start, end } = tashkentDayRange(day, day);
    return prisma.deal.count({ where: { date: { gte: start, lte: end } } });
  };
  const dbBefore = await dbCount();
  const dbTotalBefore = await prisma.deal.count();

  let result: Awaited<ReturnType<typeof syncDealsFromGoogleSheets>>;
  try {
    result = await syncDealsFromGoogleSheets(url, undefined, {
      onlyDate: day,
      onlyMissing: true,
      dryRun: !APPLY,
      allowCacheFallback: ALLOW_CACHE,
    });
  } catch (e: any) {
    if (e instanceof SheetsDownloadError) {
      out('XATO: Google Sheets hujjatini yuklab bo\'lmadi — import bajarilmadi, bazaga hech narsa yozilmadi.');
      out(`  Sabab: ${e.message}`);
      const cache = findSheetsCacheFile();
      if (cache) {
        out(`  Eski lokal nusxa bor: ${cache.path} (fayl sanasi: ${cache.modifiedAt.toISOString()}).`);
        out('  Undan foydalanish uchun --cache bayrog\'ini qo\'shing (ma\'lumot eskirgan bo\'lishi mumkin — standart holatda ishlatilmaydi).');
      }
      saveOutput(APPLY, startedAt);
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  // Manba
  if (result.source.kind === 'cache') {
    out('!!! DIQQAT: Google Sheets yuklab olinmadi — ESKI LOKAL NUSXA ishlatildi (--cache) !!!');
    out(`!!! Fayl: ${result.source.path}`);
    out(`!!! Fayl sanasi: ${result.source.modifiedAt}  — shu vaqtdan keyin varaqqa kiritilgan qatorlar bu ro'yxatda YO'Q.`);
  } else {
    out(`Manba: Google Sheets'dan hozir yuklab olindi (${result.source.url}).`);
  }
  for (const w of result.warnings) if (result.source.kind !== 'cache') out(`Ogohlantirish: ${w}`);
  out(`Varaq "${result.sheetName}": jami ${result.sheetRows} ta bitim qatori, shundan ${formatYmd(day)} sanasida — ${result.rowsForDate} ta.`);
  out(`Bazada ${formatYmd(day)} (Toshkent kuni) sanasida — ${dbBefore} ta bitim (bazada jami ${dbTotalBefore} ta).`);

  // QO'SHILADI
  const toInsert = result.toInsert;
  out('');
  out(`── ${APPLY ? "QO'SHILDI" : "QO'SHILADI"}: ${toInsert.length} ta ──`);
  if (toInsert.length) {
    printRows(toInsert);
    out(`  Jami yechilgan limit: ${fmt(toInsert.reduce((s, r) => s + r.withdrawnLimit, 0))}; jami mijozga to'lov: ${fmt(toInsert.reduce((s, r) => s + r.calculatedAmount, 0))}`);
  } else {
    out(`  Qo'shiladigan bitim yo'q — ${formatYmd(day)} sanasidagi barcha qatorlar bazada bor.`);
  }
  if (result.newReferences.length) {
    out(`  Spravochnikda topilmagan nomlar (${APPLY ? 'yaratildi' : '--apply da yaratiladi'}): ${result.newReferences.join('; ')}`);
  }

  // O'TKAZIB YUBORILDI (bazada bor)
  const byCode = (...codes: string[]) => result.skipped.filter((s) => codes.includes(s.code)).sort((a, b) => a.rowNumber - b.rowNumber);
  const existsById = byCode('EXISTS_ID');
  const existsByFp = byCode('EXISTS_FINGERPRINT');
  out('');
  out(`── O'TKAZIB YUBORILDI (bazada bor): ${existsById.length + existsByFp.length} ta ──`);
  if (existsById.length + existsByFp.length) printSkipped([...existsById, ...existsByFp].sort((a, b) => a.rowNumber - b.rowNumber));
  else out("  Yo'q.");
  out(`  Shundan: bitim raqami (ID) bo'yicha — ${existsById.length} ta; barmoq izi bo'yicha — ${existsByFp.length} ta.`);

  // Boshqa sabablar
  const sheetDup = byCode('SHEET_DUPLICATE').filter((s) => s.date === day);
  const idConflict = byCode('ID_CONFLICT');
  const unreadable = byCode('DATE_UNREADABLE');
  const empty = byCode('EMPTY_ROW');
  const mismatch = byCode('DATE_MISMATCH');
  out('');
  out("── O'TKAZIB YUBORILDI (boshqa sabablar) ──");
  out(`  Varaqda takror qator: ${sheetDup.length} ta`);
  if (sheetDup.length) printSkipped(sheetDup);
  out(`  ID to'qnashuvi (qo'lda tekshirish kerak): ${idConflict.length} ta`);
  if (idConflict.length) printSkipped(idConflict);
  out(`  Sana o'qilmadi: ${unreadable.length} ta`);
  if (unreadable.length) printSkipped(unreadable);
  out(`  Bo'sh qator (№ bor, ma'lumot yo'q): ${empty.length} ta${empty.length ? ' — ' + empty.map((r) => `${r.rowNumber}-qator`).join(', ') : ''}`);
  out(`  Sana mos emas (boshqa kunlar): ${mismatch.length} ta`);

  // Diqqat talab qiladigan mosliklar
  const doubtful = [...existsById, ...existsByFp].filter((s) => s.notes.length || s.code === 'EXISTS_FINGERPRINT');
  out('');
  out("── SHUBHALI MOSLIKLAR (qo'lda ko'zdan kechiring) ──");
  if (!doubtful.length && !idConflict.length) out("  Yo'q — barcha mosliklar bitim raqami bo'yicha, sana / yechilgan limit / do'kon ham bir xil.");
  else for (const s of doubtful) out(`  ${s.rowNumber}-qator (№${s.seq}, bitim #${s.dealNumber}): ${s.reason}${s.notes.length ? ' — ' + s.notes.join('; ') : ''}`);

  // Yakun
  const dbAfter = await dbCount();
  const dbTotalAfter = await prisma.deal.count();
  out('');
  out('── YAKUN ──');
  out(`  Varaqda ${formatYmd(day)}: ${result.rowsForDate} ta qator = ${APPLY ? "qo'shildi" : "qo'shiladi"} ${toInsert.length} + bazada bor ${existsById.length + existsByFp.length} + boshqa sabab ${sheetDup.length + idConflict.length}`);
  if (APPLY) {
    out(`  Bazada ${formatYmd(day)}: oldin ${dbBefore} → keyin ${dbAfter} ta bitim (jami: ${dbTotalBefore} → ${dbTotalAfter}); yozildi: ${result.inserted} ta.`);
  } else {
    out(`  Bazada ${formatYmd(day)}: ${dbAfter} ta bitim (jami ${dbTotalAfter}) — o'zgarmadi. --apply dan keyin: ${dbBefore + toInsert.length} ta bo'ladi.`);
    out('  DRY-RUN tugadi — bazaga hech narsa yozilmadi.');
  }

  saveOutput(APPLY, startedAt);
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
