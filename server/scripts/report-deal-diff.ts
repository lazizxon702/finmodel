/**
 * FAQAT O'QIYDI: zaxiradagi bitimlarni hozirgi baza bilan solishtiradi.
 *   tsrun scripts/report-deal-diff.ts ../backups/db-raw-db-....json
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FIELDS = [
  'date', 'sellerName', 'agencyId', 'agentId', 'storeId', 'providerId', 'customerLimit', 'withdrawnLimit', 'calculatedAmount',
  'agentAmount', 'agentPct', 'purchaseDiscountPct', 'totalPurchaseCost', 'profit', 'status', 'salePrice', 'isDaftar', 'approvalStatus',
  'productName', 'createdById', 'saleId',
];
const norm = (v: any) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && typeof v.toString === 'function') v = v.toString();
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s) * 100) / 100);
  if (/^\d{4}-\d\d-\d\dT/.test(s)) return new Date(s).toISOString();
  return s;
};
const dt = (v: any) => (v ? new Date(new Date(v).getTime() + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : '—');

async function main() {
  const file = process.argv[2];
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  const old: any[] = backup.data.Deal;
  const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); }
    }
  };
  const now = (await retry(() => prisma.deal.findMany())) as any[];
  const agents = await retry(() => prisma.agent.findMany());
  const agencies = await retry(() => prisma.agency.findMany());
  const stores = await retry(() => prisma.store.findMany());
  const providers = await retry(() => prisma.provider.findMany());
  const users = await retry(() => prisma.user.findMany({ select: { id: true, username: true } }));
  const name = new Map<string, string>();
  for (const x of [...agents, ...agencies, ...stores, ...providers] as any[]) name.set(x.id, x.name);
  for (const u of users) name.set(u.id, u.username);
  const show = (f: string, v: string) => (/Id$/.test(f) ? name.get(v) || (v ? v.slice(0, 6) : '—') : f === 'date' ? dt(v) : v || '—');

  console.log(`Zaxira: ${file} (${backup.createdAt}) — ${old.length} bitim; hozir: ${now.length} bitim\n`);
  const nowById = new Map(now.map((d) => [d.id, d]));
  const oldById = new Map(old.map((d) => [d.id, d]));

  const removed = old.filter((d) => !nowById.has(d.id));
  console.log(`YO'QOLGAN (zaxirada bor, hozir yo'q): ${removed.length}`);
  for (const d of removed) console.log(`  #${d.dealNumber} ${dt(d.date)} | ${name.get(d.agencyId) || '—'}/${name.get(d.agentId) || '—'} | limit ${norm(d.withdrawnLimit)}`);

  const added = now.filter((d) => !oldById.has(d.id));
  console.log(`\nYANGI (zaxirada yo'q): ${added.length}`);
  for (const d of added)
    console.log(`  #${d.dealNumber} sana ${dt(d.date)} | yaratilgan ${dt(d.createdAt)} | kiritgan ${name.get(d.createdById) || '—'} | ${name.get(d.agencyId) || '—'}/${name.get(d.agentId) || '—'} | ${name.get(d.storeId)}/${name.get(d.providerId)} | limit ${norm(d.withdrawnLimit)} | bot ${d.botDealId || '—'}`);

  const groups = new Map<string, string[]>();
  let changed = 0;
  for (const d of now) {
    const o = oldById.get(d.id);
    if (!o) continue;
    const diffs = FIELDS.filter((f) => norm(o[f]) !== norm(d[f]));
    if (!diffs.length) continue;
    changed++;
    const key = diffs.join(',');
    const line = `  #${d.dealNumber} (o'zgargan ${dt(d.updatedAt)}) ` + diffs.map((f) => `${f}: ${show(f, norm(o[f]))} → ${show(f, norm(d[f]))}`).join(' | ');
    groups.set(key, [...(groups.get(key) || []), line]);
  }
  console.log(`\nO'ZGARGAN: ${changed} bitim`);
  for (const [k, lines] of groups) {
    console.log(`\n[${k}] — ${lines.length} ta`);
    for (const l of lines.slice(0, 12)) console.log(l);
    if (lines.length > 12) console.log(`  … yana ${lines.length - 12} ta`);
  }
}

main().catch((e) => console.error('Xato:', e?.message || e)).finally(() => prisma.$disconnect());
