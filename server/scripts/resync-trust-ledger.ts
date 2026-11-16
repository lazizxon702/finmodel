/**
 * Trust daftaridagi qarz yozuvlarini joriy qoidaga keltiradi (16.11.2026: qarz = TO'LIQ yechilgan limit).
 * Faqat TrustLedgerEntry (DEBT) summalari o'zgaradi; bitim summalari, DDS va kassa O'ZGARMAYDI. Qayta ishga tushirish xavfsiz.
 *
 *   tsrun scripts/resync-trust-ledger.ts            (DRY-RUN)
 *   tsrun scripts/resync-trust-ledger.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { calcTrustReceivable, isTrustDeal } from '../src/services/calculation.service';
import { syncTrustDebtForDeal } from '../src/services/ledger.service';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const f = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};

async function main() {
  console.log(APPLY ? '>>> YOZISH rejimi (--apply)' : '>>> DRY-RUN: bazaga hech narsa yozilmaydi');
  const deals: any[] = await retry(() => prisma.deal.findMany({ include: { store: true, provider: true }, orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }] }));
  const entries: any[] = await retry(() => prisma.trustLedgerEntry.findMany());
  const byDeal = new Map(entries.filter((e) => e.dealId).map((e) => [e.dealId, e]));
  const paid = entries.filter((e) => e.type === 'PAYMENT').reduce((s, e) => s + Number(e.amount), 0);

  let before = 0, after = 0;
  const changes: any[] = [];
  for (const d of deals) {
    const trust = isTrustDeal(d.store?.name, d.provider?.name);
    const want = trust && d.approvalStatus === 'APPROVED' ? calcTrustReceivable(Number(d.withdrawnLimit)) : 0;
    const have = Number(byDeal.get(d.id)?.amount) || 0;
    before += have; after += want;
    if (Math.abs(want - have) > 0.005) {
      changes.push(d);
      console.log(`  #${d.dealNumber} ${d.store?.name}/${d.provider?.name} | limit ${f(d.withdrawnLimit)} | daftardagi qarz ${f(have)} → ${f(want)}`);
    }
  }
  console.log(`\nO'zgaradigan yozuvlar: ${changes.length} ta`);
  console.log(`Trust berishi kerak: ${f(before)} → ${f(after)}`);
  console.log(`Trust bergan:        ${f(paid)}`);
  console.log(`Qoldiq (Trust qarzi): ${f(before - paid)} → ${f(after - paid)}`);
  if (!APPLY) { console.log('DRY-RUN tugadi.'); return; }
  for (const d of changes) await retry(() => prisma.$transaction((tx) => syncTrustDebtForDeal(tx as any, d.id), { timeout: 60000, maxWait: 20000 }));
  console.log(`YOZILDI: ${changes.length} ta yozuv yangilandi.`);
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
