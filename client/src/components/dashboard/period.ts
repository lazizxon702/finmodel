import type { DateRangeValue } from '../ui';
import { formatDate, todayYmd } from '../../utils/format';

type TFn = (key: string, vars?: Record<string, string | number | null | undefined>) => string;

/** Tanlangan davrning o'qiladigan nomi: "Bugun, 12.11.2026", "01.11.2026 — 12.11.2026", "Butun davr" ... */
export function periodLabel(range: DateRangeValue, t: TFn): string {
  const { startDate, endDate } = range;
  if (!startDate && !endDate) return t('dashboardPage.period_all');
  const today = todayYmd();
  if (startDate && startDate === endDate) {
    return startDate === today ? `${t('period.today')}, ${formatDate(startDate)}` : formatDate(startDate);
  }
  if (startDate && endDate) return t('period.range', { from: formatDate(startDate), to: formatDate(endDate) });
  if (startDate) return t('dashboardPage.period_from', { date: formatDate(startDate) });
  return t('dashboardPage.period_until', { date: formatDate(endDate) });
}

/** API so'rovi uchun parametrlar — bo'sh sana yuborilmaydi (chegarasiz) */
export function rangeParams(range: DateRangeValue): { startDate?: string; endDate?: string } {
  return {
    startDate: range.startDate || undefined,
    endDate: range.endDate || undefined,
  };
}

/** Server xatosidan foydalanuvchiga ko'rsatiladigan matn (server `error` maydoni ustun) */
export function apiErrorMessage(err: any, fallback: string): string {
  const serverMessage = err?.response?.data?.error;
  if (typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage;
  return fallback;
}
