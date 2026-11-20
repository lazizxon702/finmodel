import React, { useRef } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button, Field, Input, controlClass, cn } from '../ui';
import { PhoneSelector } from '../PhoneSelector';
import { AmountInput } from '../AmountInput';
import { useTranslation } from '../../context/LanguageContext';
import type { ItemView } from './dealUtils';

/** Formadagi mahsulot qatori (key — React uchun barqaror identifikator) */
export interface ItemRow extends ItemView {
  key: string;
}

let rowSeq = 0;
export function newItemRow(from?: Partial<ItemView>): ItemRow {
  rowSeq += 1;
  return {
    key: `row-${Date.now()}-${rowSeq}`,
    productName: from?.productName || '',
    color: from?.color || '',
    storageGb: from?.storageGb || '',
    imei1: from?.imei1 || '',
    imei2: from?.imei2 || '',
    quantity: Math.max(1, Number(from?.quantity) || 1),
    price: Number(from?.price) || 0,
  };
}

/** Qatorda biror ma'lumot bormi (bo'sh qatorlar saqlashda tashlab yuboriladi) */
export function isItemRowFilled(row: ItemRow): boolean {
  return Boolean(row.productName.trim() || row.imei1.trim() || row.imei2.trim());
}

interface Props {
  rows: ItemRow[];
  // Funksional yangilash: PhoneSelector onChange ni kechikib chaqirganda eski ro'yxat ustidan yozib yubormasin
  onChange: React.Dispatch<React.SetStateAction<ItemRow[]>>;
}

/**
 * Bitta chekdagi mahsulotlar ro'yxati: har qatorda model/rang/xotira, IMEI 1, IMEI 2, soni, narx.
 * IMEI maydonlarida Enter (apparat skaneri kod oxirida yuboradi) formani saqlamaydi —
 * fokus keyingi IMEI maydoniga o'tadi.
 */
export const DealItemsEditor: React.FC<Props> = ({ rows, onChange }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const update = (key: string, updates: Partial<ItemRow>) => {
    onChange((prev) => prev.map((r) => (r.key === key ? { ...r, ...updates } : r)));
  };

  const remove = (key: string) => {
    if (rows.length <= 1) return; // kamida bitta qator qoladi
    onChange((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  // Tugmadan fokus olinadi: aks holda skaner yuborgan Enter fokusda qolgan tugmani qayta bosib yuboradi
  const add = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    onChange((prev) => [...prev, newItemRow()]);
  };

  const onImeiKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    const inputs = Array.from(containerRef.current?.querySelectorAll<HTMLInputElement>('input[data-imei-input]') || []);
    const next = inputs[inputs.indexOf(e.currentTarget) + 1];
    if (next) {
      next.focus();
      next.select();
    }
  };

  // Tovar narxlari: chekda 2+ tovar bo'lsa, chek tannarxi shu narxlar nisbatida bo'linadi.
  // Bo'sh qatorlar (saqlashda tashlab yuboriladi) hisobga olinmaydi.
  const priced = rows.filter(isItemRowFilled);
  const multi = priced.length >= 2;
  const weight = (r: ItemRow) => (Number(r.price) || 0) * Math.max(1, Number(r.quantity) || 1);
  const missingPrice = multi && priced.some((r) => !(Number(r.price) > 0));
  const totalWeight = priced.reduce((sum, r) => sum + weight(r), 0);
  const showShares = multi && !missingPrice && totalWeight > 0;

  return (
    <div ref={containerRef} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{t('dealsPage.items_title', { count: rows.length })}</h3>
          <p className="mt-0.5 text-xs text-fg-muted">{t('dealsPage.items_hint')}</p>
        </div>
      </div>

      {rows.map((row, idx) => {
        const inSplit = multi && isItemRowFilled(row);
        const priceEmpty = inSplit && !(Number(row.price) > 0);
        return (
        <div key={row.key} className="space-y-3 rounded-card border border-line bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-fg">
              <span className="tabular-nums text-fg-muted">{idx + 1}.</span>{' '}
              {row.productName || t('dealsPage.item_untitled')}
            </p>
            {rows.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-danger hover:text-danger"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => remove(row.key)}
              >
                {t('common.delete')}
              </Button>
            )}
          </div>

          <PhoneSelector
            initialValue={row.productName}
            initialColor={row.color}
            initialStorage={row.storageGb}
            onChange={(res) => update(row.key, { productName: res.productName, color: res.color, storageGb: res.storageGb })}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={t('dealsPage.imei1')} className="col-span-2 sm:col-span-1">
              <Input
                data-imei-input
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="next"
                className="font-mono tabular-nums"
                placeholder="35288783…"
                value={row.imei1}
                onChange={(e) => update(row.key, { imei1: e.target.value })}
                onKeyDown={onImeiKeyDown}
              />
            </Field>
            <Field label={t('dealsPage.imei2')} className="col-span-2 sm:col-span-1">
              <Input
                data-imei-input
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="next"
                className="font-mono tabular-nums"
                placeholder="35288783…"
                value={row.imei2}
                onChange={(e) => update(row.key, { imei2: e.target.value })}
                onKeyDown={onImeiKeyDown}
              />
            </Field>
            <Field label={t('common.quantity')}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                className="tabular-nums"
                value={row.quantity}
                onFocus={(e) => e.target.select()}
                onChange={(e) => update(row.key, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              />
            </Field>
            <Field
              label={multi ? t('dealsPage.item_price') : `${t('dealsPage.item_price')} (${t('common.optional')})`}
              hint={
                priceEmpty
                  ? <span className="font-medium text-warning">{t('dealsPage.item_price_missing')}</span>
                  : showShares && inSplit
                    ? t('dealsPage.item_price_share', { percent: Math.round((weight(row) / totalWeight) * 100) })
                    : undefined
              }
            >
              <AmountInput
                value={row.price}
                onChange={(val) => update(row.key, { price: val })}
                placeholder="0"
                className={cn(controlClass, 'tabular-nums', priceEmpty && 'border-warning ring-1 ring-warning/40')}
              />
            </Field>
          </div>
        </div>
        );
      })}

      {missingPrice && (
        <div role="status" className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2.5 text-sm font-medium text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t('dealsPage.items_price_warning')}</span>
        </div>
      )}
      <p className="text-xs text-fg-muted">{t('dealsPage.items_price_hint')}</p>

      <Button variant="secondary" fullWidth leftIcon={<Plus className="h-4 w-4" />} onClick={add}>
        {t('dealsPage.add_item')}
      </Button>
    </div>
  );
};
