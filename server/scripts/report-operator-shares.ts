/**
 * FAQAT O'QIYDI: operator ulushi qoidasi bor agentliklar bo'yicha operatorlarning ulushi (joriy qoidalar bilan).
 *   tsrun scripts/report-operator-shares.ts [YYYY-MM-DD dan]
 */
import { PrismaClient } from '@prisma/client';
import { OPERATOR_SHARE_RULES, calcOperatorShares, operatorShareRuleFor } from '../src/services/calculation.service';
const prisma = new PrismaClient();
const f = (n: number) => Math.round(n).toLocaleString('ru-RU');
(async () => {
  const from = process.argv[2] || '2026-11-01';
  let deals: any[] = [];
  for (let i = 0; ; i++) { try { deals = await prisma.deal.findMany({ where: { approvalStatus: 'APPROVED', date: { gte: new Date(`${from}T00:00:00+05:00`) } }, include: { agency: true, agent: true } }); break; } catch (e) { if (i > 5) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
  for (const rule of OPERATOR_SHARE_RULES) {
    const ds = deals.filter((d) => operatorShareRuleFor(d.agency?.name) === rule);
    const byOp = new Map<string, any[]>();
    for (const d of ds) byOp.set(d.agent?.name || '— (operator yozilmagan)', [...(byOp.get(d.agent?.name || '— (operator yozilmagan)') || []), d]);
    let total = 0;
    console.log(`\n${rule.agency} — ${rule.basePct}%${rule.monthlyLimitThreshold > 0 ? `, ${f(rule.monthlyLimitThreshold)} dan oshsa ${rule.bonusPct}%` : ''} | agent foydasi jami ${f(ds.reduce((s, d) => s + Number(d.agentAmount), 0))}`);
    for (const [op, g] of [...byOp].sort((a, b) => b[1].length - a[1].length)) {
      const m = calcOperatorShares(g.map((d) => ({ id: d.id, date: d.date, withdrawnLimit: Number(d.withdrawnLimit), agentAmount: Number(d.agentAmount) })), rule);
      const share = [...m.values()].reduce((s, v) => s + v, 0); total += share;
      console.log(`   ${op.padEnd(22)} ${String(g.length).padStart(3)} chek | limit ${f(g.reduce((s, d) => s + Number(d.withdrawnLimit), 0)).padStart(13)} | ulush ${f(share).padStart(10)}`);
    }
    console.log(`   JAMI operatorlar ulushi: ${f(total)}`);
  }
})().catch((e) => console.error('Xato:', e?.message || e)).finally(() => prisma.$disconnect());
