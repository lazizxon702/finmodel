import { DealStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { CalculationService, normalizeDealItems, splitItemCosts } from './calculation.service';
import { syncStoreDebtForDeal, syncTrustDebtForDeal } from './ledger.service';
import { loadActiveCommissionRules } from './sale.service';

/**
 * Chekni tovarlar bo'yicha ikkiga bo'lish (egasi, 18.11.2026): bitta chekdagi tovarlar har xil xaridorga sotilishi uchun.
 * Tanlangan tovar qatorlari YANGI chekka o'tadi; yechilgan limit / mijozga berilgan / mijoz limiti tovar narxlari
 * (tannarx og'irligi) nisbatida bo'linadi, agent ulushi, tannarx va foyda ikkala chek uchun calculateDeal bilan qayta hisoblanadi.
 * Jami summalar o'zgarmaydi. Do'kon va Trust daftarlari ikkala chek bo'yicha qayta moslanadi.
 * Chek xarajati DDS yozuvi asl chekda qoladi (bo'linmaydi).
 */
export class DealSplitError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const dealModel = Prisma.dmmf.datamodel.models.find((m) => m.name === 'Deal')!;
const NUMERIC_FIELDS = new Set(dealModel.fields.filter((x) => x.kind === 'scalar' && (x.type === 'Decimal' || x.type === 'Float')).map((x) => x.name));
const KEEP_AS_IS = new Set(['salePrice', 'receivedFromBuyer', 'debtRemainder', 'customerLimit', 'withdrawnLimit', 'calculatedAmount']);
const pickCalc = (c: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(c).filter(([k, v]) => NUMERIC_FIELDS.has(k) && typeof v === 'number' && !KEEP_AS_IS.has(k)));

const deviceJson = (items: ReturnType<typeof normalizeDealItems>['items']) =>
  items.map((it) => ({
    id: String(it.position + 1),
    productName: it.productName,
    color: it.color || '',
    storageGb: it.storageGb || '',
    quantity: it.quantity,
    imeiBarcode: it.imei1 || '',
    imei1: it.imei1 || '',
    imei2: it.imei2 || '',
    price: it.price,
  }));

export interface SplitResult {
  newDealId: string;
  newDealNumber: number;
  sourceDealNumber: number;
}

/**
 * `itemIds` — yangi chekka o'tadigan DealItem qatorlari. Shartlar: chek omborda, tasdiqlangan, sotuvda emas;
 * kamida bitta tovar asl chekda qolishi kerak.
 */
export async function splitDealByItems(dealId: string, itemIds: string[], userId?: string | null): Promise<SplitResult> {
  const rules = await loadActiveCommissionRules();
  return prisma.$transaction(
    async (tx) => {
      const d: any = await tx.deal.findUnique({
        where: { id: dealId },
        include: { store: true, provider: true, agency: true, items: { orderBy: { position: 'asc' } } },
      });
      if (!d) throw new DealSplitError('Tovar topilmadi', 404);
      if (d.status !== DealStatus.IN_WAREHOUSE || d.approvalStatus !== 'APPROVED' || d.saleId) {
        throw new DealSplitError(`№${d.dealNumber}: tovar omborda emas, tasdiqlanmagan yoki allaqachon sotilgan`, 409);
      }
      const wanted = new Set(itemIds);
      const moving = d.items.filter((i: any) => wanted.has(i.id));
      const staying = d.items.filter((i: any) => !wanted.has(i.id));
      if (moving.length !== wanted.size) throw new DealSplitError(`№${d.dealNumber}: tanlangan tovar qatori topilmadi`, 404);
      if (!moving.length || !staying.length) throw new DealSplitError(`№${d.dealNumber}: chekni bo'lish uchun kamida bitta tovar qolishi kerak`);

      const total = Number(d.totalPurchaseCost) || 0;
      const { shares } = splitItemCosts(d.items.map((i: any) => ({ price: Number(i.price), quantity: i.quantity })), total > 0 ? total : d.items.length);
      const sumAll = shares.reduce((s, x) => s + x, 0) || 1;
      const sumMoving = d.items.reduce((s: number, i: any, idx: number) => (wanted.has(i.id) ? s + shares[idx] : s), 0);
      const factor = sumMoving / sumAll;

      const limit = Number(d.withdrawnLimit) || 0;
      const calculated = Number(d.calculatedAmount) || 0;
      const custLimit = Number(d.customerLimit) || 0;
      const moved = { limit: round2(limit * factor), calculated: round2(calculated * factor), cust: round2(custLimit * factor) };
      const rest = { limit: round2(limit - moved.limit), calculated: round2(calculated - moved.calculated), cust: round2(custLimit - moved.cust) };

      const calc = (p: { limit: number; calculated: number; cust: number }) =>
        CalculationService.calculateDeal(
          {
            customerLimit: p.cust,
            withdrawnLimit: p.limit,
            calculatedAmount: p.calculated,
            storeName: d.store?.name || '',
            providerName: d.provider?.name || '',
            status: DealStatus.IN_WAREHOUSE,
            salePrice: 0,
            receivedFromBuyer: 0,
            date: d.date,
            agencyName: d.agency?.name,
          } as any,
          rules as any
        ) as unknown as Record<string, unknown>;
      const movedCalc = calc(moved);
      const restCalc = calc(rest);

      const toInput = (rows: any[]) => rows.map((i) => ({ productName: i.productName, color: i.color, storageGb: i.storageGb, imei1: i.imei1, imei2: i.imei2, quantity: i.quantity, price: Number(i.price) }));
      const movedNorm = normalizeDealItems(toInput(moving));
      const restNorm = normalizeDealItems(toInput(staying));

      const last = await tx.deal.aggregate({ _max: { dealNumber: true } });
      const dealNumber = (last._max.dealNumber || 3500) + 1;
      const { id, dealNumber: _n, createdAt, updatedAt, store, provider, agency, items, ...base } = d;
      const created = await tx.deal.create({
        data: {
          ...base,
          ...pickCalc(movedCalc),
          dealNumber,
          customerLimit: moved.cust,
          withdrawnLimit: moved.limit,
          calculatedAmount: moved.calculated,
          productName: movedNorm.productName,
          quantity: movedNorm.quantity,
          imeiBarcode: movedNorm.imeiBarcode,
          imei2: movedNorm.imei2,
          color: movedNorm.color,
          storageGb: movedNorm.storageGb,
          deviceItems: deviceJson(movedNorm.items) as any,
          status: DealStatus.IN_WAREHOUSE,
          statusChangeReason: `№${d.dealNumber} chekidan ajratildi (tovar alohida sotiladi)`,
          botDealId: null,
          note: `№${d.dealNumber} chekidan ajratildi: tovar alohida sotiladi.`,
        } as any,
      });
      for (let i = 0; i < moving.length; i++) await tx.dealItem.update({ where: { id: moving[i].id }, data: { dealId: created.id, position: i } });
      for (let i = 0; i < staying.length; i++) await tx.dealItem.update({ where: { id: staying[i].id }, data: { position: i } });
      await tx.deal.update({
        where: { id: d.id },
        data: {
          ...pickCalc(restCalc),
          customerLimit: rest.cust,
          withdrawnLimit: rest.limit,
          calculatedAmount: rest.calculated,
          productName: restNorm.productName,
          quantity: restNorm.quantity,
          imeiBarcode: restNorm.imeiBarcode,
          imei2: restNorm.imei2,
          color: restNorm.color,
          storageGb: restNorm.storageGb,
          deviceItems: deviceJson(restNorm.items) as any,
          note: `${d.note ? d.note + ' | ' : ''}"${movedNorm.productName}" №${dealNumber} chekiga ajratildi.`,
        } as any,
      });
      await syncStoreDebtForDeal(tx as any, d.id);
      await syncStoreDebtForDeal(tx as any, created.id);
      await syncTrustDebtForDeal(tx as any, d.id);
      await syncTrustDebtForDeal(tx as any, created.id);
      await tx.auditLog
        .create({
          data: {
            userId: userId || null,
            entity: 'Deal',
            entityId: d.id,
            action: 'SPLIT',
            newValues: { sourceDealNumber: d.dealNumber, newDealNumber: dealNumber, newDealId: created.id, movedItems: moving.map((i: any) => i.productName), factor },
          },
        })
        .catch(() => undefined);
      return { newDealId: created.id, newDealNumber: dealNumber, sourceDealNumber: d.dealNumber };
    },
    { timeout: 60000, maxWait: 20000 }
  );
}
