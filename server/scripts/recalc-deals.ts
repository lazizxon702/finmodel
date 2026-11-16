/**
 * HAMMA bitimlarni yangi foyda qoidalari (14.11.2026) bo'yicha qayta hisoblash. Qayta ishga tushirish xavfsiz (idempotent).
 *
 * O'zgaradigan maydonlar: agentAmount (agent foydasi), totalPurchaseCost (tannarx), agentPct, purchaseDiscountPct,
 * profit, marginPct. Limit, mijozga berilgan summa, holat, sotuv narxi va to'lovlarga TEGILMAYDI.
 * --apply da har bir o'zgargan bitim uchun do'kon daftari ham moslashtiriladi (syncStoreDebtForDeal).
 *
 * AVVAL spravochnik qoidalari yangilangan bo'lishi kerak: scripts/seed-commission-rules.ts --apply
 *
 *   npx ts-node --transpile-only scripts/recalc-deals.ts            (DRY-RUN: faqat ko'rsatadi)
 *   npx ts-node --transpile-only scripts/recalc-deals.ts --apply    (bazaga yozadi)
 *
 * Natija FinModel/backups/recalc-deals-dry-run.txt (yoki recalc-deals-apply-<vaqt>.txt) fayliga ham yoziladi.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { CalculationService, formatTashkentDateTime, resolveCommission } from '../src/services/calculation.service';
import { syncStoreDebtForDeal } from '../src/services/ledger.service';
import { loadActiveCommissionRules } from '../src/services/sale.service';

const APPLY = process.argv.includes('--apply');
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const pct = (n: number) => `${Math.round((Number(n) || 0) * 10000) / 100}%`;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const lines: string[] = [];
function out(line = '') {
  lines.push(line);
  console.log(line);
}

function describeDatabase(): string {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
  } catch (e) {
    return "(DATABASE_URL o'qilmadi)";
  }
}

async function main() {
  const startedAt = new Date();
  out('═══════════════════════════════════════════════════════════════════════');
  out(' BITIMLARNI YANGI FOYDA QOIDALARI BILAN QAYTA HISOBLASH');
  out('═══════════════════════════════════════════════════════════════════════');
  out(APPLY ? '>>> YOZISH rejimi (--apply)' : '>>> DRY-RUN: bazaga HECH NARSA yozilmaydi. Yozish uchun: --apply');
  out(`Baza:    ${describeDatabase()}`);
  out(`Vaqt:    ${startedAt.toISOString()}`);
  out('');

  // --default-rules: spravochnikdagi (hali yangilanmagan) qoidalar o'rniga standart ro'yxat bilan hisoblaydi —
  // seed-commission-rules --apply dan OLDIN natijani ko'rish uchun (faqat dry-run'da ruxsat etiladi)
  const USE_DEFAULTS = process.argv.includes('--default-rules');
  if (USE_DEFAULTS && APPLY) throw new Error("--default-rules faqat dry-run uchun. Avval seed-commission-rules --apply ni bajaring.");
  const rules = USE_DEFAULTS ? [] : await loadActiveCommissionRules();
  if (USE_DEFAULTS) out(">>> Standart qoidalar ro'yxati bilan (spravochnik hali yangilanmagan holat uchun)\n");
  const deals = await prisma.deal.findMany({
    orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
    select: {
      id: true,
      dealNumber: true,
      date: true,
      status: true,
      isDaftar: true,
      approvalStatus: true,
      customerLimit: true,
      withdrawnLimit: true,
      calculatedAmount: true,
      salePrice: true,
      receivedFromBuyer: true,
      agentAmount: true,
      totalPurchaseCost: true,
      agentPct: true,
      purchaseDiscountPct: true,
      profit: true,
      marginPct: true,
      store: { select: { name: true } },
      provider: { select: { name: true } },
    },
  });

  interface Change {
    id: string;
    line: string;
    data: {
      agentAmount: number;
      totalPurchaseCost: number;
      agentPct: number;
      purchaseDiscountPct: number;
      profit: number;
      marginPct: number;
      isDaftar: boolean;
      extraDaftar: number;
      totalExtraBalance: number;
    };
  }
  const changes: Change[] = [];
  const groups = new Map<string, { count: number; agentBefore: number; agentAfter: number; profitBefore: number; profitAfter: number }>();
  const noRule: string[] = [];
  let negAgent = 0;
  let deferred = 0;
  const tot = { agentBefore: 0, agentAfter: 0, profitBefore: 0, profitAfter: 0 };
  const totApproved = { agentBefore: 0, agentAfter: 0, profitBefore: 0, profitAfter: 0 };

  for (const d of deals) {
    const sName = d.store?.name || '';
    const pName = d.provider?.name || '';
    const c = CalculationService.calculateDeal(
      {
        customerLimit: Number(d.customerLimit),
        withdrawnLimit: Number(d.withdrawnLimit),
        calculatedAmount: Number(d.calculatedAmount),
        storeName: sName,
        providerName: pName,
        isDaftarManual: d.isDaftar,
        salePrice: Number(d.salePrice),
        receivedFromBuyer: Number(d.receivedFromBuyer),
        status: d.status,
        date: d.date,
      },
      rules
    );
    const res = resolveCommission(sName, pName, rules, d.date);
    if (res.source === 'NONE' && Number(d.withdrawnLimit) > 0) noRule.push(`#${d.dealNumber} ${sName} / ${pName}`);
    if (Number(d.agentAmount) < 0) negAgent++;
    if (c.profitDeferred) deferred++;

    const before = { agent: r2(Number(d.agentAmount)), profit: r2(Number(d.profit)) };
    const after = { agent: r2(c.agentAmount), profit: r2(c.profit) };
    const key = `${sName} / ${pName} (ulush ${pct(res.rate)}${res.profitRate !== res.rate ? `, foyda ${pct(res.profitRate)}` : ''})`;
    const g = groups.get(key) || { count: 0, agentBefore: 0, agentAfter: 0, profitBefore: 0, profitAfter: 0 };
    g.count++;
    g.agentBefore += before.agent;
    g.agentAfter += after.agent;
    g.profitBefore += before.profit;
    g.profitAfter += after.profit;
    groups.set(key, g);
    for (const t of d.approvalStatus === 'APPROVED' ? [tot, totApproved] : [tot]) {
      t.agentBefore += before.agent;
      t.agentAfter += after.agent;
      t.profitBefore += before.profit;
      t.profitAfter += after.profit;
    }

    const changed =
      Math.abs(before.agent - after.agent) >= 1 ||
      Math.abs(before.profit - after.profit) >= 1 ||
      Math.abs(r2(Number(d.totalPurchaseCost)) - r2(c.totalPurchaseCost)) >= 1 ||
      d.isDaftar !== c.isDaftar; // Daftar "Ha" faqat Imanum + Denov/Jizzax (14.11.2026)
    if (!changed) continue;
    changes.push({
      id: d.id,
      line:
        `#${String(d.dealNumber).padEnd(7)} ${formatTashkentDateTime(d.date).slice(0, 10)} ${(sName + ' / ' + pName).slice(0, 34).padEnd(34)} ` +
        `limit ${fmt(Number(d.withdrawnLimit)).padStart(11)} | agent ${fmt(before.agent).padStart(10)} → ${fmt(after.agent).padStart(10)} | ` +
        `foyda ${fmt(before.profit).padStart(10)} → ${fmt(after.profit).padStart(10)}${c.profitDeferred ? ' (daftar: kutmoqda)' : ''}` +
        (d.isDaftar !== c.isDaftar ? ` | DAFTAR ${d.isDaftar ? 'Ha' : "Yo'q"} → ${c.isDaftar ? 'Ha' : "Yo'q"}` : ''),
      data: {
        agentAmount: c.agentAmount,
        totalPurchaseCost: c.totalPurchaseCost,
        agentPct: c.agentPct,
        purchaseDiscountPct: c.purchaseDiscountPct,
        profit: c.profit,
        marginPct: c.marginPct,
        isDaftar: c.isDaftar,
        extraDaftar: c.extraDaftar,
        totalExtraBalance: c.totalExtraBalance,
      },
    });
  }

  out("── DO'KON / PROVAYDER BO'YICHA ──");
  for (const [key, g] of [...groups.entries()].sort((a, b) => b[1].count - a[1].count)) {
    out(
      `  ${key.padEnd(58)} ${String(g.count).padStart(3)} ta | agent ${fmt(g.agentBefore).padStart(12)} → ${fmt(g.agentAfter).padStart(12)} | ` +
        `foyda ${fmt(g.profitBefore).padStart(12)} → ${fmt(g.profitAfter).padStart(12)}`
    );
  }
  out('');
  out(`── O'ZGARADIGAN BITIMLAR: ${changes.length} ta (jami ${deals.length} tadan) ──`);
  for (const c of changes) out('  ' + c.line);
  out('');
  out('── YAKUN ──');
  out(`  Agent foydasi jami:  ${fmt(tot.agentBefore)} → ${fmt(tot.agentAfter)}  (tasdiqlanganlar: ${fmt(totApproved.agentBefore)} → ${fmt(totApproved.agentAfter)})`);
  out(`  Kompaniya foydasi:   ${fmt(tot.profitBefore)} → ${fmt(tot.profitAfter)}  (tasdiqlanganlar: ${fmt(totApproved.profitBefore)} → ${fmt(totApproved.profitAfter)})`);
  out(`  Daftar "Ha", pul tushmagan (foyda 0 turadi): ${deferred} ta bitim.`);
  out(`  Agent foydasi manfiy bo'lgan (endi 0 bo'ladi): ${negAgent} ta bitim.`);
  out(`  Qoida topilmagan (ulush 0%, foyda 0): ${noRule.length} ta${noRule.length ? ' — ' + noRule.slice(0, 30).join('; ') : ''}`);

  if (APPLY) {
    let done = 0;
    for (const c of changes) {
      await prisma.$transaction(
        async (tx) => {
          await tx.deal.update({ where: { id: c.id }, data: c.data });
          // --skip-store-ledger: do'kon daftariga tegilmaydi (uni alohida backfill-store-ledger bilan, dry-run ko'rsatib yozish uchun)
          if (!process.argv.includes('--skip-store-ledger')) await syncStoreDebtForDeal(tx, c.id);
        },
        { timeout: 60000, maxWait: 20000 }
      );
      done++;
    }
    out(`  YOZILDI: ${done} ta bitim yangilandi.`);
  } else {
    out('  DRY-RUN tugadi — bazaga hech narsa yozilmadi.');
  }

  const dir = path.resolve(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, APPLY ? `recalc-deals-apply-${startedAt.toISOString().replace(/[:.]/g, '-')}.txt` : 'recalc-deals-dry-run.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  console.log(`\nNatija saqlandi: ${file}`);
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
