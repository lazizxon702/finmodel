import { describe, it, expect } from 'vitest';
import {
  buildFingerprint,
  canonicalReferenceName,
  customerNameKey,
  groupReferences,
  matchFingerprint,
  parseDayArg,
  parseSheetDate,
  phoneKey,
  phoneKeys,
  referenceKey,
  tashkentYmd,
} from '../src/services/sheetsSync.service';
import { findProbableDuplicates, planAgentMerges, translitSkeleton } from '../scripts/merge-references';

describe('Sana o\'qish (parseSheetDate)', () => {
  it('dd.mm.yyyy matni', () => {
    const d = parseSheetDate('09.11.2026')!;
    expect(d.ymd).toBe('2026-11-09');
    expect(d.date.toISOString()).toBe('2026-11-09T00:00:00.000Z');
    expect(parseSheetDate(' 9/11/2026 ')!.ymd).toBe('2026-11-09');
    expect(parseSheetDate('2026-11-09')!.ymd).toBe('2026-11-09');
  });

  it('Date obyekti — varaqdagi kalendar kuni olinadi', () => {
    expect(parseSheetDate(new Date('2026-11-09T00:00:00.000Z'))!.ymd).toBe('2026-11-09');
    // kechki vaqt ham o'sha kun bo'lib qoladi (Toshkent vaqti deb olinadi)
    const late = parseSheetDate(new Date('2026-11-09T23:30:00.000Z'))!;
    expect(late.ymd).toBe('2026-11-09');
    expect(tashkentYmd(late.date)).toBe('2026-11-09');
    expect(late.date.toISOString()).toBe('2026-11-09T18:30:00.000Z');
  });

  it('Excel seriya raqami', () => {
    const serial = (Date.UTC(2026, 10, 9) - Date.UTC(1899, 11, 30)) / 86400000;
    expect(parseSheetDate(serial)!.ymd).toBe('2026-11-09');
    expect(parseSheetDate(String(serial))!.ymd).toBe('2026-11-09');
    expect(parseSheetDate(serial + 0.5)!.hasTime).toBe(true);
  });

  it('o\'qilmaydigan qiymat — null (bugungi sana emas)', () => {
    for (const v of [null, undefined, '', 'kecha', '31.02.2026', '09.13.2026', 0, -5, {}, '09.11.1850']) {
      expect(parseSheetDate(v)).toBeNull();
    }
  });

  it('parseDayArg va tashkentYmd', () => {
    expect(parseDayArg('09.11.2026')).toBe('2026-11-09');
    expect(parseDayArg('2026-11-09')).toBe('2026-11-09');
    expect(parseDayArg('abc')).toBeNull();
    expect(tashkentYmd(new Date('2026-11-09T20:00:00.000Z'))).toBe('2026-11-10');
    expect(tashkentYmd(new Date('2026-11-09T07:00:00.000Z'))).toBe('2026-11-09');
  });
});

describe('Telefon va mijoz ismi kalitlari', () => {
  it('telefon: faqat raqamlar, oxirgi 9 tasi', () => {
    expect(phoneKey('+998 90 111-22-33')).toBe('901112233');
    expect(phoneKey(901112233)).toBe('901112233');
    expect(phoneKey('-')).toBeNull();
    expect(phoneKeys('901112233, +998931234567', null)).toEqual(['901112233', '931234567']);
  });
  it('"Mijoz" kabi umumiy so\'z ism hisoblanmaydi', () => {
    expect(customerNameKey('  ALIYEV   Vali ')).toBe('aliyev vali');
    expect(customerNameKey('Mijoz')).toBe('');
  });
});

describe('Barmoq izi / dublikat aniqlash', () => {
  const base = { day: '2026-11-09', withdrawnLimit: 4000000, storeName: 'Qodir oka', calculatedAmount: 3000000, providerName: 'Imanium', agencyName: 'Жахонгир' };

  it('telefon mos — bitta bitim (do\'kon kanonik nom bo\'yicha)', () => {
    const a = buildFingerprint({ ...base, phones: ['+998901112233'], customerName: 'Ali' });
    const b = buildFingerprint({ ...base, storeName: 'QODIR  AKA', phones: ['90 111 22 33'], customerName: 'Boshqa' });
    expect(matchFingerprint(a, b)).toBe('phone');
  });

  it('ism mos — bitta bitim', () => {
    const a = buildFingerprint({ ...base, customerName: 'Aliyev Vali' });
    const b = buildFingerprint({ ...base, customerName: ' aliyev  vali ' });
    expect(matchFingerprint(a, b)).toBe('name');
  });

  it('kun, limit yoki do\'kon farq qilsa — mos emas', () => {
    const a = buildFingerprint({ ...base, phones: ['901112233'] });
    expect(matchFingerprint(a, buildFingerprint({ ...base, day: '2026-11-10', phones: ['901112233'] }))).toBeNull();
    expect(matchFingerprint(a, buildFingerprint({ ...base, withdrawnLimit: 4000001, phones: ['901112233'] }))).toBeNull();
    expect(matchFingerprint(a, buildFingerprint({ ...base, storeName: 'Novza', phones: ['901112233'] }))).toBeNull();
  });

  it('ikkalasida mijoz bor, lekin boshqa — mos emas', () => {
    const a = buildFingerprint({ ...base, phones: ['901112233'], customerName: 'Ali' });
    const b = buildFingerprint({ ...base, phones: ['931234567'], customerName: 'Vali' });
    expect(matchFingerprint(a, b)).toBeNull();
  });

  it('mijoz ma\'lumoti yo\'q — to\'lov + provayder + agentlik ham bir xil bo\'lsa kuchsiz moslik', () => {
    const a = buildFingerprint(base);
    expect(matchFingerprint(a, buildFingerprint({ ...base, providerName: 'Imanum', agencyName: 'Jahongir' }))).toBe('weak');
    expect(matchFingerprint(a, buildFingerprint({ ...base, agencyName: 'Nazirbek' }))).toBeNull();
    expect(matchFingerprint(a, buildFingerprint({ ...base, calculatedAmount: 2999000 }))).toBeNull();
    // bazada mijoz kiritilgan, varaqda yo'q — baribir kuchsiz moslik
    expect(matchFingerprint(a, buildFingerprint({ ...base, phones: ['901112233'], customerName: 'Ali' }))).toBe('weak');
  });
});

describe('Spravochnik guruhlash (kanonik nom)', () => {
  it('kanonik nom va kalit', () => {
    expect(canonicalReferenceName('store', ' qodir  OKA ')).toBe('Qodir aka');
    expect(canonicalReferenceName('provider', 'IMANIUM')).toBe('Imanum');
    expect(canonicalReferenceName('agency', 'Жахонгир')).toBe('Jahongir');
    expect(canonicalReferenceName('store', '  Yangi   Dokon ')).toBe('Yangi Dokon');
    expect(referenceKey('store', 'Green bazar')).toBe(referenceKey('store', 'GREEN  BAZAR'));
    expect(referenceKey('store', 'constructor')).toBe('constructor');
  });

  it('nomi kanonikka aynan teng yozuv omon qoladi (bitimi kam bo\'lsa ham)', () => {
    const groups = groupReferences('store', [
      { id: '1', name: 'Qodir aka', dealCount: 7 },
      { id: '2', name: 'Qodir oka', dealCount: 30 },
      { id: '3', name: 'Novza', dealCount: 29 },
    ]);
    const g = groups.find((x) => x.canonicalName === 'Qodir aka')!;
    expect(g.survivor.id).toBe('1');
    expect(g.duplicates.map((d) => d.id)).toEqual(['2']);
    expect(g.rename).toBe(false);
    expect(groups).toHaveLength(2);
  });

  it('kanonik nomli yozuv bo\'lmasa — bitimi ko\'pi qayta nomlanadi', () => {
    const [g] = groupReferences('provider', [
      { id: 'a', name: 'Imanium', dealCount: 30 },
      { id: 'b', name: 'imaniom', dealCount: 2 },
    ]);
    expect(g.survivor.id).toBe('a');
    expect(g.canonicalName).toBe('Imanum');
    expect(g.rename).toBe(true);
  });

  it('jadvalda yo\'q nomlar katta-kichik harf / bo\'shliq bo\'yicha guruhlanadi', () => {
    const [g] = groupReferences('store', [
      { id: 'a', name: 'shaxlo', dealCount: 1 },
      { id: 'b', name: 'Shaxlo ', dealCount: 5 },
    ]);
    expect(g.survivor.id).toBe('b');
    expect(g.canonicalName).toBe('Shaxlo');
    expect(g.rename).toBe(true);
  });
});

describe('Agentlar: birlashtirish va ehtimoliy dublikatlar', () => {
  it('bitta agentlik ichida aynan bir xil ism birlashadi, kirill/lotin — yo\'q', () => {
    const map = new Map([['cyr', 'lat']]);
    const groups = planAgentMerges(
      [
        { id: '1', name: 'Malika', agencyId: 'lat', dealCount: 1 },
        { id: '2', name: ' malika ', agencyId: 'cyr', dealCount: 5 },
        { id: '3', name: 'Малика', agencyId: 'cyr', dealCount: 9 },
        { id: '4', name: 'Malika', agencyId: 'other', dealCount: 2 },
      ],
      map
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].agencyId).toBe('lat');
    expect(groups[0].survivor.id).toBe('2');
    expect(groups[0].duplicates.map((d) => d.id)).toEqual(['1']);
  });

  it('translit skeleti va ehtimoliy juftliklar', () => {
    expect(translitSkeleton('Шахло')).toBe(translitSkeleton('Shaxlo'));
    expect(translitSkeleton('Муяссар')).toBe(translitSkeleton('Muyassar'));
    const pairs = findProbableDuplicates([
      { id: '1', name: 'Малика', scope: 'a' },
      { id: '2', name: 'Malika', scope: 'a' },
      { id: '3', name: 'Malika', scope: 'b' },
      { id: '4', name: 'Сугдиена', scope: 'a' },
      { id: '5', name: "Sug'diyona", scope: 'a' },
      { id: '6', name: 'Alif Offline', scope: 'p' },
      { id: '7', name: 'Alif Online', scope: 'p' },
      { id: '8', name: 'Paylater offline', scope: 'p' },
      { id: '9', name: 'Payletar offline', scope: 'p' },
    ]);
    expect(pairs.map((p) => `${p.a.id}-${p.b.id}:${p.reason}`)).toEqual(['1-2:translit', '4-5:similar', '8-9:swapped']);
  });
});
