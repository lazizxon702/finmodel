/**
 * Chekni Trust do'koni / Trust 1 provayderiga o'tkazadi (egasi, 23.11.2026: #8113, #8194 — "Ha, o'tkaz"). BIR MARTALIK.
 * Standart DRY-RUN; yozish uchun --apply (avval backup-db-raw.ts!). Ishlatish:
 *   tsrun scripts/move-to-trust-1123.ts --deals=8113,8194 [--apply]
 * Qayta hisob: spravochnik (Trust 16%) — agentga limit × (diskont − 16%), foyda limit × 16%;
 * keyin Trust daftari (DEBT = to'liq limit) va do'kon daftari (eski do'kon qarzi o'chadi) moslanadi; tarixga OVERRIDE yoziladi.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { CalculationService } from '../src/services/calculation.service';
import { loadActiveCommissionRules } from '../src/services/sale.service';
import { syncStoreDebtForDeal, syncTrustDebtForDeal } from '../src/services/ledger.service';

const APPLY = process.argv.includes('--apply');
const arg = process.argv.find((a) => a.startsWith('--deals='));
const NUMS = (arg ? arg.slice(8) : '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
const fmt = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ /g, ' ');

async function main() {
  if (!NUMS.length) throw new Error('--deals=8113,8194 kerak');
  console.log(`═══ TRUST'GA O'TKAZISH: ${NUMS.map((n) => '#' + n).join(', ')} ═══ ${APPLY ? '(--apply: YOZADI)' : '(DRY-RUN: yozmaydi)'}`);
  const rules = await loadActiveCommissionRules();
  const trustStore = await prisma.store.findFirst({ where: { name: 'Trust' } });
  const trustProv = await prisma.provider.findFirst({ where: { name: 'Trust 1' } });
  if (!trustStore || !trustProv) throw new Error('"Trust" do\'koni yoki "Trust 1" provayderi topilmadi');

  const plan: { id: string; num: number; data: any; from: string }[] = [];
  for (const num of NUMS) {
    const d = await prisma.deal.findUnique({ where: { dealNumber: num }, include: { store: true, provider: true, agency: true, trustEntry: true, storeEntry: true } });
    if (!d) { console.log(`\n#${num}: TOPILMADI`); continue; }
    if (d.saleId) { console.log(`\n#${num}: sotuvga kirgan — o'tkazilmaydi`); continue; }
    if (d.storeId === trustStore.id && d.providerId === trustProv.id) { console.log(`\n#${num}: allaqachon Trust / Trust 1`); continue; }
    const c = CalculationService.calculateDeal(
      {
        customerLimit: Number(d.customerLimit), withdrawnLimit: Number(d.withdrawnLimit), calculatedAmount: Number(d.calculatedAmount),
        storeName: trustStore.name, providerName: trustProv.name, salePrice: Number(d.salePrice), receivedFromBuyer: Number(d.receivedFromBuyer),
        status: d.status, date: d.date, agencyName: d.agency?.name,
      },
      rules
    );
    console.log(`\n#${num} (${d.date.toISOString().slice(0, 10)}, ${d.approvalStatus}, holat ${d.status}, agent ${d.agency?.name || '-'})`);
    console.log(`  ${d.store.name} / ${d.provider.name} → Trust / Trust 1`);
    console.log(`  limit ${fmt(d.withdrawnLimit)}, mijozga ${fmt(d.calculatedAmount)}, diskont ${(c.purchaseDiscountPct * 100).toFixed(1)}%`);
    console.log(`  agentga ${fmt(d.agentAmount)} → ${fmt(c.agentAmount)};  foyda ${fmt(d.profit)} → ${fmt(c.profit)}`);
    console.log(`  Trust daromadi ${fmt(d.trustDebtAmount)} → ${fmt(c.trustDebtAmount)}; Trust daftari ${d.trustEntry ? fmt(d.trustEntry.amount) : "yo'q"} → ${d.approvalStatus === 'APPROVED' ? fmt(d.withdrawnLimit) : "yo'q"}`);
    console.log(`  do'kon daftari: ${d.storeEntry ? `${d.store.name} ${d.storeEntry.type} ${fmt(d.storeEntry.amount)}` : "yo'q"} → yo'q`);
    if (c.purchaseDiscountPct < 0.16) console.log('  ⚠ diskont 16% dan kichik — agentga 0, foyda limit × diskont');
    plan.push({
      id: d.id, num, from: `${d.store.name} / ${d.provider.name}`,
      data: {
        storeId: trustStore.id, providerId: trustProv.id,
        agentAmount: c.agentAmount, totalPurchaseCost: c.totalPurchaseCost, agentPct: c.agentPct, purchaseDiscountPct: c.purchaseDiscountPct,
        profit: c.profit, marginPct: c.marginPct, isActualDeviceSale: c.isActualDeviceSale, isDaftar: c.isDaftar, extraDaftar: c.extraDaftar,
        qodirDebt: c.qodirDebt, qodirBalance: c.qodirBalance, greenBazarBalance: c.greenBazarBalance, trustBalance: c.trustBalance,
        trustDebtAmount: c.trustDebtAmount, totalExtraBalance: c.totalExtraBalance,
      },
    });
  }
  if (!APPLY) { console.log('\nDRY-RUN tugadi — bazaga hech narsa yozilmadi.'); return; }
  for (const p of plan) {
    await prisma.$transaction(async (tx) => {
      await tx.deal.update({ where: { id: p.id, saleId: null }, data: p.data });
      await syncTrustDebtForDeal(tx, p.id);
      await syncStoreDebtForDeal(tx, p.id);
      await tx.auditLog.create({ data: { entity: 'Deal', entityId: p.id, action: 'OVERRIDE', newValues: { rule: `Do'kon/provayder ${p.from} → Trust / Trust 1`, reason: "Egasi, 23.11.2026: Trust 1 faqat Trust do'koni bilan" } } });
    }, { timeout: 60_000, maxWait: 30_000 });
    console.log(`#${p.num} — YOZILDI`);
  }
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
