/**
 * FAQAT O'QIYDI: agentliklar bo'yicha bitimlar soni (kun bo'yicha) va bitta agentlik bitimlari tafsiloti.
 *   tsrun scripts/report-agency-counts.ts [agentlik nomi, masalan Anvar] [zaxira.json]
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const f = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const day = (v: Date) => new Date(v.getTime() + 5 * 3600e3).toISOString().slice(5, 10).split('-').reverse().join('.');
const dt = (v: Date) => new Date(v.getTime() + 5 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};

async function main() {
  const focus = (process.argv[2] || 'Anvar').toLowerCase();
  const backupFile = process.argv[3];
  const deals: any[] = await retry(() => prisma.deal.findMany({
    include: { store: true, provider: true, agency: true, agent: true, createdBy: { select: { username: true, role: true } } },
    orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
  }));
  const days = [...new Set(deals.map((d) => day(d.date)))];
  const by = new Map<string, Map<string, number>>();
  for (const d of deals) {
    const a = d.agency?.name || '—';
    if (!by.has(a)) by.set(a, new Map());
    by.get(a)!.set(day(d.date), (by.get(a)!.get(day(d.date)) || 0) + 1);
  }
  console.log(`Jami ${deals.length} bitim. Agentlik bo'yicha (kunlar: ${days.join(' ')})`);
  for (const [a, m] of [...by].sort((x, y) => [...y[1].values()].reduce((s, v) => s + v, 0) - [...x[1].values()].reduce((s, v) => s + v, 0)))
    console.log(`  ${a.padEnd(12)} jami ${String([...m.values()].reduce((s, v) => s + v, 0)).padStart(3)} | ${days.map((k) => String(m.get(k) || '·').padStart(2)).join(' ')}`);

  const mine = deals.filter((d) => (d.agency?.name || '').toLowerCase().includes(focus) || (d.agent?.name || '').toLowerCase().includes(focus));
  const old = backupFile ? new Map<string, any>(JSON.parse(fs.readFileSync(backupFile, 'utf8')).data.Deal.map((x: any) => [x.id, x])) : null;
  console.log(`\n"${focus}" bitimlari: ${mine.length} ta`);
  for (const d of mine)
    console.log(`  #${d.dealNumber} ${day(d.date)} | ${d.store?.name}/${d.provider?.name} | ${d.agency?.name}/${d.agent?.name || '—'} | limit ${f(d.withdrawnLimit)} | kiritgan ${d.createdBy?.username || 'Sheets'} | yaratilgan ${dt(d.createdAt)} | o'zgargan ${dt(d.updatedAt)}${old ? (old.has(d.id) ? (old.get(d.id).agencyId === d.agencyId ? '' : ' | ZAXIRADA BOSHQA AGENTLIK') : ' | ZAXIRADA YO\'Q') : ''}`);

  const logs: any[] = await retry(() => prisma.auditLog.findMany({
    where: { entity: 'Deal', createdAt: { gte: new Date(Date.now() - 8 * 3600e3) } },
    include: { user: { select: { username: true } } }, orderBy: { createdAt: 'asc' },
  }));
  const agents: any[] = await retry(() => prisma.agent.findMany({ include: { agency: true } }));
  const nm = (id: any) => { const a = agents.find((x) => x.id === id); return a ? `${a.agency?.name}/${a.name}` : id ? '?' : '—'; };
  console.log(`\nOxirgi 8 soatdagi bitim amallari: ${logs.length} ta`);
  for (const l of logs) {
    const o = l.oldValues || {}, n = l.newValues || {};
    console.log(`  ${dt(l.createdAt)} | ${l.user?.username || '—'} | ${l.action} | #${o.dealNumber ?? n.dealNumber ?? ''} | ${nm(o.agentId)} → ${nm(n.agentId)}`);
  }
}

main().catch((e) => console.error('Xato:', e?.message || e)).finally(() => prisma.$disconnect());
