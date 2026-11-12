// i18n turlari. Har bir modul fayli (i18n/modules/<modul>.ts) shu shaklda eksport qiladi:
//
//   import { defineModule } from '../types';
//   export default defineModule({
//     uz: { 'deals.title': 'Bitimlar' },
//     ru: { 'deals.title': 'Сделки' },
//     en: { 'deals.title': 'Deals' },
//   });
//
// Qoidalar:
//  - Kalitlar "<modul>.<nom>" ko'rinishida, uch tilda BIR XIL to'plam
//    (tekshiruv, client papkasidan: `node src/i18n/check-keys.mjs`).
//  - O'zgaruvchilar: 'Jami {count} ta'  →  t('x.total', { count: 5 })
//  - LanguageContext'ga tegish shart emas — modullar avtomatik yig'iladi.

export type Language = 'uz' | 'ru' | 'en';

export const LANGUAGES: Language[] = ['uz', 'ru', 'en'];

export type Dict = Record<string, string>;

export type I18nModule = Record<Language, Dict>;

export type TVars = Record<string, string | number | null | undefined>;

/** Modulni tur jihatdan tekshirib qaytaradi (uch til ham majburiy). */
export function defineModule<T extends I18nModule>(mod: T): T {
  return mod;
}
