/**
 * FAQAT O'QIYDI: shubhali (xato bo'lishi mumkin) bitimlar ro'yxati.
 */
import { PrismaClient } from '@prisma/client';
import { resolveCommission } from '../src/services/calculation.service';

const prisma = new PrismaClient();
const f = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const day = (v: Date) => new Date(v.getTime() + 5 * 3600e3).toISOString().slice(5, 10).split('-').reverse().join('.');
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};

async function main() {
  const deals: any[] = await retry(() => prisma.deal.findMany({
    include: { store: true, provider: true, agency: true, agent: true, createdBy: { select: { username: true } } },
    orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
  }));
  const line = (d: any, extra = '') =>
    `   #${d.dealNumber} ${day(d.date)} | ${d.store?.name}/${d.provider?.name} | ${d.agency?.name || '—'}/${d.agent?.name || '—'} | limit ${f(d.withdrawnLimit)} | mijozga ${f(d.calculatedAmount)} | agent ${f(d.agentAmount)} | ${d.status}${extra ? ' | ' + extra : ''}`;
  const section = (title: string, rows: string[]) => {
    console.log(`\n── ${title}: ${rows.length} ta ──`);
    for (const r of rows) console.log(r);
  };
  const N = (v: any) => Number(v) || 0;

  section('1. Yechilgan limit yoki mijozga berilgan summa 0', deals.filter((d) => N(d.withdrawnLimit) <= 0 || N(d.calculatedAmount) <= 0).map((d) => line(d)));

  section('2. Mijozga berilgan summa limitdan KATTA yoki teng', deals.filter((d) => N(d.withdrawnLimit) > 0 && N(d.calculatedAmount) >= N(d.withdrawnLimit)).map((d) => line(d)));

  const groups = new Map<string, any[]>();
  for (const d of deals) {
    if (N(d.withdrawnLimit) <= 0) continue;
    const k = [day(d.date), d.storeId, d.providerId, N(d.withdrawnLimit), N(d.calculatedAmount)].join('|');
    groups.set(k, [...(groups.get(k) || []), d]);
  }
  const dupRows: string[] = [];
  for (const g of groups.values()) if (g.length > 1) { for (const d of g) dupRows.push(line(d, `kiritgan ${d.createdBy?.username || 'Sheets'}`)); dupRows.push(''); }
  section("3. TAKROR bo'lishi mumkin (bir kun, bir do'kon, bir provayder, bir xil limit va summa)", dupRows);

  const imei = new Map<string, any[]>();
  for (const d of deals) {
    const codes = new Set<string>(String(`${d.imeiBarcode || ''} ${d.imei2 || ''}`).match(/\d{14,16}/g) || []);
    for (const c of codes) imei.set(c, [...(imei.get(c) || []), d]);
  }
  const imeiRows: string[] = [];
  for (const [c, g] of imei) if (g.length > 1) imeiRows.push(`   IMEI ${c}: ${g.map((d) => `#${d.dealNumber} (${d.status})`).join(', ')}`);
  section('4. Bitta IMEI bir nechta chekda', imeiRows);

  section("5. Operatori yoki agentligi yo'q", deals.filter((d) => !d.agentId || !d.agencyId).map((d) => line(d)));

  section("6. Foiz qoidasi topilmagan (kompaniya ulushi 0%)", deals.filter((d) => resolveCommission(d.store?.name, d.provider?.name, [], d.date).source === 'NONE').map((d) => line(d)));

  section("7. Diskont g'alati (0%, 15% dan kichik yoki 45% dan katta)", deals
    .filter((d) => N(d.withdrawnLimit) > 0 && (N(d.purchaseDiscountPct) < 0.15 || N(d.purchaseDiscountPct) > 0.45))
    .map((d) => line(d, `diskont ${Math.round(N(d.purchaseDiscountPct) * 1000) / 10}%`)));

  section("8. Agent ulushi limitning 10% idan katta yoki manfiy", deals
    .filter((d) => N(d.withdrawnLimit) > 0 && (N(d.agentAmount) < 0 || N(d.agentAmount) > N(d.withdrawnLimit) * 0.1))
    .map((d) => line(d, `agent ${Math.round((N(d.agentAmount) / N(d.withdrawnLimit)) * 1000) / 10}%`)));

  section('9. Foydasi MANFIY', deals.filter((d) => N(d.profit) < 0).map((d) => line(d, `foyda ${f(d.profit)} | sotuv ${f(d.salePrice)}`)));

  section("10. \"Sotildi\" lekin sotuv narxi 0", deals.filter((d) => d.status === 'SOLD' && N(d.salePrice) <= 0).map((d) => line(d, `tovar: ${d.productName || '—'}`)));

  section("11. Omborda / sotilgan, lekin tovar nomi yo'q yoki tushunarsiz", deals
    .filter((d) => ['IN_WAREHOUSE', 'IN_TRANSIT', 'SOLD'].includes(d.status) && (!d.productName || /^[\s\d.\-]+$/.test(d.productName) || /^\s*1\s+1\s+1\s*$/.test(d.productName)))
    .map((d) => line(d, `tovar: "${d.productName || ''}"`)));

  const byStatus = new Map<string, number>();
  for (const d of deals) byStatus.set(d.status, (byStatus.get(d.status) || 0) + 1);
  console.log(`\nJami ${deals.length} bitim. Holatlar: ${[...byStatus].map(([k, v]) => `${k}=${v}`).join(', ')}`);
}

main().catch((e) => console.error('Xato:', e?.message || e)).finally(() => prisma.$disconnect());
