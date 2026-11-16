/**
 * Do'kon daftarini (do'konlar bilan hisob-kitob) mavjud bitimlardan to'ldirish. Qayta ishga tushirish xavfsiz (idempotent).
 *
 * Qoida (calculation.service.ts → calcStoreDebt): TASDIQLANGAN, sanasi daftar boshlangan kundan (STORE_LEDGER_START_YMD)
 * keyingi, Trust bo'lmagan do'kon bitimi uchun DEBT yozuvi = "mijozga berilgan summa". Qodir aka: BIZ undan qarzdormiz,
 * qolgan do'konlar: DO'KON bizdan qarzdor. Qolgan hollarda (tasdiqlanmagan, eski sana, Trust, summa 0) yozuv bo'lmaydi —
 * mavjud bo'lsa o'chiriladi. To'lovlar (PAYMENT) bu skriptga tegishli emas — ular DDS orqali yoziladi.
 *
 *   npx ts-node --transpile-only scripts/backfill-store-ledger.ts            (DRY-RUN: faqat ko'rsatadi)
 *   npx ts-node --transpile-only scripts/backfill-store-ledger.ts --apply    (bazaga yozadi, syncStoreDebtForDeal orqali)
 *
 * Natija FinModel/backups/store-ledger-dry-run.txt (yoki store-ledger-apply-<vaqt>.txt) fayliga ham yoziladi.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import {
  STORE_LEDGER_START_YMD,
  formatTashkentDateTime,
  isOnOrAfterStoreLedgerStart,
  storeSettlementKind,
} from '../src/services/calculation.service';
import { storeDebtPartsForDeal, syncStoreDebtForDeal } from '../src/services/ledger.service';
import { loadActiveCommissionRules } from '../src/services/sale.service';

const APPLY = process.argv.includes('--apply');
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

const SETTLEMENT_LABEL: Record<string, string> = {
  WE_OWE: 'BIZ qarzdormiz (Qodir aka)',
  STORE_OWES: "DO'KON bizdan qarzdor",
  TRUST: "Trust daftari (do'kon daftariga yozilmaydi)",
};

type Action = 'create' | 'update' | 'remove' | 'same';
interface Row {
  dealId: string;
  dealNumber: number;
  date: Date;
  customerName: string | null;
  action: Action;
  before: number;
  after: number;
}

async function main() {
  const startedAt = new Date();
  out('═══════════════════════════════════════════════════════════════════════');
  out(` DO'KON DAFTARI: bitimlardan qarz yozuvlarini to'ldirish (${STORE_LEDGER_START_YMD.split('-').reverse().join('.')} dan)`);
  out('═══════════════════════════════════════════════════════════════════════');
  out(APPLY ? ">>> YOZISH rejimi (--apply): do'kon daftari yangilanadi" : '>>> DRY-RUN: bazaga HECH NARSA yozilmaydi. Yozish uchun: --apply');
  out(`Baza:    ${describeDatabase()}`);
  out(`Vaqt:    ${startedAt.toISOString()}`);
  out('');

  const [deals, existing, stores] = await Promise.all([
    prisma.deal.findMany({
      orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
      select: {
        id: true,
        dealNumber: true,
        date: true,
        customerName: true,
        calculatedAmount: true,
        withdrawnLimit: true,
        customerLimit: true,
        approvalStatus: true,
        storeId: true,
        store: { select: { name: true } },
        provider: { select: { name: true } },
      },
    }),
    prisma.storeLedgerEntry.findMany({
      where: { dealId: { not: null } },
      select: { dealId: true, storeId: true, amount: true, dateTime: true },
    }),
    prisma.store.findMany({ select: { id: true, name: true } }),
  ]);
  const rules = await loadActiveCommissionRules();
  const existingByDeal = new Map(existing.map((e) => [e.dealId as string, e]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  const skipped = { notApproved: 0, beforeStart: 0, trust: 0, zero: 0 };
  const byStore = new Map<string, Row[]>();
  const changes: Row[] = [];

  for (const d of deals) {
    // Qodir aka: chek + agent ulushi + 6% foyda; boshqa do'konlar: faqat chek (syncStoreDebtForDeal bilan bir xil yo'l)
    const after = (await storeDebtPartsForDeal(prisma, d, rules)).total;
    const ex = existingByDeal.get(d.id);
    const before = ex ? Number(ex.amount) : 0;

    if (after <= 0) {
      if (d.approvalStatus !== 'APPROVED') skipped.notApproved++;
      else if (storeSettlementKind(d.store?.name) === 'TRUST') skipped.trust++;
      else if (!isOnOrAfterStoreLedgerStart(d.date)) skipped.beforeStart++;
      else skipped.zero++;
    }

    let action: Action = 'same';
    if (after > 0 && !ex) action = 'create';
    else if (after > 0 && ex && (before !== after || ex.storeId !== d.storeId || ex.dateTime.getTime() !== d.date.getTime())) action = 'update';
    else if (after <= 0 && ex) action = 'remove';
    else if (after <= 0) continue; // yozuv yo'q va bo'lmaydi

    const row: Row = { dealId: d.id, dealNumber: d.dealNumber, date: d.date, customerName: d.customerName, action, before, after };
    if (!byStore.has(d.storeId)) byStore.set(d.storeId, []);
    byStore.get(d.storeId)!.push(row);
    if (action !== 'same') changes.push(row);
  }

  const ACTION_LABEL: Record<Action, string> = { create: 'YANGI', update: 'YANGILANADI', remove: "O'CHIRILADI", same: "o'zgarmaydi" };
  const totals = { create: 0, update: 0, remove: 0, same: 0, debtAfter: 0, weOwe: 0, storesOwe: 0 };

  const storeIds = Array.from(byStore.keys()).sort((a, b) => (storeName.get(a) || '').localeCompare(storeName.get(b) || ''));
  for (const sid of storeIds) {
    const rows = byStore.get(sid)!;
    const name = storeName.get(sid) || sid;
    const kind = storeSettlementKind(name);
    const debtAfter = rows.reduce((s, r) => s + r.after, 0);
    const count = (a: Action) => rows.filter((r) => r.action === a).length;
    out(`── ${name} — ${SETTLEMENT_LABEL[kind]} ──`);
    out(
      `   yangi: ${count('create')}, yangilanadi: ${count('update')}, o'chiriladi: ${count('remove')}, o'zgarmaydi: ${count('same')};` +
        ` qarz yozuvlari jami: ${fmt(debtAfter)} so'm`
    );
    for (const r of rows) {
      if (r.action === 'same') continue;
      out(
        `   #${String(r.dealNumber).padEnd(8)} ${formatTashkentDateTime(r.date)}  ${cut(r.customerName, 26).padEnd(26)}  ` +
          `${ACTION_LABEL[r.action].padEnd(12)} ${r.action === 'create' ? '' : fmt(r.before) + ' → '}${fmt(r.after)}`
      );
    }
    for (const a of ['create', 'update', 'remove', 'same'] as Action[]) totals[a] += count(a);
    totals.debtAfter += debtAfter;
    if (kind === 'WE_OWE') totals.weOwe += debtAfter;
    else totals.storesOwe += debtAfter;
    out('');
  }
  if (!storeIds.length) out("  Do'kon daftariga yoziladigan bitim yo'q.\n");

  out('── YAKUN ──');
  out(`  Bitimlar jami: ${deals.length} ta; do'konlar (yozuvi bor/bo'ladigan): ${storeIds.length} ta.`);
  out(`  Yangi yozuv: ${totals.create} ta; yangilanadi: ${totals.update} ta; o'chiriladi: ${totals.remove} ta; o'zgarmaydi: ${totals.same} ta.`);
  out(`  Qarz yozuvlari jami (DEBT, to'lovlarsiz): ${fmt(totals.debtAfter)} so'm`);
  out(`     hammasi do'konlar BIZGA qarzi (Qodir aka ham: chek + agent ulushi + 6% foyda): ${fmt(totals.storesOwe)} so'm.`);
  out(
    `  Yozuv yaratilmaydi: tasdiqlanmagan ${skipped.notApproved} ta; ${STORE_LEDGER_START_YMD} dan oldingi ${skipped.beforeStart} ta;` +
      ` Trust do'koni ${skipped.trust} ta; summa 0 — ${skipped.zero} ta.`
  );

  if (APPLY) {
    let done = 0;
    for (const r of changes) {
      // Uzoqdagi bazada (sekin aloqa) standart 5 soniyalik chegara yetmaydi
      await prisma.$transaction((tx) => syncStoreDebtForDeal(tx, r.dealId), { timeout: 60000, maxWait: 20000 });
      done++;
    }
    out(`  YOZILDI: ${done} ta bitim bo'yicha do'kon daftari moslashtirildi.`);
  } else {
    out('  DRY-RUN tugadi — bazaga hech narsa yozilmadi.');
  }

  const dir = path.resolve(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, APPLY ? `store-ledger-apply-${startedAt.toISOString().replace(/[:.]/g, '-')}.txt` : 'store-ledger-dry-run.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  console.log(`\nNatija saqlandi: ${file}`);
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
