import React from 'react';

interface ChartTooltipProps {
  active?: boolean;
  payload?: { value?: number | string; name?: string }[];
  label?: string | number;
  /** Sarlavha (masalan sana) formatlovchisi */
  formatLabel?: (label: string | number) => string;
  /** Qiymat formatlovchisi */
  formatValue?: (value: number) => string;
  /** Qiymat nomi (masalan "Hajm") */
  seriesLabel?: string;
}

/** Recharts uchun token ranglaridagi qalqib chiquvchi oyna (dark/light rejimda o'zi moslashadi). */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload, label, formatLabel, formatValue, seriesLabel }) => {
  if (!active || !payload || payload.length === 0) return null;
  const value = Number(payload[0]?.value) || 0;
  return (
    <div className="rounded-control border border-line bg-elevated px-3 py-2 text-xs shadow-pop">
      {label !== undefined && <p className="font-medium text-fg-secondary">{formatLabel ? formatLabel(label) : label}</p>}
      <p className="mt-0.5 font-semibold tabular-nums text-fg">
        {seriesLabel ? `${seriesLabel}: ` : ''}
        {formatValue ? formatValue(value) : value}
      </p>
    </div>
  );
};

/** Grafik ranglari — CSS o'zgaruvchilaridan (index.css tokenlari), ikkala rejimda o'qiladi. */
export const chartColors = {
  primary: 'rgb(var(--accent))',
  secondary: 'rgb(var(--violet, 124 92 255))',
  success: 'rgb(var(--success))',
  warning: 'rgb(var(--warning))',
  danger: 'rgb(var(--danger))',
  info: 'rgb(var(--info))',
  grid: 'rgb(var(--line))',
  tick: 'rgb(var(--fg-muted))',
  cursor: 'rgb(var(--bg-surface-2))',
};
