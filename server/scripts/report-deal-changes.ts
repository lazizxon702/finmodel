/**
 * FAQAT O'QIYDI: bitimlar soni (kun bo'yicha, operator bo'yicha) va oxirgi 3 kundagi audit yozuvlari (bitim o'chirish/tahrir).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const day = (v: Date) => new Date(v.getTime() + 5 * 3600e3).toISOString().slice(0, 10);
const dt = (v: Date) => new Date(v.getTime() + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

async function main() {
  const deals: any[] = await prisma.deal.findMany({
    include: { agency: true, agent: true, createdBy: { select: { username: true, role: true } } },
    orderBy: { date: 'asc' },
  });
  console.log(`Bitimlar jami: ${deals.length}`);
  const byStatus = new Map<string, number>();
  const byDay = new Map<string, number>();
  for (const d of deals) {
    byStatus.set(d.approvalStatus, (byStatus.get(d.approvalStatus) || 0) + 1);
    byDay.set(day(d.date), (byDay.get(day(d.date)) || 0) + 1);
  }
  console.log('Tasdiq holati:', Object.fromEntries(byStatus));
  console.log('Kun bo\'yicha:', [...byDay].map(([k, v]) => `${k.slice(5)}=${v}`).join('  '));

  const recent = deals.filter((d) => d.date.getTime() > Date.now() - 4 * 86400e3);
  console.log(`\nOxirgi 4 kun bitimlari (${recent.length}):`);
  for (const d of recent)
    console.log(`  #${d.dealNumber} ${dt(d.date)} | ${d.agency?.name || '—'}/${d.agent?.name || '—'} | kiritgan: ${d.createdBy?.username || '—'} (${d.createdBy?.role || ''}) | ${d.approvalStatus} | limit ${Number(d.withdrawnLimit)}`);

  const logs: any[] = await prisma.auditLog.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 3 * 86400e3) } },
    include: { user: { select: { username: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const cnt = new Map<string, number>();
  for (const l of logs) cnt.set(`${l.entity}:${l.action}`, (cnt.get(`${l.entity}:${l.action}`) || 0) + 1);
  console.log(`\nAudit (oxirgi 3 kun, ${logs.length} ta):`, Object.fromEntries(cnt));
  const agents: any[] = await prisma.agent.findMany({ include: { agency: true } });
  const nm = (id: any) => { const a = agents.find((x) => x.id === id); return a ? `${a.agency?.name}/${a.name}` : id ? String(id).slice(0, 6) : '—'; };
  console.log('\nO\'CHIRILGAN yoki OPERATORI O\'ZGARGAN bitimlar:');
  for (const l of logs) {
    if (!/deal/i.test(l.entity)) continue;
    const o = l.oldValues || {}, n = l.newValues || {};
    if (l.action === 'DELETE' || (l.action === 'UPDATE' && (o.agentId ?? null) !== (n.agentId ?? null)))
      console.log(`  * ${dt(l.createdAt)} | ${l.user?.username} | ${l.action} | #${o.dealNumber ?? n.dealNumber} | ${nm(o.agentId)} → ${l.action === 'DELETE' ? "o'chirildi" : nm(n.agentId)} | limit ${o.withdrawnLimit ?? ''}`);
  }
  for (const l of [] as any[]) {
    if (!/deal/i.test(l.entity)) continue;
    const o = l.oldValues || {}, n = l.newValues || {};
    const num = o.dealNumber ?? n.dealNumber ?? '';
    const keys = l.newValues && l.oldValues ? Object.keys(n).filter((k) => JSON.stringify(n[k]) !== JSON.stringify(o[k])).slice(0, 8).join(',') : '';
    console.log(`  ${dt(l.createdAt)} | ${l.user?.username || '—'} (${l.user?.role || ''}) | ${l.entity} ${l.action} | #${num} | agent ${o.agentId ?? ''}→${n.agentId ?? ''} | ${keys}`);
  }
}

main().catch((e) => console.error('Xato:', e?.message || e)).finally(() => prisma.$disconnect());
