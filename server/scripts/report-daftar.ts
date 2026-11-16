/**
 * FAQAT O'QIYDI: Daftar cheklari (Denov / Jizzax) — har chek bo'yicha holat va summalar.
 */
import { PrismaClient } from '@prisma/client';
import { canonicalStoreName } from '../src/services/calculation.service';

const prisma = new PrismaClient();
const f = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const d = (v: Date | null | undefined) => (v ? new Date(v.getTime() + 5 * 3600e3).toISOString().slice(0, 10) : '—');

async function main() {
  const deals = await prisma.deal.findMany({
    include: { store: true, provider: true, agency: true, agent: true },
    orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
  });
  const rows = deals.filter((x) => ['Denov', 'Jizzax'].includes(canonicalStoreName(x.store?.name) as string));
  let limit = 0, spent = 0;
  for (const x of rows as any[]) {
    limit += Number(x.withdrawnLimit);
    spent += Number(x.calculatedAmount) + Number(x.agentAmount);
    console.log(
      [
        `#${x.dealNumber}`, d(x.date), x.store?.name, x.provider?.name, `daftar=${x.isDaftar ? 'Ha' : "Yo'q"}`, x.approvalStatus, x.status,
        `mijoz: ${x.customerName || '—'}`, `agent: ${x.agency?.name || '—'}/${x.agent?.name || '—'}`,
        `limit ${f(x.customerLimit)}`, `yechilgan ${f(x.withdrawnLimit)}`, `mijozga ${f(x.calculatedAmount)}`, `agentga ${f(x.agentAmount)}`,
        `pul tushdi ${d(x.daftarMoneyAt)}`, `qurilma ${x.devicePurchaseAmount == null ? '—' : f(x.devicePurchaseAmount)}`,
        `tovar: ${x.productName || '—'}`, `sotuv ${f(x.salePrice)}`, `foyda ${f(x.profit)}`,
      ].join(' | ')
    );
  }
  console.log(`JAMI: ${rows.length} chek, yechilgan ${f(limit)}, sarf (mijozga+agent) ${f(spent)}`);
}

main().finally(() => prisma.$disconnect());
