import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';

// Gemini modeli muhit o'zgaruvchisi orqali almashtiriladi (gemini-1.5-flash Google tomonidan o'chirilgan)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const router = Router();

// Helper to format currency
function formatUZS(amount: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(amount)) + ' UZS';
}

// POST /api/ai/chat
router.post('/chat', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { message, history = [], apiKey, language = 'uz' } = req.body;
    // Rol endi tokendan olinadi — klient o'zini ADMIN deb ko'rsata olmaydi
    const userRole = req.user?.role || 'OPERATOR';

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Xabar matni kiritilishi shart (message required)' });
    }

    const isRu = language === 'ru';

    // 1. Fetch live metrics from database for context
    let dealsCount = 0;
    let totalWithdrawn = 0;
    let totalProfit = 0;
    let totalQodirExpense = 0;
    let warehouseCount = 0;
    let needToBuyCount = 0;
    let leadsCount = 0;
    let employeesCount = 0;
    let tasksCount = 0;

    try {
      const [deals, leads, emps, tasks] = await Promise.all([
        prisma.deal.findMany({
          select: {
            withdrawnLimit: true,
            profit: true,
            status: true,
            calculatedAmount: true,
            agentAmount: true,
            store: { select: { name: true } }
          }
        }),
        prisma.lead.count(),
        prisma.employee.count(),
        prisma.task.count({ where: { status: { not: 'COMPLETED' } } })
      ]);

      dealsCount = deals.length;
      deals.forEach((d) => {
        totalWithdrawn += Number(d.withdrawnLimit || 0);
        totalProfit += Number(d.profit || 0);
        const storeName = d.store?.name?.toLowerCase() || '';
        if (storeName.includes('qodir') || storeName.includes('green')) {
          totalQodirExpense += Number(d.calculatedAmount || 0) + Number(d.agentAmount || 0);
        }
        if (d.status === 'IN_WAREHOUSE') warehouseCount++;
        if (d.status === 'NEED_TO_BUY') needToBuyCount++;
      });

      leadsCount = leads;
      employeesCount = emps;
      tasksCount = tasks;
    } catch (dbErr) {
      console.warn('Could not fetch live metrics for AI context:', dbErr);
    }

    // 2. Build ERP System Context for Gemini
    const systemPrompt = `
Siz Macmobi ERP tizimining rasmiy Intellektual AI Maslahatchisi va Boshqaruv Agenti (Google Gemini texnologiyasida).
Sizning vazifangiz — foydalanuvchiga butun Macmobi ERP sayti, uning har bir sahifasi, formulalari, ombor, savdo, kassa, HR, lidlar va rollari bo'yicha professional, do'stona va aniq tushuntirish berishdir.

Joriy real tizim ko'rsatkichlari (Real-time live database):
- Jami bitimlar soni: ${dealsCount} ta
- Yechilgan jami limitlar: ${formatUZS(totalWithdrawn)}
- Kompaniya sof foydasi (P&L): ${formatUZS(totalProfit)}
- Qodir aka bo'yicha cheklar xarajati: ${formatUZS(totalQodirExpense)}
- Omborda mavjud tovarlar: ${warehouseCount} ta
- Sotib olinishi kerak bo'lganlar (Need to Buy): ${needToBuyCount} ta
- Ro'yxatdan o'tgan lidlar: ${leadsCount} ta
- Tizimdagi xodimlar: ${employeesCount} ta
- Bajarilishi kutilayotgan faol vazifalar: ${tasksCount} ta

Saytdagi barcha 17 ta sahifa va ularning vazifalari:
1. / - SWOT Boshqaruv Paneli (Barcha ko'rsatkichlar, KPI va moliyaviy grafiklar)
2. /leads - Lidlar va CRM (Koll-markaz murojaatlari, Jahongir & Farida jamoalari reytingi, dublikat tekshiruvi, 1 bosishda bitimga o'tkazish)
3. /deals - Bitimlar va Cheklar (Mijoz kartochkasi, 4 xonali unikal chek kodi, limit yechish, statuslar: Qoralama, Tekshiruvda, Tasdiqlandi, Omborda, Yopildi, Bekor qilindi)
4. /warehouse - Ombor (Sklad) Nazorati (Kutilayotgan tovarlar qizil rangda, IMEI va shtrix-kod skaneri, filiallararo ko'chirish, inventarizatsiya auditi)
5. /sales - Sotuvlar va Marja (Ombordagi tovarlarni sotish, xaridor ma'lumotlari, tannarx, sof foyda va marja foizi)
6. /debtors - Qarzdorlar Ro'yxati (Nasiya tovarlar, to'lov muddatlari, kechikkan kunlar va to'lov kiritish)
7. /agents - Agentlar Komissiyasi (Agentlar bo'yicha hisoblangan komissiya, to'langan summa va kompaniya qarzi qoldig'i)
8. /agents-swot - Agentliklar SWOT Tahlili (Kuchli va zaif tomonlar, agentliklar samaradorligi)
9. /hr - HR, Davomat va Vazifalar (Xodimlar kartochkasi, 31 kunlik tabel matritsasi, avans va oyliklar, vazifalar va KPI)
10. /dds - Pul Harakati (Kassa va bank hisoblari, kirim va chiqim operatsiyalari, yangi xarajat toifalari)
11. /balance - Sheriklar Balansi va Depozitlar (Sheriklar ulushi, oylik taqsimot va omonatlar)
12. /daily - Kunlik Hisob va Kassa (Kunlik tushum, xarajatlar va kassa topshirish akti)
13. /finmodel - 12 Oylik Moliyaviy Model va P&L (Kompaniyaning 1 yillik reja va fakt moliyaviy tahlili)
14. /bot-deals - Telegram Bot Bitimlari (Telegram bot orqali tushgan arizalar)
15. /bot-payments - Telegram Cheklar (Foydalanuvchilar yuklagan to'lov cheklari)
16. /finances - Boshqaruv Balansi va Moliya Svod (Umumiy P&L, aktivlar va passivlar)
17. /references - Spravochniklar va Qoidalar (Platformalar: Imanium 25%, Alif, Payme, Trust; Hamkorlar: Qodir aka 5% bonusi, Denov, Angren, Planet phone 16%)

Maxsus formulalar va qoidalar:
- Qodir aka / oka: hamkor sifatida tanlansa, 5% foyda bonusi beriladi. Chek xarajati = Hisob summasi + Agent komissiyasi.
- Tovar to'liq tannarxi = Xarid narxi + bevosita xarajatlar (yetkazish, komissiya).
- Sotuvdan yalpi foyda = Sotuv narxi - Tovar tannarxi.
- Marja foizi = (Yalpi foyda / Sotuv narxi) * 100.
- Qarzdorlik blokirovkasi: muddati o'tgan qarzdorga tovar sotish taqiqlangan, uni faqat administrator kodi bilan ochish mumkin.

Foydalanuvchi hozirgi roli: ${userRole}.
Javoblarni aniq, chiroyli, Markdown formatida (sarlavhalar, ro'yxatlar, qalin shrift va emojilar bilan) bering.
Javob tili: ${isRu ? 'Rus tili (Русский язык)' : "O'zbek tili (Lotin alifbosi)"}.
`;

    // 3. Check if Gemini API key is provided
    const activeApiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (activeApiKey) {
      try {
        // Prepare Gemini request contents
        const contents: any[] = [];

        // Add history
        if (Array.isArray(history)) {
          for (const item of history.slice(-6)) {
            contents.push({
              role: item.role === 'agent' || item.role === 'model' ? 'model' : 'user',
              parts: [{ text: item.text || '' }]
            });
          }
        }

        // Add current user message
        contents.push({
          role: 'user',
          parts: [{ text: message }]
        });

        // Call Gemini API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${activeApiKey}`;
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048
            }
          })
        });

        const geminiData = await geminiRes.json();

        if (geminiRes.ok && geminiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
          const aiReply = geminiData.candidates[0].content.parts[0].text;
          return res.json({
            reply: aiReply,
            source: 'gemini',
            model: GEMINI_MODEL
          });
        } else {
          console.warn('Gemini API call returned non-200 or no candidates:', geminiData);
        }
      } catch (geminiError: any) {
        console.warn('Gemini API fetch error, falling back to local expert engine:', geminiError?.message);
      }
    }

    // 4. Embedded Fallback Expert Engine (Guarantees smart reply even without external API key)
    const reply = generateSmartFallbackReply(message, {
      dealsCount,
      totalWithdrawn,
      totalProfit,
      totalQodirExpense,
      warehouseCount,
      needToBuyCount,
      leadsCount,
      employeesCount,
      tasksCount,
      isRu
    });

    return res.json({
      reply,
      source: 'knowledge_base',
      model: 'FinModel AI Engine'
    });
  } catch (error: any) {
    console.error('Error in AI chat route:', error);
    res.status(500).json({ error: 'AI xizmatida xatolik yuz berdi: ' + error.message });
  }
});

// Helper for intelligent offline/fallback response
function generateSmartFallbackReply(
  userQuery: string,
  data: {
    dealsCount: number;
    totalWithdrawn: number;
    totalProfit: number;
    totalQodirExpense: number;
    warehouseCount: number;
    needToBuyCount: number;
    leadsCount: number;
    employeesCount: number;
    tasksCount: number;
    isRu: boolean;
  }
): string {
  const q = userQuery.toLowerCase();
  const { isRu, dealsCount, totalWithdrawn, totalProfit, totalQodirExpense, warehouseCount, needToBuyCount, leadsCount, employeesCount, tasksCount } = data;

  // 1. Qodir aka bo'yicha hisob-kitoblar
  if (q.includes('qodir') || q.includes('кодир') || q.includes('чек xarajat') || q.includes('расход чек')) {
    if (isRu) {
      return `📌 **Специальные правила по Кодир ака / ока:**\n\n1. **Бонус 5% к прибыли**: Если в сделке партнером выступает *Кодир ака* или *Green Bazar*, 5% от суммы закупки автоматически начисляется в чистую прибыль компании.\n2. **Формула расхода по чеку**:\n   $$\\text{Чек харажати} = \\text{Расчетная сумма клиенту} + \\text{Комиссия агента}$$\n3. **Текущий факт расходов по чекам Кодир ака**: **${formatUZS(totalQodirExpense)}**.\n4. Сумма отображается в карточке сделки, таблице и дашборде.`;
    }
    return `📌 **Qodir aka / oka bo'yicha maxsus hisob-kitob qoidalari:**\n\n1. **5% Foyda Bonusi**: Bitimda hamkor sifatida *Qodir aka* yoki *Green Bazar* tanlansa, tovar xarid summasining 5% qismi avtomatik ravishda loyiha sof foydasiga qo'shiladi.\n2. **Chek xarajati formulasi**:\n   $$\\text{Qodir chek xarajati} = \\text{Mijozga to'lov (Hisob summasi)} + \\text{Agent komissiyasi}$$\n3. **Hozirgi umumiy Qodir aka cheklar xarajati**: **${formatUZS(totalQodirExpense)}**.\n4. Bu summa Bitimlar jadvalida, chek chop etishda va umumiy tahlilda alohida yuritiladi.`;
  }

  // 2. Ombor va IMEI skaneri
  if (q.includes('ombor') || q.includes('склад') || q.includes('imei') || q.includes('skaner') || q.includes('сканер')) {
    if (isRu) {
      return `📦 **Склад, Приход и сканирование IMEI:**\n\n- **В наличии на складе**: **${warehouseCount} шт** техники.\n- **Ожидают закупки (Need to Buy)**: **${needToBuyCount} шт**.\n- **Ожидаемые товары**: в списке склада подсвечиваются ярко-красным цветом.\n- **Быстрый приход**: нажмите кнопку **'Kamera skaneri'**, наведите камеру на коробку/штрих-код IMEI — товар оприходуется за 1 секунду.\n- **Перемещение**: из Горького на Грин Базар или другие склады отправляется со статусом *'Yo'lda'* (В пути) до подтверждения принимающей стороной.`;
    }
    return `📦 **Ombor, Kirim (Prixod) va IMEI Skanerlash:**\n\n- **Omborda tayyor tovarlar**: **${warehouseCount} ta**.\n- **Kutilayotgan xaridlar (Need to Buy)**: **${needToBuyCount} ta** bitim.\n- **Kutilayotgan tovarlar**: Ombor oynasida qizil rangda alohida ajralib turadi.\n- **Tezkor Prixod**: **'Kamera skaneri'** tugmasini bosib, qutidagi IMEI shtrix-kodini ko'rsatsangiz, 1 soniyada omborga kirim qilinadi.\n- **Filiallararo ko'chirish**: Gorkiy, Green Bazar va boshqa omborlar o'rtasida tovar jo'natilganda, qabul qilib olinmaguncha *'Yo'lda'* holatida saqlanadi.`;
  }

  // 3. Jamoalar va Lidlar (Jahongir & Farida)
  if (q.includes('jamoa') || q.includes('jahongir') || q.includes('farida') || q.includes('lid') || q.includes('команд') || q.includes('лид')) {
    if (isRu) {
      return `👥 **Колл-центр и Команды в CRM (\`/leads\`):**\n\n- **Команда Жаҳонгира**: Шаҳзода, Ҳосила, Назокат, Гулнур, Наргиза, Ҳасан, Муяссар, Шаҳло, Муборак, Маржона, Ситора.\n- **Команда Фариды**: Фарида, Муслима.\n- **Функции**:\n  - Автоматическое определение дубликатов по номеру телефона (защита от перехвата лидов).\n  - Конверсия в сделку в 1 клик с сохранением ответственного агента.\n  - Живой рейтинг по количеству подтвержденных чеков и объему лимитов.`;
    }
    return `👥 **Koll-markaz va Jamoalar CRM (\`/leads\`):**\n\n- **Jahongir jamoasi**: Shahzoda, Hosila, Nazokat, Gulnur, Nargiza, Hasan, Muyassar, Shahlo, Muborak, Marjona, Sitora.\n- **Farida jamoasi**: Farida, Muslima.\n- **Asosiy imkoniyatlar**:\n  - Telefon raqami bo'yicha dublikat lidlarni darhol ogohlantirish (bir mijozni ikki agentga kirmasligi uchun).\n  - 1 bosishda lidni rasmiy Bitimga aylantirish (mas'ul agent va jamoa saqlanadi).\n  - Jamoalar va agentlar o'rtasida kunlik/oylik tasdiqlangan cheklar reytingi.`;
  }

  // 4. Statistika va daromad
  if (q.includes('statistika') || q.includes('jami') || q.includes('foyda') || q.includes('daromad') || q.includes('прибыль') || q.includes('статистика')) {
    if (isRu) {
      return `📊 **Текущие финансовые показатели FinModel ERP:**\n\n- 📝 Всего сделок: **${dealsCount} шт**\n- 💳 Объем списанных лимитов: **${formatUZS(totalWithdrawn)}**\n- 💰 Чистая прибыль (P&L): **${formatUZS(totalProfit)}**\n- 🧾 Расходы по чекам Кодир ака: **${formatUZS(totalQodirExpense)}**\n- 📦 На складе: **${warehouseCount} шт** (Ожидают выкупа: **${needToBuyCount} шт**)\n- 👥 Лидов в CRM: **${leadsCount}** | Сотрудников: **${employeesCount}**`;
    }
    return `📊 **FinModel ERP joriy real ko'rsatkichlari:**\n\n- 📝 Jami bitimlar: **${dealsCount} ta**\n- 💳 Yechilgan limitlar hajmi: **${formatUZS(totalWithdrawn)}**\n- 💰 Kompaniya sof foydasi (P&L): **${formatUZS(totalProfit)}**\n- 🧾 Qodir aka cheklar xarajati: **${formatUZS(totalQodirExpense)}**\n- 📦 Omborda mavjud: **${warehouseCount} ta** (Kutilayotgan: **${needToBuyCount} ta**)\n- 👥 CRM dagi lidlar: **${leadsCount} ta** | Xodimlar soni: **${employeesCount} ta**`;
  }

  // 5. Sayt nima va umumiy tushuntirish
  if (q.includes('sayt') || q.includes('tizim') || q.includes('nima') || q.includes('qanday ishlaydi') || q.includes('chuntir') || q.includes('обзор') || q.includes('сайт') || q.includes('система') || q.includes('как работает')) {
    if (isRu) {
      return `🌟 **FinModel ERP — Полный обзор системы и как она работает:**

FinModel ERP — это комплексная экосистема для автоматизации партнерского финансирования, выкупа техники, складского учета и управления финансами от А до Я:

1. **CRM и Лиды (\`/leads\`)**: Прием обращений клиентов, распределение по командам (Жахонгир и Фарида), проверка лимитов в банках и конверсия в сделку в 1 клик.
2. **Сделки и Чеки (\`/deals\`)**: Создание чека с уникальным 4-значным кодом, списание лимита, автоматический расчет суммы клиенту, комиссии агента и маржи.
3. **Склад и IMEI (\`/warehouse\`)**: Список ожидаемых товаров (выделен красным), прием по сканеру штрих-кода/камере, учет Dual IMEI и межфилиальные перемещения.
4. **Продажи (\`/sales\`)**: Реализация техники со склада, расчет чистой прибыли, фиксация покупателя и контроль рассрочки.
5. **ДДС и Финансы (\`/dds\`, \`/finances\`)**: Касса, P&L, платежный баланс, учет по Кодир ака (5% бонус) и хронологический порядок операций.
6. **HR и Табель (\`/hr\`)**: Карточки сотрудников, 31-дневная матрица посещаемости (QR/PIN), авансы с автоматическим списанием из ДДС и KPI.

💡 *Вы можете спросить меня о любом конкретном модуле, формуле или показателе!*`;
    }
    return `🌟 **FinModel ERP — Tizim haqida to'liq tushuntirish:**

FinModel ERP — bu hamkor dasturlar orqali limit yechish, tovar xaridi, ombor nazorati, sotuvlar va moliyani boshqaruvchi yaxlit avtomatlashtirilgan tizimdir:

1. **CRM va Lidlar (\`/leads\`)**: Mijoz murojaatlarini qabul qilish, jamoalarga bo'lish (Jahongir va Farida jamoalari), bank limitini tekshirish va 1 bosishda bitimga o'tkazish.
2. **Bitimlar va Cheklar (\`/deals\`)**: 4 xonali unikal chek yaratish, limit yechish, mijozga to'lov, agent komissiyasi va kompaniya sof foydasini avtomatik hisoblash.
3. **Ombor va IMEI Nazorati (\`/warehouse\`)**: Kutilayotgan tovarlar ro'yxati (qizil rangda), IMEI va shtrix-kodni kamera/skaner orqali 1 soniyada prixod qilish, filiallararo ko'chirish.
4. **Sotuvlar va Marja (\`/sales\`)**: Ombordagi tovarlarni mijozga sotish, tannarx va marja hisobi, muddatli to'lov va nasiyalarni qayd etish.
5. **DDS va Moliya (\`/dds\`, \`/finances\`)**: Kassa va bank kirim-chiqimi, P&L hisoboti, Qodir aka hisob-kitoblari (5% foyda bonusi) va pul oqimi.
6. **HR va Tabel (\`/hr\`)**: Xodimlar ro'yxati, 31 kunlik davomat matritsasi, avans berish (avtomatik DDS ga tushadi) va vazifalar taxtasi.

💡 *Istalgan bo'lim, formula yoki ko'rsatkich haqida batafsil so'rashingiz mumkin!*`;
  }

  // 2. Qodir aka bo'yicha hisob-kitoblar
  if (q.includes('qodir') || q.includes('кодир') || q.includes('чек') || q.includes('chek')) {
    if (isRu) {
      return `📌 **Специальные правила по Кодир ака / ока:**

1. **Бонус 5% к прибыли**: Если в сделке партнером выступает *Кодир ака* или *Green Bazar*, 5% от суммы закупки автоматически начисляется в чистую прибыль компании.
2. **Формула расхода по чеку**:
   $$\\text{Чек харажати} = \\text{Расчетная сумма клиенту} + \\text{Комиссия агента}$$
3. **Текущий факт расходов по чекам Кодир ака**: **${formatUZS(totalQodirExpense)}**.
4. Сумма отображается в карточке сделки, таблице и дашборде.`;
    }
    return `📌 **Qodir aka / oka bo'yicha maxsus hisob-kitob qoidalari:**

1. **5% Foyda Bonusi**: Bitimda hamkor sifatida *Qodir aka* yoki *Green Bazar* tanlansa, tovar xarid summasining 5% qismi avtomatik ravishda loyiha sof foydasiga qo'shiladi.
2. **Chek xarajati formulasi**:
   $$\\text{Qodir chek xarajati} = \\text{Mijozga to'lov (Hisob summasi)} + \\text{Agent komissiyasi}$$
3. **Hozirgi umumiy Qodir aka cheklar xarajati**: **${formatUZS(totalQodirExpense)}**.
4. Bu summa Bitimlar jadvalida, chek chop etishda va umumiy tahlilda alohida yuritiladi.`;
  }

  // 3. Ombor va IMEI skaneri
  if (q.includes('ombor') || q.includes('склад') || q.includes('imei') || q.includes('skaner') || q.includes('сканер')) {
    if (isRu) {
      return `📦 **Склад, Приход и сканирование IMEI:**

- **В наличии на складе**: **${warehouseCount} шт** техники.
- **Ожидают закупки (Need to Buy)**: **${needToBuyCount} шт**.
- **Ожидаемые товары**: в списке склада подсвечиваются ярко-красным цветом.
- **Быстрый приход**: нажмите кнопку **'Kamera skaneri'**, наведите камеру на коробку/штрих-код IMEI — товар оприходуется за 1 секунду.
- **Перемещение**: из Горького на Грин Базар или другие склады отправляется со статусом *'Yo'lda'* (В пути) до подтверждения принимающей стороной.`;
    }
    return `📦 **Ombor, Kirim (Prixod) va IMEI Skanerlash:**

- **Omborda tayyor tovarlar**: **${warehouseCount} ta**.
- **Kutilayotgan xaridlar (Need to Buy)**: **${needToBuyCount} ta** bitim.
- **Kutilayotgan tovarlar**: Ombor oynasida qizil rangda alohida ajralib turadi.
- **Tezkor Prixod**: **'Kamera skaneri'** tugmasini bosib, qutidagi IMEI shtrix-kodini ko'rsatsangiz, 1 soniyada omborga kirim qilinadi.
- **Filiallararo ko'chirish**: Gorkiy, Green Bazar va boshqa omborlar o'rtasida tovar jo'natilganda, qabul qilib olinmaguncha *'Yo'lda'* holatida saqlanadi.`;
  }

  // 4. Hozirgi statistika va daromad
  if (q.includes('statistika') || q.includes('jami') || q.includes('foyda') || q.includes('daromad') || q.includes('прибыль') || q.includes('статистика')) {
    if (isRu) {
      return `📊 **Текущие финансовые показатели FinModel ERP:**

- 📝 Всего сделок: **${dealsCount} шт**
- 💳 Объем списанных лимитов: **${formatUZS(totalWithdrawn)}**
- 💰 Чистая прибыль (P&L): **${formatUZS(totalProfit)}**
- 🧾 Расходы по чекам Кодир ака: **${formatUZS(totalQodirExpense)}**
- 📦 На складе: **${warehouseCount} шт** (Ожидают выкупа: **${needToBuyCount} шт**)
- 👥 Лидов в CRM: **${leadsCount}** | Сотрудников: **${employeesCount}**`;
    }
    return `📊 **FinModel ERP joriy real ko'rsatkichlari:**

- 📝 Jami bitimlar: **${dealsCount} ta**
- 💳 Yechilgan limitlar hajmi: **${formatUZS(totalWithdrawn)}**
- 💰 Kompaniya sof foydasi (P&L): **${formatUZS(totalProfit)}**
- 🧾 Qodir aka cheklar xarajati: **${formatUZS(totalQodirExpense)}**
- 📦 Omborda mavjud: **${warehouseCount} ta** (Kutilayotgan: **${needToBuyCount} ta**)
- 👥 CRM dagi lidlar: **${leadsCount} ta** | Xodimlar soni: **${employeesCount} ta**`;
  }

  // 5. Jamoalar va Lidlar (Jahongir & Farida)
  if (q.includes('jamoa') || q.includes('jahongir') || q.includes('farida') || q.includes('lid') || q.includes('команд') || q.includes('лид')) {
    if (isRu) {
      return `👥 **Колл-центр и Команды в CRM (\`/leads\`):**

- **Команда Жаҳонгира**: Шаҳзода, Ҳосила, Назокат, Гулнур, Наргиза, Ҳасан, Муяссар, Шаҳло, Муборак, Маржона, Ситора.
- **Команда Фариды**: Фарида, Муслима.
- **Функции**:
  - Автоматическое определение дубликатов по номеру телефона (защита от перехвата лидов).
  - Конверсия в сделку в 1 клик с сохранением ответственного агента.
  - Живой рейтинг по количеству подтвержденных чеков и объему лимитов.`;
    }
    return `👥 **Koll-markaz va Jamoalar CRM (\`/leads\`):**

- **Jahongir jamoasi**: Shahzoda, Hosila, Nazokat, Gulnur, Nargiza, Hasan, Muyassar, Shahlo, Muborak, Marjona, Sitora.
- **Farida jamoasi**: Farida, Muslima.
- **Asosiy imkoniyatlar**:
  - Telefon raqami bo'yicha dublikat lidlarni darhol ogohlantirish (bir mijozni ikki agentga kirmasligi uchun).
  - 1 bosishda lidni rasmiy Bitimga aylantirish (mas'ul agent va jamoa saqlanadi).
  - Jamoalar va agentlar o'rtasida kunlik/oylik tasdiqlangan cheklar reytingi.`;
  }

  // Default response
  if (isRu) {
    return `🤖 **Я готов ответить на любой ваш вопрос по FinModel ERP:**

1. 🌟 **Как работает система** — обзор всех 17 страниц и ролей.
2. 📊 **Сделки и Чеки** — лимиты, проценты, расчет суммы клиенту и комиссия агентов.
3. 🧾 **Кодир ака** — бонус 5% и расчет расходов по чекам.
4. 📦 **Склад и IMEI** — сканирование штрих-кода, перемещение и инвентаризация.
5. 👥 **Команды и Лиды** — Жахонгир и Фарида, рейтинги и дубликаты.
6. 💰 **ДДС и Финансы** — касса, P&L, баланс и добавление категорий.
7. 📋 **HR и Табель** — 31-дневный учет, авансы и расчет зарплаты.

*Напишите свой вопрос или выберите одну из подсказок ниже!*`;
  }
  return `🤖 **FinModel ERP bo'yicha istalgan savolingizga javob berishga tayyorman:**

1. 🌟 **Sayt qanday ishlaydi** — barcha 17 ta sahifa va rollar bo'yicha yo'riqnoma.
2. 📊 **Bitimlar va Cheklar** — limitlar, foizlar, mijozga to'lov va agent haqi.
3. 🧾 **Qodir aka** — 5% foyda bonusi va chek xarajati formulasi.
4. 📦 **Ombor va IMEI** — shtrix-kod skaneri, filiallararo o'tkazish va audit.
5. 👥 **Jamoalar va CRM** — Jahongir va Farida, agentlar reytingi va dublikat nazorati.
6. 💰 **DDS va Moliya** — kassa, P&L, sheriklar balansi va xarajat toifalari.
7. 📋 **HR va Tabel** — 31 kunlik davomat, avanslar va oylik hisob-kitobi.

*Savolingizni yozing yoki quyidagi tayyor tugmalardan birini bosing!*`;
}

// GET /api/ai/status
router.get('/status', (req: Request, res: Response) => {
  const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  res.json({
    active: true,
    geminiConfigured: hasKey,
    model: hasKey ? GEMINI_MODEL : 'FinModel AI Engine'
  });
});

export default router;
