/**
 * BIR MARTALIK (egasi, 16.11.2026: "chek bo'linishi kerak — iPhone Umirzoqqa, kofe mashinka Qoratoshga"):
 * #8107 (iPhone 18 Pro Max 256GB Burgundy + Kofe mashinka) ikkiga bo'linadi:
 *   • #8107 — faqat iPhone: limit 22 800 000, mijozga 16 872 000, agent 912 000, tannarx 17 784 000 (Umirzoqning №5 sotuvi 21 176 000 — joyida);
 *   • YANGI chek — Kofe mashinka: limit 8 000 000, mijozga 5 920 000, agent 320 000, tannarx 6 240 000;
 *     omborga qo'yiladi va Media park qoratoshga 570$ × 11 950 = 6 811 500 NAQD sotiladi (oddiy sotuv: Sale + to'lov + DDS kirimi).
 * Jami limit / mijozga / agent / tannarx O'ZGARMAYDI. Do'kon daftari ikkala chek bo'yicha qayta moslanadi.
 * Chek xarajati DDS yozuvi (#8107 ga bog'langan) o'zgarmaydi.
 *
 *   tsrun scripts/split-deal-8107-coffee.ts            (DRY-RUN)
 *   tsrun scripts/split-deal-8107-coffee.ts --apply
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { CalculationService } from '../src/services/calculation.service';
import { syncStoreDebtForDeal } from '../src/services/ledger.service';
import { createSale } from '../src/services/sale.service';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const DEAL = 8107;
const IPHONE = { limit: 22_800_000, name: 'iPhone 18 Pro Max 256GB Burgundy' };
const COFFEE = { limit: 8_000_000, name: 'Kofe mashinka' };
const BUYER = 'Media park qoratosh';
const USD = 570, RATE = 11_950, PRICE = USD * RATE;
const f = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const isCoffee = (s: unknown) => /kofe|кофе|coffee/i.test(String(s ?? ''));

async function main() {
  console.log(APPLY ? '>>> YOZISH rejimi (--apply)' : '>>> DRY-RUN: bazaga hech narsa yozilmaydi');
  const d: any = await prisma.deal.findUnique({ where: { dealNumber: DEAL }, include: { store: true, provider: true, agency: true, items: true, sale: true } });
  if (!d) throw new Error('#8107 topilmadi');
  const total = Number(d.withdrawnLimit);
  if (Math.round(total) !== IPHONE.limit + COFFEE.limit) {
    if (Math.round(total) === IPHONE.limit) { console.log('#8107 allaqachon bo\'lingan (limit 22 800 000) — hech narsa qilinmaydi.'); return; }
    throw new Error(`#8107 limiti kutilgandek emas: ${f(total)}`);
  }
  const coffeeItems = d.items.filter((i: any) => isCoffee(i.productName));
  if (coffeeItems.length !== 1) throw new Error(`Kofe mashinka qatori ${coffeeItems.length} ta topildi`);

  const part = (v: unknown, limit: number) => Math.round(((Number(v) || 0) * limit) / total * 100) / 100;
  const custLimit = Number(d.customerLimit) || 0;
  const rules: any[] = await prisma.commissionRule.findMany({ where: { isActive: true }, include: { store: true, provider: true } });
  const ruleItems = rules.map((r) => ({ ...r, storeName: r.store?.name, providerName: r.provider?.name, ratePercent: Number(r.ratePercent), profitPercent: r.profitPercent == null ? null : Number(r.profitPercent) }));
  const calc = (limit: number, calculated: number, customerLimit: number, sold: boolean) => CalculationService.calculateDeal({
    customerLimit, withdrawnLimit: limit, calculatedAmount: calculated, storeName: d.store?.name || '', providerName: d.provider?.name || '',
    status: sold ? d.status : ('IN_WAREHOUSE' as any), salePrice: sold ? Number(d.salePrice) : 0, receivedFromBuyer: sold ? Number(d.receivedFromBuyer) : 0,
    date: d.date, agencyName: d.agency?.name,
  } as any, ruleItems as any) as any;

  const iCalc = calc(IPHONE.limit, part(d.calculatedAmount, IPHONE.limit), custLimit >= total ? custLimit - COFFEE.limit : custLimit, true);
  const cCalc = calc(COFFEE.limit, part(d.calculatedAmount, COFFEE.limit), COFFEE.limit, false);
  const dealModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Deal')!;
  const numeric = new Set(dealModel.fields.filter((x) => x.kind === 'scalar' && (x.type === 'Decimal' || x.type === 'Float')).map((x) => x.name));
  const pickCalc = (c: any) => Object.fromEntries(Object.entries(c).filter(([k, v]) => numeric.has(k) && typeof v === 'number' && !['salePrice', 'receivedFromBuyer', 'debtRemainder', 'customerLimit', 'withdrawnLimit', 'calculatedAmount'].includes(k)));

  const row = (label: string, a: unknown, b: unknown, c: unknown) => console.log(`   ${label.padEnd(18)} ${f(a).padStart(13)} = ${f(b).padStart(13)} + ${f(c).padStart(12)}${Math.abs(Number(a) - Number(b) - Number(c)) < 1 ? '' : '   !!! MOS EMAS'}`);
  console.log(`#${DEAL}: ${d.store?.name} / ${d.provider?.name}, "${d.productName}"`);
  console.log(`   ${''.padEnd(18)} ${'HOZIR'.padStart(13)}   ${'iPhone (#8107)'.padStart(13)}   ${'Kofe (yangi)'.padStart(12)}`);
  row('Yechilgan limit', d.withdrawnLimit, IPHONE.limit, COFFEE.limit);
  row('Mijozga berilgan', d.calculatedAmount, part(d.calculatedAmount, IPHONE.limit), part(d.calculatedAmount, COFFEE.limit));
  row('Agent ulushi', d.agentAmount, iCalc.agentAmount, cCalc.agentAmount);
  row('Tannarx', d.totalPurchaseCost, iCalc.totalPurchaseCost, cCalc.totalPurchaseCost);
  console.log(`   iPhone: Umirzoq, sotuv №${d.sale?.saleNumber}, ${f(d.salePrice)} → foyda ${f(d.profit)} → ${f(iCalc.profit)}`);
  console.log(`   Kofe mashinka: ${BUYER}, ${USD}$ × ${f(RATE)} = ${f(PRICE)} naqd → foyda ${f(PRICE - cCalc.totalPurchaseCost)}`);
  const cash = await prisma.accountBalance.findUnique({ where: { account: 'CASH' } });
  console.log(`   naqd kassa ${f(cash?.balance)} → ${f(Number(cash?.balance) + PRICE)}`);
  if (Math.abs(Number(d.agentAmount) - iCalc.agentAmount - cCalc.agentAmount) > 1 || Math.abs(Number(d.totalPurchaseCost) - iCalc.totalPurchaseCost - cCalc.totalPurchaseCost) > 1) throw new Error('Bo\'laklar yig\'indisi asl chekka teng emas — to\'xtatildi');
  if (!APPLY) { console.log('DRY-RUN tugadi.'); return; }

  const newId = await prisma.$transaction(async (tx) => {
    const last = await tx.deal.aggregate({ _max: { dealNumber: true } });
    const dealNumber = (last._max.dealNumber || 3500) + 1;
    const { id, dealNumber: _n, createdAt, updatedAt, store, provider, agency, items, sale, ...base } = d;
    const devices = Array.isArray(d.deviceItems) ? d.deviceItems : null;
    const note = `#${DEAL} chekidan ajratildi (16.11.2026): kofe mashinka alohida sotiladi. Tannarx hisobi: chek 24 024 000 − iPhone 18 Pro Max 256 (#3639 bo'yicha) 17 784 000 = 6 240 000.`;
    const created = await tx.deal.create({
      data: {
        ...base, ...pickCalc(cCalc), dealNumber,
        customerLimit: COFFEE.limit, withdrawnLimit: COFFEE.limit, calculatedAmount: part(d.calculatedAmount, COFFEE.limit),
        productName: COFFEE.name, quantity: 1, imeiBarcode: null, imei2: null, color: null, storageGb: null,
        deviceItems: devices ? (devices.filter((x: any) => isCoffee(x?.productName)) as any) : Prisma.DbNull,
        status: 'IN_WAREHOUSE', statusChangeReason: `#${DEAL} chekidan ajratildi`, isActualDeviceSale: true,
        saleId: null, buyerId: null, saleDate: null, salePrice: 0, receivedFromBuyer: 0, debtRemainder: 0, paidCashUzs: 0, paidCashUsd: 0, paidBank: 0, paidTransfer: 0,
        botDealId: null, debtDueDate: null, note,
      } as any,
    });
    await tx.dealItem.update({ where: { id: coffeeItems[0].id }, data: { dealId: created.id } });
    await tx.deal.update({
      where: { id: d.id },
      data: {
        ...pickCalc(iCalc),
        customerLimit: custLimit >= total ? custLimit - COFFEE.limit : custLimit, withdrawnLimit: IPHONE.limit, calculatedAmount: part(d.calculatedAmount, IPHONE.limit),
        productName: IPHONE.name, quantity: 1,
        deviceItems: devices ? (devices.filter((x: any) => !isCoffee(x?.productName)) as any) : undefined,
        note: `${d.note ? d.note + ' | ' : ''}Kofe mashinka #${dealNumber} chekiga ajratildi (16.11.2026).`,
      } as any,
    });
    await syncStoreDebtForDeal(tx as any, d.id);
    await syncStoreDebtForDeal(tx as any, created.id);
    console.log(`YOZILDI: #${DEAL} bo'lindi, yangi chek #${dealNumber}.`);
    return created.id;
  }, { timeout: 60000, maxWait: 20000 });

  const buyer = await prisma.buyer.upsert({ where: { name: BUYER }, update: {}, create: { name: BUYER } });
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } });
  const saleId = await createSale({
    dealIds: [newId], scope: {}, totalPrice: PRICE, buyerId: buyer.id, buyerName: BUYER, paidAmount: PRICE, paymentType: 'CASH', account: 'CASH',
    saleDate: new Date(), dueDate: null, note: `Kofe mashinka (#${DEAL} chekidan ajratilgan), ${USD}$ × ${RATE}`, userId: admin?.id || null,
  } as any);
  const s = await prisma.sale.findUnique({ where: { id: saleId } });
  console.log(`YOZILDI: sotuv №${s?.saleNumber} → ${BUYER}, ${f(s?.totalPrice)}, olingan ${f(s?.receivedAmount)}.`);
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
