// Komissiya qoidasi formasi: ekranda butun foiz (22), serverda ulush (0.22).

export interface RuleFormState {
  name: string;
  /** Faqat shu agentlik cheklariga (bo'sh — hamma agentlik) */
  agencyId: string;
  storeId: string;
  providerId: string;
  ratePct: string; // "Kompaniya ulushi %"
  profitPct: string; // "Bizning foyda %" (bo'sh = kompaniya ulushiga teng)
  validFrom: string; // YYYY-MM-DD
  validTo: string; // YYYY-MM-DD
  priority: string;
  isActive: boolean;
}

export const emptyRuleForm: RuleFormState = {
  name: '',
  agencyId: '',
  storeId: '',
  providerId: '',
  ratePct: '22',
  profitPct: '',
  validFrom: '',
  validTo: '',
  priority: '1',
  isActive: true,
};

/** 0.22 → "22" (suzuvchi nuqta xatosiz) */
export function fractionToPct(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 100 * 10000) / 10000);
}

/** "22" → 0.22; bo'sh qator → null */
export function pctToFraction(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 10000) / 1000000;
}

/** Serverdagi ISO vaqt → Toshkent kuni (YYYY-MM-DD) */
export function isoToTashkentYmd(iso: unknown): string {
  if (!iso) return '';
  const ms = new Date(String(iso)).getTime();
  if (isNaN(ms)) return '';
  return new Date(ms + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function ruleToForm(rule: any): RuleFormState {
  return {
    name: rule.name || '',
    agencyId: rule.agencyId || '',
    storeId: rule.storeId || '',
    providerId: rule.providerId || '',
    ratePct: fractionToPct(rule.ratePercent),
    profitPct: fractionToPct(rule.profitPercent),
    validFrom: isoToTashkentYmd(rule.validFrom),
    validTo: isoToTashkentYmd(rule.validTo),
    priority: String(rule.priority ?? 1),
    isActive: rule.isActive !== false,
  };
}

/** Forma → server body (foizlar ulushga aylantiriladi). Xato bo'lsa `error` qaytadi. */
export function formToRuleBody(f: RuleFormState): { body: any } | { error: 'rate' | 'profit' } {
  const rate = pctToFraction(f.ratePct);
  if (rate === null || Number.isNaN(rate) || rate < 0 || rate > 1) return { error: 'rate' };
  const profit = pctToFraction(f.profitPct);
  if (profit !== null && (Number.isNaN(profit) || profit < 0 || profit > 1)) return { error: 'profit' };
  return {
    body: {
      name: f.name.trim(),
      agencyId: f.agencyId || null,
      storeId: f.storeId || null,
      providerId: f.providerId || null,
      ratePercent: rate,
      profitPercent: profit,
      validFrom: f.validFrom || null,
      validTo: f.validTo || null,
      priority: parseInt(f.priority, 10) || 1,
      isActive: f.isActive,
    },
  };
}
