// FAQAT O'QIYDI: 8-blok (23.11.2026) — #8171 va Qodir aka hisob-kitobi uchun hozirgi holat
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const n = (v: any) => Math.round(Number(v) || 0);
const f = (v: number) => v.toLocaleString('ru-RU').replace(/ /g, ' ');
(async () => {
  const d = await p.deal.findUnique({ where: { dealNumber: 8171 }, include: { store: true, provider: true, trustEntry: true, storeEntry: true, agency: true } });
  if (d) console.log('#8171', d.date.toISOString().slice(0, 10), d.store.name, '|', d.provider.name, '| limit', f(n(d.withdrawnLimit)), '| mijozga', f(n(d.calculatedAmount)),
    '| diskont', (Number(d.purchaseDiscountPct) * 100).toFixed(1) + '%', '| agent', f(n(d.agentAmount)), '| foyda', f(n(d.profit)), '| status', d.status, d.approvalStatus,
    '| trustEntry', d.trustEntry ? f(n(d.trustEntry.amount)) : '-', '| storeEntry', d.storeEntry ? `${d.storeEntry.type} ${f(n(d.storeEntry.amount))}` : '-', '| agentlik', d.agency?.name);
  const alif = [3694, 3695, 3696, 3700, 3701, 3704, 3716, 3721, 3724];
  const fins = [3723, 8222, 8223, 3744, 8111];
  for (const [label, nums, want] of [['Alif', alif, 52_124_000], ['Finsum', fins, 69_803_160]] as const) {
    const deals = await p.deal.findMany({ where: { dealNumber: { in: [...nums] } }, include: { store: true, provider: true, storeEntry: true } });
    let sum = 0;
    for (const x of deals.sort((a, b) => a.dealNumber - b.dealNumber)) {
      const debt = x.storeEntry ? n(x.storeEntry.amount) : 0;
      sum += debt;
      console.log(` ${label} #${x.dealNumber} ${x.date.toISOString().slice(0, 10)} ${x.store.name} | ${x.provider.name} | limit ${f(n(x.withdrawnLimit))} | mijozga ${f(n(x.calculatedAmount))} | agent ${f(n(x.agentAmount))} | foyda ${f(n(x.profit))} | daftar ${f(debt)} | ${x.approvalStatus}`);
    }
    const missing = nums.filter((k) => !deals.some((x) => x.dealNumber === k));
    console.log(` ${label}: topildi ${deals.length}/${nums.length}${missing.length ? ' (yo\'q: ' + missing.join(', ') + ')' : ''}; daftardagi qarz ${f(sum)}; jadvalda ${f(want)}; farq ${f(sum - want)}`);
  }
  const qodir = await p.store.findFirst({ where: { name: 'Qodir aka' } });
  if (qodir) {
    const e = await p.storeLedgerEntry.findMany({ where: { storeId: qodir.id }, include: { deal: { select: { dealNumber: true, date: true } }, ddsTransaction: { select: { txNumber: true, dateTime: true } } }, orderBy: { createdAt: 'asc' } });
    const debt = e.filter((x) => x.type === 'DEBT').reduce((s, x) => s + n(x.amount), 0);
    const pay = e.filter((x) => x.type === 'PAYMENT').reduce((s, x) => s + n(x.amount), 0);
    console.log(`Qodir aka daftari: DEBT ${e.filter((x) => x.type === 'DEBT').length} ta ${f(debt)}; PAYMENT ${f(pay)}; qoldiq ${f(debt - pay)}`);
    for (const x of e.filter((x) => x.type === 'PAYMENT')) console.log('  to\'lov', x.ddsTransaction?.txNumber, x.ddsTransaction?.dateTime?.toISOString().slice(0, 10), f(n(x.amount)));
    const after = e.filter((x) => x.type === 'DEBT' && x.deal && x.deal.date >= new Date('2026-11-08T00:00:00+05:00'));
    console.log(`  08.11 dan keyingi cheklar daftarda: ${after.length} ta: ${after.map((x) => '#' + x.deal!.dealNumber).join(' ')}`);
  }
  const tx = await p.ddsTransaction.findMany({
    where: { dateTime: { gte: new Date('2026-11-07T00:00:00+05:00'), lte: new Date('2026-11-20T00:00:00+05:00') }, OR: [{ description: { contains: 'одир', mode: 'insensitive' } }, { description: { contains: 'qodir', mode: 'insensitive' } }, { sourcePerson: { contains: 'одир', mode: 'insensitive' } }, { sourcePerson: { contains: 'qodir', mode: 'insensitive' } }] },
    select: { txNumber: true, dateTime: true, amount: true, type: true, description: true, category: { select: { name: true } } }, orderBy: { dateTime: 'asc' },
  }).catch((e) => { console.log('dds xato', e.message.split('\n').pop()); return []; });
  for (const t of tx) console.log('  DDS', t.txNumber, t.dateTime.toISOString().slice(0, 10), t.type, f(n(t.amount)), '|', t.category?.name, '|', (t.description || '').slice(0, 60));
  await p.$disconnect();
})().catch((e) => { console.log('ERR', String(e.message).split('\n').slice(-3).join(' ')); process.exit(1); });
