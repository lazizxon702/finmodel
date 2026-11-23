// FAQAT O'QIYDI: 01.11.2026 dan tasdiqlangan cheklardagi "do'kon — provayder" juftliklari (2-blok boshlang'ich ro'yxati egasiga ko'rsatish uchun)
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const g = await p.deal.groupBy({ by: ['storeId', 'providerId'], where: { approvalStatus: 'APPROVED', date: { gte: new Date('2026-11-01T00:00:00+05:00') } }, _count: { _all: true } });
  const [s, pr] = await Promise.all([p.store.findMany({ select: { id: true, name: true } }), p.provider.findMany({ select: { id: true, name: true } })]);
  const sn = new Map(s.map((x) => [x.id, x.name]));
  const pn = new Map(pr.map((x) => [x.id, x.name]));
  const rows = g.map((x) => ({ store: sn.get(x.storeId) || '?', provider: pn.get(x.providerId) || '?', n: x._count._all })).sort((a, b) => a.store.localeCompare(b.store) || b.n - a.n);
  let cur = '';
  for (const r of rows) {
    if (r.store !== cur) { cur = r.store; console.log(`\n${r.store}:`); }
    console.log(`  ${r.provider} — ${r.n}`);
  }
  console.log(`\nJami juftlik: ${rows.length}, chek: ${rows.reduce((a, r) => a + r.n, 0)}`);
  await p.$disconnect();
})().catch((e) => { console.log('ERR', String(e.message).split('\n').slice(-2).join(' ')); process.exit(1); });
