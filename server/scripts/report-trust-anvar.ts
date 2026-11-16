/**
 * FAQAT O'QIYDI: Trust bitimlari (agentlik bo'yicha) va Anvar agentligi bitimlari (do'kon/provayder bo'yicha).
 */
import { PrismaClient } from '@prisma/client';
import { isTrustDeal } from '../src/services/calculation.service';

const prisma = new PrismaClient();
const f = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');

async function main() {
  const deals: any[] = await prisma.deal.findMany({
    include: { store: true, provider: true, agency: true, agent: true },
    orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
  });
  const group = (rows: any[], keyOf: (x: any) => string) => {
    const m = new Map<string, { n: number; limit: number; check: number; agent: number; profit: number; trust: number; nums: number[] }>();
    for (const x of rows) {
      const k = keyOf(x);
      const g = m.get(k) ?? { n: 0, limit: 0, check: 0, agent: 0, profit: 0, trust: 0, nums: [] };
      g.n++; g.limit += Number(x.withdrawnLimit); g.check += Number(x.calculatedAmount); g.agent += Number(x.agentAmount);
      g.profit += Number(x.profit); g.trust += Number(x.trustDebtAmount); g.nums.push(x.dealNumber);
      m.set(k, g);
    }
    for (const [k, g] of m)
      console.log(`  ${k}: ${g.n} ta | limit ${f(g.limit)} | mijozga ${f(g.check)} | agent ${f(g.agent)} | foyda ${f(g.profit)} | trust16% ${f(g.trust)}\n     #${g.nums.join(', #')}`);
  };

  const trust = deals.filter((x) => isTrustDeal(x.store?.name, x.provider?.name));
  console.log(`── TRUST bitimlari: ${trust.length} ta ──`);
  group(trust, (x) => `${x.store?.name} / ${x.provider?.name} / agentlik ${x.agency?.name || '—'} [${x.approvalStatus}]`);

  const anvar = deals.filter((x) => /anvar|анвар/i.test(`${x.agency?.name || ''} ${x.agent?.name || ''}`));
  console.log(`\n── ANVAR bitimlari: ${anvar.length} ta ──`);
  group(anvar, (x) => `${x.store?.name} / ${x.provider?.name} / ${x.agency?.name || '—'}/${x.agent?.name || '—'} [${x.status}]`);

  const tl: any[] = await (prisma as any).trustLedgerEntry.findMany({ orderBy: { createdAt: 'asc' } });
  const byType = new Map<string, { n: number; sum: number }>();
  for (const e of tl) {
    const k = String(e.type ?? e.kind ?? '?');
    const g = byType.get(k) ?? { n: 0, sum: 0 };
    g.n++; g.sum += Number(e.amount); byType.set(k, g);
  }
  console.log('\n── Trust daftari ──');
  for (const [k, g] of byType) console.log(`  ${k}: ${g.n} ta, ${f(g.sum)}`);

  const dds: any[] = await prisma.ddsTransaction.findMany({ orderBy: { dateTime: 'asc' } });
  console.log('\n── DDS: Trust / Ishonch / Anvar so\'zi bor qatorlar ──');
  for (const t of dds) {
    const text = `${t.categoryName || ''} ${t.description || ''} ${t.sourcePerson || ''}`;
    if (/trust|траст|ishonch|ишонч|anvar|анвар/i.test(text))
      console.log(`  ${t.txNumber} | ${new Date(t.dateTime).toISOString().slice(0, 10)} | ${t.type} | ${t.account} | ${f(t.amount)} | ${t.categoryName} | ${t.sourcePerson} | ${(t.description || '').slice(0, 80)}`);
  }
}

main().catch((e) => console.error('Xato:', e?.message || e)).finally(() => prisma.$disconnect());
