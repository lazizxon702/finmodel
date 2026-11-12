import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { PHONE_CATALOG, STANDARD_STORAGES, PhoneModelItem } from '../constants/phoneModels';
import { useTranslation } from '../context/LanguageContext';
import { cn } from '../lib/cn';
import { controlClass } from './ui';

type Brand = 'apple' | 'samsung' | 'other';

interface PhoneSelectorProps {
  /** To'liq mahsulot nomi ("iPhone 16 Pro 256GB Black") yoki faqat model nomi */
  initialValue?: string;
  initialColor?: string;
  initialStorage?: string;
  onChange: (result: {
    productName: string;
    brand: string;
    modelName: string;
    color: string;
    storageGb: string;
    isValid: boolean;
  }) => void;
}

interface SelectorState {
  brand: Brand;
  series: string;
  model: PhoneModelItem | null;
  customModel: string;
  color: string;
  customColor: boolean;
  storage: string;
  customStorage: boolean;
}

const DEFAULT_COLORS = ['Black', 'White', 'Silver', 'Gold', 'Blue'];
const APPLE_SERIES = Array.from(new Set(PHONE_CATALOG.filter((p) => p.brand === 'apple').map((p) => p.series)));

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Matn oxiridagi bo'lakni (rang yoki xotira) olib tashlaydi — registrga qaramasdan */
function stripSuffix(text: string, suffix: string): string {
  const base = text.trimEnd();
  const tail = suffix.trim();
  if (!tail || !base.toLowerCase().endsWith(tail.toLowerCase())) return text;
  return base.slice(0, base.length - tail.length).trimEnd();
}

const sameIn = (list: string[], value: string) => list.find((x) => norm(x) === norm(value));

/**
 * Saqlangan qiymatdan tanlov holatini tiklaydi. Maqsad: tahrir oynasi ochilganda eski bitimning
 * mahsulot nomi o'zgarib ketmasligi (katalogda yo'q nom "Boshqa" bo'limiga aynan o'zi bilan tushadi).
 */
function resolveInitial(value: string, initialColor: string, initialStorage: string): SelectorState {
  const raw = (value || '').trim();
  let color = (initialColor || '').trim();
  let storage = String(initialStorage || '').trim();

  if (!raw) {
    // Yangi qator: hech narsa oldindan tanlanmaydi (tasodifiy model saqlanib ketmasin)
    return {
      brand: 'apple',
      series: APPLE_SERIES[0] || '',
      model: null,
      customModel: '',
      color,
      customColor: false,
      storage,
      customStorage: false,
    };
  }

  // Nom "Model Xotira Rang" tartibida yig'iladi — oxiridan rang, keyin xotirani ajratamiz
  let rest = raw;
  if (color) rest = stripSuffix(rest, color);
  if (storage) rest = stripSuffix(rest, storage);

  let model = PHONE_CATALOG.find((m) => norm(m.name) === norm(rest)) || null;

  if (!model && !color && !storage) {
    // Rang/xotira alohida saqlanmagan yozuv: nom boshidan eng uzun mos modelni qidiramiz
    const candidate = [...PHONE_CATALOG]
      .sort((a, b) => b.name.length - a.name.length)
      .find((m) => norm(raw).startsWith(norm(m.name) + ' '));
    if (candidate) {
      const tail = raw.slice(candidate.name.length).trim();
      const match = tail.match(/^(\d+\s?(?:GB|TB))(?:\s+(.*))?$/i);
      if (match) {
        model = candidate;
        storage = match[1].replace(/\s/g, '').toUpperCase();
        color = (match[2] || '').trim();
      }
    }
  }

  if (model) {
    const knownColor = color ? sameIn(model.colors, color) : undefined;
    const knownStorage = storage ? sameIn(model.storages, storage) : undefined;
    return {
      brand: model.brand === 'samsung' ? 'samsung' : 'apple',
      series: model.series,
      model,
      customModel: '',
      color: knownColor || color,
      customColor: Boolean(color) && !knownColor,
      storage: knownStorage || storage,
      customStorage: Boolean(storage) && !knownStorage,
    };
  }

  const knownStorage = storage ? sameIn(STANDARD_STORAGES, storage) : undefined;
  const knownColor = color ? sameIn(DEFAULT_COLORS, color) : undefined;
  return {
    brand: 'other',
    series: APPLE_SERIES[0] || '',
    model: null,
    customModel: rest,
    color: knownColor || color,
    customColor: Boolean(color) && !knownColor,
    storage: knownStorage || storage,
    customStorage: Boolean(storage) && !knownStorage,
  };
}

const chip = (selected: boolean) =>
  cn(
    'inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-control border px-3 text-xs font-medium transition-colors sm:min-h-[2rem]',
    selected
      ? 'border-accent bg-brand-soft text-accent'
      : 'border-line-strong bg-surface text-fg-secondary hover:bg-surface-2 hover:text-fg'
  );

const stepLabel = 'mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-fg-secondary';

export const PhoneSelector: React.FC<PhoneSelectorProps> = ({
  initialValue = '',
  initialColor = '',
  initialStorage = '',
  onChange,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<SelectorState>(() => resolveInitial(initialValue, initialColor, initialStorage));
  const patch = (updates: Partial<SelectorState>) => setState((prev) => ({ ...prev, ...updates }));

  const { brand, series, model, customModel, color, customColor, storage, customStorage } = state;

  const result = useMemo(() => {
    const modelName = brand === 'other' ? customModel.trim() : model?.name || '';
    const finalColor = color.trim();
    const finalStorage = storage.trim();
    return {
      productName: modelName ? [modelName, finalStorage, finalColor].filter(Boolean).join(' ') : '',
      brand,
      modelName,
      color: finalColor,
      storageGb: finalStorage,
      isValid: Boolean(modelName && finalColor && finalStorage),
    };
  }, [brand, model, customModel, color, storage]);

  // Ota komponentga faqat qiymat HAQIQATAN o'zgarganda xabar beramiz — ochilishning o'zi
  // saqlangan mahsulot nomini qayta yozib yubormasligi uchun.
  const lastSent = useRef({
    productName: (initialValue || '').trim(),
    color: (initialColor || '').trim(),
    storageGb: String(initialStorage || '').trim(),
  });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const prev = lastSent.current;
    if (prev.productName === result.productName && prev.color === result.color && prev.storageGb === result.storageGb) {
      return;
    }
    lastSent.current = { productName: result.productName, color: result.color, storageGb: result.storageGb };
    onChangeRef.current(result);
  }, [result]);

  const selectModel = (item: PhoneModelItem) => {
    setState((prev) => ({
      ...prev,
      model: item,
      // Yangi modelda bunday rang/xotira bo'lmasa — birinchisiga o'tamiz (qo'lda yozilgan qiymat saqlanadi)
      color: prev.customColor || item.colors.includes(prev.color) ? prev.color : item.colors[0] || '',
      storage: prev.customStorage || item.storages.includes(prev.storage) ? prev.storage : item.storages[0] || '',
    }));
  };

  const changeBrand = (next: Brand) => {
    if (next === brand) return;
    if (next === 'other') {
      patch({ brand: next, model: null });
      return;
    }
    // Brend almashganda model qayta tanlanadi — eski brend modeli qolib ketmasin
    patch({ brand: next, model: null, series: next === 'apple' ? APPLE_SERIES[0] || '' : series });
  };

  const brandModels =
    brand === 'apple'
      ? PHONE_CATALOG.filter((p) => p.brand === 'apple' && p.series === series)
      : PHONE_CATALOG.filter((p) => p.brand === 'samsung');

  const storageOptions = model?.storages || STANDARD_STORAGES;
  const colorOptions = model?.colors || DEFAULT_COLORS;

  const brands: { value: Brand; label: string }[] = [
    { value: 'apple', label: 'Apple iPhone' },
    { value: 'samsung', label: 'Samsung Galaxy' },
    { value: 'other', label: t('phone.other_brand') },
  ];

  return (
    <div className="space-y-3 rounded-control border border-line bg-surface-2/50 p-3">
      {/* 1. Brend va model */}
      <div>
        <div className={stepLabel}>
          <span>{t('phone.brand_select')}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {brands.map((b) => (
            <button
              key={b.value}
              type="button"
              aria-pressed={brand === b.value}
              onClick={() => changeBrand(b.value)}
              className={cn(chip(brand === b.value), 'justify-center px-2 text-center')}
            >
              {b.label}
            </button>
          ))}
        </div>

        {brand === 'apple' && APPLE_SERIES.length > 1 && (
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
            {APPLE_SERIES.map((ser) => (
              <button
                key={ser}
                type="button"
                aria-pressed={series === ser}
                onClick={() => patch({ series: ser })}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-control px-2.5 py-1.5 text-xs font-medium transition-colors',
                  series === ser ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                )}
              >
                {ser}
              </button>
            ))}
          </div>
        )}

        {brand !== 'other' && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {brandModels.map((m) => {
              const selected = model?.id === m.id;
              return (
                <button key={m.id} type="button" aria-pressed={selected} onClick={() => selectModel(m)} className={chip(selected)}>
                  {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {m.name}
                </button>
              );
            })}
          </div>
        )}

        {brand === 'other' && (
          <div className="mt-2">
            <input
              type="text"
              value={customModel}
              onChange={(e) => patch({ customModel: e.target.value })}
              placeholder={t('dealsPage.phone_model_placeholder')}
              aria-label={t('dealsPage.phone_model_placeholder')}
              className={controlClass}
            />
          </div>
        )}
      </div>

      {/* 2. Xotira */}
      <div>
        <div className={stepLabel}>
          <span>{t('phone.storage_select')}</span>
          <span className="truncate text-fg-muted">{storage}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {storageOptions.map((st) => {
            const selected = !customStorage && storage === st;
            return (
              <button
                key={st}
                type="button"
                aria-pressed={selected}
                onClick={() => patch({ storage: selected ? '' : st, customStorage: false })}
                className={chip(selected)}
              >
                {st}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customStorage}
            onClick={() => patch({ customStorage: true, storage: customStorage ? storage : '' })}
            className={chip(customStorage)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('phone.other_storage')}
          </button>
        </div>
        {customStorage && (
          <input
            type="text"
            value={storage}
            onChange={(e) => patch({ storage: e.target.value })}
            placeholder={t('dealsPage.phone_storage_placeholder')}
            aria-label={t('phone.other_storage')}
            className={cn(controlClass, 'mt-2')}
          />
        )}
      </div>

      {/* 3. Rang */}
      <div>
        <div className={stepLabel}>
          <span>{t('phone.color_select')}</span>
          <span className="truncate text-fg-muted">{color}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {colorOptions.map((col) => {
            const selected = !customColor && color === col;
            return (
              <button
                key={col}
                type="button"
                aria-pressed={selected}
                onClick={() => patch({ color: selected ? '' : col, customColor: false })}
                className={chip(selected)}
              >
                {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                {col}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customColor}
            onClick={() => patch({ customColor: true, color: customColor ? color : '' })}
            className={chip(customColor)}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('phone.other_color')}
          </button>
        </div>
        {customColor && (
          <input
            type="text"
            value={color}
            onChange={(e) => patch({ color: e.target.value })}
            placeholder={t('dealsPage.phone_color_placeholder')}
            aria-label={t('phone.other_color')}
            className={cn(controlClass, 'mt-2')}
          />
        )}
      </div>

      {/* Yig'ilgan nom */}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5 text-xs">
        <span className="shrink-0 text-fg-muted">{t('dealsPage.phone_summary')}</span>
        <span className={cn('min-w-0 truncate text-right font-semibold', result.productName ? 'text-fg' : 'text-fg-muted')}>
          {result.productName || t('dealsPage.phone_not_selected')}
        </span>
      </div>
    </div>
  );
};
export default PhoneSelector;
