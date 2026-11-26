/**
 * Shaxzod agentligi uchun alohida kompaniya ulushi (egasi, 26.11.2026): Variant 20%, Alif Online 26%, Alif Offline 22%, Imanum 25%.
 * Agentga — diskontning shu foizdan ortig'i. Standart DRY-RUN: qoidalar va Shaxzodning mavjud cheklariga ta'siri (agent/foyda) ko'rsatiladi.
 *   --apply           spravochnikka 4 ta qoida yozadi (avval prisma db push — CommissionRule.agencyId, va backup-db-raw.ts)
 *   --apply --recalc  qo'shimcha: Shaxzodning mavjud cheklarini ham qayta hisoblaydi (agent ulushi, tannarx, foyda)
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { CalculationService } from '../src/services/calculation.service';
import { syncStoreDebtForDeal } from '../src/services/ledger.service';

const APPLY = process.argv.includes('--apply');
const RECALC = process.argv.includes('--recalc');
const AGENCY = 'Shaxzod';
const RULES: [string, number][] = [['Variant online', 0.2], ['Variant offline', 0.2], ['Alif Online', 0.26], ['Alif Offline', 0.22], ['Imanum', 0.25]];
const fmt = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ /g, ' ');

async function main() {
  console.log(`═══ SHAXZOD FOIZLARI ═══ ${APPLY ? '(--apply' + (RECALC ? ' --recalc' : '') + ')' : '(DRY-RUN)'}`);
  const agency = await prisma.agency.findFirst({ where: { name: { equals: AGENCY, mode: 'insensitive' } } });
  if (!agency) throw new Error(`"${AGENCY}" agentligi topilmadi`);
  const providers = await prisma.provider.findMany({ select: { id: true, name: true } });
  const norm = (s: string) => s.trim().toLowerCase();
  const plan = RULES.map(([pn, rate]) => ({ provider: providers.find((p) => norm(p.name) === norm(pn)), pn, rate }));
  console.log('  provayderlar: ' + providers.map((p) => p.name).join(', '));
  for (const r of plan) console.log(`  ${r.pn}: ${r.rate * 100}%${r.provider ? '' : ' — PROVAYDER TOPILMADI'}`);

  // Jonli bazada agencyId ustuni hali bo'lmasligi mumkin (db push'dan oldin) — faqat kerakli ustunlar o'qiladi
  const base = (await prisma.commissionRule.findMany({ where: { isActive: true }, select: { ratePercent: true, profitPercent: true, validFrom: true, validTo: true, priority: true, store: { select: { name: true } }, provider: { select: { name: true } } } })).map((r) => ({ storeName: r.store?.name || null, providerName: r.provider?.name || null, agencyName: null, ratePercent: Number(r.ratePercent), profitPercent: r.profitPercent === null ? null : Number(r.profitPercent), validFrom: r.validFrom, validTo: r.validTo, priority: r.priority }));
  const withNew = [...base, ...plan.filter((r) => r.provider).map((r) => ({ storeName: null, providerName: r.pn, agencyName: agency.name, ratePercent: r.rate, profitPercent: null, validFrom: null, validTo: null, priority: 5 }))];

  const deals = await prisma.deal.findMany({
    where: { agencyId: agency.id },
    orderBy: { dealNumber: 'asc' },
    include: { store: true, provider: true, agency: true },
  });
  console.log(`\nShaxzodning cheklari: ${deals.length} ta`);
  const changes: { id: string; num: number; data: any }[] = [];
  let aB = 0, aA = 0, pB = 0, pA = 0;
  for (const d of deals) {
    const c = CalculationService.calculateDeal(
      {
        customerLimit: Number(d.customerLimit), withdrawnLimit: Number(d.withdrawnLimit), calculatedAmount: Number(d.calculatedAmount),
        storeName: d.store.name, providerName: d.provider.name, salePrice: Number(d.salePrice), receivedFromBuyer: Number(d.receivedFromBuyer),
        status: d.status, date: d.date, agencyName: d.agency?.name,
      },
      withNew
    );
    aB += Number(d.agentAmount); aA += c.agentAmount; pB += Number(d.profit); pA += c.profit;
    const changed = Math.abs(Number(d.agentAmount) - c.agentAmount) >= 1 || Math.abs(Number(d.profit) - c.profit) >= 1;
    console.log(`  #${d.dealNumber} ${d.date.toISOString().slice(0, 10)} ${d.store.name} | ${d.provider.name} | limit ${fmt(d.withdrawnLimit)} | diskont ${(c.purchaseDiscountPct * 100).toFixed(1)}% | agent ${fmt(d.agentAmount)} → ${fmt(c.agentAmount)} | foyda ${fmt(d.profit)} → ${fmt(c.profit)}${changed ? '' : ' (o\'zgarmaydi)'}${d.saleId ? ' [sotuvda]' : ''}`);
    if (changed && !d.saleId) changes.push({ id: d.id, num: d.dealNumber, data: { agentAmount: c.agentAmount, totalPurchaseCost: c.totalPurchaseCost, agentPct: c.agentPct, purchaseDiscountPct: c.purchaseDiscountPct, profit: c.profit, marginPct: c.marginPct } });
  }
  console.log(`\n  Jami agent: ${fmt(aB)} → ${fmt(aA)};  kompaniya foydasi: ${fmt(pB)} → ${fmt(pA)};  o'zgaradigan chek: ${changes.length}`);

  if (!APPLY) { console.log('\nDRY-RUN tugadi — bazaga hech narsa yozilmadi.'); return; }
  for (const r of plan) {
    if (!r.provider) continue;
    const exists = await prisma.commissionRule.findFirst({ where: { agencyId: agency.id, providerId: r.provider.id, storeId: null } });
    if (exists) await prisma.commissionRule.update({ where: { id: exists.id }, data: { ratePercent: r.rate, isActive: true } });
    else await prisma.commissionRule.create({ data: { name: `${agency.name} — ${r.pn} ${r.rate * 100}%`, agencyId: agency.id, providerId: r.provider.id, ratePercent: r.rate, priority: 5, isActive: true } });
  }
  console.log('Qoidalar yozildi.');
  if (RECALC) {
    for (const ch of changes) {
      await prisma.$transaction(async (tx) => {
        await tx.deal.update({ where: { id: ch.id, saleId: null }, data: ch.data });
        await syncStoreDebtForDeal(tx, ch.id);
      }, { timeout: 60_000, maxWait: 30_000 });
    }
    console.log(`Qayta hisoblandi: ${changes.length} chek.`);
  }
}
main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
