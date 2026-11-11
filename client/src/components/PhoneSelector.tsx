import React, { useState, useEffect } from 'react';
import { PHONE_CATALOG, STANDARD_STORAGES, PhoneModelItem } from '../constants/phoneModels';
import { Smartphone, Check, Sparkles, PlusCircle } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

interface PhoneSelectorProps {
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

export const PhoneSelector: React.FC<PhoneSelectorProps> = ({
  initialValue = '',
  initialColor = '',
  initialStorage = '',
  onChange,
}) => {
  const { t } = useTranslation();

  const [brand, setBrand] = useState<'apple' | 'samsung' | 'other'>('apple');
  const [selectedSeries, setSelectedSeries] = useState<string>('iPhone 16 Series');
  const [selectedModel, setSelectedModel] = useState<PhoneModelItem | null>(
    PHONE_CATALOG[0] || null
  );

  const [customBrandModel, setCustomBrandModel] = useState('');
  const [selectedColor, setSelectedColor] = useState(initialColor || 'Desert Titanium');
  const [customColor, setCustomColor] = useState('');
  const [isCustomColor, setIsCustomColor] = useState(false);

  const [selectedStorage, setSelectedStorage] = useState(initialStorage || '256GB');
  const [customStorage, setCustomStorage] = useState('');
  const [isCustomStorage, setIsCustomStorage] = useState(false);

  // Sync to parent
  useEffect(() => {
    let finalModel = '';
    if (brand === 'other') {
      finalModel = customBrandModel.trim();
    } else if (selectedModel) {
      finalModel = selectedModel.name;
    }

    const finalColor = isCustomColor ? customColor.trim() : selectedColor.trim();
    const finalStorage = isCustomStorage ? customStorage.trim() : selectedStorage.trim();

    const isValid = Boolean(finalModel && finalColor && finalStorage);
    const fullProductName = isValid ? `${finalModel} ${finalStorage} ${finalColor}`.trim() : finalModel;

    onChange({
      productName: fullProductName,
      brand,
      modelName: finalModel,
      color: finalColor,
      storageGb: finalStorage,
      isValid,
    });
  }, [
    brand,
    selectedModel,
    customBrandModel,
    selectedColor,
    customColor,
    isCustomColor,
    selectedStorage,
    customStorage,
    isCustomStorage,
  ]);

  const handleBrandChange = (newBrand: 'apple' | 'samsung' | 'other') => {
    setBrand(newBrand);
    if (newBrand === 'apple') {
      const firstApple = PHONE_CATALOG.find((p) => p.brand === 'apple') || null;
      setSelectedSeries('iPhone 16 Series');
      setSelectedModel(firstApple);
      if (firstApple) {
        setSelectedColor(firstApple.colors[0]);
        setSelectedStorage(firstApple.storages[0]);
      }
    } else if (newBrand === 'samsung') {
      const firstSam = PHONE_CATALOG.find((p) => p.brand === 'samsung') || null;
      setSelectedModel(firstSam);
      if (firstSam) {
        setSelectedColor(firstSam.colors[0]);
        setSelectedStorage(firstSam.storages[0]);
      }
    }
  };

  const handleModelSelect = (item: PhoneModelItem) => {
    setSelectedModel(item);
    if (!item.colors.includes(selectedColor)) {
      setSelectedColor(item.colors[0] || '');
      setIsCustomColor(false);
    }
    if (!item.storages.includes(selectedStorage)) {
      setSelectedStorage(item.storages[0] || '128GB');
      setIsCustomStorage(false);
    }
  };

  const filteredAppleModels = PHONE_CATALOG.filter(
    (p) => p.brand === 'apple' && p.series === selectedSeries
  );

  const samsungModels = PHONE_CATALOG.filter((p) => p.brand === 'samsung');

  return (
    <div className="space-y-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-inner text-xs">
      {/* 1. Brand selection buttons */}
      <div>
        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            {t('phone.brand_select', '1. Brend / Rusumni tanlang')} *
          </span>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">
            ({t('common.required', 'Tanlash majburiy')})
          </span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleBrandChange('apple')}
            className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm ${
              brand === 'apple'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-cyan-500/20 ring-2 ring-cyan-400'
                : 'bg-slate-200/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700'
            }`}
          >
            <span>🍏 Apple iPhone</span>
          </button>
          <button
            type="button"
            onClick={() => handleBrandChange('samsung')}
            className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm ${
              brand === 'samsung'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/20 ring-2 ring-blue-400'
                : 'bg-slate-200/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700'
            }`}
          >
            <span>📱 Samsung Galaxy</span>
          </button>
          <button
            type="button"
            onClick={() => handleBrandChange('other')}
            className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm ${
              brand === 'other'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-500/20 ring-2 ring-emerald-400'
                : 'bg-slate-200/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700'
            }`}
          >
            <span>➕ Boshqalar</span>
          </button>
        </div>
      </div>

      {/* 2. Series / Model selection */}
      {brand === 'apple' && (
        <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800/80">
          {/* Series Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {['iPhone 16 Series', 'iPhone 17 Series', 'iPhone 18 Series'].map((ser) => (
              <button
                key={ser}
                type="button"
                onClick={() => setSelectedSeries(ser)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition ${
                  selectedSeries === ser
                    ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-200/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {ser}
              </button>
            ))}
          </div>

          {/* Model Chips */}
          <div className="flex flex-wrap gap-1.5">
            {filteredAppleModels.map((m) => {
              const isSelected = selectedModel?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleModelSelect(m)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-md shadow-cyan-500/30 ring-2 ring-cyan-300'
                      : 'bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700/80'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  <span>{m.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {brand === 'samsung' && (
        <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800/80">
          <div className="flex flex-wrap gap-1.5">
            {samsungModels.map((m) => {
              const isSelected = selectedModel?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleModelSelect(m)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-300'
                      : 'bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700/80'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  <span>{m.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {brand === 'other' && (
        <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-800/80">
          <label className="block text-slate-600 dark:text-slate-400 text-[11px] font-medium">
            Rusum va model nomini kiriting (masalan: Xiaomi 14 Pro, Honor Magic 6):
          </label>
          <input
            type="text"
            required
            value={customBrandModel}
            onChange={(e) => setCustomBrandModel(e.target.value)}
            placeholder="Model nomini yozing..."
            className="w-full bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
      )}

      {/* 3. Memory / Storage (GB) selection */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80">
        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
          <span>2. Xotira hajmi (GB / TB) *</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {isCustomStorage ? customStorage || 'Kiritilmoqda' : selectedStorage}
          </span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {/* Quick choices based on model or standard */}
          {(selectedModel?.storages || STANDARD_STORAGES).map((st) => {
            const isSelected = !isCustomStorage && selectedStorage === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setSelectedStorage(st);
                  setIsCustomStorage(false);
                }}
                className={`py-1 px-3 rounded-xl font-bold transition text-xs ${
                  isSelected
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow ring-2 ring-indigo-400'
                    : 'bg-slate-200/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700'
                }`}
              >
                {st}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setIsCustomStorage(true)}
            className={`py-1 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              isCustomStorage
                ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700'
            }`}
          >
            <PlusCircle className="w-3 h-3" />
            <span>Boshqa GB</span>
          </button>
        </div>

        {isCustomStorage && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={customStorage}
              onChange={(e) => setCustomStorage(e.target.value)}
              placeholder="Masalan: 64GB yoki 128GB"
              className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* 4. Color selection */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80">
        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
          <span>3. Rangi (Texnika rangi) *</span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {isCustomColor ? customColor || 'Kiritilmoqda' : selectedColor}
          </span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(selectedModel?.colors || ['Black', 'White', 'Silver', 'Gold', 'Blue']).map((col) => {
            const isSelected = !isCustomColor && selectedColor === col;
            return (
              <button
                key={col}
                type="button"
                onClick={() => {
                  setSelectedColor(col);
                  setIsCustomColor(false);
                }}
                className={`py-1 px-3 rounded-xl font-bold transition text-xs flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow ring-2 ring-emerald-300'
                    : 'bg-slate-200/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700'
                }`}
              >
                {isSelected && <Check className="w-3 h-3" />}
                <span>{col}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setIsCustomColor(true)}
            className={`py-1 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              isCustomColor
                ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700'
            }`}
          >
            <PlusCircle className="w-3 h-3" />
            <span>Boshqa rang</span>
          </button>
        </div>

        {isCustomColor && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              placeholder="Masalan: Cosmic Orange, Deep Green..."
              className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* Summary preview badge */}
      <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/40 flex items-center justify-between text-cyan-800 dark:text-cyan-200">
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Shakllangan tovar:</span>
        <span className="font-bold text-xs text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 animate-pulse" />
          {selectedModel?.name || customBrandModel || 'Tanlanmadi'}{' '}
          {isCustomStorage ? customStorage : selectedStorage}{' '}
          {isCustomColor ? customColor : selectedColor}
        </span>
      </div>
    </div>
  );
};
export default PhoneSelector;
