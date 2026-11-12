// Formatlash yordamchilari: pul, foiz, sana.
// MUHIM: barcha sana/vaqt funksiyalari brauzer vaqt zonasidan qat'i nazar
// HAR DOIM Asia/Tashkent (UTC+5) bo'yicha ishlaydi.

export const APP_TIME_ZONE = 'Asia/Tashkent';

export function formatMoney(amount: number | string | null | undefined, currency: string = 'UZS'): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return `0 ${currency}`;
  const num = Math.round(Number(amount));
  const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} ${currency}`;
}

export function formatNumber(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return '0';
  const num = Math.round(Number(amount));
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatPercent(val: number | string | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) return '0.0%';
  const num = Number(val) * 100;
  return `${num.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Sana / vaqt (Asia/Tashkent)
// ---------------------------------------------------------------------------

export type DateInput = string | number | Date | null | undefined;

interface TashkentParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  // "YYYY-MM-DD" (vaqtsiz) — Toshkent kunining o'zi deb olinadi, UTC yarim tuni emas
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+05:00`);
  }
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function tashkentParts(d: Date): TashkentParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === '24' ? '00' : out.hour,
    minute: out.minute,
  };
}

/** "DD.MM.YYYY" — Toshkent kuni bo'yicha. Bo'sh qiymat uchun "-". */
export function formatDate(dateStr: DateInput): string {
  if (dateStr === null || dateStr === undefined || dateStr === '') return '-';
  const d = toDate(dateStr);
  if (!d) return String(dateStr);
  const p = tashkentParts(d);
  return `${p.day}.${p.month}.${p.year}`;
}

/** "DD.MM.YYYY HH:mm" — har doim Asia/Tashkent bo'yicha. Bo'sh qiymat uchun "-". */
export function formatDateTime(dateStr: DateInput): string {
  if (dateStr === null || dateStr === undefined || dateStr === '') return '-';
  const d = toDate(dateStr);
  if (!d) return String(dateStr);
  const p = tashkentParts(d);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

/** "HH:mm" — Toshkent vaqti. */
export function formatTime(dateStr: DateInput): string {
  const d = toDate(dateStr);
  if (!d) return '-';
  const p = tashkentParts(d);
  return `${p.hour}:${p.minute}`;
}

/** Berilgan lahzaning Toshkentdagi kalendar kuni: "YYYY-MM-DD". */
export function toYmdTashkent(date: DateInput = new Date()): string {
  const d = toDate(date) ?? new Date();
  const p = tashkentParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Toshkent bo'yicha bugungi kun: "YYYY-MM-DD". */
export function todayYmd(): string {
  return toYmdTashkent(new Date());
}

/** "YYYY-MM-DD" ga kun qo'shadi/ayiradi (kalendar arifmetikasi, vaqt zonasidan mustaqil). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

export type PeriodMode = 'today' | 'week' | 'month' | 'all' | 'custom';

export interface PeriodRange {
  mode: PeriodMode;
  /** YYYY-MM-DD (Toshkent kuni) yoki bo'sh satr — chegarasiz */
  startDate: string;
  endDate: string;
}

/**
 * Tez filtr oralig'i (Toshkent kuni bo'yicha):
 *  today — bugun;  week — dushanbadan bugungacha;  month — oyning 1-kunidan bugungacha;
 *  all — chegarasiz ('' / '');  custom — bugun (boshlang'ich qiymat sifatida).
 */
export function periodRange(mode: PeriodMode): PeriodRange {
  const today = todayYmd();
  switch (mode) {
    case 'today':
    case 'custom':
      return { mode, startDate: today, endDate: today };
    case 'week': {
      const [y, m, d] = today.split('-').map(Number);
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = yakshanba
      const sinceMonday = (weekday + 6) % 7;
      return { mode, startDate: addDaysYmd(today, -sinceMonday), endDate: today };
    }
    case 'month':
      return { mode, startDate: `${today.slice(0, 8)}01`, endDate: today };
    case 'all':
    default:
      return { mode: 'all', startDate: '', endDate: '' };
  }
}
