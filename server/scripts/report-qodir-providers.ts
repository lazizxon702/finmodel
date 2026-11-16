/**
 * FAQAT O'QIYDI: Qodir aka cheklari provayder bo'yicha (soni, limit, hozirgi foyda, 5% / 6% bo'lsa foyda).
 */
import { PrismaClient } from '@prisma/client';
import { isQodirStore, canonicalProviderName } from '../src/services/calculation.service';

const prisma = new PrismaClient();

async function main() {
  const deals = await prisma.deal.findMany({
    where: { date: { gte: new Date('2026-10-31T19:00:00Z') } },
    select: {
      dealNumber: true, date: true, withdrawnLimit: true, agentAmount: true, calculatedAmount: true,
      profit: true, approvalStatus: true, store: { select: { name: true } }, provider: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  });
  const rows = deals.filter((d) => isQodirStore(d.store?.name));
  const by = new Map<string, { n: number; limit: number; profit: number; agent: number; check: number; nums: number[] }>();
  for (const d of rows) {
    const key = `${(canonicalProviderName as any)?.(d.provider?.name) ?? d.provider?.name} [${d.approvalStatus}]`;
    const g = by.get(key) ?? { n: 0, limit: 0, profit: 0, agent: 0, check: 0, nums: [] };
    g.n++; g.limit += Number(d.withdrawnLimit); g.profit += Number(d.profit); g.agent += Number(d.agentAmount);
    g.check += Number(d.calculatedAmount); g.nums.push(d.dealNumber);
    by.set(key, g);
  }
  for (const [k, g] of by) {
    console.log(`${k}: ${g.n} chek, limit ${g.limit}, chek ${g.check}, agent ${g.agent}, foyda(hozir) ${g.profit}, 5%=${g.limit * 0.05}, 6%=${g.limit * 0.06}`);
    console.log(`   #${g.nums.join(', #')}`);
  }
  console.log(`JAMI: ${rows.length} chek`);
}

main().finally(() => prisma.$disconnect());
