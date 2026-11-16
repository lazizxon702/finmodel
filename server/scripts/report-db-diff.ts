/**
 * FAQAT O'QIYDI: zaxiradagi HAMMA jadvallarni hozirgi baza bilan solishtiradi (qo'shilgan / yo'qolgan / o'zgargan qatorlar).
 *   tsrun scripts/report-db-diff.ts ../backups/db-raw-db-....json [--table=Deal]
 */
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SKIP = new Set(['AuditLog']);
const norm = (v: any): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object') {
    if (typeof (v as any).toFixed === 'function' || (v as any).constructor?.name === 'Decimal') return String(Math.round(Number(v.toString()) * 100) / 100);
    return JSON.stringify(v);
  }
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s) * 100) / 100);
  if (/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(s)) {
    const t = new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
    return isNaN(t.getTime()) ? s : t.toISOString();
  }
  return s;
};
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};

async function main() {
  const file = process.argv[2];
  const only = (process.argv.find((a) => a.startsWith('--table=')) || '').split('=')[1];
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Zaxira: ${backup.createdAt}`);
  for (const table of Object.keys(backup.data)) {
    if (SKIP.has(table) || (only && only !== table)) continue;
    const old: any[] = backup.data[table];
    const now: any[] = await retry(() => prisma.$queryRawUnsafe(`SELECT * FROM "${table}"`));
    const keyOf = (r: any) => String(r.id ?? r.key ?? JSON.stringify(r));
    const oldBy = new Map(old.map((r) => [keyOf(r), r]));
    const nowBy = new Map(now.map((r) => [keyOf(r), r]));
    const added = now.filter((r) => !oldBy.has(keyOf(r)));
    const removed = old.filter((r) => !nowBy.has(keyOf(r)));
    const fieldHist = new Map<string, number>();
    let changed = 0;
    const samples: string[] = [];
    for (const r of now) {
      const o = oldBy.get(keyOf(r));
      if (!o) continue;
      const diffs = Object.keys(r).filter((f) => f !== 'updatedAt' && norm(o[f]) !== norm(r[f]));
      if (!diffs.length) continue;
      changed++;
      for (const f of diffs) fieldHist.set(f, (fieldHist.get(f) || 0) + 1);
      if (samples.length < (only ? 400 : 4))
        samples.push(`     ${r.dealNumber ?? r.txNumber ?? r.name ?? r.username ?? r.saleNumber ?? keyOf(r).slice(0, 8)}: ` + diffs.map((f) => `${f} ${norm(o[f]).slice(0, 40)} → ${norm(r[f]).slice(0, 40)}`).join(' | '));
    }
    if (!added.length && !removed.length && !changed) { console.log(`${table}: o'zgarish yo'q (${now.length})`); continue; }
    console.log(`\n${table}: zaxirada ${old.length}, hozir ${now.length} | qo'shilgan ${added.length}, yo'qolgan ${removed.length}, o'zgargan ${changed}`);
    if (changed) console.log(`   maydonlar: ${[...fieldHist].map(([k, v]) => `${k}=${v}`).join(', ')}`);
    for (const s of samples) console.log(s);
    const label = (r: any) => r.dealNumber ?? r.txNumber ?? r.name ?? r.username ?? r.saleNumber ?? r.note ?? keyOf(r).slice(0, 8);
    if (added.length) console.log(`   + ${added.slice(0, 40).map(label).join(' ; ')}`);
    if (removed.length) console.log(`   − ${removed.slice(0, 40).map(label).join(' ; ')}`);
  }
}

main().catch((e) => console.error('Xato:', e?.message || e)).finally(() => prisma.$disconnect());
