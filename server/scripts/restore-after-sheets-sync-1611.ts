/**
 * BIR MARTALIK: 16.11.2026 12:52 (Toshkent) dagi noto'g'ri Google Sheets sinxronlashidan keyin tiklash.
 * Jadvalga ustun qo'shilgani uchun sinxronlash 199 bitimni surilgan ustunlardan ustiga yozgan.
 *
 *   1) sinxronlash oynasida o'zgargan bitimlar — zaxiradagi (12:29) qiymatlarga qaytariladi;
 *   2) sinxronlash qayta yaratgan (egasi 14.11 da o'chirgan) bitimlar — o'chiriladi;
 *   3) sinxronlash yaratgan soxta agentlik / operator / xaridor yozuvlari (hech narsaga bog'lanmagan) — o'chiriladi.
 * DDS va kassa qoldig'i faqat SOLISHTIRILADI (yozilmaydi).
 *
 *   tsrun scripts/restore-after-sheets-sync-1611.ts <zaxira.json>            (DRY-RUN)
 *   tsrun scripts/restore-after-sheets-sync-1611.ts <zaxira.json> --apply
 */
import fs from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const WINDOW_FROM = new Date('2026-11-16T07:51:30.000Z');
const WINDOW_TO = new Date('2026-11-16T07:54:00.000Z');

const lines: string[] = [];
const out = (s = '') => { console.log(s); lines.push(s); };
const f = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 6) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};
const parseDate = (s: any): Date | null => {
  if (s === null || s === undefined || s === '') return null;
  if (s instanceof Date) return s;
  const str = String(s);
  return new Date(/Z|[+-]\d\d:?\d\d$/.test(str) ? str : str.replace(' ', 'T') + 'Z');
};
const norm = (v: any): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (Prisma.Decimal.isDecimal(v)) return String(Math.round(Number(v.toString()) * 100) / 100);
    return JSON.stringify(v);
  }
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s) * 100) / 100);
  if (/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(s)) return (parseDate(s) as Date).toISOString();
  return s;
};

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) throw new Error('Zaxira fayli ko\'rsatilmagan');
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  const B = backup.data;
  out('═══ 16.11 noto\'g\'ri Sheets sinxronlashidan keyin TIKLASH ═══');
  out(APPLY ? '>>> YOZISH rejimi (--apply)' : '>>> DRY-RUN: bazaga HECH NARSA yozilmaydi');
  out(`Zaxira: ${path.basename(file)} (${backup.createdAt})\n`);

  const dealModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Deal')!;
  const scalar = dealModel.fields.filter((x) => x.kind !== 'object' && !['id', 'updatedAt', 'createdAt', 'dealNumber'].includes(x.name));

  const now = (await retry(() => prisma.deal.findMany())) as any[];
  const agencies = (await retry(() => prisma.agency.findMany())) as any[];
  const agents = (await retry(() => prisma.agent.findMany())) as any[];
  const buyers = (await retry(() => prisma.buyer.findMany())) as any[];
  const users = (await retry(() => prisma.user.findMany({ select: { id: true, username: true, agentId: true, agencyId: true } }))) as any[];
  const sales = (await retry(() => prisma.sale.findMany({ select: { id: true, buyerId: true } as any }))) as any[];
  const nameOf = new Map<string, string>([...agencies, ...agents, ...buyers, ...B.Agency, ...B.Agent].map((x: any) => [x.id, x.name]));

  const oldById = new Map<string, any>(B.Deal.map((d: any) => [d.id, d]));

  // ── 1) tiklanadigan bitimlar ──
  const toRestore: { deal: any; old: any; diffs: string[] }[] = [];
  const otherChanged: string[] = [];
  for (const d of now) {
    const o = oldById.get(d.id);
    if (!o) continue;
    const diffs = scalar.map((x) => x.name).filter((k) => norm(o[k]) !== norm(d[k]));
    if (!diffs.length) continue;
    const inWindow = d.updatedAt >= WINDOW_FROM && d.updatedAt <= WINDOW_TO;
    if (inWindow) toRestore.push({ deal: d, old: o, diffs });
    else otherChanged.push(`#${d.dealNumber} (${d.updatedAt.toISOString().slice(11, 16)}Z: ${diffs.join(',')})`);
  }
  out(`1) TIKLANADIGAN bitimlar (sinxronlash oynasida o'zgargan): ${toRestore.length} ta`);
  const hist = new Map<string, number>();
  for (const r of toRestore) for (const k of r.diffs) hist.set(k, (hist.get(k) || 0) + 1);
  out(`   maydonlar: ${[...hist].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  let profitNow = 0, profitOld = 0;
  for (const r of toRestore) { profitNow += Number(r.deal.profit); profitOld += Number(r.old.profit); }
  out(`   shu bitimlar foydasi: hozir ${f(profitNow)} → tiklangach ${f(profitOld)} (keyin Qodir aka 5% qayta hisoblanadi)`);
  for (const r of toRestore) {
    const d = r.deal, o = r.old;
    const parts = [`${nameOf.get(d.agencyId) || '—'}/${nameOf.get(d.agentId) || '—'} → ${nameOf.get(o.agencyId) || '—'}/${nameOf.get(o.agentId) || '—'}`];
    if (r.diffs.includes('productName')) parts.push(`tovar "${d.productName ?? ''}" → "${o.productName ?? ''}"`);
    if (r.diffs.includes('status')) parts.push(`holat ${d.status} → ${o.status}`);
    if (r.diffs.includes('profit')) parts.push(`foyda ${f(d.profit)} → ${f(o.profit)}`);
    out(`   #${d.dealNumber}: ${parts.join(' | ')}`);
  }
  out(`\n   Tegilmaydi (sinxronlashdan tashqari, sizning o'zgarishlaringiz): ${otherChanged.length} ta — ${otherChanged.join('; ')}`);

  // ── 2) qayta yaratilgan bitimlar ──
  const recreated = now.filter((d) => !oldById.has(d.id) && d.createdAt >= WINDOW_FROM && d.createdAt <= WINDOW_TO && !d.createdById);
  const keptNew = now.filter((d) => !oldById.has(d.id) && !recreated.includes(d));
  out(`\n2) O'CHIRILADIGAN bitimlar (sinxronlash qayta yaratgan): ${recreated.length} ta`);
  for (const d of recreated) out(`   #${d.dealNumber} | ${nameOf.get(d.agencyId) || '—'}/${nameOf.get(d.agentId) || '—'} | limit ${f(d.withdrawnLimit)}`);
  out(`   Qoladigan yangi bitimlar: ${keptNew.map((d) => '#' + d.dealNumber).join(', ') || '—'}`);

  // ── 3) soxta spravochnik yozuvlari ──
  const recreatedIds = new Set(recreated.map((d) => d.id));
  const restoredIds = new Map(toRestore.map((r) => [r.deal.id, r.old]));
  const finalDeals = now.filter((d) => !recreatedIds.has(d.id)).map((d) => restoredIds.get(d.id) || d);
  const usedAgents = new Set<string>([...finalDeals.map((d) => d.agentId), ...users.map((u) => u.agentId)].filter(Boolean));
  const usedBuyers = new Set<string>([...finalDeals.map((d) => d.buyerId), ...sales.map((s) => s.buyerId)].filter(Boolean));
  const oldIds = (t: string) => new Set<string>(B[t].map((x: any) => x.id));
  const junkAgents = agents.filter((a) => !oldIds('Agent').has(a.id) && !usedAgents.has(a.id));
  const junkAgentIds = new Set(junkAgents.map((a) => a.id));
  const usedAgencies = new Set<string>([
    ...finalDeals.map((d) => d.agencyId), ...users.map((u) => u.agencyId),
    ...agents.filter((a) => !junkAgentIds.has(a.id)).map((a) => a.agencyId),
  ].filter(Boolean));
  const junkAgencies = agencies.filter((a) => !oldIds('Agency').has(a.id) && !usedAgencies.has(a.id));
  const junkBuyers = buyers.filter((b) => !oldIds('Buyer').has(b.id) && !usedBuyers.has(b.id));
  const keptNewAgents = agents.filter((a) => !oldIds('Agent').has(a.id) && !junkAgentIds.has(a.id));
  out(`\n3) O'CHIRILADIGAN soxta yozuvlar:`);
  out(`   agentliklar ${junkAgencies.length} ta: ${junkAgencies.map((a) => a.name).join(', ')}`);
  out(`   operator yozuvlari ${junkAgents.length} ta: ${junkAgents.map((a) => `${nameOf.get(a.agencyId) || '—'}/${a.name}`).join(', ')}`);
  out(`   xaridorlar ${junkBuyers.length} ta (ismi raqam): ${junkBuyers.slice(0, 12).map((b) => b.name).join(', ')}${junkBuyers.length > 12 ? ' …' : ''}`);
  if (keptNewAgents.length) out(`   QOLADI (yangi, lekin ishlatilgan): ${keptNewAgents.map((a) => `${nameOf.get(a.agencyId) || '—'}/${a.name}`).join(', ')}`);

  // ── DDS va kassa: faqat solishtirish ──
  const ddsNow = (await retry(() => prisma.ddsTransaction.findMany())) as any[];
  const ddsOldBy = new Map<string, any>(B.DdsTransaction.map((t: any) => [t.txNumber, t]));
  const ddsFields = ['type', 'account', 'amount', 'categoryName', 'expenseType', 'dateTime', 'sourcePerson', 'description', 'source', 'dealId'];
  const ddsDiff: string[] = [];
  for (const t of ddsNow) {
    const o = ddsOldBy.get(t.txNumber);
    if (!o) { ddsDiff.push(`+ ${t.txNumber} ${t.type} ${f(t.amount)} ${t.categoryName}`); continue; }
    const diffs = ddsFields.filter((k) => norm(o[k]) !== norm(t[k]));
    if (diffs.length) ddsDiff.push(`~ ${t.txNumber}: ` + diffs.map((k) => `${k} ${norm(o[k]).slice(0, 30)} → ${norm(t[k]).slice(0, 30)}`).join(' | '));
  }
  const ddsNowNums = new Set(ddsNow.map((t) => t.txNumber));
  for (const o of B.DdsTransaction) if (!ddsNowNums.has(o.txNumber)) ddsDiff.push(`− ${o.txNumber} ${o.type} ${f(o.amount)} ${o.categoryName}`);
  out(`\nDDS (pul harakati) — zaxira bilan farq: ${ddsDiff.length} ta (yozilmaydi, faqat ma'lumot)`);
  for (const l of ddsDiff.slice(0, 30)) out(`   ${l}`);
  const balNow = (await retry(() => prisma.accountBalance.findMany())) as any[];
  out('Kassa qoldiqlari: ' + balNow.map((b) => {
    const o = B.AccountBalance.find((x: any) => x.account === b.account);
    return `${b.account} ${f(o?.balance)} → ${f(b.balance)}`;
  }).join(' | '));

  if (!APPLY) {
    out('\nDRY-RUN tugadi — bazaga hech narsa yozilmadi.');
  } else {
    // 1) bitimlarni tiklash (har biri alohida — qayta ishga tushirsa xavfsiz)
    let done = 0;
    for (const r of toRestore) {
      const data: any = {};
      for (const x of scalar) {
        if (!r.diffs.includes(x.name)) continue;
        const v = r.old[x.name];
        if (x.type === 'DateTime') data[x.name] = parseDate(v);
        else if (x.type === 'Json') data[x.name] = v === null || v === undefined ? Prisma.DbNull : v;
        else if (x.type === 'Decimal') data[x.name] = v === null || v === undefined ? null : String(v);
        else data[x.name] = v ?? null;
      }
      await retry(() => prisma.deal.update({ where: { id: r.deal.id }, data }));
      done++;
    }
    out(`\nYOZILDI: ${done} ta bitim tiklandi.`);
    // 2) qayta yaratilgan bitimlarni o'chirish
    for (const d of recreated) {
      await retry(() => prisma.$transaction([
        prisma.dealItem.deleteMany({ where: { dealId: d.id } }),
        prisma.storeLedgerEntry.deleteMany({ where: { dealId: d.id } }),
        prisma.trustLedgerEntry.deleteMany({ where: { dealId: d.id } }),
        prisma.deal.delete({ where: { id: d.id } }),
      ]));
    }
    out(`O'CHIRILDI: ${recreated.length} ta qayta yaratilgan bitim.`);
    // 3) soxta yozuvlar
    if (junkAgents.length) await retry(() => prisma.agent.deleteMany({ where: { id: { in: junkAgents.map((a) => a.id) } } }));
    if (junkAgencies.length) await retry(() => prisma.agency.deleteMany({ where: { id: { in: junkAgencies.map((a) => a.id) } } }));
    if (junkBuyers.length) await retry(() => prisma.buyer.deleteMany({ where: { id: { in: junkBuyers.map((b) => b.id) } } }));
    out(`O'CHIRILDI: operator ${junkAgents.length}, agentlik ${junkAgencies.length}, xaridor ${junkBuyers.length}.`);
  }

  const outFile = path.join(__dirname, '..', '..', 'backups', APPLY ? `restore-1611-apply-${new Date().toISOString().replace(/[:.]/g, '-')}.txt` : 'restore-1611-dry-run.txt');
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log(`\nNatija saqlandi: ${outFile}`);
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
