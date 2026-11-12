# i18n hisoboti

Holat: asos qurilgan, 8 ta kichik sahifa va layout uch tilga (uz / ru / en) o'tkazilgan.
Qoidalar va modul qo'shish tartibi — `docs/DESIGN_SYSTEM.md`, 3-bo'lim.

## 1. Modullar va kalitlar soni

`cd client; node src/i18n/check-keys.mjs` natijasi (uch tilda kalitlar to'plami bir xil, takror yo'q,
`{o'zgaruvchi}`lar mos):

| Modul (`client/src/i18n/modules/`) | Nima | uz | ru | en |
|---|---|---|---|---|
| `common.ts` | Umumiy tugma/yorliqlar (`common.*`) | 113 | 113 | 113 |
| `nav.ts` | Menyu, sarlavhalar, yuqori panel, qobiq (`menu.*`, `title.*`, `header.*`, `layout.*`) | 92 | 92 | 92 |
| `navShort.ts` | Mobil pastki panel qisqa yorliqlari (`menu.short.*`) | 14 | 14 | 14 |
| `domain.ts` | `accounts.*`, `approval.*`, `dealStatus.*`, `paymentStatus.*`, `errors.*`, eski `status.*` | 36 | 36 | 36 |
| `roles.ts` | 13 rol + `roles.unknown` | 14 | 14 | 14 |
| `period.ts` | Davr filtri (`period.*`) | 11 | 11 | 11 |
| `auth.ts` | Kirish sahifasi | 11 | 11 | 11 |
| `legacy.ts` | Eski `deals.*`, `phone.*`, `dash.*` (keyin o'z modullariga ko'chiriladi) | 27 | 27 | 27 |
| `references.ts` | ReferencesPage | 82 | 82 | 82 |
| `botPayments.ts` | BotPaymentsPage | 65 | 65 | 65 |
| `botDeals.ts` | BotDealsPage | 32 | 32 | 32 |
| `agentSwot.ts` | AgentSwotPage | 34 | 34 | 34 |
| `balance.ts` | BalancePage | 24 | 24 | 24 |
| `daily.ts` | DailyAccountingPage | 32 | 32 | 32 |
| `finmodel.ts` | FinModelPage | 41 | 41 | 41 |
| **Jami** | | **628** | **628** | **628** |

Eski LanguageContext'dagi ~155 kalitning hammasi nomi o'zgarmagan holda ko'chirilgan (mavjud `t()` chaqiruvlari ishlaydi)
va EN tarjimasi qo'shilgan. Matni o'zgarganlar: `menu.all` ("Barchasi" → "Menyu" — pastki paneldagi tugma),
`menu.users` / `menu.users_sub` (avval lug'atda yo'q edi, fallback bilan chiqardi).

To'liq o'tkazilgan fayllar (qotirilgan matn va `isRu ? :` qolmagan): `App.tsx`, `components/Sidebar.tsx`, `Header.tsx`,
`BottomNav.tsx`, `components/ui/*`, `context/SocketContext.tsx`, `pages/LoginPage`, `BalancePage`, `DailyAccountingPage`,
`FinModelPage`, `AgentSwotPage`, `BotDealsPage`, `BotPaymentsPage`, `ReferencesPage`, `TrustPage`, `TeamPage`.

Ataylab tarjima qilinmaganlar: brend nomi ("Macmobi ERP"), til nomlari (`O'zbekcha / Русский / English`),
provayder/ilova nomlari (BotPayments tanlovidagi `Imanum`, `Alif 6 oylik` ... — bular API'ga yuboriladigan qiymat),
server javobidagi matn bilan solishtirish (`DailyAccountingPage`: `'В НОРМЕ'`, `'дефицита'`), AgentSwot standart
agentlik nomi (`'Асадбек'` — ma'lumot qiymati).

## 2. O'tkazilMAGAN fayllar — qotirilgan matnlar sanog'i

Usul: regex asosidagi taxminiy sanoq (grep darajasida; ±15% xato bo'lishi mumkin).

- **JSX matn** — teglar orasidagi harfli matn tugunlari (`>Matn<`).
- **Atribut** — `placeholder / title / label / aria-label / alt` ichidagi qotirilgan satr.
- **Dialog** — `alert( / confirm( / prompt(` ga to'g'ridan-to'g'ri berilgan satr.
- **Ternary** — `isRu ? ... : ...` yoki `language === 'ru'|'uz' ? ...` (har biri kamida 2 ta matn; EN yo'q — inglizchada o'zbekcha chiqadi).
- **t()** — fayldagi mavjud `t('...')` chaqiruvlari; **yo'q kalit** — ulardan lug'atda topilmaganlari.
- **Dark xavf** — `dark:` variantsiz `text-gray-900 | text-slate-900 | text-black | bg-white` soni (hozir xavfsizlik to'ri yopib turadi).

| Fayl (`client/src/`) | Qator | JSX matn | Atribut | Dialog | Ternary | t() | Yo'q kalit | Dark xavf | **Jami matn** |
|---|---|---|---|---|---|---|---|---|---|
| `pages/DealsPage.tsx` | 1902 | 64 | 11 | 12 | 0 | 56 | 0 | 58 | **87** |
| `pages/DashboardPage.tsx` | 729 | 13 | 0 | 0 | 94 | 0 | 0 | 28 | **107** |
| `pages/DdsPage.tsx` | 716 | 32 | 8 | 9 | 0 | 0 | 0 | 51 | **49** |
| `pages/FinancesSummaryPage.tsx` | 296 | 16 | 0 | 0 | 0 | 0 | 0 | 12 | **16** |
| `pages/AgentsPage.tsx` | 751 | 46 | 2 | 0 | 0 | 0 | 0 | 18 | **48** |
| `pages/UsersPage.tsx` | 857 | 0 | 10 | 0 | 44 | 0 | 0 | 0 | **54** |
| `pages/SalesPage.tsx` | 1107 | 68 | 12 | 13 | 0 | 0 | 0 | 52 | **93** |
| `pages/WarehousePage.tsx` | 927 | 61 | 7 | 9 | 0 | 1 | 0 | 48 | **77** |
| `pages/HrManagementPage.tsx` | 994 | 87 | 6 | 5 | 0 | 0 | 0 | 39 | **98** |
| `pages/LeadsPage.tsx` | 743 | 85 | 5 | 2 | 0 | 0 | 0 | 24 | **92** |
| `pages/DebtorsPage.tsx` | 571 | 35 | 6 | 0 | 0 | 1 | 0 | 12 | **41** |
| `pages/InventoryPage.tsx` (marshrutga ulanmagan) | 910 | 42 | 9 | 6 | 0 | 18 | 0 | 8 | **57** |
| `pages/HandoverPage.tsx` (marshrutga ulanmagan) | 665 | 40 | 2 | 1 | 0 | 0 | 0 | 21 | **43** |
| `components/AIAssistantModal.tsx` | 410 | 18 | 3 | 0 | 4 | 0 | 0 | 7 | **25** |
| `components/BarcodeScannerModal.tsx` | 269 | 9 | 1 | 0 | 0 | 0 | 0 | 8 | **10** |
| `components/ExportModal.tsx` | 490 | 11 | 0 | 1 | 21 | 0 | 0 | 9 | **33** |
| `components/InstallAppModal.tsx` | 285 | 36 | 1 | 0 | 0 | 0 | 0 | 5 | **37** |
| `components/PhoneSelector.tsx` | 380 | 6 | 3 | 0 | 0 | 2 | 0 | 8 | **9** |
| `components/AmountInput.tsx` | 83 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **Jami** | | | | | | | | | **≈ 976** |

Izohlar:

- Ternary ustunidagi har bir yozuv amalda ikki matn, shuning uchun `DashboardPage` (94), `UsersPage` (44), `ExportModal` (21)
  uchun haqiqiy kalitlar soni ko'rsatilganidan ko'p emas, lekin har biriga EN tarjima yozish kerak.
- JSX ichidagi shablon satrlar (`` `${n} ta` ``), massiv/obyektlarda e'lon qilingan yorliqlar (`label: 'Naqd'`, status xaritalari)
  bu sanoqqa to'liq kirmaydi — ayniqsa `DealsPage`, `HrManagementPage`, `LeadsPage`, `UsersPage` da qo'shimcha 10–30 tadan bo'lishi mumkin.
- Mavjud `t()` chaqiruvlarida lug'atda yo'q kalit **topilmadi** (0): `DealsPage` (56), `InventoryPage` (18), `PhoneSelector`,
  `WarehousePage`, `DebtorsPage` ishlatgan barcha kalitlar ko'chirilgan va EN'da ham bor.

## 3. Yetishmayotgan kalitlar — keyingi agentlar uchun

Yangi modul fayllari (har biri o'z prefiksida, uch tilda):

| Modul fayli | Sahifa | Taxminiy yangi kalitlar | Tayyor kalitlardan foydalaning |
|---|---|---|---|
| `deals.ts` | DealsPage (+ `legacy.ts` dan `deals.*` ni ko'chirish) | 90–120 | `common.*` (customer, provider, store, limit, withdrawn_limit, product_qty, imei_barcode ...), `dealStatus.*`, `paymentStatus.*`, `approval.*`, `period.*` |
| `dashboard.ts` | DashboardPage (+ `legacy.ts` dan `dash.*`) | 90–100 (94 ternary) | `period.*`, `common.total/profit/margin` |
| `dds.ts` | DdsPage | 45–55 | `accounts.*`, `common.income/expense/amount/date_time`, `period.*`, `approval.*` |
| `finances.ts` | FinancesSummaryPage | 15–20 | `accounts.*`, `common.total` |
| `agents.ts` | AgentsPage | 45–55 | `common.agency/agent_commission`, `period.*`, `roles.AGENT` |
| `users.ts` | UsersPage | 50–60 (44 ternary) | `roles.*`, `common.username/password/fullName/role/active/inactive` |
| `sales.ts` | SalesPage | 90–100 | `common.sale_price/profit/margin/seller`, `paymentStatus.*`, `accounts.*` |
| `warehouse.ts` | WarehousePage (va ishlatilsa InventoryPage) | 75–85 | `dealStatus.*`, `common.product_name/imei_barcode/quantity` |
| `hr.ts` | HrManagementPage | 100–120 | `roles.*`, `common.*` |
| `leads.ts` | LeadsPage | 90–100 | `common.phone/comment/status`, `roles.CALL_CENTER_*` |
| `debtors.ts` | DebtorsPage | 40–45 | `common.amount/phone/date`, `paymentStatus.*` |
| `trust.ts` | TrustPage (yangi) | — | `approval.*`, `accounts.*`, `period.*`, `title.trust`, `menu.trust*` |
| `team.ts` | TeamPage (yangi) | — | `roles.OPERATOR/AGENT`, `common.username/password/active`, `title.team`, `menu.team*` |
| `phone.ts` | PhoneSelector (+ `legacy.ts` dan `phone.*`) | 8–10 | — |
| `exportModal.ts`, `aiAssistant.ts`, `installApp.ts`, `scanner.ts` | umumiy modallar | 33 / 25 / 37 / 10 | `common.close/cancel/download/export` |

`common.ts` da yo'q, lekin bir nechta sahifada takrorlanadigan matnlar (kerak bo'lsa `common.ts` ga **bitta agent** qo'shsin,
parallel qo'shilsa to'qnashadi — yaxshisi o'z modulingizga yozing):
"Jami {count} ta", "Tanlanmagan", "Barcha agentlar", "Barcha sanalar", "Yuklab olish (Excel)", "Chop etish",
"Batafsil ko'rish", "Qator qo'shish", "O'zgarishlar saqlandi", "Ruxsat yo'q", "Fayl tanlash", "Rasm yuklash".

## 4. Eslatmalar

- `t(key, 'fallback')` chaqiruvlari saqlanishi mumkin, lekin fallback faqat o'zbekcha matn beradi — kalit uch tilda lug'atda bo'lishi shart.
- Dev rejimida yetishmayotgan kalit konsolga bir marta chiqadi: `[i18n] Kalit topilmadi: "x.y" (en)`.
- Til tanlovi: `localStorage['finmodel_lang']` (`uz | ru | en`); almashtirgich — Header (mobilda ixcham tugma), Sidebar pasti, Login.
- Server qaytaradigan xato matnlari (`err.response.data.error`) tarjima qilinmaydi — ular server tilida chiqadi.
