# FinModel / Macmobi ERP — loyiha holati va ish qoidalari

Bu fayl yangi suhbatda ishni davom ettirish uchun. Oxirgi yangilanish: 2026-11-16.

## ENG YANGI HOLAT — 2026-11-16 (yangi suhbat shu yerdan boshlasin)
Hammasi JONLIDA (server + klient deploy qilingan, oxirgi deploy 15.11 kech). **Git'ga COMMIT QILINMAGAN** (14–15.11 dagi hamma ish faqat ishchi papkada), GitHub'ga push yo'q.
Batafsil tarix — pastdagi "YANGI SUHBAT UCHUN" bo'limidagi bandlarda; bu yerda faqat hozirgi raqamlar va ochiq ishlar.

**16.11 (egasi "Ha, 01.11 dan" va "Ha, yoz va chiqar" dedi; JONLIDA, commit yo'q):** Qodir aka do'konida ALIF orqali (online/offline/nasiya) bizning foyda 5%, Finsum va boshqalar 6%;
ulush 22% va agent foydasi o'zgarmaydi. Kod: `calculation.service.ts` `QODIR_ALIF_PROFIT_RATE`, `qodirProfitRate` (resolveCommission ichida, spravochnik qoidasidan ham ustun — Spravochnikda ko'rinmaydi). Testlar 339/339.
Zaxira `backups/db-raw-db-2026-11-16T07-29-18-879Z.json`; recalc-deals --apply --skip-store-ledger: 36 bitim (foyda 264 307 630 → 261 303 930), backfill-store-ledger --apply: 36 yozuv; ikkalasi qayta dry-run 0; server deploy.
Qodir aka HOZIR: berishi kerak 258 714 260, to'langan 9 800 000, qoldiq 248 914 260 (pastdagi 15.11 raqamlari eskirgan). O'qish skripti: `scripts/report-qodir-providers.ts`.
Egasining 16.11 ish ro'yxati (bugun bitishi kerak): Daftar plyus-minus va to'liq to'g'rilash; Ishonch (Trust)/Anvar; xato arizalarni yo'qotish; kiritilmagan xarajat/foyda; fakt summalar bilan tenglashtirish — hammasi egasi ma'lumotini kutadi.
Angren/Novza telefonlari, xolodilnik, Isfandiyor puli — egasi: "bularning aloqasi yo'q, qo'shma".

**16.11 AVARIYA — Sheets sinxronlashi 199 bitimni buzdi (TIKLANDI, egasi "o'zing to'g'rilab ber" dedi):** 16.11 12:52 (Toshkent) da Google Sheets → sayt bitim sinxronlashi ishlagan;
"Сделки_и_Склад" varag'iga ustun qo'shilgani uchun (sinxronlash ustunni TARTIB RAQAMI bilan o'qiydi: `sheetsSync.service.ts` getCell(24) tovar, getCell(29) agentlik) 199 eski bitimda agentlik = holat so'zi ("Надо покупать"...),
operator = agent nomi, tovar = raqam, foyda 0, holat NEED_TO_BUY bo'lib qolgan; o'chirilgan #3699/#3702/#3703 qayta yaratilgan; 6 soxta agentlik, 30 operator yozuvi, 97 xaridor paydo bo'lgan. DDS/kassa buzilmagan.
Tuzatish: `sync.routes.ts` `DEALS_SYNC_DISABLED = true` (webhook/cron/qo'lda — bitim sinxronlashi O'CHIRILGAN, DDS sinxronlashi va dry-run ishlaydi; server deploy qilingan);
zaxira `backups/db-raw-db-2026-11-16T08-14-11-354Z.json` (buzilgan holat), tiklash manbai `db-raw-db-2026-11-16T07-29-18-879Z.json`; `scripts/restore-after-sheets-sync-1611.ts --apply` (BIR MARTALIK, QAYTA ISHLATMA): 199 bitim tiklandi,
3 bitim va soxta yozuvlar o'chirildi; keyin recalc-deals --apply (36 Qodir/Alif), qayta dry-run 0, do'kon daftari dry-run 0. Hozir: 260 bitim, kompaniya foydasi 264 053 930, agent 123 378 796.
SINXRONLASHNI QAYTA YOQMA — avval ustunlarni SARLAVHA bo'yicha o'qiydigan qil va sarlavha mos kelmasa to'xtaydigan himoya qo'sh. Kim ishga tushirgani aniqlanmagan (webhook yoki "Sinxronlash" tugmasi).
O'qish skriptlari (xavfsiz): `report-db-diff.ts <zaxira>` (hamma jadval; DIQQAT — User jadvalida parol maydonlarini ham chiqaradi), `report-deal-diff.ts`, `report-deal-changes.ts`, `report-daftar.ts`, `report-trust-anvar.ts`.
Daftar to'ldirish jadvali (egasi to'ldiradi): `1IZop4peXDJtrP3hqz77bNxDR1iuqYJ4tITVbNKtu8TA`. Trust: 34 chek, 8 tasi Anvarniki; DDS'da "Ишонч" so'zi bor (TX-1015, TX-1020) — "Ishonch" = Trustmi, egasidan so'ralgan, javob yo'q.

**Jonli bazadagi hozirgi holat (15.11 kech o'qilgan):**
- **Umirzoq (xaridor):** 52 sotuv, jami 510 887 000, bergan puli 459 621 500, QARZI 51 265 500 (№58 sotuv 41 459 670; #8123 5 205 080; #8128 4 600 750).
  Yangi to'lov — DDS → "Yangi operatsiya" → Kirim → "Umirzoq" tugmasi (eng eski chekdan ayiradi, kassaga kirim yozadi).
- **Qodir aka:** 37 chek (01–11.11), limit 311 569 000, bizning 6% foyda 18 694 140, u berishi kerak 261 717 960, to'langan 9 800 000, qoldiq 251 917 960.
  DDS'da hisobga OLINMAGAN ikki kirim bor: TX-1062 17 925 000 ("Кодир ака расчет болди 07.11 гача") va TX-1060 10 000 000 ("карзни берди") — egasidan so'ralgan, javob yo'q.
- **Daftar (`/daftar`):** 19 chek — Denov 16, Jizzax 3; hammasi 1-bosqichda (narxlar kiritilmagan), #3644 "Sotildi" lekin narxsiz. Novza KIRMAYDI.
- **Trust:** 34 chek, limit 369 700 000, sayt qarzni 16% = 59 152 000 deb hisoblaydi, Trust 250 000 000 bergan (TX-1202) → qoldiq −190 848 000.
  Bu noto'g'ri ko'rinadi: Trust bitta chek uchun bizga qancha berishi kerak (to'liq limit / limit−16% / faqat 16%) — egasidan so'ralgan, javob YO'Q. Formulani TAXMIN QILMA.
- **Kassa:** naqd 135 606 600; karta −21 425 950; hisob-raqam 250 000 000. DDS to'liq emas: 04–10.11 chek to'lovlari yozilmagan, boshlang'ich qoldiq yo'q;
  #8099 va #8100 chek to'lovi ikki marta yozilgan (TX-1095/TX-1170, TX-1096/TX-1169; jami 7 434 050) — egasi "tegma" dedi.
- **Omborda:** #3649, #3653 (iPhone 16) — egasi buyrug'i bilan Umirzoq sotuvidan qaytarilgan.
- **Rollar:** Kuzatuvchi (VIEWER) endi hamma bitimni ko'radi, o'zgartira olmaydi (login `kuzatuvchi` jonlida bor; parolini yangilash aytilgan).

**Egasi javobini kutayotgan savollar:**
1. Trust bitta chek uchun bizga qancha beradi (yuqorida).
2. Qodir aka: TX-1062 va TX-1060 to'lovmi; "07.11 gacha hisob-kitob bo'ldi" degani 07.11 gacha qarz yopilganimi.
3. Umirzoq: DDS'dagi TX-1031 (05.11, 3 000 000) ham uning qarzidan ayrilsinmi.
4. Operatori yozilmagan cheklar #8110, #8111, #8121; #3730 (saytda Asadbek/Manzura, jadvalda Apple).
5. Jadvalga tenglashtirishdan qolgan 3 ta manfiy komissiya (#3640, #8094, #3730) — manfiyga ruxsatmi.
6. Git commit / GitHub push qilinsinmi (repo holati: 2 kunlik ish commit qilinmagan).

**Bir martalik skriptlar (QAYTA ISHLATMA):** `move-sold-to-umirzoq.ts`, `apply-buyer-payments.ts`, `fix-umirzoq-1511.ts`, `apply-team-sheet.ts`, `merge-operator-duplicates.ts`.
Qayta ishlatsa bo'ladiganlar (avval dry-run): `recalc-deals.ts`, `backfill-store-ledger.ts`, `set-sale-prices.ts --set=<chek>:<so'm>`, `cancel-sale-payments.ts --sale=N`, `backup-db-raw.ts`.

**Egasining Google Sheets fayllari (men yaratganlar, uning Drive'ida):** agentlar hisoboti `15zJF7cqOdLQWZwWhg7-hCQ1_lWQ-DV6fbM8SZQHrJfc`; Qodir aka jadvali `1ZAAIG8YTwcluiBTny7TylX7dIjP7Jh1QTRcninQO8jA`;
Daftar `1I_ocdVVgp5NZQZC9v21IJ0P6fJIv18wMt_GcpJIfAWs`; Umirzoq narxlari (to'ldirilgan) `1OsyxOsAcuGPIZKPzEeXjiT-_6PDLU0JZUAI4LueWG4I`. Mavjud Sheets ichini tahrirlab bo'lmaydi — faqat yangi fayl yaratiladi.
Egasining manba jadvallari: "Фин модел" `1Xas4V79zUAOQGx0ZePPd-VwhhARE3-nsq98rL9vEvUo` (Сделки_и_Склад gid 909576334, ведомость gid 1421385214, "Daftar" varag'i), jamoalar `1zHW8R0PKYB6_T4MQgQs6rNlYZRRarIsbCj5PtaheWC8`.

**Ish uslubi bo'yicha saboqlar (15.11):** hisobot/formula TAXMIN QILINMAYDI — avval raqamli misol bilan tugmali savol; jonli bazaga yozish faqat egasining ANIQ "ha"si bilan
(boshqa savolga javob ruxsat emas); har yozishdan oldin zaxira + dry-run; bazadagi IMEI ma'lumoti chala — IMEI bo'yicha taxminiy bog'lama.

## YANGI SUHBAT UCHUN — qayerda to'xtadik (2026-11-14, kechki sessiya)
**Holat (14.11, egasi buyrug'i bilan): KOD JONLIDA** — zaxira `backups/db-raw-db-2026-11-14T02-24-06-211Z.json`, jonli bazaga sxema qo'shildi
(`prisma db push`), Vercel `server` ga VAPID_* qo'shildi, server va klient deploy qilindi. **Commit QILINMAGAN** (ishchi papkadan deploy), GitHub'ga push yo'q.
**Jonli MA'LUMOT YOZILDI (14.11, egasi "Ha, yoz" dedi; zaxira `backups/db-raw-db-2026-11-14T02-31-34-036Z.json`):** seed-commission-rules,
merge-references, recalc-deals (176 bitim, `--skip-store-ledger` bilan; qayta dry-run: 0 o'zgarish), create-operator-logins (42 yaratildi, 1 bog'landi,
`backups/operator_logins.2026-11-14T02-35-10-071Z.txt`). `backfill-store-ledger --apply` ham bajarildi (zaxira `db-raw-db-2026-11-14T02-37-40-338Z.json`; 38 yangi + 1 yangilandi, jami 53 yozuv,
do'konlar bizga 369 663 040; qayta dry-run: 0 o'zgarish). **HALI YOZILMAGAN:** `move-checks-to-dds` (egasi 2 ta qo'lda kiritilgan chiqim haqida javob bermagan).
Quyidagi ro'yxat — o'sha kungi dry-run tavsifi: `seed-commission-rules` (18 eski → 18 yangi qoida,
"Variant offline" provayderi yaratiladi), `merge-references` (Payletar→Paylater, Tursunquruva Shaxlo→Tursunqulova Shahlo), `recalc-deals`
(243 tadan 176 bitim; foyda 20 784 221 → 227 695 180, agent 127 890 946 → 118 041 246; `--default-rules` bilan ko'rilgan), keyin `backfill-store-ledger`
(seed'dan KEYIN dry-run qil), `create-operator-logins` (42 yaratiladi, 1 bog'lanadi; agent Jamoa sahifasini ochsa ham avtomatik yaratiladi).
Seed qilinmaguncha jonlida yangi bitimlar ESKI spravochnik qoidalari bilan hisoblanadi (Qodir aka foydasi 22%, Imanum 22%, Green Bazar 35%).
Jonli bazada eski "Qodir aka to'lovi" yozuvlari yo'q (tekshirildi).
- **14.11 kunduzi (egasi buyrug'i bilan, hammasi JONLIDA, commit yo'q):**
  - Login sahifasi qayta bezatildi (`LoginPage.tsx`, `BrandMark animated`, `index.css` `.fm-login-*`, `.fm-logo-*`, `.fm-mascot*`; `auth.greeting_*` kalitlari) — klient deploy qilingan.
  - Takror operatorlar tuzatildi (zaxira `backups/db-raw-db-2026-11-14T10-28-54-309Z.json`, `scripts/merge-operator-duplicates.ts --apply`,
    hisobot `scripts/report-duplicate-users.ts`): BITTA agentlik ichidagi kirill/lotin juftlari (13 ta) birlashtirildi — lotincha Agent yozuvi qoldi,
    26 bitim ko'chdi, 12 ta "…2" login va `farida2` o'chirildi; turli agentlardagi bir xil ismlar loginiga agent qo'shildi (`ruxsora_asadbek`, `xosila_jahongir` …).
    **Egasi qoidasi: TURLI agentlardagi bir xil ismli operatorlar (Sevinch Jahongirda / Nazirbekda / Davlatbekda) boshqa-boshqa odam — HECH QACHON birlashtirilmaydi;
    bitta agent ichidagi kirill/lotin juftligi — bitta odam.** (Bu oldingi "operator ismlariga tegilmaydi" qarorini shu doirada almashtiradi.)
  - `team.service.ts`: agentning o'zi nomidagi Agent yozuviga operator logini ochilmaydi; login band bo'lsa `ism_agent` beriladi — server deploy qilingan.
  - Takror qayta paydo bo'lmasligi uchun: `calculation.service.ts` `personNameKey` (kirill = lotin, x = h) — bot (`bot.routes.ts`), Sheets sinxronlashi
    (`resolveAgent`) va spravochnik (agent qo'shish/tahrirlash) operatorni BITTA agentlik ichida shu kalit bilan qidiradi; `team.service` ham shuni ishlatadi.
    Testlar 334/334. Server deploy qilingan (14.11).
- **14.11 kechqurun (egasi "Ha, yoz va chiqar" dedi; JONLIDA, commit yo'q):**
  - Jamoalar egasining Google jadvali ("Agentar": xodim → rahbar, fayl `1zHW8R0PKYB6_T4MQgQs6rNlYZRRarIsbCj5PtaheWC8`) bo'yicha tartibga keltirildi:
    `scripts/apply-team-sheet.ts --apply` (zaxira `backups/db-raw-db-2026-11-14T12-22-27-315Z.json`, hisobot `backups/apply-team-sheet-apply-*.txt`).
    Anvarning 8 bitimi → Anvar agentligi; Xasan → Jahongir jamoasi (agentlik "Xasan" o'chirildi); Iroda (Jahongir) → Davlatbek; Хосила (Asadbek) → Jahongirdagi Xosila;
    "Нафиса" → "Nafisa"; "Ozoda" agentligi yaratildi; 35 ta operator spravochnikka qo'shildi. Summalar o'zgarmagan. Qayta dry-run: 0 o'zgarish.
    Nazirbekdagi "Рухсора" (#3549) — egasi: agent Nazirbek, operator Ruxsora (alohida odam, Nazirbekda qoladi). "Сугдиена" va "Sug'diyona" haqida egasi "boshqa-boshqa" dedi (men shunday tushundim) — BIRLASHTIRILMAYDI.
  - **Operator ulushi (FAQAT Jahongir jamoasi, egasi qarori):** har bitimning YECHILGAN LIMITIDAN 0.5% (Muyassar 155 900 000 → 779 500; egasi avval "agent foydasidan" variantini tanlab, keyin tuzatdi — limitdan);
    operatorning OYLIK yechilgan limiti 500 mln dan oshgan QISMIGA 0.7%; agent foydasidan ayrilmaydi, faqat ko'rsatiladi.
    Kod: `calculation.service.ts` `OPERATOR_SHARE_RULES`, `operatorShareRuleFor`, `calcOperatorShares`; `team.service.ts` `PeriodStats.operatorShare`;
    `/api/team/operators|summary|my-summary` (`operatorShareRule`); `TeamPage` "Operator ulushi" ustuni. Testlar 337/337. Jonli sahifa ko'z bilan tekshirilmagan.
  - **Anvar (egasi qarori, 14.11 kech):** agentlar ro'yxatida ALOHIDA qator bo'lib turadi, lekin uning cheklaridan agent foydasi HECH KIMGA hisoblanmaydi.
    Faqat HISOBOT darajasida: `calculation.service.ts` `NO_AGENT_COMMISSION_AGENCIES`, `isNoCommissionAgency`, `reportAgentAmount` —
    `/api/agents/deals` (totals, items), `/api/agents/commission-summary`, `/api/deals/totals` (totalAgentAmount). Saqlangan `Deal.agentAmount` / tannarx O'ZGARMAGAN.
    Operator (Jahongir jamoasi) Bitimlar sahifasida agent summasi o'rniga "Mening ulushim" ko'radi (`/api/deals` `operatorShare`, `/api/deals/totals` `operatorShare`).
  - **Jadval ("Фин модел" ведомость) bilan solishtirish 01–10.11:** bitim soni/limit/mijozga — to'liq mos (187 / 1 278 469 000). Agent foydasi farqi sabablari (egasi javobi kutilmoqda):
    Green Bazar jadvalda 35% (saytda 30), 7 ta Variant bitimi jadvalda oflayn 22% (saytda onlayn 27), "Iman daftar" foizi yo'q (#3728 agentga 30% ketgan), jadvalda manfiy komissiya bor (#3640, #8094).
  - **Jadvalga tenglashtirish (egasi: "jadval hisoboti bilan sayt to'g'ri chiqishi kerak"; JONLIGA YOZILDI 14.11 kech — zaxira `backups/db-raw-db-2026-11-14T14-03-21-013Z.json`, seed-commission-rules --apply (22 qoida), recalc-deals --apply --skip-store-ledger (53 bitim; qayta dry-run 0; do'kon daftari dry-run 0 o'zgarish), server+klient deploy; Anvar qoidasi va operator jadvali ham chiqdi):**
    manba — "Фин модел" jadvali, varaq Сделки_и_Склад (gid 909576334; 01–11.11, 202 chek; ID 3597, 3633–3636 jadvalda takror — saytda ular #8066, #8093, #8094, #8096, #8097).
    Chekma-chek: limit va mijozga — 202/202 mos. `DEFAULT_COMMISSION_RULES` ga sanali qoidalar (`SHEET_PARITY_END_YMD = 2026-11-11`): Green Bazar 35 (12.11 dan 30),
    Variant 22 (12.11 dan 27), Iman daftar 22 (faqat 11.11 gacha), Infin Bank 22 (12.11 dan 15). Jonli dry-run (`recalc-deals --default-rules`): 53 chek, agent 129 293 246 → 123 731 796.
    Tartib: zaxira → `seed-commission-rules --apply` → `recalc-deals` dry-run/apply → deploy. Qoladigan farq 518 400: jadvalda MANFIY agent komissiyasi (#3640 −278 400, #8094 −60 000, #3730 −180 000), saytda 0 — egasi hal qiladi.
    Jadvalning "Фойда" ustuni boshqa formulada (Qodir aka to'liq 22%, tovarli bitimda 0) — kompaniya foydasi tenglashtirilMAGAN.
  - **Qodir aka (egasi, 14.11 kech):** DDS'dagi "Инвистиция Кодир ака" (09.11, 57 692 000, TX-1075) — ALOHIDA investitsiya, uning chek qarzini yopishga HISOBLANMAYDI.
    "Qodir aka prixod" (11.11, 9 800 000, TX-1159) — qarzga to'lov, lekin kategoriyasi "Qodir aka to'lovi" emas, shuning uchun do'kon daftariga tushmagan (egasidan so'ralgan, javob yo'q).
    08–14.11: 11 chek, Qodir aka beradi 79 463 160. Do'kon daftari 10.11 dan boshlanadi — 01.11 dan boshlansinmi, javob yo'q.
  - **Daftar "Ha" qoidasi (egasi, 14.11 kech; JONLIGA YOZILDI — zaxira `backups/db-raw-db-2026-11-14T18-48-55-441Z.json`, recalc-deals --apply --skip-store-ledger: 33 bitim, qayta dry-run 0, do'kon daftari 0 o'zgarish; server+klient deploy):** FAQAT provayder Imanum (Imanium) VA do'kon Denov yoki Jizzax.
    Boshqa hamma holatda Daftar "Ha" bo'lmaydi; qo'lda belgilash va Sheets ustuni e'tiborga olinmaydi. Kod: `calculation.service.ts` `isDaftarDeal` (calculateDeal ichida majburiy),
    `sheetsSync.service.ts` dealFields, `scripts/recalc-deals.ts` endi isDaftar/extraDaftar/totalExtraBalance ni ham yozadi. Jonli dry-run: 33 bitim Ha → Yo'q
    (Novza/Imanum 25, Iman 3, Iman rebus 2, Planet Phone 1, Samarqand 1, Denov/"Iman daftar" 1), 18 ta "Ha" qoladi; kompaniya foydasi 252 105 473 → 337 344 473.
    Ochiq: "Iman daftar" provayderi Imanum hisoblanadimi (#3728, Denov)? Bitim formasidagi Daftar tugmasi endi ta'sir qilmaydi (olib tashlash/avtomatik qilish kerak).
  - **"Daftar boshqa, Qodir boshqa" (egasi, 14.11 tun; JONLIGA YOZILDI 15.11 — zaxira `backups/db-raw-db-2026-11-14T19-12-40-964Z.json`, backfill-store-ledger --apply 36 yozuv, link-qodir-payments --apply 1 kirim, qayta dry-run 0; Qodir aka: DEBT 37 ta 261 717 960, PAYMENT 9 800 000; deploy qilingan):** bitim formasidan Daftar tugmasi olib tashlandi
    (faqat avtomatik ko'rsatkich: Imanium + Denov/Jizzax); menyu/sarlavha "Qodir aka daftari" → "Qodir aka hisob-kitobi". Qodir aka hisobi 01.11.2026 dan
    (`QODIR_LEDGER_START_YMD`; boshqa do'konlar 10.11 dan qoladi). "Qodir aka prixod" kategoriyasi endi Qodir to'lovi deb taniladi; mavjud TX-1159 (9 800 000) ni
    `scripts/link-qodir-payments.ts` bog'laydi. Jonli dry-run: backfill-store-ledger 36 yangi yozuv (do'konlar qarzi 444 411 040 → 696 721 840), link 1 ta kirim.
    Yozilgach Qodir aka qoldig'i: 261 717 960 − 9 800 000 = 251 917 960. Investitsiya (TX-1075) bog'lanMAYDI.
  - **Daftar sahifasi (egasi, 15.11; SAYTGA CHIQARILGAN, jonli sahifa ko'z bilan tekshirilmagan):** `/daftar` — "Daftar Denov" va "Daftar Jizzax" alohida bo'limlar (Qodir aka bu yerga kirmaydi).
    Ko'rsatkichlar: tovar olingan, sotilgan, foyda (+kutilayotgan), tovar olish kerak, qoldiqlar (olinmagan tovar, ombordagi tovar, xaridor qarzi) + cheklar jadvali.
    Server: `routes/daftar.routes.ts` (`GET /api/daftar-reports?startDate&endDate`), `calculation.service.ts` `daftarStage`, `summarizeDaftar`. Klient: `pages/DaftarPage.tsx`,
    `i18n/modules/daftar.ts`, Sidebar/App yo'nalishi. Taxminlar (egasi tasdiqlamagan): tovar summasi = yechilgan limit; PENDING/NEED_TO_BUY = "olish kerak", IN_WAREHOUSE/IN_TRANSIT = omborda, SOLD/MONEY_RECEIVED = sotilgan.
    Egasi "Qodir aka to'g'risidagi ma'lumotlaring to'g'ri" dedi (raqamlar tasdiqlandi), lekin Qodir hisobini jonliga yozishga hali aniq "yoz" demagan.
  - **DAFTAR — ANIQ QOIDALAR (egasi savol-javobda tasdiqladi, 15.11; avvalgi "taxminlar" BEKOR). Egasi: "nimaga taxmin qilgansan, aniq hisobotlar bilan ishlashimiz kerak" — hisobot formulasini HECH QACHON taxmin qilma, avval misol bilan so'ra.**
    Jarayon: 1) Daftardan chek uriladi — kompaniya o'z pulidan sarflaydi (mijozga berilgan + agent ulushi); 2) har chek bo'yicha Daftar ilovasida pul tushgani tekshiriladi;
    3) tushgan pulga qurilma olinadi — narxi QO'LDA kiritiladi (limitga teng bo'lishi shart emas); 4) qurilma sotiladi — sotuv narxi ham kiritiladi.
    Foyda/zarar = sotilgan narx − kompaniya sarflagani (misol: sarf 7 500 000, sotildi 9 000 000 → +1 500 000), FAQAT sotilgach; har chek bo'yicha alohida qurilma olinadi.
    Qoldiqlar: limit qoldig'i, ombordagi tovar, xaridorlar qarzi, pul qoldig'i (chek orqali avtomatik: tushgan − sarflangan).
    Kod (JONLIDA 15.11 — zaxira `backups/db-raw-db-2026-11-14T19-58-26-416Z.json`, `prisma db push` (3 ta nullable ustun), recalc dry-run 0 o'zgarish, server+klient deploy): `Deal.daftarMoneyAt`, `devicePurchaseAmount`, `devicePurchasedAt`;
    `calculation.service.ts` `daftarStage` (CHEQUE/MONEY/DEVICE/SOLD ← PENDING|NEED_TO_BUY / MONEY_RECEIVED / IN_WAREHOUSE|IN_TRANSIT / SOLD), `daftarSpent`, `daftarDealResult`, `summarizeDaftar`;
    calculateDeal: daftar foydasi endi SOTILGUNCHA 0 (ilgari "Pul tushdi"da kutilayotgan foyda berilardi); `routes/daftar.routes.ts`: GET + POST `/:dealId/money-received | device-purchased {amount} | back`
    (ADMIN, MANAGER, COO); sotish — mavjud Sotuv bo'limi orqali. Klient `pages/DaftarPage.tsx` qayta yozilgan. Testlar 338/338. Jonli sahifa ko'z bilan tekshirilmagan; 4-bosqich (sotish) sinalmagan.
  - **Daftar tarkibi (egasi 15.11 da uch marta tasdiqladi):** FAQAT do'koni Denov yoki Jizzax deb yozilgan cheklar, summasi 0 bo'lsa ham; NOVZA KIRMAYDI (egasining Google jadvalidagi "Daftar" varag'ida Novza 18 ta bor — shunga qaramay "Yo'q, faqat Denov/Jizzax" dedi). Provayder "Iman daftar" ham Imanium deb olinadi (#3728). Jonlida 19 ta chek: Denov 16, Jizzax 3 (zaxira `backups/db-raw-db-2026-11-14T20-24-45-564Z.json`, recalc 1 bitim, deploy). Sotilgan chekka qurilma narxi kiritish tugmasi qo'shilgan. Jonli bazaga yozishni egasining ANIQ "ha"sisiz boshlama — 15.11 da boshqa savolga berilgan javobni ruxsat deb olganimda tizim to'xtatdi.
  - **Umirzoq (egasi, 15.11; JONLIGA YOZILDI — zaxira `backups/db-raw-db-2026-11-15T13-37-59-539Z.json`, `scripts/move-sold-to-umirzoq.ts --apply`):** №5 sotuvdagi 14.11 naqd to'lov (TX-1199, 130 759 843) SOXTA edi — Umirzoq bermagan — o'chirildi (naqd kassa 123 066 443 → −7 693 400).
    52 ta telefon cheki (№5 dan 14 ta + xaridorsiz SOLD 15 ta + PARTIAL_AMOUNT 23 ta) har biri ALOHIDA sotuv bo'ldi: xaridor Umirzoq, DEBT, narx 0 (egasi "hozir 0 bilan yoz" dedi). №5 da faqat #8107 qoldi (26 906 880, qarz).
    Tegilmagan: №3 Saloxiddin, №4 Kochadan, #3638 (maishiy), #3717, #3644. KEYINGI QADAM: egasi IMEI bo'yicha sotuv narxlarini va Umirzoq bergan pullarni (sanasi bilan) beradi — narxlar har sotuvga kiritiladi, to'lovlar qarzdan ayriladi.
    Umirzoqning DDS'dagi haqiqiy kirimlari (Sheets'dan, sotuvga bog'lanmagan): TX-1007 9 310 000, TX-1022 7 100 000, TX-1041 59 750 000, TX-1069 52 325 000, TX-1077 124 877 500 = 253 362 500.
    DIQQAT: narx 0 bo'lgani uchun bu 52 chekning foydasi hozir −tannarx (jami −386 130 570; kompaniya foydasi jami −145 727 490). Narxlar kiritilguncha `recalc-deals --apply` ISHLATMA — u shu 52 chek foydasini "kutilayotgan foyda"ga qayta yozib yuboradi (sotuv yo'li va calculateDeal narx 0 da turlicha hisoblaydi). IMEI ro'yxati: Google Sheets `10mwghNaX6enphCXRWa1547NsiwH_d0QIDRgC42vOhXI`.
  - **Umirzoq narxlari (15.11):** egasi 37 ta IMEI narxini $ da berdi (kurs 11 950), "chekma-chek" dedi. Shubhasiz mos kelgan 5 chekka narx YOZILDI (zaxira `backups/db-raw-db-2026-11-15T13-59-37-567Z.json`, `scripts/set-sale-prices.ts --set=<chek>:<so'm>,... --apply`):
    #3698 5 198 250, #3726 12 428 000, #8101 5 198 250, #8123 6 871 250, #8128 4 600 750. Umirzoq qarzi hozir 61 203 380 (53 sotuv, to'lovlar hali bog'lanmagan).
    Qolgani egasi javobini kutadi — Google Sheets `1qbKn_DLU12-i0Y9n8hyaxWCwjwkRASYm0WbbV9b0if4`: 5 ta IMEI bazada takror cheklarda, 18 tasi bazada yo'q, 3 tasi ombordagi (sotilmagan) cheklarda (#8129, #8130), 33 ta Umirzoq chekida narx yo'q. Bazadagi IMEI ma'lumoti chala/xato — IMEI'ni TAXMIN bilan bog'lama.
  - **Umirzoq — narxlar to'liq kiritildi (15.11 kech; egasi "Ha, hammasini yoz" dedi; zaxira `backups/db-raw-db-2026-11-15T14-51-24-803Z.json`):** egasi Google Sheets `1OsyxOsAcuGPIZKPzEeXjiT-_6PDLU0JZUAI4LueWG4I` da 45 chek narxini $ da to'ldirdi (kurs 11 950; ikki tovarli chekda narxlar qo'shilgan) —
    `set-sale-prices.ts --apply`: 45 chek, 375 947 000. #3725, #8112 (1 dona, 2 narx) va #3727 (zarar) — egasi: "bozor narxi o'ynagan", jadvaldagidek yozildi. Bo'sh qolgan #3649, #3653 (iPhone 16) — egasi buyrug'i bilan omborga qaytarildi (IN_WAREHOUSE, sotuvlari o'chirildi).
    HOLAT: Umirzoq 51 ta sotuv, jami 437 150 380, olingan 0, qarz 437 150 380; narxi 0 sotuv qolmadi; kompaniya foydasi jami 287 416 010; naqd kassa −7 693 400.
    KEYINGI QADAM (egasi tasdig'i kerak): DDS'dagi 5 ta haqiqiy Umirzoq kirimini (253 362 500, sotuvga bog'lanmagan SYNC qatorlar) sanasi bo'yicha qarzdan ayirish → qoldiq 183 787 880. Avvalgi "recalc-deals ISHLATMA" ogohlantirishi endi kuchsiz (narxi 0 chek yo'q), lekin baribir avval dry-run qil.
  - **Umirzoq to'lovlari ayirildi (15.11 kech; egasi "jami 316 321 500 bergan" va "Ha, yoz" dedi; zaxira `backups/db-raw-db-2026-11-15T15-00-18-636Z.json`, `scripts/apply-buyer-payments.ts --apply`):**
    7 ta to'lov sotuvlarga SalePayment bo'lib yozildi (DDS'ga bog'lanmagan — pullar DDS'da allaqachon bor: TX-1007, 1022, 1034, 1030, 1041, 1069, 1077; kassa o'zgarmadi), eng eski chekdan taqsimlangan.
    DDS'da Umirzoq kirimlari jami 319 322 100 (ismi "Умирзок"/"Умурзок" ikki xil yozilgan); egasi summasiga TX-1031 (3 000 000) va 600 so'm kirmagan — egasidan so'ralgan.
    HOLAT: Umirzoq 51 sotuv, 437 150 380, olingan 316 321 500, QARZ 120 828 880 (37 chek PAID, 13 DEBT, 1 PARTIAL #3735). Skriptni QAYTA ishlatma (to'lov bor sotuvda xato beradi). Naqd kassa −7 693 400 (alohida tekshirish kerak).
  - **"Umirzoq" tugmasi (egasi, 15.11 kech; SAYTGA CHIQARILGAN, jonli sahifa ko'z bilan tekshirilmagan):** DDS kirim formasida qarzi bor har bir xaridor uchun tugma (ism + qarz). Bosilsa: kirim kassaga tushadi va shu xaridor qarzidan ENG ESKI chekdan boshlab ayriladi (egasi tanlovi).
    Server: `sale.service.ts` `listBuyerDebts`, `payBuyerDebt` (`addSalePaymentInTx` — har bo'lak oddiy sotuv to'lovi: SalePayment + DDS kirimi "Sotuv №X — ... qarz qaytarilishi"), `sales.routes.ts` `GET /api/sales/buyer-debts`, `POST /api/sales/buyers/:buyerId/payment` (PAYMENT_ROLES; summa > qarz → 400).
    Klient: `DdsFormModal.tsx` (tugmalar, kategoriya yashiriladi), `DdsPage.handleCreated` (`ddsPage.saved_buyer`), i18n `ddsPage.buyer_pay_*`. Lokalda bitta sotuvda sinalgan (ortiqcha summa rad etiladi, qarz kamayadi); bir nechta sotuvga taqsimlash faqat kod bo'yicha (jonli skript bilan bir xil tartib). Testlar 338/338.
  - **Umirzoq — 15.11 kechki tuzatish (egasi "chiqarvor bularni" dedi; zaxira `backups/db-raw-db-2026-11-15T15-54-21-189Z.json`, `scripts/fix-umirzoq-1511.ts --apply`, BIR MARTALIK):**
    egasi o'zi №58 sotuv (10 chek, 79 467 500) kiritdi va tugma orqali 51 000 000 (13.11) + 92 300 000 (14.11) to'lov qildi; qarz 9 805 830 chiqdi, u 51 265 500 kutgan edi.
    Sabab: №58 kiritilganda "to'langan" maydoniga 47 190 550 yozilgan (TX-1203, Umirzoq bermagan) va #8107 da eski narx 26 906 880 turgan. Tuzatildi: TX-1203 o'chirildi, #8107 narxi 21 176 000, ortiqcha 5 730 880 to'lov №58 qarziga ko'chirildi.
    HOLAT: Umirzoq 52 sotuv, narx 510 887 000, olingan 459 621 500 (316 321 500 eski + 143 300 000 tugma orqali), QARZ 51 265 500 (#8128 4 600 750; #8123 5 205 080; №58 41 459 670). Naqd kassa 135 606 600.
    Saboq: yangi sotuv formasidagi "to'langan summa" maydoni kassaga kirim yozadi — egasi uni adashib to'ldirishi mumkin.
  - **Kuzatuvchi (VIEWER) — bitimlarni faqat ko'radi (egasi, 15.11 kech; SAYTGA CHIQARILGAN, jonlida shu rol bilan kirib tekshirilmagan):** Sidebar `ROLE_PERMISSIONS.VIEWER` ga `/deals` qo'shildi; `DealsPage` / `DealsTable` — "Yangi bitim" tugmasi VIEWER'ga ko'rinmaydi
    (tahrirlash/o'chirish/tasdiqlash tugmalari `dealPermissions` da avvaldan yashirin); server `deals.routes.ts` `denyViewer` — POST `/`, PUT `/:id`, DELETE `/:id` → 403. Lokalda sinalgan: ko'rish 200 (208 bitim), qo'shish/tahrir/o'chirish/tasdiqlash 403.
    Jonlida VIEWER foydalanuvchi bor: `kuzatuvchi` ("Nazoratchi / Investor") — paroli seed'dagi standart bo'lishi mumkin, egasiga yangilash aytilgan. Foyda/agent summalari VIEWER'ga ko'rinadi (egasi yashirishni so'ramagan). Ombor/Sotuv/Qarzdorlar ochilmagan.
- **Egasi qarorlari (14.11):** foyda = yechilgan limit − mijozga berilgan − agent foydasi (= limit × kompaniya ulushi). Ulushlar:
  Alif offline 22, Imanum 22 (03.11 gacha) / 25 (04.11 dan), Variant online 27 / offline 22, Alif online 27, Trust 1 16, Alif 6 oylik 35,
  Payme 20, Infinbank 15, Paylater online 27 / offline 22, Finsum 22. Do'kon qoidasi ustun: Qodir aka ulush 22 (bizga 6, unga 16),
  Green Bazar 30, Tursunqulova Shahlo 22, Trust 16. Diskontning ulushdan ortig'i — agentga (manfiy bo'lmaydi).
  Daftar "Ha" bitimida foyda "Pul tushdi" holatigacha 0. HAMMA eski bitimlar qayta hisoblanadi.
  **Qodir aka endi BIZGA qarzdor**: chek + agent ulushi + 6% foyda (3 qism); u bergan pul — KIRIM ("Qodir aka to'lovi" yoki "Do'kondan tushum"),
  ortig'i — depozit. Operator ismlariga (spravochnikdagi Agent yozuvlari) TEGILMAYDI, kirill/lotin juftlari birlashtirilmaydi.
  Spravochnikda Agency = login'li agent, uning Agent yozuvlari = operatorlari.
- **Kod (commit qilinmagan):** sxema — `CommissionRule.profitPercent/validFrom/validTo`, `User.agentId` (operator → Agent yozuvi), `WebPushSubscription`.
  `calculation.service.ts`: `resolveCommission`, `DEFAULT_COMMISSION_RULES` (yagona ro'yxat), `calcExpectedProfit`, `calcStoreDebtParts`,
  `summarizeLedger` (+`debtLeft`, `deposit`); `storeSettlementKind` endi Qodir uchun ham STORE_OWES. `ledger.service.ts`: `storeDebtPartsForDeal`.
  `sale.service.ts`: `computeDealProfitForStatus` (ombor holati o'zgarganda foyda qayta hisoblanadi). Spravochnik: hamma ro'yxatda tahrirlash/o'chirish
  (ishlatilgan yozuv yashiriladi, `?all=1`). Jamoa: `team.service.ts` `ensureOperatorsForAgent` (Agent yozuvlaridan operator loginlari avtomatik),
  `/api/team/operators?from&to&q`, `/team/summary`, `/team/my-summary`; operator o'zi kiritgan + `Deal.agentId` o'ziniki bo'lgan bitimlarni ko'radi.
  Bildirishnoma: Web Push (VAPID; `web-push@3.6.7`, `client/public/sw.js`, `services/webPush.ts`) — iPhone (bosh ekranga qo'shilgan sayt) va brauzer.
- **Yangi skriptlar (hammasi standart dry-run, `--apply`):** `seed-commission-rules.ts`, `recalc-deals.ts`, `create-operator-logins.ts`, `generate-vapid-keys.ts`.
- **Lokal bazada bajarilgan:** db push, seed-commission-rules, recalc-deals (157 bitim; foyda 10 036 761 → 191 576 460, agent 109 891 236 → 98 961 016),
  merge-references, backfill-store-ledger, create-operator-logins (42 login, `backups/operator_logins.*.txt`).
- **Jonliga chiqarish tartibi (faqat egasi buyrug'i bilan):** zaxira → `prisma db push` (`User.agentId` unique ogohlantirishi — yangi ustun, xavfsiz) →
  Vercel `server` ga `VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT` → deploy (server, klient) → `seed-commission-rules` → `merge-references` →
  `recalc-deals` → `backfill-store-ledger` → `create-operator-logins` (har biri avval dry-run, natijani egasiga ko'rsat). Jadval bo'lmasa `/api/notifications/status` 500 beradi.
- **Egasidan so'raladigan ochiq savollar:** (a) Qodir aka cheki DDS chiqimiga yozilsinmi (hozir yozilmaydi)? (b) Green Bazar / Shahlo ham chek + agent + foyda
  qarzdor bo'ladimi (hozir faqat chek)? (c) "Shaxlo", "Variant Shahlo" do'konlari = "Tursunqulova Shahlo"mi? (d) Birzum va "Iman daftar" provayderlari foizi (hozir 0)?
  (e) Sheets sinxronlashi qayta hisoblangan foydani ustidan yozishi mumkin — Sheets hali ishlatiladimi? (f) eski "Qodir aka to'lovi" CHIQIM yozuvlari jonli bazada bo'lsa
  ular endi teskari ma'noda — tekshir. (g) kirill/lotin operator juftlari ikkita login oladi (gulnur, gulnur2).
- **2-bosqich (egasi kelishgan, boshlanmagan):** Daftar bo'limi — daftar nomlari (Denov, Jizzax...), "tovar olish kerak" holati, olingan/sotilgan summa, hammasi DDS'ga.
- **Android push:** egasidan Firebase fayllari kerak (`docs/FIREBASE_SETUP.md`); rollar bo'yicha bildirishnoma rejasi: `~/.claude/plans/menga-buni-qanday-qilishni-valiant-snail.md`.

### Oldingi holat (14.11 ertalab — quyidagi 1–2-qadamlar yangi qoidalar jonliga chiqqandan KEYIN, yangi raqamlar bilan bajariladi)
- Kod: `main` da 2 ta yangi commit — `adedc1d` (do'kon daftari, Qodir aka daftari, cheklarni DDS'ga o'tkazish, DDS davr filtri) va
  `9867280` (ko'p tovarli sotuv). Ikkalasi JONLIGA CHIQARILGAN (baza sxemasi + server + klient). GitHub'ga push qilinmagan.
  CLAUDE.md dagi oxirgi tahrirlar commit qilinmagan.
- **Egasi javobini kutayotgan 1-qadam:** jonli bazada do'kon daftarini to'ldirish —
  `cd server && source ../backups/prod-env.sh && tsrun scripts/backfill-store-ledger.ts` (dry-run), keyin `--apply`.
  Dry-run (13.11): 46 yozuv, do'konlar bizga 320 035 030, biz Qodir akaga 8 399 250. Egasiga sodda tilda tushuntirilgan, "ha/yo'q" javobi kutilmoqda.
  To'ldirilmaguncha jonli saytda Do'konlar / Qodir aka daftari sahifalarida qarz 0 ko'rinadi. Yozishdan oldin yangi zaxira ol va dry-run'ni qayta ko'rsat.
- **2-qadam (alohida, shoshilma):** cheklarni DDS'ga o'tkazish (`move-checks-to-dds.ts`, dry-run: 30 bitim, 234 953 930 so'm, naqd kassa
  416 640 750 → 181 686 820). Oldin egasi DDS'dagi 10.11 dan keyingi, bitimga bog'lanmagan 2 ta qo'lda kiritilgan chiqimni (7 434 050 so'm,
  "Mijozga berilgan summa (Tovar xaridi)") qaysi bitimniki ekanini aytishi kerak — aks holda ikki marta yoziladi. Trust bitimlari cheklari savoli ham ochiq.
- **Tekshirilmagan:** jonli saytga login qilib yangi sahifalarni hech kim ko'rmagan; sotuv bo'yicha tuzatishlar brauzerda qayta sinalmagan.
  Egasi "ishlamayapti" desa — avval qaysi sahifa va xato matnini so'ra.
- **Ochiq biznes savollari:** pastdagi "Ochiq savollar" 7–12 bandlar (daftar boshlanish sanasi, Trust, ombor ko'chirishi, sotuv qaytarilishi va h.k.).
- **Egasi bilan ishlash uslubi:** texnik emas — qisqa, sodda, misol bilan tushuntir; vazifa oldidan aniqlashtiruvchi savollar ber (tugmali variantlar bilan);
  limitni tejash uchun ishni sub-agentlarga bo'l (kod o'rganish — Explore, server va klient — alohida, ko'rib chiqish — alohida).
Foydalanuvchi bilan muloqot va kod izohlari **o'zbek tilida (lotin)**.

## Loyiha
- Telefon/texnika muddatli savdo (nasiya limitini naqdlashtirish) kompaniyasining ichki ERP tizimi.
- `client/` — React 18 + Vite + Tailwind + Capacitor 6 (Android). `server/` — Express + Prisma 5 + PostgreSQL (Neon), TypeScript.
- Jonli manzillar: klient `https://finmodel-erp-uz.vercel.app`, server `https://server-ecru-three-97.vercel.app`
  (Vercel loyihalari `client` va `server`, GitHub'dan emas — `npx vercel --prod --yes` bilan har papkadan alohida deploy qilinadi).
- GitHub: `https://github.com/lazizxon702/finmodel.git` (`main`). Repo PUBLIC edi — egasiga Private qilish aytilgan, holatini tekshir.

## Qat'iy qoidalar (egasi bergan)
- **Push va deploy faqat egasining aniq buyrug'i bilan.** Avval lokalda ko'rsatiladi.
- Biznes qoidasi noaniq bo'lsa — taxmin qilma, so'ra.
- Kalit/parol/tokenlarni kodga, logga, chatga yozma. `.env*` fayllarni o'qima, faqat `process.env`.
- Jonli bazaga yozishdan oldin: zaxira → dry-run → natijani ko'rsat → keyin yoz.
- Takroriy biznes-mantiq faqat `server/src/services/calculation.service.ts` da; pul harakati faqat `ledger.service.ts` orqali.
- Prisma sxemasini faqat asosiy sessiya o'zgartiradi (sub-agentlar emas). Ikki agent bir faylga tegmasin.
- Fayllarni PowerShell `Get-Content/Set-Content` bilan qayta saqlama — UTF-8 buziladi. Edit/Write yoki node skripti ishlat.

## Muhit
- Windows, PowerShell asosiy. Git Bash'da `npx` YO'Q: `node node_modules/ts-node/dist/bin.js --transpile-only scripts/x.ts`
  yoki PowerShell'da `npx ts-node --transpile-only scripts/x.ts`.
- **Lokal baza:** kompyuterdagi PostgreSQL 17, baza `finmodel_dev`. `server/.env` lokalga qaragan.
  Jonli Neon sozlamalari `server/.env.neon-prod` da. Jonli bazaga ulanish uchun bash'da: `cd server && source ../backups/prod-env.sh`
  (DATABASE_URL ni eksport qiladi va `tsrun` funksiyasini beradi).
- Lokal ishga tushirish: `.claude/launch.json` (`server` :5000, `client` :5173).
- Lokal bazada jonli Google Sheets manzillari uzilgan (`scripts/local-safety.ts`) — lokal sinov haqiqiy jadvalga yozmaydi.
- Brauzerda lokal kirish (parolsiz): `scripts/dev-token.ts <username>` → JWT → `localStorage.setItem('token', ...)`. Faqat localhost bazada ishlaydi.
- `backups/` (gitignore): zaxiralar, dry-run natijalari. Jonli migratsiyadan oldingi zaxira: `backups/db-raw-prod-pre-migration-*.json`.
- `agent_logins.local.txt` (gitignore): JONLI agent parollari. Lokal bazaniki: `backups/agent_logins.lokal-baza.txt`.
- Lokal git'da `pre-clean-backup` tegi bor (ichida biznes ma'lumotli fayllar) — uni PUSH QILMA.

## Tekshiruv buyruqlari
- Server: `cd server; npx tsc --noEmit; npx vitest run` (252 test, fayllar ketma-ket — integratsion testlar lokal bazani ishlatadi).
- Klient: `cd client; npm run build; node src/i18n/check-keys.mjs` (uz/ru/en kalitlari bir xil bo'lishi shart).
- API tutun-sinovi: `server/scripts/smoke-api.ts`.

## Arxitektura (yangi qismlar)
- **Sxema:** `Role.AGENT`; `User.agencyId/parentAgentId/telegramLinkCode/initialPassword`; `Deal.approvalStatus` (PENDING_APPROVAL | APPROVED | REJECTED),
  `trustDebtAmount`, `items DealItem[]`; `DdsTransaction.source/dealId` (`@@unique([dealId, source])`); `AccountBalance`; `TrustLedgerEntry`; `DeviceToken`.
  Migratsiya papkasi yo'q — `prisma db push`.
- **calculation.service.ts:** Trust faqat aniq nom bo'yicha ("Trust", "Trust 1"), `calcTrustDebt` = yechilgan limit × 16%; `isQodirStore`; `calcCheckExpense`
  (Qodir aka cheki xarajatga olinmaydi); `calcAgentCommission` = limit × (xarid diskonti − agent foizi); `normalizeDealItems`; kanonik nomlar
  (`STORE/PROVIDER/AGENCY_ALIASES`); `formatTashkentDateTime`, `tashkentDayRange`.
- **ledger.service.ts:** `createDds/deleteDds` (hisob qoldig'ini yangilaydi; "Trust 1 daromadi" kirimi Trust qarzini kamaytiradi), `approveDeal/rejectDeal`,
  `createCheckExpenseInTx` (idempotent), `syncTrustDebtForDeal`, `rebuildAccountBalances`, `getTrustLedger`.
- **access.service.ts:** `dealScopeWhere` — OPERATOR faqat o'zi kiritgan; AGENT o'zi + jamoasi + o'z agentligi; `APPROVED_ONLY`.
- **Routelar:** `/api/trust`, `/api/team` (agent o'z operatorlarini boshqaradi), `/api/notifications`, `/api/deals/:id/approve|reject|expense-to-dds`,
  `/api/deals/kpi-details`, `/api/deals/pending-count`, `/api/agents/commission-summary`.
- **Parollar (egasi qarori):** ochiq matnda `User.initialPassword` da saqlanadi; ADMIN Foydalanuvchilar sahifasida, AGENT o'z operatorlarinikini Jamoa sahifasida ko'radi.
- **AI:** `ai.routes.ts`, Gemini `gemini-3.6-flash` (`GEMINI_MODEL` bilan almashtiriladi), kalit faqat `GEMINI_API_KEY`, kontekst bazadagi real raqamlar.
- **Klient:** dizayn tokenlari `client/src/index.css` + `tailwind.config.js`; umumiy komponentlar `components/ui/`; i18n `i18n/modules/*.ts`
  (uz/ru/en, `import.meta.glob`); hujjat `docs/DESIGN_SYSTEM.md`. Yorug' mavzu standart, to'q ko'k yon menyu, shriftlar Onest + Geologica.
  Bitimlar: `components/deals/` (`DealsSummary`, 12 ustunli `DealsTable`, `DealFormModal`, `DealItemsEditor`).
- **Skriptlar** (`server/scripts/`): `backup-db-raw.ts` (sxemaga bog'liq emas), `restore-db.ts` (faqat lokal), `backfill-ledger.ts`,
  `merge-references.ts`, `import-sheets-day.ts --date=DD.MM.YYYY`, `create-agent-logins.ts` — hammasi standart dry-run, `--apply` bilan yozadi.

## Do'kon daftari va cheklarni DDS'ga o'tkazish (2026-11-13; kod jonlida, ma'lumot to'ldirilmagan — yuqoridagi bo'limga qara)
- **Egasi qarorlari:** do'kon qarzi = bitimdagi mijozga berilgan summa (`calculatedAmount`); Qodir aka — BIZ unga qarzdormiz
  (cheki DDS xarajatiga tushmaydi), boshqa do'konlar — do'kon BIZGA qarzdor. Qarz DDS orqali yopiladi: "Qodir aka to'lovi"
  (chiqim, majburan COGS, `QODIR_PAYMENT`) va "Do'kondan tushum" (kirim, `storeId` majburiy, `STORE_PAYMENT`).
- **Sxema:** `StoreLedgerEntry` (DEBT/PAYMENT, `dealId @unique`, `ddsTransactionId @unique`), `DdsSource` ga 2 qiymat. Jonli bazaga qo'shilgan (13.11).
- **calculation.service.ts:** `STORE_LEDGER_START_YMD = '2026-11-10'` (daftar boshlanishi — bitta konstanta), `calcStoreDebt`,
  `storeSettlementKind` (WE_OWE | STORE_OWES | TRUST), `summarizeLedger`. Trust do'konlari do'kon daftariga kirmaydi.
- **ledger.service.ts:** `syncStoreDebtForDeal` (syncTrustDebtForDeal chaqirilgan hamma joyda), `getStoreLedger`, `getStoresReport`,
  `listPendingCheckExpenses` / `applyPendingCheckExpenses` (chek DDS'ga BITIM SANASI bilan yoziladi).
- **Routelar:** `/api/store-reports` (`/`, `/qodir`, `/:storeId`), `/api/dds/check-expenses/preview|apply` (ADMIN; apply `expectedCount/expectedTotal` mos kelmasa 409).
- **Klient:** `/stores`, `/stores/:id`, `/qodir-ledger` (`pages/StoresPage`, `StoreDetailPage`, `components/stores/`), DDS sahifasida davr filtri va
  `CheckTransferModal`, DDS formasida do'kon tanlash.
- **Skriptlar:** `move-checks-to-dds.ts --from=DD.MM.YYYY`, `backfill-store-ledger.ts` (ikkalasi standart dry-run, `--apply`).
  Lokal bazada `backfill-store-ledger --apply` bajarilgan (22 yozuv); cheklar lokalda ham hali o'tkazilmagan.
- **Jonliga chiqarish tartibi:** zaxira → `prisma db push` → deploy → `backfill-store-ledger` dry-run/apply → `move-checks-to-dds` dry-run/apply.
  Cheklarni o'tkazishdan oldin tekshir: shu davrda "Mijozga berilgan summa (Tovar xaridi)" kategoriyasida bitimga bog'lanmagan
  (qo'lda/Sheets'dan) DDS qatorlari bo'lsa, ikki marta yozilib qoladi.

## Ko'p tovarli sotuv (2026-11-13; jonliga chiqarilgan)
- **Egasi qarorlari:** bitta sotuv = bir nechta ombor qatori (bitim) bitta xaridorga; BITTA umumiy narx (bitimlarga `totalPurchaseCost` ga
  mutanosib taqsimlanadi); BITTA to'lov, qarz SOTUV bo'yicha; to'lov turi CASH / BANK_CARD / SETTLEMENT_ACCOUNT / DEBT (nasiya);
  omborga qaytarilganda tushum ham bekor bo'ladi. Alohida telefon (DealItem) darajasida sotish QILINMAGAN (tannarx faqat bitimda).
- **Sxema:** `Sale` (saleNumber, totalPrice, receivedAmount, debtRemainder, paymentType), `SalePayment` (manfiy = xaridorga qaytarilgan,
  `ddsTransactionId`), `Deal.saleId`, `DdsSource.SALE_PAYMENT`. Jonli bazaga qo'shilgan (13.11).
- **Kod:** `services/sale.service.ts` (`createSale`, `updateSale`, `addSalePayment`, `returnSale`, `applySaleToDeals` — bitimdagi sotuv
  maydonlarini sotuvdan ulush bo'yicha qayta yozadi), `routes/sales.routes.ts` (`/api/sales`, `/:id`, `/:id/payments`, `/:id/return`;
  rollar ADMIN, MANAGER, COO, SELLER; to'lovga + CASHIER, CFO). Taqsimlash: `allocateProportional/allocateCapped/allocateRefundByAccount`.
- **Himoya:** `saleId` bor bitim eski yo'llar bilan o'zgartirilmaydi (inventory sell/sale/status/transfer/receive, bitimni o'chirish, bot — 409);
  bitim tahriri va Sheets importi sotuv maydonlarini ustidan yozmaydi; sotuv to'loviga bog'langan DDS qatori alohida o'chirilmaydi.
- **Eski sotuvlar** (`saleId` yo'q) ro'yxatda `legacy: true` bitta tovarli sotuv bo'lib ko'rinadi va eski route'lar bilan ishlaydi.
- **Qaytarish:** butun sotuv — DDS qatorlari O'CHIRILADI; qisman — ortiqcha to'lov bugungi sana bilan chiqim (COGS) bo'lib qaytariladi.
- **Klient:** `components/sales/` (`NewSaleModal`, `SaleModals`, `SaleDetails`), `SalesPage` (ochiladigan qatorlar), `DebtorsPage` (`kind: SALE`).

## Jonli muhit holati (2026-11-13 yangilanishi)
- Egasi buyrug'i bilan jonliga chiqarildi: sxema (`StoreLedgerEntry`, `Sale`, `SalePayment`, `Deal.saleId`, yangi enum qiymatlari — faqat
  qo'shimcha), server va klient deploy (commit `9867280`). Zaxira: `backups/db-raw-db-2026-11-13T11-25-16-078Z.json`. GitHub'ga push QILINMAGAN.
- Jonli bazada HALI BAJARILMAGAN (egasi javobini kutadi): `backfill-store-ledger --apply` (dry-run: 46 yozuv, do'konlar bizga 320 035 030,
  biz Qodir akaga 8 399 250) va `move-checks-to-dds --apply` (dry-run: 30 bitim, 234 953 930; kassa 416 640 750 → 181 686 820).
  Diqqat: 10.11 dan beri shu kategoriyada bitimga bog'lanmagan 2 ta qo'lda kiritilgan DDS chiqimi bor (7 434 050) — ikki marta yozilmasin.
- Jonli saytga login qilib yangi sahifalar tekshirilmagan (faqat yo'llar va klient to'plami tekshirildi).

## Jonli muhit holati (2026-11-12)
- Deploy qilingan: server va klient. Jonli baza: sxema yangilangan, eski bitimlar to'ldirilgan (DealItem, Trust daftari, kassa qoldiqlari),
  dublikatlar birlashtirilgan (do'kon 22, provayder 16, agentlik 10), 5 agent logini (nazirbek, asadbek, farida, jahongir, macmobi).
- Vercel `server` env: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SYNC_WEBHOOK_SECRET`.
  Yo'q: `TELEGRAM_BOT_USERNAME`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `CRON_SECRET`.
- Vercel'da Socket.IO ishlamaydi → jonli saytda real vaqt yangilanishi yo'q (lokalda bor).
- Jonli saytga login qilib ichki sahifalar hali hech kim tomonidan tekshirilmagan.

## Ochiq savollar (egasi javob bermagan — taxmin qilma)
1. **Imanum agent foizi:** kodda 03.11.2026 dan 25%, spravochnik qoidasida 22% (qoida ustun). Qaysi biri to'g'ri? 19 ta Imanum/Novza bitimi keyingi tahrirda 22% bilan qayta hisoblanadi.
2. **Agent ismlari:** 14 ta kirill/lotin juftlik (Гулнур/Gulnur, Шахло/Shahlo ...) birlashtirilsinmi?
3. **Omborchi** tasdiqlanmagan bitimni ko'rmaydi — shunday qolsinmi?
4. **Telegram bot:** avtorizatsiyasiz, DDS'ni ledger'siz yozadi (`telegram.bot.ts:~526`, `bot.routes.ts:~135`). Tuzatilsinmi?
5. **Bitim formasi:** tayyor qiymatlar (limit 10 000 000, yechilgan 2 800 000) olib tashlansinmi?
6. **Eski 99 bitim foydasi:** egasi "hozircha yo'q" dedi — qayta hisoblanmagan; P&L'da 41 052 100 so'mlik "Tuzatish" qatori turibdi.

7. **Do'kon daftari boshlanishi** 10.11.2026 deb qo'yilgan (egasi tasdiqlamagan) — undan oldingi bitimlar qarzga kirmaydi.
8. **Trust:** Trust do'konlari do'kon daftaridan chiqarilgan, lekin Trust bitimlari cheklari DDS xarajatiga yoziladi — ikkalasi ham tasdiqlanmagan.
   Provayderi Trust, do'koni oddiy bo'lgan bitim ham Trust qarzi (16%), ham do'kon qarzini oladi — shundaymi?
9. **Ombor ko'chirishi** (`inventory.routes.ts` transfer-accept) bitim do'konini o'zgartiradi, do'kon qarzi eski do'konda qoladi — ko'chsinmi?
10. **Sheets'dan kelgan "Do'kondan tushum"** qatorida do'kon yo'q — daftarga to'lov bo'lib tushmaydi; "Qodir aka to'lovi" ham Sheets'dan kelsa daftarni kamaytirmaydi (faqat COGS bo'ladi).
11. **Ortiqcha to'lov** cheklanmagan (qoldiq manfiy bo'lishi mumkin); CASHIER va MANAGER do'konlar hisobotida foydani ko'radi — shundaymi?

12. **Sotuv:** butun sotuv qaytarilganda eski DDS qatorlari o'chiriladi (yopilgan davr o'zgaradi) — o'rniga bugungi sana bilan teskari yozuv bo'lsinmi?
    Sotuv paytidagi to'lov DDS'ga bugungi sana bilan yoziladi (orqa sana bilan sotuvda ham) — sotuv sanasi bilan bo'lsinmi?
    Sotilgan bitim foydasi = narx ulushi − xarid summasi (Trust 16% / hamkor 5% bonussiz, eski sotuv yo'li kabi) — shundaymi?
    Tannarxi 0 tovar aralash sotuvda 0 narx ulushi oladi. Sotuv tahririda narx oshirilsa (boshqa qarzi yo'q xaridor) admin kodi so'ralmaydi.

## Ma'lum kamchiliklar / keyingi ishlar
- Eski sotuv va qarz to'lovi route'larida (`/api/inventory/:id/sell`, `/api/debtors/:id/payment`) rol tekshiruvi yo'q; yangi `/api/sales` da bor.
- Tor oynada (~1024px) Sotuv/DDS kartochkalaridagi uzun raqamlar sinadi; Bitimlar yig'ma panelining o'ng kataklari kesiladi; jadval biroz o'ngga suriladi.
- Lidlar, HR, Balans, Kunlik hisob, Moliyaviy model, bot sahifalari va modallar yangi dizaynda ko'z bilan tekshirilmagan.
- Android push: `google-services.json` + service account kerak (`docs/FIREBASE_SETUP.md`), APK qayta yig'iladi. Qurilmada sinalmagan.
- Haqiqiy Telegram bildirishnomasi, Sheets webhook va Trust to'lovi formasi (UI) jonli sinovdan o'tmagan.
- Bazada 14 ta summasi 0 bo'lgan bo'sh DDS qatori va #8095 "axlat" bitim bor.
- 9 ta komissiya qoidasi aynan takror. `seed.ts`, `bot.routes.ts`, `leads.routes.ts` eski dublikat nomlarni qayta yaratishi mumkin.
- `Balance`/`Daily` sahifalarida boshlang'ich oy `'2026-11'` qotirilgan.
- Telegram bot tokenlari ilgari kodda ochiq yozilgan edi (endi yo'q) — BotFather'da yangilash tavsiya etilgan.
