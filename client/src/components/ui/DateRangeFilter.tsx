import React from 'react';
import { cn } from '../../lib/cn';
import { useTranslation } from '../../context/LanguageContext';
import { periodRange, todayYmd, type PeriodMode, type PeriodRange } from '../../utils/format';
import { SegmentedControl } from './Tabs';
import { controlClass } from './Field';

export type DateRangeValue = PeriodRange;

export interface DateRangeFilterProps {
  /** { mode, startDate, endDate } — sanalar YYYY-MM-DD, Asia/Tashkent kuni bo'yicha; 'all' da ikkalasi '' */
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  /** Ko'rsatiladigan tez tugmalar (standart: today, week, month, all) */
  modes?: Exclude<PeriodMode, 'custom'>[];
  /** Sana oralig'i maydonlarini yashirish */
  hideCustomRange?: boolean;
  className?: string;
}

/** Boshlang'ich qiymat: const [range, setRange] = useState(() => defaultDateRange('month')) */
export function defaultDateRange(mode: PeriodMode = 'today'): DateRangeValue {
  return periodRange(mode);
}

/**
 * Davr filtri: tez tugmalar (Bugun / Hafta / Oy / Hammasi) + sana oralig'i.
 * Sana qo'lda o'zgartirilsa mode = 'custom' bo'ladi.
 *
 *   const [range, setRange] = useState(() => defaultDateRange('today'));
 *   <DateRangeFilter value={range} onChange={setRange} />
 *   // API: params: { startDate: range.startDate || undefined, endDate: range.endDate || undefined }
 */
export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  value,
  onChange,
  modes = ['today', 'week', 'month', 'all'],
  hideCustomRange,
  className,
}) => {
  const { t } = useTranslation();

  const items = modes.map((mode) => ({ value: mode as PeriodMode, label: t(`period.${mode}`) }));

  const setStart = (startDate: string) => {
    // Boshlanish tugashdan keyin bo'lib qolmasin
    const endDate = value.endDate && startDate && startDate > value.endDate ? startDate : value.endDate;
    onChange({ mode: 'custom', startDate, endDate });
  };
  const setEnd = (endDate: string) => {
    const startDate = value.startDate && endDate && endDate < value.startDate ? endDate : value.startDate;
    onChange({ mode: 'custom', startDate, endDate });
  };

  const dateClass = cn(controlClass, 'w-full min-w-0 px-2 tabular-nums sm:w-[9.5rem]');

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center', className)}>
      <SegmentedControl
        ariaLabel={t('period.label')}
        items={items}
        value={value.mode}
        onChange={(mode) => onChange(periodRange(mode))}
        fullWidth
        className="sm:inline-flex sm:w-auto"
      />
      {!hideCustomRange && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label={t('period.from')}
            title={t('period.from')}
            value={value.startDate}
            max={value.endDate || todayYmd()}
            onChange={(e) => setStart(e.target.value)}
            className={dateClass}
          />
          <span className="shrink-0 text-fg-muted" aria-hidden="true">
            —
          </span>
          <input
            type="date"
            aria-label={t('period.to')}
            title={t('period.to')}
            value={value.endDate}
            min={value.startDate || undefined}
            onChange={(e) => setEnd(e.target.value)}
            className={dateClass}
          />
        </div>
      )}
    </div>
  );
};
