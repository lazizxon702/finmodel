/**
 * Lokal API tutun-sinovi (faqat o'qiydi): asosiy endpointlar admin, agent va operator tokeni bilan javob beradimi.
 *   npx ts-node --transpile-only scripts/smoke-api.ts [http://localhost:5000]
 * Token parolsiz, JWT kaliti bilan lokal imzolanadi — hech qanday parol chiqarilmaydi.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma';
import { getJwtSecret } from '../src/lib/security';

const BASE = process.argv[2] || 'http://localhost:5000';
const fmt = (n: any) => Math.round(Number(n) || 0).toLocaleString('ru-RU');

async function tokenFor(where: any) {
  const u = await prisma.user.findFirst({ where });
  if (!u) return null;
  return {
    user: u,
    token: jwt.sign({ id: u.id, username: u.username, role: u.role, fullName: u.fullName }, getJwtSecret(), { expiresIn: '10m' }),
  };
}

async function get(path: string, token: string) {
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  let body: any = null;
  try {
    body = await r.json();
  } catch {}
  return { status: r.status, body };
}

async function main() {
  const admin = await tokenFor({ role: 'ADMIN', isActive: true });
  const agent = await tokenFor({ role: 'AGENT', username: 'jahongir' });
  const operator = await tokenFor({ role: 'OPERATOR', isActive: true });
  if (!admin) throw new Error('ADMIN topilmadi');

  console.log('== ADMIN ==');
  const trust = await get('/api/trust', admin.token);
  console.log('trust', trust.status, 'jami qarz', fmt(trust.body?.overall?.totalDebt), 'bergan', fmt(trust.body?.overall?.totalPaid), 'qoldiq', fmt(trust.body?.overall?.balance), 'yozuvlar', trust.body?.entries?.length, '| namuna:', trust.body?.entries?.[0]?.dateTimeLabel);
  const dds = await get('/api/dds/summary', admin.token);
  console.log('dds/summary', dds.status, 'CASH', fmt(dds.body?.balances?.CASH), 'KARTA', fmt(dds.body?.balances?.BANK_CARD), 'mos:', dds.body?.balancesInSync);
  const fin = await get('/api/finances/summary', admin.token);
  const p = fin.body?.pnl || {};
  console.log('finances', fin.status, 'trustIncome', fmt(p.trustIncome), 'dealsProfit', fmt(p.dealsProfit), 'opex', fmt(p.totalOpex), 'net', fmt(p.netProfit), 'farq', fmt(p.reconciliation?.difference));
  const totals = await get('/api/deals/totals', admin.token);
  console.log('deals/totals', totals.status, JSON.stringify(totals.body).slice(0, 260));
  const deals = await get('/api/deals?limit=2', admin.token);
  const list = deals.body?.items || deals.body?.deals || deals.body?.data || [];
  console.log('deals', deals.status, 'kalitlar:', Object.keys(deals.body || {}).join(','), '| birinchi:', list[0] && { n: list[0].dealNumber, dt: list[0].dateTimeLabel, ap: list[0].approvalStatus, items: list[0].items?.length, store: list[0].store?.name });
  const pend = await get('/api/deals/pending-count', admin.token);
  console.log('pending-count', pend.status, JSON.stringify(pend.body));
  const kpi = await get('/api/deals/kpi-details?metric=totalLimitVolume&startDate=2026-11-09&endDate=2026-11-09', admin.token);
  console.log('kpi-details 09.11', kpi.status, 'soni', kpi.body?.count, 'jami', fmt(kpi.body?.total));
  const comm = await get('/api/agents/commission-summary', admin.token);
  console.log('commission-summary', comm.status, (comm.body?.agencies || []).map((a: any) => `${a.agencyName}: jami ${fmt(a.total)} (${a.dealsTotal})`).join(' | '));
  const ai = await get('/api/ai/status', admin.token);
  console.log('ai/status', ai.status, JSON.stringify(ai.body));
  const notif = await get('/api/notifications/status', admin.token);
  console.log('notifications/status', notif.status, JSON.stringify(notif.body));

  for (const [name, t] of [['AGENT', agent], ['OPERATOR', operator]] as const) {
    if (!t) {
      console.log(`== ${name}: foydalanuvchi topilmadi ==`);
      continue;
    }
    console.log(`== ${name} (${t.user.username}) ==`);
    const d = await get('/api/deals?limit=1', t.token);
    console.log('deals', d.status, 'jami:', d.body?.pagination?.total ?? d.body?.total ?? '?');
    for (const path of ['/api/dds', '/api/finances/summary', '/api/trust', '/api/agents/commission-summary', '/api/team/operators']) {
      const r = await get(path, t.token);
      console.log(path.padEnd(34), r.status);
    }
  }
}

main()
  .catch((e) => {
    console.error('Xato:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
