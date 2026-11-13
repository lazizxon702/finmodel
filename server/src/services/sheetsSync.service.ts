import https from 'https';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma';
import {
  DealStatus,
  PaymentStatus,
  TransactionType,
  AccountType,
  ExpenseCategoryType,
  DdsSource,
  TrustEntryType,
} from '@prisma/client';
import {
  AGENCY_ALIASES,
  PROVIDER_ALIASES,
  STORE_ALIASES,
  canonicalAgencyName,
  canonicalProviderName,
  canonicalStoreName,
  isQodirPaymentCategory,
  normalizeDealItems,
  normalizeName,
} from './calculation.service';
import { isTrustIncomeCategory, rebuildAccountBalances, syncStoreDebtForDeal, syncTrustDebtForDeal } from './ledger.service';

export const DEFAULT_SHEETS_URL =
  'https://docs.google.com/spreadsheets/d/1Xas4V79zUAOQGx0ZePPd-VwhhARE3-nsq98rL9vEvUo/edit?usp=sharing';

// ════════════════════════════════════════════════════════════════════
//  SOF YORDAMCHI FUNKSIYALAR (bazaga tegmaydi — tests/sheetsSync.helpers.test.ts da sinalgan)
// ════════════════════════════════════════════════════════════════════

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Vaqt lahzasining Asia/Tashkent (UTC+5) bo'yicha kalendar kuni: "YYYY-MM-DD" */
export function tashkentYmd(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "DD.MM.YYYY" */
export function formatYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ymd || '';
}

export interface SheetDate {
  /** Varaqda yozilgan kalendar kuni (Toshkent kuni): "YYYY-MM-DD" */
  ymd: string;
  /** Bazaga yoziladigan vaqt lahzasi */
  date: Date;
  /** Katakda soat:daqiqa ham bormi */
  hasTime: boolean;
}

function buildSheetDate(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): SheetDate | null {
  if (![y, m, d, hh, mm, ss].every((n) => Number.isInteger(n) && n >= 0)) return null;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
  const wall = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  // 31.02 kabi mavjud bo'lmagan sanalar JS'da keyingi oyga "sirg'alib" ketadi — ularni rad etamiz
  if (wall.getUTCFullYear() !== y || wall.getUTCMonth() !== m - 1 || wall.getUTCDate() !== d) return null;
  const hasTime = hh + mm + ss > 0;
  return {
    ymd: `${y}-${pad2(m)}-${pad2(d)}`,
    // Faqat sana bo'lsa — UTC yarim tun (Toshkentda o'sha kun 05:00; eski importlar bilan bir xil).
    // Vaqt ham bo'lsa — varaqdagi vaqt Toshkent vaqti deb olinadi va UTC lahzasiga o'tkaziladi.
    date: hasTime ? new Date(wall.getTime() - TASHKENT_OFFSET_MS) : wall,
    hasTime,
  };
}

function sheetDateFromWallClock(wall: Date): SheetDate | null {
  if (isNaN(wall.getTime())) return null;
  return buildSheetDate(
    wall.getUTCFullYear(),
    wall.getUTCMonth() + 1,
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
    wall.getUTCSeconds()
  );
}

function sheetDateFromSerial(serial: number): SheetDate | null {
  // Excel/Google Sheets seriya raqami: 1899-12-30 dan boshlab kunlar soni (kasr qismi — kun ichidagi vaqt)
  if (!Number.isFinite(serial) || serial < 1 || serial >= 2958466) return null;
  const seconds = Math.round((serial - 25569) * 86400);
  return sheetDateFromWallClock(new Date(seconds * 1000));
}

/**
 * Varaq katagidagi sanani o'qiydi. Qabul qilinadi:
 *   - Date obyekti (exceljs sanani "devor soati" sifatida UTC komponentlarida beradi);
 *   - Excel seriya raqami (46335 yoki "46335");
 *   - matn: "dd.mm.yyyy", "dd/mm/yyyy", "dd-mm-yyyy" (ixtiyoriy "HH:mm[:ss]"), "yyyy-mm-dd[ HH:mm]".
 * O'qib bo'lmasa — null (HECH QACHON bugungi sana qaytarilmaydi).
 */
export function parseSheetDate(raw: unknown): SheetDate | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return sheetDateFromWallClock(raw);
  if (typeof raw === 'number') return sheetDateFromSerial(raw);
  if (typeof raw !== 'string') return null;

  const s = raw.trim();
  if (!s) return null;

  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?:(?:\s+|T|,\s*)(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return buildSheetDate(year, Number(dmy[2]), Number(dmy[1]), Number(dmy[4] || 0), Number(dmy[5] || 0), Number(dmy[6] || 0));
  }

  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:(?:\s+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (ymd) {
    return buildSheetDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]), Number(ymd[4] || 0), Number(ymd[5] || 0), Number(ymd[6] || 0));
  }

  if (/^\d{4,6}(?:[.,]\d+)?$/.test(s)) return sheetDateFromSerial(Number(s.replace(',', '.')));
  return null;
}

/** Buyruq qatori / API uchun: "09.11.2026" yoki "2026-11-09" → "2026-11-09" (noto'g'ri bo'lsa null) */
export function parseDayArg(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = parseSheetDate(value.trim());
  return parsed && !parsed.hasTime ? parsed.ymd : null;
}

/** Telefon raqamining solishtirish kaliti: faqat raqamlar, oxirgi 9 tasi (998 prefiksi tashlanadi) */
export function phoneKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/** Bir nechta katak/maydondagi telefonlar (bitta katakda vergul bilan bir nechta raqam bo'lishi mumkin) */
export function phoneKeys(...values: unknown[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (v === null || v === undefined) continue;
    for (const part of String(v).split(/[,;/|\\\n]+/)) {
      const k = phoneKey(part);
      if (k) out.add(k);
    }
  }
  return [...out];
}

// Mijoz ismi o'rniga yozib qo'yiladigan "bo'sh" qiymatlar — shaxsni bildirmaydi
const PLACEHOLDER_CUSTOMER_NAMES = new Set(['mijoz', 'klient', 'клиент', 'мижоз', 'nomalum', 'номаълум', 'test', '-', '—', 'yoq', 'net', 'нет']);

/** Mijoz ismining solishtirish kaliti ('' — ism yo'q yoki "Mijoz" kabi umumiy so'z) */
export function customerNameKey(name?: string | null): string {
  const n = normalizeName(name);
  return PLACEHOLDER_CUSTOMER_NAMES.has(n) ? '' : n;
}

// ───── Spravochnik (do'kon / provayder / agentlik) nomlari ─────

export type ReferenceKind = 'store' | 'provider' | 'agency';

const ALIAS_TABLES: Record<ReferenceKind, Record<string, string>> = {
  store: STORE_ALIASES,
  provider: PROVIDER_ALIASES,
  agency: AGENCY_ALIASES,
};
const CANONICAL_FN: Record<ReferenceKind, (name?: string | null) => string> = {
  store: canonicalStoreName,
  provider: canonicalProviderName,
  agency: canonicalAgencyName,
};

/** Ortiqcha bo'shliqlarsiz nom */
export function cleanName(name?: string | null): string {
  return (name || '').replace(/\s+/g, ' ').trim();
}

/** Nom uchun kanonik jadvalda (STORE_ALIASES ...) yozuv bormi */
export function hasCanonicalAlias(kind: ReferenceKind, name?: string | null): boolean {
  return Object.prototype.hasOwnProperty.call(ALIAS_TABLES[kind], normalizeName(name));
}

/** Bazada saqlanadigan yagona nom: jadvalda bo'lsa kanonik nom, bo'lmasa tozalangan asl nom */
export function canonicalReferenceName(kind: ReferenceKind, name?: string | null): string {
  // Jadvalda faqat o'z kalitlari hisobga olinadi ("constructor" kabi nomlar Object xossalariga tushib qolmasin)
  return cleanName(hasCanonicalAlias(kind, name) ? CANONICAL_FN[kind](name) : name);
}

/** Solishtirish kaliti: bir xil kalit = bitta spravochnik yozuvi (katta-kichik harf, bo'shliq, variantlar farqsiz) */
export function referenceKey(kind: ReferenceKind, name?: string | null): string {
  return normalizeName(canonicalReferenceName(kind, name));
}

export interface ReferenceRecord {
  id: string;
  name: string;
  /** Yozuvga bog'langan bitimlar soni (omon qoluvchini tanlash uchun) */
  dealCount?: number;
}

export interface ReferenceGroup<T extends ReferenceRecord> {
  key: string;
  /** Guruhning yagona nomi */
  canonicalName: string;
  /** Omon qoluvchi yozuv */
  survivor: T;
  /** Omon qoluvchiga qo'shilib, o'chiriladigan yozuvlar */
  duplicates: T[];
  /** Omon qoluvchining nomi kanonik nomga o'zgartiriladimi */
  rename: boolean;
}

/**
 * Bir xil kalitli yozuvlarni guruhlaydi va har guruhda omon qoluvchini tanlaydi:
 *   1) nomi kanonik nomga AYNAN teng bo'lgan yozuv;
 *   2) bo'lmasa — bitimi eng ko'p bo'lgani (u kanonik nomga qayta nomlanadi).
 * Kanonik jadvalda yo'q nomlar uchun yagona nom — omon qoluvchining tozalangan nomi.
 */
export function groupReferences<T extends ReferenceRecord>(kind: ReferenceKind, records: T[]): ReferenceGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const r of records) {
    const key = referenceKey(kind, r.name);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  const byDealsDesc = (a: T, b: T) =>
    (b.dealCount || 0) - (a.dealCount || 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

  const groups: ReferenceGroup<T>[] = [];
  for (const [key, members] of buckets) {
    const sorted = [...members].sort(byDealsDesc);
    const aliased = members.find((m) => hasCanonicalAlias(kind, m.name));
    const aliasName = aliased ? canonicalReferenceName(kind, aliased.name) : null;
    const survivor = (aliasName && members.find((m) => m.name === aliasName)) || sorted[0];
    const canonicalName = aliasName || cleanName(survivor.name);
    groups.push({
      key,
      canonicalName,
      survivor,
      duplicates: sorted.filter((m) => m.id !== survivor.id),
      rename: survivor.name !== canonicalName,
    });
  }
  return groups.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

// ───── Bitimning "barmoq izi" (dublikatni ID siz aniqlash) ─────

export interface FingerprintInput {
  /** Toshkent kuni "YYYY-MM-DD" */
  day: string;
  withdrawnLimit: number | string | null | undefined;
  storeName?: string | null;
  phones?: unknown[];
  customerName?: string | null;
  /** Mijozga to'lov (Расчетное сумма) */
  calculatedAmount?: number | string | null;
  providerName?: string | null;
  agencyName?: string | null;
}

export interface DealFingerprint {
  day: string;
  limit: number;
  storeKey: string;
  phones: string[];
  nameKey: string;
  // Mijoz ma'lumoti (telefon/ism) umuman bo'lmaganda ishlatiladigan qo'shimcha belgilar
  amount: number;
  providerKey: string;
  agencyKey: string;
}

export function buildFingerprint(input: FingerprintInput): DealFingerprint {
  return {
    day: input.day,
    limit: Math.round(Number(input.withdrawnLimit) || 0),
    storeKey: referenceKey('store', input.storeName),
    phones: phoneKeys(...(input.phones || [])),
    nameKey: customerNameKey(input.customerName),
    amount: Math.round(Number(input.calculatedAmount) || 0),
    providerKey: referenceKey('provider', input.providerName),
    agencyKey: referenceKey('agency', input.agencyName),
  };
}

/** Asosiy kalit: bir xil Toshkent kuni + yechilgan limit + do'kon (kanonik) */
export function fingerprintBaseKey(fp: DealFingerprint): string {
  return `${fp.day}|${fp.limit}|${fp.storeKey}`;
}

/**
 *   'phone' — telefon raqami mos;  'name' — mijoz ismi mos;
 *   'weak'  — kamida bir tomonda mijoz ma'lumoti yo'q, lekin mijozga to'lov + provayder + agentlik ham bir xil.
 */
export type FingerprintMatch = 'phone' | 'name' | 'weak';

export function hasCustomerIdentity(fp: DealFingerprint): boolean {
  return fp.phones.length > 0 || !!fp.nameKey;
}

/**
 * Ikki bitim bitta bitimmi? Asosiy shart: kun + yechilgan limit + do'kon bir xil. So'ng:
 *   - telefon (raqamlari) YOKI mijoz ismi (normallashtirilgan) mos kelsa — ha;
 *   - ikkalasida ham mijoz ma'lumoti bor, lekin mos emas — yo'q (boshqa mijoz);
 *   - kamida birida mijoz ma'lumoti yo'q (varaqda ism/telefon to'ldirilmagan) —
 *     mijozga to'lov, provayder va agentlik ham bir xil bo'lsagina "kuchsiz" moslik.
 */
export function matchFingerprint(a: DealFingerprint, b: DealFingerprint): FingerprintMatch | null {
  if (!a.day || fingerprintBaseKey(a) !== fingerprintBaseKey(b)) return null;
  if (a.phones.some((p) => b.phones.includes(p))) return 'phone';
  if (a.nameKey && a.nameKey === b.nameKey) return 'name';
  if (hasCustomerIdentity(a) && hasCustomerIdentity(b)) return null;
  if (a.amount === b.amount && a.providerKey === b.providerKey && a.agencyKey === b.agencyKey) return 'weak';
  return null;
}

// ════════════════════════════════════════════════════════════════════
//  FAYLNI YUKLASH VA KATAKLARNI O'QISH
// ════════════════════════════════════════════════════════════════════

export function extractSheetId(url: string): string | null {
  const match = (url || '').match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/** Google Sheets hujjatini yuklab bo'lmaganda tashlanadigan xato (matni foydalanuvchiga ko'rsatishga tayyor) */
export class SheetsDownloadError extends Error {
  code: 'NETWORK' | 'FORBIDDEN' | 'NOT_FOUND' | 'HTTP' | 'NOT_XLSX';
  constructor(code: SheetsDownloadError['code'], message: string) {
    super(message);
    this.name = 'SheetsDownloadError';
    this.code = code;
  }
}

const ACCESS_HINT =
  'Hujjat "Havolasi bor har kim — ko\'rishi mumkin" qilib ochilganini tekshiring (Google Sheets → Ulashish).';

function downloadFile(url: string, destPath: string, redirectsLeft = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode || 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        if (/accounts\.google\.com|ServiceLogin/i.test(next)) {
          return reject(new SheetsDownloadError('FORBIDDEN', `Google Sheets hujjatiga ruxsat yo'q (Google kirish sahifasiga yo'naltirdi). ${ACCESS_HINT}`));
        }
        if (redirectsLeft <= 0) {
          return reject(new SheetsDownloadError('HTTP', "Google Sheets yuklab olishda xatolik: juda ko'p yo'naltirish (redirect)"));
        }
        return downloadFile(next, destPath, redirectsLeft - 1).then(resolve).catch(reject);
      }

      if (status !== 200) {
        res.resume();
        if (status === 401 || status === 403) {
          return reject(new SheetsDownloadError('FORBIDDEN', `Google Sheets hujjatiga ruxsat yo'q (HTTP ${status}). ${ACCESS_HINT}`));
        }
        if (status === 404 || status === 410) {
          return reject(new SheetsDownloadError('NOT_FOUND', `Google Sheets hujjati topilmadi (HTTP ${status}) — havola/ID to'g'riligini tekshiring.`));
        }
        return reject(new SheetsDownloadError('HTTP', `Google Sheets yuklab olishda xatolik: HTTP status ${status}`));
      }

      if (/text\/html/i.test(String(res.headers['content-type'] || ''))) {
        res.resume();
        return reject(new SheetsDownloadError('FORBIDDEN', `Google Sheets XLSX o'rniga HTML sahifa qaytardi — hujjat ochiq emas. ${ACCESS_HINT}`));
      }

      const file = fs.createWriteStream(destPath);
      const fail = (err: Error) => {
        file.destroy();
        fs.rm(destPath, { force: true }, () => reject(err));
      };
      res.on('error', (e) => fail(new SheetsDownloadError('NETWORK', `Google Sheets yuklab olish uzilib qoldi: ${e.message}`)));
      file.on('error', (e) => fail(new Error(`Vaqtinchalik faylga yozib bo'lmadi (${destPath}): ${e.message}`)));
      res.pipe(file);
      file.on('finish', () =>
        file.close(() => {
          // XLSX — ZIP arxiv, "PK" bilan boshlanadi
          let ok = false;
          try {
            const fd = fs.openSync(destPath, 'r');
            const head = Buffer.alloc(2);
            fs.readSync(fd, head, 0, 2, 0);
            fs.closeSync(fd);
            ok = head.toString('latin1') === 'PK';
          } catch (e) {
            ok = false;
          }
          if (ok) return resolve();
          fs.rm(destPath, { force: true }, () =>
            reject(new SheetsDownloadError('NOT_XLSX', `Google Sheets'dan kelgan fayl XLSX emas (hujjat ochiq bo'lmasligi mumkin). ${ACCESS_HINT}`))
          );
        })
      );
    });

    req.setTimeout(60_000, () => req.destroy(new Error('60 soniya ichida javob kelmadi')));
    req.on('error', (e: NodeJS.ErrnoException) =>
      reject(
        e instanceof SheetsDownloadError
          ? e
          : new SheetsDownloadError('NETWORK', `Google Sheets'ga ulanib bo'lmadi (tarmoq xatosi${e.code ? ' ' + e.code : ''}): ${e.message}`)
      )
    );
  });
}

function extractVal(cell: ExcelJS.Cell | undefined): any {
  if (!cell) return null;
  const val = cell.value;
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'object') {
    const anyVal = val as any;
    // Formula katagi: faqat hisoblangan natija olinadi (natija keshlanmagan yoki #REF! bo'lsa — bo'sh)
    if ('formula' in anyVal || 'sharedFormula' in anyVal || 'result' in anyVal) {
      const result = anyVal.result;
      if (result === null || result === undefined) return null;
      if (result instanceof Date) return result;
      return typeof result === 'object' ? null : result;
    }
    if (Array.isArray(anyVal.richText)) return anyVal.richText.map((t: any) => t?.text || '').join('');
    if (anyVal.text !== undefined && anyVal.text !== null) {
      if (typeof anyVal.text === 'object') {
        return Array.isArray(anyVal.text.richText) ? anyVal.text.richText.map((t: any) => t?.text || '').join('') : null;
      }
      return anyVal.text;
    }
    return null;
  }
  return val;
}

function extractNum(cell: ExcelJS.Cell | undefined): number {
  const v = extractVal(cell);
  if (v === null || v === undefined || v instanceof Date) return 0;
  const n = typeof v === 'string' ? Number(v.replace(/[\s ]/g, '')) : Number(v);
  return isNaN(n) ? 0 : n;
}

function extractStr(cell: ExcelJS.Cell | undefined): string | null {
  const v = extractVal(cell);
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export interface SheetFileSource {
  /** download — hozir yuklab olindi; local — chaqiruvchi bergan fayl; cache — yuklab bo'lmagani uchun eski lokal nusxa */
  kind: 'download' | 'local' | 'cache';
  path: string;
  /** Faylning oxirgi o'zgargan vaqti (ISO) */
  modifiedAt: string | null;
  url: string | null;
}

const CACHE_FILE_NAMES = ['temp_live_download.xlsx', 'temp_sheets_inspect.xlsx'];

/** Yuklab bo'lmaganda ishlatilishi mumkin bo'lgan eng yangi lokal nusxa (bo'lmasa null) */
export function findSheetsCacheFile(): { path: string; modifiedAt: Date } | null {
  let best: { path: string; modifiedAt: Date } | null = null;
  for (const name of CACHE_FILE_NAMES) {
    const p = path.join(__dirname, '../../', name);
    try {
      const st = fs.statSync(p);
      if (st.isFile() && (!best || st.mtime > best.modifiedAt)) best = { path: p, modifiedAt: st.mtime };
    } catch (e) {
      // fayl yo'q
    }
  }
  return best;
}

async function resolveWorkbookFile(opts: {
  customUrl?: string;
  localFilePath?: string;
  allowCacheFallback: boolean;
  label: string;
  warnings: string[];
}): Promise<{ source: SheetFileSource; cleanup: () => void }> {
  const mtime = (p: string) => {
    try {
      return fs.statSync(p).mtime.toISOString();
    } catch (e) {
      return null;
    }
  };

  if (opts.localFilePath) {
    if (fs.existsSync(opts.localFilePath)) {
      return {
        source: { kind: 'local', path: opts.localFilePath, modifiedAt: mtime(opts.localFilePath), url: null },
        cleanup: () => undefined,
      };
    }
    opts.warnings.push(`Berilgan lokal fayl topilmadi (${opts.localFilePath}) — Google Sheets'dan yuklab olinadi.`);
  }

  const sheetUrl = opts.customUrl || DEFAULT_SHEETS_URL;
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) throw new Error("Noto'g'ri Google Sheets havolasi");

  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  const tempPath = path.join(os.tmpdir(), `finmodel_sheets_${opts.label}_${Date.now()}_${process.pid}.xlsx`);

  try {
    console.log(`Google Sheets XLSX yuklab olinmoqda: ${exportUrl}`);
    await downloadFile(exportUrl, tempPath);
    return {
      source: { kind: 'download', path: tempPath, modifiedAt: new Date().toISOString(), url: exportUrl },
      cleanup: () => {
        try {
          fs.rmSync(tempPath, { force: true });
        } catch (e) {
          // vaqtinchalik faylni o'chirib bo'lmadi — muhim emas
        }
      },
    };
  } catch (dlErr: any) {
    const cache = opts.allowCacheFallback ? findSheetsCacheFile() : null;
    if (!cache) throw dlErr;
    const warning =
      `DIQQAT: Google Sheets yuklab olinmadi (${dlErr.message}). ESKI lokal nusxa ishlatildi: ${cache.path} ` +
      `(fayl sanasi: ${cache.modifiedAt.toISOString()}) — ma'lumot eskirgan bo'lishi mumkin.`;
    console.warn(warning);
    opts.warnings.push(warning);
    return {
      source: { kind: 'cache', path: cache.path, modifiedAt: cache.modifiedAt.toISOString(), url: exportUrl },
      cleanup: () => undefined, // kesh fayli o'chirilmaydi
    };
  }
}

// ════════════════════════════════════════════════════════════════════
//  BITIMLARNI IMPORT QILISH
// ════════════════════════════════════════════════════════════════════

export interface SyncDealsOptions {
  /** Faqat shu Toshkent kunidagi qatorlar: "YYYY-MM-DD" (yoki "DD.MM.YYYY") */
  onlyDate?: string;
  /** true — bazada bor bitimlar HECH QACHON yangilanmaydi, faqat yo'qlari qo'shiladi */
  onlyMissing?: boolean;
  /** true — bazaga hech narsa yozilmaydi (spravochnik yozuvlari ham yaratilmaydi) */
  dryRun?: boolean;
  /** Yuklab bo'lmaganda eski lokal nusxaga o'tishga ruxsat (standart: true — avvalgi xulq) */
  allowCacheFallback?: boolean;
}

export type SheetSkipCode =
  | 'EXISTS_ID' // bazada shu dealNumber bor
  | 'EXISTS_FINGERPRINT' // bazada barmoq izi bo'yicha bor
  | 'DATE_MISMATCH' // onlyDate ga mos emas
  | 'DATE_UNREADABLE' // sana o'qilmadi
  | 'EMPTY_ROW' // № bor, lekin ma'lumot yo'q
  | 'SHEET_DUPLICATE' // varaq ichida takror qator
  | 'ID_CONFLICT'; // 8000+№ raqami bazada boshqa bitimga tegishli

export interface SheetRowSummary {
  /** Varaqdagi qator raqami (1 dan) */
  rowNumber: number;
  /** "№" ustunidagi tartib raqami */
  seq: number;
  dealNumber: number;
  /** Varaqdagi ID (bo'sh yoki takror bo'lsa null — dealNumber = 8000 + №) */
  sheetId: number | null;
  /** "YYYY-MM-DD" (o'qilmagan bo'lsa null) */
  date: string | null;
  customerName: string | null;
  customerPhone: string | null;
  storeName: string;
  providerName: string;
  agencyName: string | null;
  agentName: string | null;
  withdrawnLimit: number;
  /** Mijozga to'lov (Расчетное сумма) */
  calculatedAmount: number;
  productName: string | null;
  /** Diqqat talab qiladigan holatlar (masalan, varaqda juda o'xshash qator bor) */
  notes: string[];
}

export interface SheetSkippedRow extends SheetRowSummary {
  code: SheetSkipCode;
  reason: string;
  /** Mos kelgan bazadagi bitim raqami (bo'lsa) */
  matchedDealNumber: number | null;
}

interface ParsedDealRow {
  rowNumber: number;
  seq: number;
  sheetId: number | null;
  dealNumber: number;
  /** ID bo'sh yoki varaqda takror — raqam "8000 + №" sxemasidan olingan */
  synthetic: boolean;
  rawDate: unknown;
  dateInfo: SheetDate | null;
  isEmpty: boolean;
  fp: DealFingerprint | null;
  duplicateOf: ParsedDealRow | null;
  duplicateKind: FingerprintMatch | null;
  notes: string[];
  data: {
    sellerName: string;
    providerName: string;
    isDaftar: boolean;
    customerName: string | null;
    customerPhone1: string | null;
    customerPhone2: string | null;
    contractUrl: string | null;
    passportPhotoUrl: string | null;
    storeName: string;
    customerLimit: number;
    withdrawnLimit: number;
    agentAmount: number;
    totalPurchaseCost: number;
    purchaseDiscountPct: number;
    agentPct: number;
    calculatedAmount: number;
    remainingLimit: number;
    differenceAmount: number;
    productName: string | null;
    quantity: number;
    isActualDeviceSale: boolean;
    imeiBarcode: string | null;
    status: DealStatus;
    agencyName: string | null;
    agentName: string | null;
    extraDaftar: number;
    qodirDebt: number;
    qodirBalance: number;
    greenBazarBalance: number;
    trustBalance: number;
    totalExtraBalance: number;
    buyerName: string | null;
    salePrice: number;
    paidTransfer: number;
    paidCashUzs: number;
    paidCashUsd: number;
    paidBank: number;
    exchangeRate: number;
    profit: number;
    marginPct: number;
    receivedFromBuyer: number;
    debtRemainder: number;
    paymentStatus: PaymentStatus;
    note: string | null;
  };
}

const DEFAULT_STORE_NAME = "Asosiy do'kon";
const DEFAULT_PROVIDER_NAME = 'Boshqa';

function parseDealRow(row: ExcelJS.Row, rowNumber: number): Omit<ParsedDealRow, 'dealNumber' | 'synthetic' | 'fp' | 'duplicateOf' | 'duplicateKind' | 'notes'> | null {
  const seq = Math.round(extractNum(row.getCell(3)));
  const rawId = Math.round(extractNum(row.getCell(4)));
  const sheetId = rawId > 0 ? rawId : null;
  if (!sheetId && !(seq > 0)) return null;

  const rawDate = extractVal(row.getCell(5));
  const dateInfo = parseSheetDate(rawDate);

  const rawProvider = extractStr(row.getCell(7));
  const rawStore = extractStr(row.getCell(14));
  const isDaftarStr = (extractStr(row.getCell(8)) || '').toLowerCase();
  const isDaftar = isDaftarStr === 'да' || isDaftarStr === 'yes' || isDaftarStr === 'ha' || isDaftarStr === 'true';

  const customerName = extractStr(row.getCell(9));
  const customerLimit = extractNum(row.getCell(15));
  const withdrawnLimit = extractNum(row.getCell(16));
  const calculatedAmount = extractNum(row.getCell(21));
  const productName = extractStr(row.getCell(24));
  const isActualStr = (extractStr(row.getCell(26)) || '').toLowerCase();

  const rawStatus = (extractStr(row.getCell(28)) || '').toLowerCase();
  let status: DealStatus = DealStatus.NEED_TO_BUY;
  if (rawStatus.includes('склад') || rawStatus.includes('omborda')) status = DealStatus.IN_WAREHOUSE;
  else if (rawStatus.includes('продан') || rawStatus.includes('sotildi')) status = DealStatus.SOLD;
  else if (rawStatus.includes('пут') || rawStatus.includes("yo'lda")) status = DealStatus.IN_TRANSIT;
  else if (rawStatus.includes('ожида') || rawStatus.includes('kutilmoqda')) status = DealStatus.PENDING;
  else if (rawStatus.includes('поступ') || rawStatus.includes('pul tushdi')) status = DealStatus.MONEY_RECEIVED;
  else if (rawStatus.includes('не все') || rawStatus.includes('неполн') || rawStatus.includes("to'liq emas"))
    status = DealStatus.PARTIAL_AMOUNT;

  const rawPStatus = (extractStr(row.getCell(56)) || '').toLowerCase();
  let paymentStatus: PaymentStatus = PaymentStatus.PARTIAL;
  if (rawPStatus.includes('оплач') || rawPStatus.includes("to'langan")) paymentStatus = PaymentStatus.PAID;
  else if (rawPStatus.includes('долг') || rawPStatus.includes('qarz')) paymentStatus = PaymentStatus.DEBT;

  // № bor, lekin bitim ma'lumoti umuman yo'q qator (masalan, oldindan raqamlangan bo'sh qator)
  const isEmpty =
    (rawDate === null || rawDate === undefined || rawDate === '') &&
    !rawProvider &&
    !rawStore &&
    !customerName &&
    !productName &&
    customerLimit === 0 &&
    withdrawnLimit === 0 &&
    calculatedAmount === 0;

  return {
    rowNumber,
    seq: seq > 0 ? seq : 0,
    sheetId,
    rawDate,
    dateInfo,
    isEmpty,
    data: {
      sellerName: extractStr(row.getCell(6)) || 'Operator',
      providerName: rawProvider || DEFAULT_PROVIDER_NAME,
      isDaftar,
      customerName,
      customerPhone1: extractStr(row.getCell(10)),
      customerPhone2: extractStr(row.getCell(11)),
      contractUrl: extractStr(row.getCell(12)),
      passportPhotoUrl: extractStr(row.getCell(13)),
      storeName: rawStore || DEFAULT_STORE_NAME,
      customerLimit,
      withdrawnLimit,
      agentAmount: extractNum(row.getCell(17)),
      totalPurchaseCost: extractNum(row.getCell(18)),
      purchaseDiscountPct: extractNum(row.getCell(19)),
      agentPct: extractNum(row.getCell(20)),
      calculatedAmount,
      remainingLimit: extractNum(row.getCell(22)),
      differenceAmount: extractNum(row.getCell(23)),
      productName,
      quantity: Math.max(1, Math.round(extractNum(row.getCell(25))) || 1),
      isActualDeviceSale: isActualStr === 'да' || isActualStr === 'yes' || isActualStr === 'true',
      imeiBarcode: extractStr(row.getCell(27)),
      status,
      agencyName: extractStr(row.getCell(29)),
      agentName: extractStr(row.getCell(30)),
      extraDaftar: extractNum(row.getCell(31)),
      qodirDebt: extractNum(row.getCell(32)),
      qodirBalance: extractNum(row.getCell(34)),
      greenBazarBalance: extractNum(row.getCell(35)),
      trustBalance: extractNum(row.getCell(36)),
      totalExtraBalance: extractNum(row.getCell(37)),
      buyerName: extractStr(row.getCell(38)),
      salePrice: extractNum(row.getCell(41)),
      paidTransfer: extractNum(row.getCell(42)),
      paidCashUzs: extractNum(row.getCell(43)),
      paidCashUsd: extractNum(row.getCell(44)),
      paidBank: extractNum(row.getCell(45)),
      exchangeRate: extractNum(row.getCell(46)) || 1,
      profit: extractNum(row.getCell(47)),
      marginPct: extractNum(row.getCell(48)),
      receivedFromBuyer: extractNum(row.getCell(49)),
      debtRemainder: extractNum(row.getCell(50)),
      paymentStatus,
      note: extractStr(row.getCell(57)),
    },
  };
}

function summarizeRow(row: ParsedDealRow): SheetRowSummary {
  const d = row.data;
  return {
    rowNumber: row.rowNumber,
    seq: row.seq,
    dealNumber: row.dealNumber,
    sheetId: row.synthetic ? null : row.sheetId,
    date: row.dateInfo?.ymd || null,
    customerName: d.customerName,
    customerPhone: [d.customerPhone1, d.customerPhone2].filter(Boolean).join(', ') || null,
    storeName: canonicalReferenceName('store', d.storeName),
    providerName: canonicalReferenceName('provider', d.providerName),
    agencyName: d.agencyName ? canonicalReferenceName('agency', d.agencyName) : null,
    agentName: d.agentName ? cleanName(d.agentName) : null,
    withdrawnLimit: d.withdrawnLimit,
    calculatedAmount: d.calculatedAmount,
    productName: d.productName,
    notes: [...row.notes],
  };
}

const fmtSum = (n: number) => Math.round(Number(n) || 0).toLocaleString('ru-RU');

interface DbDealLite {
  id: string;
  dealNumber: number;
  createdById: string | null;
  fp: DealFingerprint;
}

/** Spravochnik indeksi: kalit → omon qoluvchi yozuv (dublikatlar birlashtirilmagan bazada ham to'g'ri ishlaydi) */
function buildReferenceIndex<T extends ReferenceRecord>(kind: ReferenceKind, records: T[]) {
  const index = new Map<string, { id: string; name: string; memberIds: string[] }>();
  for (const g of groupReferences(kind, records)) {
    index.set(g.key, { id: g.survivor.id, name: g.survivor.name, memberIds: [g.survivor.id, ...g.duplicates.map((d) => d.id)] });
  }
  return index;
}

export async function syncDealsFromGoogleSheets(customUrl?: string, localFilePath?: string, options: SyncDealsOptions = {}) {
  const dryRun = options.dryRun === true;
  const onlyMissing = options.onlyMissing === true;
  const allowCacheFallback = options.allowCacheFallback !== false;
  const warnings: string[] = [];

  let onlyDate: string | null = null;
  if (options.onlyDate !== undefined && options.onlyDate !== null && String(options.onlyDate).trim() !== '') {
    onlyDate = parseDayArg(String(options.onlyDate));
    if (!onlyDate) throw new Error(`onlyDate noto'g'ri: "${options.onlyDate}" (kutilgan format: YYYY-MM-DD yoki DD.MM.YYYY)`);
  }

  const { source, cleanup } = await resolveWorkbookFile({ customUrl, localFilePath, allowCacheFallback, label: 'deals', warnings });

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(source.path);

    // "Сделки_и_Склад" varag'i (aniq nom bo'lmasa — nomida "сделк"/"склад" bor birinchi varaq)
    let ws = wb.getWorksheet('Сделки_и_Склад');
    if (!ws) {
      ws = wb.worksheets.find((w) => w.name.toLowerCase().includes('сделк') || w.name.toLowerCase().includes('склад'));
    }
    if (!ws) {
      throw new Error('Google Sheets ichida "Сделки_и_Склад" varag\'i topilmadi');
    }

    console.log(`Topilgan varaq: ${ws.name}, qatorlar soni: ${ws.rowCount}`);

    const skipped: SheetSkippedRow[] = [];
    const skip = (row: ParsedDealRow, code: SheetSkipCode, reason: string, matchedDealNumber: number | null = null) => {
      skipped.push({ ...summarizeRow(row), code, reason, matchedDealNumber });
    };

    // ── 1. Qatorlarni o'qish, raqam berish, varaq ichidagi takrorlarni belgilash ──
    const rows: ParsedDealRow[] = [];
    const seenDealNumbers = new Set<number>();
    const sheetFpIndex = new Map<string, ParsedDealRow[]>();

    for (let r = 3; r <= ws.rowCount; r++) {
      const base = parseDealRow(ws.getRow(r), r);
      if (!base) continue;

      // ID bo'sh yoki varaqda takror bo'lsa — "8000 + №" (eski sxema, mavjud bitimlar raqami o'zgarmasligi uchun saqlangan)
      let dealNumber = base.sheetId || 0;
      let synthetic = false;
      if (!dealNumber || seenDealNumbers.has(dealNumber)) {
        dealNumber = base.seq > 0 ? 8000 + base.seq : 0;
        synthetic = true;
      }

      const row: ParsedDealRow = { ...base, dealNumber, synthetic, fp: null, duplicateOf: null, duplicateKind: null, notes: [] };

      if (row.isEmpty) {
        skip(row, 'EMPTY_ROW', "bo'sh qator (№ bor, bitim ma'lumoti yo'q)");
        continue;
      }
      if (!dealNumber || seenDealNumbers.has(dealNumber)) {
        skip(row, 'SHEET_DUPLICATE', `varaqda ID takror va "№" bo'sh/takror — raqam berib bo'lmadi (ID: ${base.sheetId ?? "yo'q"}, №: ${base.seq || "yo'q"})`);
        continue;
      }
      seenDealNumbers.add(dealNumber);

      if (row.dateInfo) {
        row.fp = buildFingerprint({
          day: row.dateInfo.ymd,
          withdrawnLimit: row.data.withdrawnLimit,
          storeName: row.data.storeName,
          phones: [row.data.customerPhone1, row.data.customerPhone2],
          customerName: row.data.customerName,
          calculatedAmount: row.data.calculatedAmount,
          providerName: row.data.providerName,
          agencyName: row.data.agencyName,
        });
        const baseKey = fingerprintBaseKey(row.fp);
        const candidates = sheetFpIndex.get(baseKey) || [];
        for (const prev of candidates) {
          const kind = matchFingerprint(row.fp, prev.fp!);
          if (!kind) continue;
          // Telefon/ism mos — aniq takror. Mijoz ma'lumotisiz ("kuchsiz") moslikda faqat ID ham bir xil yozilgan bo'lsa takror deymiz,
          // aks holda bu bir kunda bir xil summali ikki alohida bitim bo'lishi mumkin — ikkalasi ham olinadi, lekin belgilab qo'yiladi.
          if (kind !== 'weak' || (row.sheetId !== null && row.sheetId === prev.sheetId)) {
            row.duplicateOf = prev;
            row.duplicateKind = kind;
          } else {
            row.notes.push(`varaqda juda o'xshash qator bor: ${prev.rowNumber}-qator (№${prev.seq}, bitim #${prev.dealNumber})`);
          }
          break;
        }
        if (!row.duplicateOf) {
          candidates.push(row);
          sheetFpIndex.set(baseKey, candidates);
        }
      }
      rows.push(row);
    }

    // ── 2. Bazadagi bitimlar va spravochniklar ──
    const [dbDealsRaw, existingStores, existingProviders, existingAgencies, existingAgents, existingBuyers] = await Promise.all([
      prisma.deal.findMany({
        select: {
          id: true,
          dealNumber: true,
          date: true,
          createdById: true,
          withdrawnLimit: true,
          calculatedAmount: true,
          customerName: true,
          customerPhone1: true,
          customerPhone2: true,
          store: { select: { name: true } },
          provider: { select: { name: true } },
          agency: { select: { name: true } },
        },
      }),
      prisma.store.findMany({ select: { id: true, name: true, _count: { select: { deals: true } } } }),
      prisma.provider.findMany({ select: { id: true, name: true, _count: { select: { deals: true } } } }),
      prisma.agency.findMany({ select: { id: true, name: true, _count: { select: { deals: true } } } }),
      prisma.agent.findMany({ select: { id: true, name: true, agencyId: true, _count: { select: { deals: true } } } }),
      prisma.buyer.findMany({ select: { id: true, name: true } }),
    ]);

    const dbDeals: DbDealLite[] = dbDealsRaw.map((d) => ({
      id: d.id,
      dealNumber: d.dealNumber,
      createdById: d.createdById,
      fp: buildFingerprint({
        day: tashkentYmd(d.date),
        withdrawnLimit: Number(d.withdrawnLimit),
        storeName: d.store?.name,
        phones: [d.customerPhone1, d.customerPhone2],
        customerName: d.customerName,
        calculatedAmount: Number(d.calculatedAmount),
        providerName: d.provider?.name,
        agencyName: d.agency?.name,
      }),
    }));
    const dbByNumber = new Map<number, DbDealLite>(dbDeals.map((d) => [d.dealNumber, d]));

    const withCount = <T extends { _count: { deals: number } }>(list: T[]) => list.map((x) => ({ ...x, dealCount: x._count.deals }));
    const storeIndex = buildReferenceIndex('store', withCount(existingStores));
    const providerIndex = buildReferenceIndex('provider', withCount(existingProviders));
    const agencyIndex = buildReferenceIndex('agency', withCount(existingAgencies));
    const buyerMap = new Map<string, string>(existingBuyers.map((b) => [normalizeName(b.name), b.id]));

    // Agentlar: (agentlik guruhi + normallashtirilgan ism) → agent. Dublikat agentliklar hali birlashtirilmagan bo'lsa ham
    // "Асадбек"/"Asadbek" ostidagi agentlar bitta guruh sifatida qidiriladi — yangi dublikat agent yaratilmaydi.
    const agencyKeyById = new Map<string, string>();
    for (const [key, entry] of agencyIndex) for (const id of entry.memberIds) agencyKeyById.set(id, key);
    const agentIndex = new Map<string, { id: string; inSurvivor: boolean; deals: number }>();
    for (const a of existingAgents) {
      const agencyKey = agencyKeyById.get(a.agencyId);
      if (!agencyKey) continue;
      const k = `${agencyKey}::${normalizeName(a.name)}`;
      const cand = { id: a.id, inSurvivor: agencyIndex.get(agencyKey)!.id === a.agencyId, deals: a._count.deals };
      const cur = agentIndex.get(k);
      if (!cur || (cand.inSurvivor && !cur.inSurvivor) || (cand.inSurvivor === cur.inSurvivor && cand.deals > cur.deals)) {
        agentIndex.set(k, cand);
      }
    }

    // ── 3. Varaq qatorlarini bazadagi bitimlarga RAQAM bo'yicha bog'lash ──
    const existingByRow = new Map<ParsedDealRow, DbDealLite>();
    const conflictByRow = new Map<ParsedDealRow, DbDealLite>();
    const claimedDealIds = new Set<string>();
    for (const row of rows) {
      const db = dbByNumber.get(row.dealNumber);
      if (!db) continue;
      const sameBase = row.fp ? fingerprintBaseKey(row.fp) === fingerprintBaseKey(db.fp) : true;
      if (row.synthetic && !sameBase) {
        // "8000 + №" raqami tasodifan boshqa bitimga to'g'ri kelib qolgan (qatorlar surilgan yoki ilovada shu raqam berilgan)
        conflictByRow.set(row, db);
        continue;
      }
      if (!sameBase && row.fp) {
        const diffs: string[] = [];
        if (row.fp.day !== db.fp.day) diffs.push(`sana ${formatYmd(row.fp.day)} ≠ bazada ${formatYmd(db.fp.day)}`);
        if (row.fp.limit !== db.fp.limit) diffs.push(`yechilgan limit ${fmtSum(row.fp.limit)} ≠ bazada ${fmtSum(db.fp.limit)}`);
        if (row.fp.storeKey !== db.fp.storeKey) diffs.push(`do'kon "${row.fp.storeKey}" ≠ bazada "${db.fp.storeKey}"`);
        row.notes.push(`DIQQAT: bazadagi #${db.dealNumber} bilan farq bor — ${diffs.join('; ')}`);
      }
      existingByRow.set(row, db);
      claimedDealIds.add(db.id);
    }

    // Varaqdagi hech bir qatorga raqam bo'yicha bog'lanmagan bitimlar — barmoq izi bilan solishtiriladi (har biri faqat bir marta)
    const unclaimedIndex = new Map<string, DbDealLite[]>();
    for (const d of dbDeals) {
      if (claimedDealIds.has(d.id) || !d.fp.day) continue;
      const k = fingerprintBaseKey(d.fp);
      if (!unclaimedIndex.has(k)) unclaimedIndex.set(k, []);
      unclaimedIndex.get(k)!.push(d);
    }
    const takeFingerprintMatch = (fp: DealFingerprint): { deal: DbDealLite; kind: FingerprintMatch } | null => {
      const list = unclaimedIndex.get(fingerprintBaseKey(fp));
      if (!list) return null;
      for (let i = 0; i < list.length; i++) {
        const kind = matchFingerprint(fp, list[i].fp);
        if (kind) {
          const [deal] = list.splice(i, 1);
          return { deal, kind };
        }
      }
      return null;
    };
    const matchLabel: Record<FingerprintMatch, string> = {
      phone: 'telefon raqami',
      name: 'mijoz ismi',
      weak: "mijoz ma'lumotisiz: kun + limit + do'kon + mijozga to'lov + provayder + agentlik",
    };

    // ── 4. Har bir qator uchun qaror ──
    // Xronologik tartib (sanasi o'qilmaganlar oxirida), so'ng bitim raqami bo'yicha
    const ordered = [...rows].sort((a, b) => {
      const ta = a.dateInfo ? a.dateInfo.date.getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.dateInfo ? b.dateInfo.date.getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb || a.dealNumber - b.dealNumber;
    });

    const toCreate: ParsedDealRow[] = [];
    const toUpdate: { row: ParsedDealRow; db: DbDealLite }[] = [];
    let rowsForDate = 0;

    for (const row of ordered) {
      if (onlyDate) {
        if (!row.dateInfo) {
          skip(row, 'DATE_UNREADABLE', `sana o'qilmadi (katakdagi qiymat: ${JSON.stringify(row.rawDate) ?? "bo'sh"})`);
          continue;
        }
        if (row.dateInfo.ymd !== onlyDate) {
          skip(row, 'DATE_MISMATCH', `sana mos emas (${formatYmd(row.dateInfo.ymd)})`);
          continue;
        }
        rowsForDate++;
      }

      const existing = existingByRow.get(row);
      if (existing) {
        if (onlyMissing) skip(row, 'EXISTS_ID', `bazada bor (bitim #${existing.dealNumber})`, existing.dealNumber);
        else toUpdate.push({ row, db: existing });
        continue;
      }

      const conflict = conflictByRow.get(row);
      if (conflict) {
        skip(
          row,
          'ID_CONFLICT',
          `ID to'qnashuvi: varaqda ID bo'sh/takror, "8000 + №" = ${row.dealNumber} raqami bazada BOSHQA bitimga tegishli — varaqdagi ID ni to'ldirib qayta urining`,
          conflict.dealNumber
        );
        continue;
      }

      if (row.duplicateOf) {
        const prev = row.duplicateOf;
        skip(
          row,
          'SHEET_DUPLICATE',
          `varaqda takror qator: ${prev.rowNumber}-qator (№${prev.seq}, bitim #${prev.dealNumber}) bilan bir xil — ${matchLabel[row.duplicateKind!]}`,
          existingByRow.get(prev)?.dealNumber ?? null
        );
        continue;
      }

      if (row.fp) {
        const match = takeFingerprintMatch(row.fp);
        if (match) {
          skip(row, 'EXISTS_FINGERPRINT', `bazada bor (barmoq izi: bitim #${match.deal.dealNumber} — ${matchLabel[match.kind]})`, match.deal.dealNumber);
          continue;
        }
      }

      toCreate.push(row);
    }

    // ── 5. Spravochniklarni aniqlash (dry-run'da faqat tekshiriladi, yaratilmaydi) ──
    const newReferences = new Set<string>();
    const kindLabel: Record<ReferenceKind, string> = { store: "Do'kon", provider: 'Provayder', agency: 'Agentlik' };
    const indexes = { store: storeIndex, provider: providerIndex, agency: agencyIndex };

    const resolveReference = async (kind: ReferenceKind, rawName: string): Promise<string | null> => {
      const key = referenceKey(kind, rawName);
      const found = indexes[kind].get(key);
      if (found) return found.id;
      const name = canonicalReferenceName(kind, rawName);
      newReferences.add(`${kindLabel[kind]}: ${name}`);
      if (dryRun) return null;
      const created =
        kind === 'store'
          ? await prisma.store.upsert({ where: { name }, update: {}, create: { name } })
          : kind === 'provider'
            ? await prisma.provider.upsert({ where: { name }, update: {}, create: { name } })
            : await prisma.agency.upsert({ where: { name }, update: {}, create: { name } });
      indexes[kind].set(key, { id: created.id, name: created.name, memberIds: [created.id] });
      return created.id;
    };

    const resolveAgent = async (agencyRawName: string, agencyId: string | null, agentRawName: string): Promise<string | null> => {
      const agencyKey = referenceKey('agency', agencyRawName);
      const k = `${agencyKey}::${normalizeName(agentRawName)}`;
      const found = agentIndex.get(k);
      if (found) return found.id;
      const name = cleanName(agentRawName);
      newReferences.add(`Agent: ${canonicalReferenceName('agency', agencyRawName)} / ${name}`);
      if (dryRun || !agencyId) return null;
      const created = await prisma.agent.create({ data: { agencyId, name } });
      agentIndex.set(k, { id: created.id, inSurvivor: true, deals: 0 });
      return created.id;
    };

    const resolveBuyer = async (rawName: string): Promise<string | null> => {
      const key = normalizeName(rawName);
      const found = buyerMap.get(key);
      if (found) return found;
      if (dryRun) return null;
      const name = cleanName(rawName);
      const created = await prisma.buyer.upsert({ where: { name }, update: {}, create: { name } });
      buyerMap.set(key, created.id);
      return created.id;
    };

    const resolveAll = async (row: ParsedDealRow) => {
      const d = row.data;
      const storeId = await resolveReference('store', d.storeName);
      const providerId = await resolveReference('provider', d.providerName);
      let agencyId: string | null = null;
      let agentId: string | null = null;
      if (d.agencyName) {
        agencyId = await resolveReference('agency', d.agencyName);
        if (d.agentName) agentId = await resolveAgent(d.agencyName, agencyId, d.agentName);
      }
      const buyerId = d.buyerName ? await resolveBuyer(d.buyerName) : null;
      return { storeId, providerId, agencyId, agentId, buyerId };
    };

    /** Varaqdan olinadigan bitim maydonlari (yaratishda ham, yangilashda ham bir xil) */
    const dealFields = (row: ParsedDealRow, refs: Awaited<ReturnType<typeof resolveAll>>) => {
      const d = row.data;
      return {
        sellerName: d.sellerName,
        providerId: refs.providerId!,
        isDaftar: d.isDaftar,
        customerName: d.customerName,
        customerPhone1: d.customerPhone1,
        customerPhone2: d.customerPhone2,
        contractUrl: d.contractUrl,
        passportPhotoUrl: d.passportPhotoUrl,
        storeId: refs.storeId!,
        customerLimit: d.customerLimit,
        withdrawnLimit: d.withdrawnLimit,
        agentAmount: d.agentAmount,
        totalPurchaseCost: d.totalPurchaseCost,
        purchaseDiscountPct: d.purchaseDiscountPct,
        agentPct: d.agentPct,
        calculatedAmount: d.calculatedAmount,
        remainingLimit: d.remainingLimit,
        differenceAmount: d.differenceAmount,
        productName: d.productName,
        quantity: d.quantity,
        isActualDeviceSale: d.isActualDeviceSale,
        imeiBarcode: d.imeiBarcode,
        status: d.status,
        agencyId: refs.agencyId,
        agentId: refs.agentId,
        extraDaftar: d.extraDaftar,
        qodirDebt: d.qodirDebt,
        qodirBalance: d.qodirBalance,
        greenBazarBalance: d.greenBazarBalance,
        trustBalance: d.trustBalance,
        totalExtraBalance: d.totalExtraBalance,
        buyerId: refs.buyerId,
        salePrice: d.salePrice,
        paidTransfer: d.paidTransfer,
        paidCashUzs: d.paidCashUzs,
        paidCashUsd: d.paidCashUsd,
        paidBank: d.paidBank,
        exchangeRate: d.exchangeRate,
        profit: d.profit,
        marginPct: d.marginPct,
        receivedFromBuyer: d.receivedFromBuyer,
        debtRemainder: d.debtRemainder,
        paymentStatus: d.paymentStatus,
        note: d.note,
      };
    };

    // ── 6. Yozish (yoki dry-run'da faqat ro'yxat) ──
    const toInsert: SheetRowSummary[] = [];
    let inserted = 0;
    let updated = 0;

    for (const row of toCreate) {
      const refs = await resolveAll(row);
      toInsert.push(summarizeRow(row));
      if (dryRun) continue;

      // Varaqda mahsulot bitta matn bo'lib keladi — bitta DealItem qatori (backfill-ledger bilan bir xil qoida)
      const { items } = normalizeDealItems([{ productName: row.data.productName, imei1: row.data.imeiBarcode, quantity: row.data.quantity }]);
      // Yangi bitimda sana o'qilmagan bo'lsa (faqat to'liq sinxronlashda bo'lishi mumkin) — avvalgidek hozirgi vaqt
      const date = row.dateInfo ? row.dateInfo.date : new Date();

      await prisma.$transaction(async (tx) => {
        const created = await tx.deal.create({
          data: {
            dealNumber: row.dealNumber,
            date,
            ...dealFields(row, refs),
            approvalStatus: 'APPROVED',
            approvedAt: new Date(),
            items: items.length ? { create: items } : undefined,
          },
        });
        // Trust / Trust 1 bitimi bo'lsa — Trust daftariga qarz (yechilgan limit × 16%) yoziladi
        await syncTrustDebtForDeal(tx, created.id);
        // Do'kon bilan hisob-kitob qarzi (mijozga berilgan summa) — do'kon daftariga
        await syncStoreDebtForDeal(tx, created.id);
      });
      inserted++;
    }

    for (const { row, db } of toUpdate) {
      if (dryRun) {
        updated++;
        continue;
      }
      const refs = await resolveAll(row);
      await prisma.$transaction(async (tx) => {
        await tx.deal.update({
          where: { id: db.id },
          // Sana o'qilmagan bo'lsa bazadagi sana saqlanadi (hozirgi vaqt bilan ustidan yozilmaydi)
          data: { ...(row.dateInfo ? { date: row.dateInfo.date } : {}), ...dealFields(row, refs) },
        });
        await syncTrustDebtForDeal(tx, db.id);
        await syncStoreDebtForDeal(tx, db.id);
      });
      updated++;
    }

    // ── 7. Sozlamalar (faqat to'liq, haqiqiy sinxronlashda) ──
    const now = new Date().toISOString();
    if (!dryRun && !onlyDate) {
      const effectiveSheetUrl = customUrl || DEFAULT_SHEETS_URL;
      await prisma.appSetting.upsert({
        where: { key: 'google_sheets_url' },
        update: { value: effectiveSheetUrl },
        create: { key: 'google_sheets_url', value: effectiveSheetUrl, description: 'Ulangan Google Sheets havolasi' },
      });
      await prisma.appSetting.upsert({
        where: { key: 'google_sheets_last_sync' },
        update: { value: now },
        create: { key: 'google_sheets_last_sync', value: now, description: 'Oxirgi muvaffaqiyatli sinxronizatsiya vaqti' },
      });
    }

    const dated = ordered.filter((r) => r.dateInfo);
    const skippedSummary: Partial<Record<SheetSkipCode, number>> = {};
    for (const s of skipped) skippedSummary[s.code] = (skippedSummary[s.code] || 0) + 1;

    console.log(
      `[Deals Sync${dryRun ? ' DRY-RUN' : ''}] varaqda ${rows.length} ta bitim qatori; ` +
        `${dryRun ? "qo'shiladi" : "qo'shildi"}: ${toInsert.length}, ${dryRun ? 'yangilanadi' : 'yangilandi'}: ${updated}, o'tkazib yuborildi: ${skipped.length}`
    );

    return {
      success: true,
      // Avvalgi maydonlar (mavjud chaqiruvchilar uchun)
      count: (dryRun ? toInsert.length : inserted) + updated,
      minDeal: dated[0]?.dealNumber,
      maxDeal: dated[dated.length - 1]?.dealNumber,
      dateRange: `${dated[0]?.dateInfo?.ymd} - ${dated[dated.length - 1]?.dateInfo?.ymd}`,
      sheetName: ws.name,
      lastSync: now,
      // Yangi maydonlar
      dryRun,
      onlyDate,
      onlyMissing,
      source,
      /** Varaqdagi bitim qatorlari soni (bo'sh qatorlarsiz) */
      sheetRows: rows.length,
      /** onlyDate berilganda — shu kunga to'g'ri kelgan qatorlar soni */
      rowsForDate: onlyDate ? rowsForDate : null,
      inserted: dryRun ? 0 : inserted,
      updated: dryRun ? 0 : updated,
      /** dry-run'da: yangilanishi kerak bo'lgan mavjud bitimlar soni (onlyMissing=true bo'lsa har doim 0) */
      wouldUpdate: dryRun ? updated : 0,
      toInsert,
      skipped,
      skippedSummary,
      /** Spravochnikda topilmagan (yaratiladigan / yaratilgan) nomlar */
      newReferences: [...newReferences],
      warnings,
    };
  } finally {
    cleanup();
  }
}

export async function pushDealToGoogleSheets(deal: any) {
  try {
    const scriptSetting = await prisma.appSetting.findUnique({
      where: { key: 'google_apps_script_url' },
    });
    if (!scriptSetting || !scriptSetting.value || !scriptSetting.value.startsWith('http')) {
      return { success: false, reason: 'Apps Script URL sozlanmagan' };
    }

    let statusText = 'Надо покупать';
    switch (deal.status) {
      case 'IN_WAREHOUSE': statusText = 'На складе'; break;
      case 'SOLD': statusText = 'Продано'; break;
      case 'IN_TRANSIT': statusText = 'В пути'; break;
      case 'PENDING': statusText = 'Ожидается'; break;
      case 'MONEY_RECEIVED': statusText = 'Денги поступило'; break;
      case 'PARTIAL_AMOUNT': statusText = 'Не все сумма'; break;
      default: statusText = 'Надо покупать';
    }

    let pStatusText = 'Частично';
    if (deal.paymentStatus === 'PAID') pStatusText = 'Оплачено';
    else if (deal.paymentStatus === 'DEBT') pStatusText = 'Долг';

    const payload = {
      action: 'upsert_deal',
      deal: {
        dealNumber: deal.dealNumber,
        date: deal.date ? new Date(deal.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        sellerName: deal.sellerName || 'Operator',
        providerName: deal.provider?.name || '',
        isDaftar: deal.isDaftar ? 'Да' : 'Нет',
        customerName: deal.customerName || '',
        customerPhone1: deal.customerPhone1 || '',
        customerPhone2: deal.customerPhone2 || '',
        contractUrl: deal.contractUrl || '',
        passportPhotoUrl: deal.passportPhotoUrl || '',
        storeName: deal.store?.name || '',
        customerLimit: Number(deal.customerLimit) || 0,
        withdrawnLimit: Number(deal.withdrawnLimit) || 0,
        agentAmount: Number(deal.agentAmount) || 0,
        totalPurchaseCost: Number(deal.totalPurchaseCost) || 0,
        purchaseDiscountPct: Number(deal.purchaseDiscountPct) || 0,
        agentPct: Number(deal.agentPct) || 0,
        calculatedAmount: Number(deal.calculatedAmount) || 0,
        remainingLimit: Number(deal.remainingLimit) || 0,
        differenceAmount: Number(deal.differenceAmount) || 0,
        productName: deal.productName || '',
        quantity: deal.quantity || 1,
        isActualDeviceSale: deal.isActualDeviceSale ? 'Да' : 'Нет',
        imeiBarcode: deal.imeiBarcode || '',
        statusText,
        agencyName: deal.agency?.name || '',
        agentName: deal.agent?.name || '',
        extraDaftar: Number(deal.extraDaftar) || 0,
        qodirDebt: Number(deal.qodirDebt) || 0,
        qodirBalance: Number(deal.qodirBalance) || 0,
        greenBazarBalance: Number(deal.greenBazarBalance) || 0,
        trustBalance: Number(deal.trustBalance) || 0,
        totalExtraBalance: Number(deal.totalExtraBalance) || 0,
        buyerName: deal.buyer?.name || '',
        salePrice: Number(deal.salePrice) || 0,
        paidTransfer: Number(deal.paidTransfer) || 0,
        paidCashUzs: Number(deal.paidCashUzs) || 0,
        paidCashUsd: Number(deal.paidCashUsd) || 0,
        paidBank: Number(deal.paidBank) || 0,
        exchangeRate: Number(deal.exchangeRate) || 1,
        profit: Number(deal.profit) || 0,
        marginPct: Number(deal.marginPct) || 0,
        receivedFromBuyer: Number(deal.receivedFromBuyer) || 0,
        debtRemainder: Number(deal.debtRemainder) || 0,
        paymentStatus: pStatusText,
        note: deal.note || '',
      },
    };

    const res = await fetch(scriptSetting.value, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log(`Pushed deal #${deal.dealNumber} to Google Sheets, status: ${res.status}`);
    return { success: true, status: res.status };
  } catch (err: any) {
    console.error('Error pushing deal to Google Sheets:', err.message);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════════════
//  DDS (pul harakati) IMPORTI
// ════════════════════════════════════════════════════════════════════

export interface SyncDdsOptions {
  /** true — bazaga hech narsa yozilmaydi, faqat nima bo'lishi hisoblanadi */
  dryRun?: boolean;
}

export async function syncDdsFromGoogleSheets(customUrl?: string, options: SyncDdsOptions = {}) {
  const dryRun = options.dryRun === true;
  const warnings: string[] = [];
  // DDS uchun eski lokal nusxaga o'tilmaydi — eskirgan fayl pul yozuvlarini buzishi mumkin
  const { source, cleanup } = await resolveWorkbookFile({ customUrl, allowCacheFallback: false, label: 'dds', warnings });

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(source.path);

    let ws = wb.getWorksheet('Транзакции_ДДС');
    if (!ws) {
      ws = wb.worksheets.find(
        (w) => w.name.toLowerCase().includes('транзакци') || w.name.toLowerCase().includes('ддс')
      );
    }

    if (!ws) {
      throw new Error('Google Sheets ichida "Транзакции_ДДС" varag\'i topilmadi');
    }

    console.log(`[DDS Sync] Topilgan varaq: ${ws.name}, qatorlar soni: ${ws.rowCount}`);

    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const createdById = adminUser?.id || null;

    const items: any[] = [];
    // ID yozilgan, lekin summasi yo'q qatorlar (oldindan raqamlangan bo'sh qatorlar) — yozuv yaratilmaydi
    const placeholderTxNumbers: string[] = [];
    const seenTxNumbers = new Set<string>();
    const legacyTimeByTx = new Map<string, number>();

    for (let r = 7; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const txId = extractVal(row.getCell(1));
      const dtVal = extractVal(row.getCell(2));
      const typeStr = String(extractVal(row.getCell(3)) || '').trim().toLowerCase();
      const accountStr = String(extractVal(row.getCell(4)) || '').trim().toLowerCase();
      const expenseTypeStr = String(extractVal(row.getCell(5)) || '').trim().toLowerCase();
      const categoryStr = String(extractVal(row.getCell(6)) || '').trim();
      const sourceStr = String(extractVal(row.getCell(7)) || '').trim();
      const amount = extractNum(row.getCell(8));
      const desc = extractVal(row.getCell(9));

      if (!txId && amount <= 0) continue;

      const txNumber = txId ? String(txId).trim() : `TX-${1000 + r}`;
      if (seenTxNumbers.has(txNumber)) {
        warnings.push(`DDS varag'ida takror ID: ${txNumber} (${r}-qator) — ikkinchisi o'tkazib yuborildi`);
        continue;
      }
      seenTxNumbers.add(txNumber);

      if (!(amount > 0)) {
        placeholderTxNumbers.push(txNumber);
        continue;
      }

      let type: TransactionType = TransactionType.EXPENSE;
      if (typeStr.includes('доход') || typeStr.includes('приход') || typeStr.includes('kirim')) {
        type = TransactionType.INCOME;
      }

      let account: AccountType = AccountType.CASH;
      if (accountStr.includes('карта') || accountStr.includes('card')) {
        account = AccountType.BANK_CARD;
      } else if (accountStr.includes('расчет') || accountStr.includes('р/с') || accountStr.includes('bank')) {
        account = AccountType.SETTLEMENT_ACCOUNT;
      }

      let expenseType: ExpenseCategoryType = ExpenseCategoryType.OPEX;
      if (type === TransactionType.INCOME) {
        expenseType = ExpenseCategoryType.INCOME_TRANSFER;
      } else if (
        // Qodir akaga to'lov — qarzni qaytarish, operatsion xarajat (OPEX) emas
        isQodirPaymentCategory(categoryStr) ||
        expenseTypeStr.includes('cogs') ||
        expenseTypeStr.includes('перемен') ||
        categoryStr.toLowerCase().includes('выкуп') ||
        categoryStr.toLowerCase().includes('tovar')
      ) {
        expenseType = ExpenseCategoryType.COGS;
      } else if (expenseTypeStr.includes('opex') || expenseTypeStr.includes('операцион')) {
        expenseType = ExpenseCategoryType.OPEX;
      }

      // Varaqdagi sana-vaqt Toshkent vaqti; o'qilmasa avvalgidek hozirgi vaqt
      const parsedDate = parseSheetDate(dtVal);
      if (!parsedDate) warnings.push(`DDS ${txNumber} (${r}-qator): sana o'qilmadi — hozirgi vaqt qo'yildi`);
      if (dtVal instanceof Date && !isNaN(dtVal.getTime())) legacyTimeByTx.set(txNumber, dtVal.getTime());

      items.push({
        txNumber,
        dateTime: parsedDate ? parsedDate.date : new Date(),
        type,
        account,
        expenseType,
        categoryName: categoryStr || (type === TransactionType.INCOME ? 'Tushum' : 'Boshqa xarajat'),
        sourcePerson: sourceStr || 'Hasan',
        amount,
        description: desc ? String(desc).trim() : null,
        createdById,
        source: DdsSource.SYNC,
      });
    }

    // Bazadagi shu raqamli yozuvlar. Ilova ham "TX-<raqam>" beradi, shuning uchun varaq raqami ilovada yaratilgan
    // yozuv bilan to'qnashishi mumkin — bunday yozuv O'CHIRILMAYDI (aks holda chek xarajati / Trust to'lovi yo'qolardi).
    const sheetTxNumbers = [...items.map((i) => i.txNumber), ...placeholderTxNumbers];
    const existing = sheetTxNumbers.length
      ? await prisma.ddsTransaction.findMany({
          where: { txNumber: { in: sheetTxNumbers } },
          select: { id: true, txNumber: true, source: true, dealId: true, type: true, amount: true, dateTime: true },
        })
      : [];
    const itemByTx = new Map<string, any>(items.map((i) => [i.txNumber, i]));
    const replaceIds: string[] = [];
    const conflicts: { txNumber: string; reason: string }[] = [];
    for (const e of existing) {
      const item = itemByTx.get(e.txNumber);
      const fromSync = e.source === DdsSource.SYNC;
      // Avvalgi importlar source = MANUAL bilan yozilgan: turi va summasi varaq bilan bir xil bo'lsa — o'sha import deb olinadi
      const legacyImport =
        e.source === DdsSource.MANUAL &&
        !e.dealId &&
        (item
          ? (e.type === item.type && Math.round(Number(e.amount)) === Math.round(item.amount)) ||
            // summa varaqda formula bilan o'zgarib turadi — eski import sanani "devor soati"ni UTC deb saqlagan, shu bo'yicha taniladi
            (legacyTimeByTx.get(e.txNumber) !== undefined && e.dateTime.getTime() === legacyTimeByTx.get(e.txNumber))
          : Number(e.amount) === 0);
      if (fromSync || legacyImport) {
        replaceIds.push(e.id);
      } else if (item) {
        conflicts.push({
          txNumber: e.txNumber,
          reason: `bazada shu raqamli boshqa yozuv bor (manba: ${e.source}, summa: ${Number(e.amount)}) — varaqdagi qator yozilmadi`,
        });
      }
    }
    const conflictSet = new Set(conflicts.map((c) => c.txNumber));
    const toCreate = items.filter((i) => !conflictSet.has(i.txNumber));
    for (const c of conflicts) warnings.push(`DDS ${c.txNumber}: ${c.reason}`);

    let incomeCount = 0;
    let expenseCount = 0;
    let totalIncome = 0;
    let totalExpense = 0;
    for (const i of toCreate) {
      if (i.type === TransactionType.INCOME) {
        incomeCount++;
        totalIncome += i.amount;
      } else {
        expenseCount++;
        totalExpense += i.amount;
      }
    }

    let balances: Record<string, number> | null = null;
    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        if (replaceIds.length) await tx.ddsTransaction.deleteMany({ where: { id: { in: replaceIds } } });
        if (toCreate.length) await tx.ddsTransaction.createMany({ data: toCreate });

        // Varaqda "Trust 1 daromadi" kirimi bo'lsa — Trust bergan pul sifatida Trust daftariga ham yoziladi
        const trustTx = toCreate.filter((i) => i.type === TransactionType.INCOME && isTrustIncomeCategory(i.categoryName));
        if (trustTx.length) {
          const createdRows = await tx.ddsTransaction.findMany({
            where: { txNumber: { in: trustTx.map((i) => i.txNumber) } },
            select: { id: true, amount: true, dateTime: true, description: true },
          });
          for (const row of createdRows) {
            await tx.trustLedgerEntry.create({
              data: {
                type: TrustEntryType.PAYMENT,
                amount: row.amount,
                dateTime: row.dateTime,
                ddsTransactionId: row.id,
                note: row.description || 'Trust bergan pul (Google Sheets)',
                createdById,
              },
            });
          }
        }
      });

      // Yozuvlar to'g'ridan-to'g'ri yozilgani uchun kassa/karta/hisob qoldiqlari DDS bo'yicha qayta hisoblanadi
      balances = await rebuildAccountBalances();
    }

    const importedCount = toCreate.length;
    console.log(`[DDS Sync${dryRun ? ' DRY-RUN' : ''} tugadi] Jami ${importedCount} ta DDS tranzaksiya ${dryRun ? 'yuklanadi' : 'yuklandi'}.`);
    return {
      success: true,
      importedCount,
      incomeCount,
      expenseCount,
      totalIncome,
      totalExpense,
      netCashflow: totalIncome - totalExpense,
      sheetName: ws.name,
      // Yangi maydonlar
      dryRun,
      /** Almashtirilgan (o'chirib qayta yozilgan) avvalgi import yozuvlari soni */
      replacedCount: replaceIds.length,
      /** Summasi yo'q (bo'sh) qatorlar soni — yozuv yaratilmaydi */
      skippedEmptyCount: placeholderTxNumbers.length,
      conflicts,
      balances,
      warnings,
    };
  } finally {
    cleanup();
  }
}
