/**
 * BIR MARTALIK (16.11.2026, egasi: "shularni to'g'rila"): 14.11 dagi apply-team-sheet Anvar agentligiga ko'chirgan
 * 5 bitimni asl jamoasi va operatoriga qaytaradi. Summalar o'zgarmaydi — faqat agencyId / agentId.
 *
 *   tsrun scripts/move-anvar-deals-back-1611.ts            (DRY-RUN)
 *   tsrun scripts/move-anvar-deals-back-1611.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { personNameKey } from '../src/services/calculation.service';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const MOVES: { deal: number; agency: string; agent: string }[] = [
  { deal: 3745, agency: 'Jahongir', agent: 'Muborak' },
  { deal: 3748, agency: 'Jahongir', agent: 'Marjona' },
  { deal: 8100, agency: 'Jahongir', agent: 'Shahlo' },
  { deal: 8101, agency: 'Jahongir', agent: 'Shahlo' },
  { deal: 8098, agency: 'Farida', agent: 'Farida' },
];
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};

async function main() {
  console.log(APPLY ? '>>> YOZISH rejimi (--apply)' : '>>> DRY-RUN: bazaga hech narsa yozilmaydi');
  const agencies: any[] = await retry(() => prisma.agency.findMany({ include: { agents: true } }));
  const plan: { id: string; num: number; agencyId: string; agentId: string }[] = [];
  for (const m of MOVES) {
    const deal: any = await retry(() => prisma.deal.findUnique({ where: { dealNumber: m.deal }, include: { agency: true, agent: true } }));
    if (!deal) throw new Error(`#${m.deal} topilmadi`);
    if (!/anvar/i.test(deal.agency?.name || '')) { console.log(`  #${m.deal}: hozir ${deal.agency?.name}/${deal.agent?.name} — Anvarda emas, O'TKAZIB YUBORILDI`); continue; }
    const agency = agencies.find((a) => a.name === m.agency);
    if (!agency) throw new Error(`Agentlik topilmadi: ${m.agency}`);
    const found = agency.agents.filter((a: any) => personNameKey(a.name) === personNameKey(m.agent));
    if (found.length !== 1) throw new Error(`${m.agency} ichida "${m.agent}" operatori ${found.length} ta topildi`);
    console.log(`  #${m.deal}: ${deal.agency?.name}/${deal.agent?.name} → ${agency.name}/${found[0].name} | limit ${Number(deal.withdrawnLimit)} | agent summasi ${Number(deal.agentAmount)} (o'zgarmaydi)`);
    plan.push({ id: deal.id, num: m.deal, agencyId: agency.id, agentId: found[0].id });
  }
  if (!APPLY) { console.log(`DRY-RUN tugadi: ${plan.length} ta bitim ko'chiriladi.`); return; }
  for (const p of plan) await retry(() => prisma.deal.update({ where: { id: p.id }, data: { agencyId: p.agencyId, agentId: p.agentId } }));
  console.log(`YOZILDI: ${plan.length} ta bitim ko'chirildi.`);
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
