# FinModel dizayn tizimi

Klient: `client/` (React 18 + Vite + Tailwind 3 + TypeScript). Bu hujjat sahifalarni yangi asosga
o'tkazadiganlar uchun amaliy qo'llanma.

Yo'nalish: yorug', sovuq va toza ERP — raqam birinchi o'rinda. Fon oq-ko'kimtir, sirtlar oq, matn siyoh-ko'k,
chuqurlikni yumshoq qatlamli (ko'kimtir) soyalar beradi. Brend rangi — logotipdagi to'yingan ko'k; logotipdagi
to'q sariq nuqta ("spark") faqat faol menyu bandida va tasdiq kutayotgan bitimlar nishonida ishlatiladi.
Dadillik ikki joyga sarflanadi: **to'q ko'k yon menyu** (ikkala mavzuda) va **asosiy raqamlar** (`hero` panel,
yirik Geologica raqamlar). Qolgan hamma narsa sokin: gradient faqat `fm-hero` va yon menyuda, animatsiya faqat
foydalanuvchi amaliga javoban (modal, hover).

Rang ma'nolari barqaror — bezak uchun ishlatilmaydi:

| Ma'no | Ton | Light (matn / soft / solid) | Dark (matn / soft) |
|---|---|---|---|
| Brend, asosiy amal | `brand` | `#1D52DB` / `#E5EDFF` / `#2360F0` | `#8AB0FF` / `#1A2C68` |
| Kirim, foyda, tasdiqlangan | `success` | `#047857` / `#DCF7EB` / `#058660` | `#3DDC97` / `#0C3832` |
| Chiqim, qarz, xato, rad etilgan | `danger` | `#C8232C` / `#FFE8E6` / `#DC2F3A` | `#FF7A7A` / `#481A2C` |
| Kutilmoqda, ogohlantirish | `warning` | `#A15C00` / `#FFF1CF` / `#F59E0B` | `#FFC24D` / `#3E2E12` |
| Trust, agentlar | `violet` | `#6D3FD9` / `#EFE9FF` / `#7C4DFF` | `#B49CFF` / `#2C2264` |
| Neytral ma'lumot (hisob, manba) | `info` | `#0B6BA8` / `#E0F2FE` / `#0E74B4` | `#5CC8FF` / `#0C3254` |

Asos: light — fon `#F1F5FB`, sirt `#FFFFFF`, matn `#0E1B3D`, chegara `#E0E6F1`;
dark — fon `#090F26`, sirt `#111A3A`, ichki sirt `#18234A`, ko'tarilgan sirt `#1E2B58`, matn `#EEF2FF` (kulrang-qora emas, to'q ko'k).
Yon menyu: `#0D1B4D → #081134`. Barcha matn/fon juftlari WCAG AA (4.5:1) dan yuqori.

Fayllar:

| Nima | Qayerda |
|---|---|
| Tokenlar (CSS o'zgaruvchilari), `fm-hero` / `fm-nav` sahnalari, xavfsizlik to'ri | `client/src/index.css` |
| Tokenlarning Tailwind nomlari, shriftlar, radius, soya | `client/tailwind.config.js` |
| Shrift linki (Google Fonts) | `client/index.html` |
| Komponentlar | `client/src/components/ui/` (`index.ts` dan import) |
| Qobiq: yon menyu, yuqori panel, pastki panel | `client/src/components/Sidebar.tsx`, `Header.tsx`, `BottomNav.tsx` |
| `cn()` | `client/src/lib/cn.ts` |
| Tarjimalar | `client/src/i18n/modules/*.ts`, `client/src/context/LanguageContext.tsx` |
| Sana/pul formatlash | `client/src/utils/format.ts` |

## 1. Rang tokenlari

Rejim `<html class="dark">` / `<html class="light">` orqali almashadi (ThemeContext). **Standart — light**
(yangi foydalanuvchi uchun); `localStorage['finmodel_theme']` dagi saqlangan tanlov hurmat qilinadi.
Tokenlar o'zi almashadi, shuning uchun token klasslariga **`dark:` varianti yozilmaydi**.
Hammasi alfa bilan ishlaydi: `bg-surface/80`, `border-accent/40`.

| Tailwind klass | CSS o'zgaruvchisi | Qachon |
|---|---|---|
| `bg-app` | `--bg-app` | Sahifa foni (body'da allaqachon bor) |
| `bg-surface` | `--bg-surface` | Karta, panel, jadval, input |
| `bg-surface-2` | `--bg-surface-2` | Jadval sarlavhasi, ichki blok, hover, o'chirilgan input |
| `bg-elevated` | `--bg-elevated` | Modal, dropdown, qalqib chiquvchi oyna |
| `bg-overlay/60` | `--overlay` | Modal orqa foni |
| `text-fg` | `--fg` | Asosiy matn, sarlavha, raqam |
| `text-fg-secondary` | `--fg-secondary` | Ikkinchi darajali matn, label, ko'rsatkich nomi |
| `text-fg-muted` | `--fg-muted` | Izoh, placeholder, yordamchi matn (oq fonda 5.5:1 — o'qiladi) |
| `text-fg-inverse` | `--fg-inverse` | Teskari fon ustidagi matn |
| `border-line` | `--line` | Oddiy chegara, ajratgich (`divide-line`). Rangsiz `border` ham shu |
| `border-line-strong` | `--line-strong` | Input chegarasi, hover chegarasi |
| `bg-brand` + `text-brand-fg` | `--brand`, `--brand-fg` | To'ldirilgan asosiy tugma, aktiv menyu |
| `hover:bg-brand-hover` | `--brand-hover` | Asosiy tugma hover |
| `bg-brand-soft` | `--brand-soft` | Accent'ning yumshoq foni (ikonka fonlari, tanlangan qator) |
| `text-accent`, `border-accent`, `ring-accent` | `--accent` | Sirt ustidagi accent matn/ikonka/havola, fokus |
| `text-success` / `bg-success-soft` / `bg-success-solid` | `--success*` | Kirim, foyda, tasdiqlangan |
| `text-warning` / `bg-warning-soft` / `bg-warning-solid` + `text-warning-fg` | `--warning*` | Kutilmoqda, ogohlantirish |
| `text-danger` / `bg-danger-soft` / `bg-danger-solid` | `--danger*` | Chiqim, qarz, xato, rad etilgan, o'chirish |
| `text-info` / `bg-info-soft` / `bg-info-solid` | `--info*` | Neytral ma'lumot |
| `text-violet` / `bg-violet-soft` / `bg-violet-solid` | `--violet*` | Trust va agentlarga oid hamma narsa |
| `bg-spark` | `--spark` | Logotip nuqtasi — faqat kichik urg'u (yangi kodda deyarli kerak emas) |
| `bg-nav`, `text-nav-fg`, `text-nav-muted` | `--nav-*` | Yon menyu (faqat qobiq ishlatadi) |

`-solid` fon ustida matn doim `text-white` (istisno: `bg-warning-solid` ustida `text-warning-fg`). `brand` (fon) va
`accent` (matn) alohida, chunki dark rejimda bitta rang ham fon, ham matn sifatida kontrast bermaydi.
Tailwind'ning `violet-50…950` shkalasi saqlangan — `violet` tokenlari unga qo'shimcha.

**Rangli sahnalar.** `.fm-hero` (va `<Card variant="hero">`, `<StatCard variant="hero">`) ichida tokenlar qayta
belgilanadi: `text-fg` oq, `text-fg-muted` och ko'k, `border-line` shaffof oq bo'ladi. Shuning uchun hero ichida
odatdagi klasslarni yozavering — qo'lda `text-white` shart emas.

Boshqa shkalalar:

- Radius: `rounded-control` (10px — tugma, input), `rounded-card` (16px — karta, jadval), `rounded-sheet` (20px — modal). Badge — `rounded-full`.
- Soya: `shadow-card` (ikki qatlamli yumshoq), `shadow-pop` (modal/dropdown, bosiladigan karta hover). Boshqa soyalar kerak emas.
- Teginish maydoni: `min-h-touch` / `min-w-touch` = 44px (mobil). Komponentlarda allaqachon bor.
- Bo'shliq: sahifa bloklari orasida `space-y-4 sm:space-y-5`; grid `gap-3 sm:gap-4`; karta ichi `p-4 sm:p-5`.

### Tipografika

Ikki shrift, ikkalasi ham lotin + kirillni to'liq qo'llaydi (Google Fonts, `display=swap`, yuklanmasa tizim shrifti):

- **Onest** (`font-sans`, standart) — barcha matn, jadval, forma. Raqamlari teng kenglikda.
- **Geologica** (`font-display`) — sarlavhalar (`h1–h3` avtomatik) va yirik pul raqamlari (`.fm-num`).

| Rol | Klass |
|---|---|
| Sahifa sarlavhasi (`PageHeader`) | 22px → 26px, `font-bold` |
| Karta sarlavhasi (`CardHeader`) | `text-[15px] font-semibold` |
| Asosiy matn, jadval | `text-sm` (14px) |
| Label, ko'rsatkich nomi | `text-[13px] font-medium text-fg-secondary` |
| Yordamchi matn | `text-xs text-fg-muted` (12px; minimal o'lcham `text-[11px]` — faqat nishonlarda) |
| Katta raqam | `fm-num text-2xl font-bold` (StatCard o'zi qo'yadi; o'lcham karta kengligiga moslashadi) |

**Har qanday pul/son — `tabular-nums`** (`<table>` ichida avtomatik; `Td numeric` ham qo'yadi).
`font-black`, `uppercase tracking-wider`, `text-[9px]/[10px]` ishlatilmaydi.

### Kartochka ierarxiyasi

Hamma narsa bir xil ramkali quti bo'lmasin:

1. **Hero** — sahifaning bosh raqami (kassadagi pul, jami qarz...). `<StatCard variant="hero">` yoki `<Card variant="hero">`. Sahifada 1 ta, ko'pi bilan 2 ta.
2. **Oddiy karta** — `<Card>` / `<StatCard>`: oq sirt, nozik chegara, yumshoq soya.
3. **Ichki blok** — `<Card variant="soft">` (yumshoq fon, ramkasiz) — karta ichidagi guruh.
4. **Ichki bo'lim** — `<Card variant="plain">` / `<StatCard variant="plain">` — fonsiz, ramkasiz; ajratish uchun `divide-line`.

## 2. Komponentlar

```tsx
import { Button, Card, CardHeader, StatCard, Modal, PageHeader, Badge, Field, Input, Select, Textarea,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, EmptyState, Spinner, Skeleton, LoadingBlock,
  DateRangeFilter, defaultDateRange, Tabs, SegmentedControl, LanguageSwitcher, ThemeToggle, BrandMark, cn } from '../components/ui';
```

Hammasi `className` qabul qiladi (`cn` orqali ustidan yozish mumkin).

| Komponent | Asosiy props |
|---|---|
| `Button` | `variant`: `primary` \| `secondary` \| `soft` \| `ghost` \| `danger` \| `success`; `size`: `sm` \| `md` \| `lg` \| `icon`; `loading`; `leftIcon`; `rightIcon`; `fullWidth`; + oddiy `<button>` atributlari (`type` standart `button`) |
| `Card` | `padding`: `none` \| `sm` \| `md` \| `lg`; `variant`: `default` \| `hero` \| `soft` \| `plain` |
| `CardHeader` | `title`, `description`, `actions`, `icon`, `bordered` (padding="none" kartada) |
| `StatCard` | `title`, `value`, `hint`, `icon`, `tone`: `neutral`\|`brand`\|`success`\|`warning`\|`danger`\|`info`\|`violet` (ikonka belgisi rangi; success/warning/danger da raqam ham rangli), `variant`: `card`\|`hero`\|`plain`, `onClick` (bo'lsa tugma: hover + fokus), `active` |
| `Modal` | `open`, `onClose`, `title`, `description`, `footer`, `size`: `sm`\|`md`\|`lg`\|`xl`\|`full`, `closeOnBackdrop`, `closeOnEsc`, `flush` |
| `PageHeader` | `title`, `description`, `actions`, `icon` |
| `Badge` | `tone`: `neutral`\|`brand`\|`success`\|`warning`\|`danger`\|`info`\|`violet`; `variant`: `soft`\|`solid`; `size`: `sm`\|`md`; `dot`; `icon`. Yordamchi: `approvalTone(status)` |
| `Field` | `label`, `error`, `hint`, `required`, `htmlFor` |
| `Input` / `Select` / `Textarea` | native atributlar + `invalid`; `Input` da `leftIcon`. Xom element uchun `controlClass` |
| `TableContainer` | `maxHeightClass` (vertikal skroll + yopishqoq sarlavha), `bare` (karta ichida) |
| `Table`, `Thead`, `Tbody`, `Tr` (`clickable`), `Th` (`align`), `Td` (`align`, `numeric`) | jadval o'ramlari |
| `TableEmpty` | `colSpan`, `title`, `description`, `icon` |
| `EmptyState` | `title`, `description`, `icon`, `action` |
| `Spinner` / `Skeleton` / `LoadingBlock` | `size`: `sm`\|`md`\|`lg` / `className` / `label` |
| `DateRangeFilter` | `value: { mode, startDate, endDate }`, `onChange`, `modes`, `hideCustomRange` |
| `Tabs` / `SegmentedControl` | `items: { value, label, icon?, count? }[]`, `value`, `onChange`; Segmented: `size`, `fullWidth` |
| `LanguageSwitcher` / `ThemeToggle` | `variant`: `segmented`\|`cycle` / `withLabel` |
| `BrandMark` | Macmobi belgisi (SVG); o'lcham `className` orqali |

Misol — odatiy sahifa:

```tsx
const { t } = useTranslation();
const [range, setRange] = useState(() => defaultDateRange('month'));

<div className="space-y-4 sm:space-y-5">
  <PageHeader
    title={t('trust.title')}
    description={t('trust.subtitle')}
    actions={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={openAdd}>{t('common.add')}</Button>}
  />

  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
    <StatCard variant="hero" title={t('trust.debt')} value={formatMoney(debt)} icon={<Handshake />} />
    <StatCard title={t('common.income')} value={formatMoney(income)} tone="success" icon={<ArrowDownLeft />} />
    <StatCard title={t('approval.PENDING_APPROVAL')} value={pending} tone="warning"
              onClick={() => setFilter('PENDING_APPROVAL')} active={filter === 'PENDING_APPROVAL'} />
  </div>

  <Card padding="none">
    <CardHeader bordered title={t('trust.ledger')} actions={<DateRangeFilter value={range} onChange={setRange} />} />
    <TableContainer bare>
      <Table>
        <Thead><Tr><Th>{t('common.date')}</Th><Th align="right">{t('common.amount')}</Th><Th>{t('common.status')}</Th></Tr></Thead>
        <Tbody>
          {rows.length === 0 && <TableEmpty colSpan={3} title={t('common.noData')} />}
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td numeric>{formatDateTime(r.createdAt)}</Td>
              <Td align="right" numeric>{formatMoney(r.amount)}</Td>
              <Td><Badge tone={approvalTone(r.approvalStatus)}>{t(`approval.${r.approvalStatus}`)}</Badge></Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  </Card>

  <Modal open={open} onClose={close} title={t('trust.add')}
         footer={<>
           <Button variant="secondary" onClick={close}>{t('common.cancel')}</Button>
           <Button onClick={save} loading={saving}>{t('common.save')}</Button>
         </>}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('common.amount')} required error={errors.amount}>
        <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} />
      </Field>
      <Field label={t('accounts.label')}>
        <Select value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="CASH">{t('accounts.CASH')}</option>
        </Select>
      </Field>
    </div>
  </Modal>
</div>
```

Sana va pul (`utils/format.ts`): `formatMoney`, `formatNumber`, `formatPercent`,
`formatDate` → `DD.MM.YYYY`, `formatDateTime` → `DD.MM.YYYY HH:mm`, `formatTime` — **har doim Asia/Tashkent**;
`todayYmd()`, `toYmdTashkent(date)`, `addDaysYmd(ymd, n)`, `periodRange(mode)`.
`new Date().toISOString().slice(0,10)` yoki `toLocaleDateString()` ishlatmang — `todayYmd()` / `formatDate()` bor.

Real vaqt (`context/SocketContext.tsx`): `useRealtime('deals:updated', () => reload())` —
hodisalar: `deals:updated`, `dds:updated`, `trust:updated`. Ulanish bo'lmasa jim turadi.

## 3. i18n

- Tillar: `uz | ru | en`. Tanlov `localStorage['finmodel_lang']`.
- `const { t, language } = useTranslation();`
  - `t('common.save')`
  - `t('x.count', { count: 5 })` — matnda `{count}`
  - `t('x.key', 'Zaxira matn')` — eski imzo ham ishlaydi; `t('x.key', 'Zaxira {n}', { n: 1 })`
  - Qidiruv tartibi: joriy til → uz → fallback → kalitning o'zi. Dev rejimida yetishmayotgan kalit konsolga bir marta chiqadi.
- **Modul qo'shish:** `client/src/i18n/modules/<modul>.ts` faylini yarating — boshqa hech narsaga tegmang
  (LanguageContext `import.meta.glob` bilan o'zi yig'adi).

```ts
import { defineModule } from '../types';

export default defineModule({
  uz: { 'trust.title': 'Trust hisob-kitobi', 'trust.rows': 'Jami {count} ta yozuv' },
  ru: { 'trust.title': 'Расчеты Trust',      'trust.rows': 'Всего записей: {count}' },
  en: { 'trust.title': 'Trust settlements',  'trust.rows': '{count} entries in total' },
});
```

- Qoidalar: kalit `<modul>.<nom>`; uch tilda **bir xil** kalitlar; bitta kalit faqat bitta modulda;
  `isRu ? 'a' : 'b'` yoki `language === 'uz' ? ...` yozilmaydi; `alert/confirm` matnlari ham `t()` orqali.
- Avval tayyor kalitlarni ishlating: `common.*` (save, cancel, delete, edit, add, close, search, filter, loading,
  noData, confirm, yes, no, actions, total, date, time, amount, status, name, phone, comment, export, refresh, error,
  success, required, today, week, month, all, from, to, apply, reset, back, details, saving, confirm_delete,
  load_error, save_error, delete_error ...), `period.*`, `roles.<ROLE>`, `accounts.<ACCOUNT>`,
  `approval.<STATUS>` + `approve/reject/rejectReason`, `dealStatus.<STATUS>`, `paymentStatus.<STATUS>`,
  `errors.*` (network, forbidden, unauthorized, server, validation), `menu.*`, `title.*`.
- Tekshiruv (client papkasidan): `node src/i18n/check-keys.mjs` — kalitlar to'plami, takrorlar, `{o'zgaruvchi}`lar.
- `legacy.ts` ichida eski `deals.*`, `phone.*`, `dash.*` kalitlari turibdi. O'z modulingizni (`deals.ts` ...)
  yaratsangiz, ularni o'sha yerga **ko'chiring** (nusxalamang — takror xato beradi).

## 4. Sahifani o'tkazish nazorat ro'yxati

1. Eski klass → token (token klassiga `dark:` yozilmaydi; eski `dark:...` juftini o'chiring):

| Eski | Yangi |
|---|---|
| `text-gray-900`, `text-slate-900/800`, `text-black`, `dark:text-white` jufti | `text-fg` |
| `text-gray-700/600`, `text-slate-700/600` | `text-fg-secondary` |
| `text-gray-500/400`, `text-slate-500/400` | `text-fg-muted` |
| `bg-white`, `bg-white dark:bg-slate-900` | `bg-surface` |
| `bg-gray-50/100`, `bg-slate-50/100`, `dark:bg-slate-800` | `bg-surface-2` |
| modal/dropdown foni | `bg-elevated` |
| `border-gray-200/100`, `border-slate-200`, `dark:border-slate-800` | `border-line` |
| `border-gray-300`, `border-slate-300` | `border-line-strong` |
| `divide-gray-100`, `divide-slate-100` | `divide-line` |
| `bg-emerald-600 text-white` (asosiy tugma), `bg-indigo-600`, gradient tugmalar | `<Button>` (`bg-brand text-brand-fg`) |
| `text-emerald-600/700`, `bg-emerald-50/100` | `text-success`, `bg-success-soft` |
| `text-red/rose-600`, `bg-red/rose-50` | `text-danger`, `bg-danger-soft` |
| `text-amber/yellow-600`, `bg-amber-50` | `text-warning`, `bg-warning-soft` |
| `text-blue/indigo/cyan/purple-600`, `bg-blue-50` | `text-info` / `bg-info-soft` yoki `text-accent` / `bg-brand-soft` |
| `card-3d`, `rounded-2xl/3xl shadow-xl` kartalar | `<Card>` |
| `btn-3d ...` | `<Button>` |
| `pill-3d ...` holat yorliqlari | `<Badge tone=...>` |
| `table-3d`, qo'lda yozilgan `<table>` | `TableContainer/Table/Th/Td` |
| qo'lda yozilgan `fixed inset-0 ...` modal | `<Modal>` |
| `<input className="w-full border ...">` | `<Field><Input/></Field>` |
| spinner div (`animate-spin border-4 ...`) | `<Spinner>` / `<LoadingBlock>` |

2. Barcha matnlar `t()` orqali (sarlavha, tugma, ustun, placeholder, `title`/`aria-label`, alert/confirm, bo'sh holat),
   uch tilda; modul fayli qo'shilgan; `node src/i18n/check-keys.mjs` → OK.
3. Sanalar `formatDate/formatDateTime`, pul `formatMoney/formatNumber` + `tabular-nums`.
4. Mobil (375px): gridlar `grid-cols-1`/`grid-cols-2` dan boshlanadi, jadval `TableContainer` ichida, tugmalar 44px,
   gorizontal sahifa skrolli yo'q, `PageHeader` amallari sarlavha ostiga tushadi.
5. Mantiq, API chaqiruvlari, marshrutlar o'zgarmagan.
6. Tekshiruv: sahifa faylida quyidagi grep bo'sh chiqishi kerak —
   `grep -nE "(^|[\" '\`])(text-gray-900|text-slate-900|text-black|bg-white)([\" '\`]|$)" src/pages/XPage.tsx`
   va `cd client; npm run build` xatosiz.

## 5. Xavfsizlik to'ri va `.keep-colors`

Hali o'tkazilmagan sahifalar ikkala rejimda o'qilishi uchun `index.css` da (`@layer components`) global qoidalar bor:

- **Dark:** `dark:` varianti yo'q `text-gray/slate-900…500`, `text-black` → matn tokenlari; `bg-white`, `bg-gray/slate-50/100/200` → sirt tokenlari;
  `border-gray/slate-100…300`, `divide-*` → `line`; rangli oilalar (`bg-emerald-50/100/200`, `text-emerald-600…900`,
  `border-emerald-100…300`, gradient `from-/to-*-50/100` va h.k.) → shaffof fon / och matn; `hover:` juftlari ham.
- **Light:** dark uchun yozilgan och rangli matn (`text-cyan-300`, `text-amber-400` ...) → to'qroq tus (600/700);
  eski neytrallar (`text-gray/slate-900…500`, `bg-gray/slate-50/100`, `border-gray/slate-100…300`, `divide-*`) → yangi sovuq palitra tokenlari
  (iliq kulrang "dog'"lar qolmasin). `text-*-400` ga tegilmaydi — u ko'pincha to'q fon ustida turadi.
- Forma elementlari, placeholder, autofill, `select option`, klasssiz `thead th`, skrollbar — tokenlar bo'yicha.
- Chop etishda (`@media print`) tokenlar har doim yorug' palitraga qaytadi; `.no-print` elementlar yashiriladi.

To'r `dark:` varianti bilan bir xil o'ziga xoslikda va undan **oldin** chiqadi, shuning uchun `dark:...` yozilgan
joyda doim `dark:` yutadi; to'r faqat variantsiz elementlarga tegadi.

**`.keep-colors`** — ataylab oq/qora (yoki aniq rangli) bo'lishi kerak bo'lgan blok uchun: QR-kod va skaner oynasi,
chek/hujjat ko'rinishi (oq qog'oz), rasm ustidagi yozuvlar. Klassni elementning o'ziga yoki o'rab turgan
konteynerga qo'ying — ichidagi hamma narsada to'r o'chadi:

```tsx
<div className="keep-colors bg-white text-black p-4">  {/* dark rejimda ham oq qog'oz */}
  <QRCode ... />
</div>
```

Eslatma: `text-white` va to'q fonlar (`bg-slate-900`, `bg-emerald-600` ...) to'r tomonidan o'zgartirilmaydi —
rangli tugma ustidagi oq matn buzilmaydi. Yangi kodda to'rga tayanmang: to'g'ridan-to'g'ri tokenlardan foydalaning.

Eski `card-3d`, `btn-3d`, `pill-3d`, `table-3d` klasslari ishlaydi (`card-3d` yangi kartaga tenglashtirilgan),
lekin yangi kodda ishlatilmaydi.

## 6. Qobiq (yon menyu, yuqori panel)

- **Yon menyu** (`Sidebar.tsx`) ikkala mavzuda to'q ko'k (`.fm-nav`), kengligi 256px (`w-64`; `App.tsx` da `lg:pl-64`).
  Bandlar bir qatorli; eski tavsif (`menu.<key>_sub`) faqat `title` (hover) da. Faol band — brend ko'k "tabletka" +
  to'q sariq nuqta. Bo'limlar: (Dashboard) / **Savdo** / **Moliya** / **Jamoa** / **Sozlamalar** — `MENU` dagi `group`
  maydoni va `menu.group.*` kalitlari (`nav.ts`). Yangi marshrut qo'shsangiz `group` ni ham bering.
  4 tadan kam bandi bor rollarda (operator) bo'lim nomlari ko'rsatilmaydi.
- Yordamchi amallar (eksport, AI, bildirishnoma, o'rnatish) desktopda yuqori panelda, mobil menyuda esa pastda.
- **Yuqori panel** (`Header.tsx`) sahifa foni bilan bir xil (shaffof-xira). Sahifa nomi u yerda faqat `xl+` da, sokin —
  asosiy sarlavha har doim sahifadagi `PageHeader`.
- **Pastki panel** (`BottomNav.tsx`, mobil): faol tab ikonkasi `bg-brand-soft` tabletka ichida.
