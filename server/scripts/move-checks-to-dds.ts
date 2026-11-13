/**
 * Chek xarajatlarini (mijozga berilgan summa) tanlangan sanadan boshlab DDS chiqimiga ommaviy ko'chirish.
 * Faqat TASDIQLANGAN va chek xarajati hali DDS'ga yozilmagan bitimlar olinadi. Qodir aka cheklari xarajatga olinmaydi.
 * DDS yozuvi BITIM SANASI bilan yoziladi (bugungi sana emas). Qayta ishga tushirish xavfsiz — yozilgani qayta yozilmaydi.
 *
 *   npx ts-node --transpile-only scripts/move-checks-to-dds.ts                      (DRY-RUN, 10.11.2026 dan)
 *   npx ts-node --transpile-only scripts/move-checks-to-dds.ts --from=10.11.2026 --to=12.11.2026
 *   npx ts-node --transpile-only scripts/move-checks-to-dds.ts --from=10.11.2026 --apply   (bazaga yozadi)
 *
 * Qo'shimcha:
 *   --account=CASH|BANK_CARD|SETTLEMENT_ACCOUNT   qaysi hisobdan chiqim (standart: CASH)
 *
 * Natija FinModel/backups/checks-to-dds-dry-run.txt (yoki checks-to-dds-apply-<vaqt>.txt) fayliga ham yoziladi.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { AccountType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { formatTashkentDateTime, tashkentDayRange } from '../src/services/calculation.service';
import {
  PendingCheckExpenseItem,
  applyPendingCheckExpenses,
  getAccountBalances,
  listPendingCheckExpenses,
} from '../src/services/ledger.service';

const DEFAULT_FROM = '10.11.2026';

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

/** "DD.MM.YYYY" yoki "YYYY-MM-DD" → "YYYY-MM-DD"; noto'g'ri bo'lsa null */
function parseDay(value: string): string | null {
  const s = value.trim();
  let ymd: string | null = null;
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (dmy) ymd = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) ymd = s;
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd ? ymd : null;
}
const dmy = (ymd: string) => ymd.split('-').reverse().join('.');

const HEADERS = ['Bitim №', 'Sana', "Do'kon", 'Mijoz', 'Summa'];
const cells = (r: PendingCheckExpenseItem): (string | number)[] => [
  r.dealNumber,
  formatTashkentDateTime(r.date),
  cut(r.storeName, 24),
  cut(r.customerName, 28),
  fmt(r.amount),
];

function saveOutput(apply: boolean, startedAt: Date) {
  const dir = path.resolve(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, apply ? `checks-to-dds-apply-${startedAt.toISOString().replace(/[:.]/g, '-')}.txt` : 'checks-to-dds-dry-run.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  console.log(`\nNatija saqlandi: ${file}`);
}

async function main() {
  const APPLY = hasFlag('apply');
  const startedAt = new Date();

  const fromArg = argValue('from') || DEFAULT_FROM;
  const from = parseDay(fromArg);
  if (!from) {
    console.error(`Xato: --from noto'g'ri: "${fromArg}". Kutilgan format: DD.MM.YYYY (masalan 10.11.2026) yoki YYYY-MM-DD.`);
    process.exitCode = 2;
    return;
  }
  const toArg = argValue('to');
  const to = toArg ? parseDay(toArg) : null;
  if (toArg !== null && !to) {
    console.error(`Xato: --to noto'g'ri: "${toArg}". Kutilgan format: DD.MM.YYYY yoki YYYY-MM-DD.`);
    process.exitCode = 2;
    return;
  }
  if (to && to < from) {
    console.error('Xato: --to sanasi --from sanasidan oldin bo\'lishi mumkin emas.');
    process.exitCode = 2;
    return;
  }
  const accountArg = (argValue('account') || AccountType.CASH).trim().toUpperCase();
  if (!(Object.values(AccountType) as string[]).includes(accountArg)) {
    console.error(`Xato: --account noto'g'ri: "${accountArg}". CASH, BANK_CARD yoki SETTLEMENT_ACCOUNT bo'lishi kerak.`);
    process.exitCode = 2;
    return;
  }
  const account = accountArg as AccountType;
  const range = tashkentDayRange(from, to);

  out('═══════════════════════════════════════════════════════════════════════');
  out(` CHEK XARAJATLARI → DDS: ${dmy(from)} dan ${to ? dmy(to) + ' gacha' : 'hozirgacha'}`);
  out('═══════════════════════════════════════════════════════════════════════');
  out(APPLY ? ">>> YOZISH rejimi (--apply): chek xarajatlari DDS chiqimiga yoziladi" : '>>> DRY-RUN: bazaga HECH NARSA yozilmaydi. Yozish uchun: --apply');
  out(`Baza:    ${describeDatabase()}`);
  out(`Hisob:   ${account}`);
  out(`Vaqt:    ${startedAt.toISOString()}`);
  out('');

  const pending = await listPendingCheckExpenses(range);
  const balancesBefore = (await getAccountBalances()) as Record<string, number>;

  out(`── ${APPLY ? 'YOZILADI (hozir)' : 'YOZILADI'}: ${pending.count} ta bitim, jami ${fmt(pending.total)} so'm ──`);
  if (pending.items.length) table(HEADERS, pending.items.map(cells), [0, 4]);
  else out("  Yoziladigan chek xarajati yo'q — shu davrdagi barcha tasdiqlangan bitimlar DDS'da bor.");

  out('');
  out(`── O'TKAZIB YUBORILADI — Qodir aka cheki (xarajatga olinmaydi): ${pending.qodirCount} ta, mijozga berilgan summa jami ${fmt(pending.qodirTotal)} so'm ──`);
  if (pending.qodirSkipped.length) table(HEADERS, pending.qodirSkipped.map(cells), [0, 4]);
  out(`── O'TKAZIB YUBORILADI — mijozga berilgan summa 0: ${pending.zeroCount} ta ──`);
  if (pending.zeroSkipped.length) table(HEADERS, pending.zeroSkipped.map(cells), [0, 4]);

  out('');
  out('── YAKUN ──');
  if (APPLY) {
    const result = await applyPendingCheckExpenses(range, { account });
    const balancesAfter = (await getAccountBalances()) as Record<string, number>;
    out(`  Yozildi: ${result.created} ta, jami ${fmt(result.total)} so'm; o'tkazib yuborildi (avval yozilgan): ${result.skipped} ta; xato: ${result.failed.length} ta.`);
    for (const f of result.failed) out(`  ! bitim #${f.dealNumber}: ${f.error}`);
    out(`  ${account} qoldig'i: ${fmt(balancesBefore[account])} → ${fmt(balancesAfter[account])} so'm (jami: ${fmt(balancesBefore.total)} → ${fmt(balancesAfter.total)}).`);
    if (result.failed.length) process.exitCode = 1;
  } else {
    out(`  Yoziladi: ${pending.count} ta bitim, jami ${fmt(pending.total)} so'm (${account} hisobidan, har biri bitim sanasi bilan).`);
    out(`  ${account} qoldig'i: hozir ${fmt(balancesBefore[account])} so'm → --apply dan keyin ${fmt(balancesBefore[account] - pending.total)} so'm.`);
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
