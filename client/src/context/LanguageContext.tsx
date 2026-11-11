import React, { createContext, useContext, useState } from 'react';

export type Language = 'uz' | 'ru';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  uz: {
    // Navigation / Menus
    'menu.dashboard': 'Dashboard',
    'menu.dashboard_sub': 'SWOT sana tahlili',
    'menu.leads': 'Lidlar (CRM)',
    'menu.leads_sub': 'Koll-markaz & Jamoalar',
    'menu.deals': 'Bitimlar',
    'menu.deals_sub': 'Bitimlar va ombor',
    'menu.warehouse': 'Ombor',
    'menu.warehouse_sub': 'Tovar qoldig\'i va prixod',
    'menu.sales': 'Sotuvlar',
    'menu.sales_sub': 'Sotuvlar va marja',
    'menu.inventory': 'Ombor',
    'menu.inventory_sub': 'Tovar qoldig\'i',
    'menu.debtors': 'Qarzdorlar',
    'menu.debtors_sub': 'Qarz hisobi va muddatlar',
    'menu.agents': 'Agentlar',
    'menu.agents_sub': 'Agent komissiyasi',
    'menu.agents_swot': 'Agentliklar tahlili',
    'menu.agents_swot_sub': 'SWOT agentliklar',
    'menu.hr': 'HR va Davomat',
    'menu.hr_sub': 'Xodimlar, Tabel & Maosh',
    'menu.dds': 'Pul harakati — DDS',
    'menu.dds_sub': 'Kassa va bank oqimlari',
    'menu.balance': 'Balans / Depozitlar',
    'menu.balance_sub': 'Sheriklar kapitali',
    'menu.daily': 'Kunlik hisob',
    'menu.daily_sub': 'Kunlik kassa va audit',
    'menu.finmodel': 'Moliyaviy model',
    'menu.finmodel_sub': '12 oylik reja va P&L',
    'menu.bot_deals': 'Bot bitimlari',
    'menu.bot_deals_sub': 'Telegram arizalari',
    'menu.bot_payments': 'Telegram cheklar',
    'menu.bot_payments_sub': 'To\'lov cheklari nazorati',
    'menu.finances': 'P&L, Kassa va Balans',
    'menu.finances_sub': 'Boshqaruv balansi',
    'menu.handover': 'Jarayonlar & FOT',
    'menu.handover_sub': 'Smena va KPI maoshi',
    'menu.references': 'Spravochniklar',
    'menu.references_sub': 'Filiallar va stavkalar',

    // Titles
    'title.dashboard': 'SWOT Boshqaruv Paneli va Moliya Xulosasi',
    'title.deals': 'Bitimlar va Ombor Jadvali',
    'title.warehouse': 'Ombor (Sklad) Nazorati',
    'title.sales': 'Sotuvlar va Marja Hisobi',
    'title.inventory': 'Ombor va Sotuvlar',
    'title.debtors': 'Qarzdorlar Ro\'yxati va Qarz Boshqaruvi',
    'title.agents': 'Agentlar Komissiyasi va Hisob-kitoblar',
    'title.agents_swot': 'Agentliklar SWOT Tahlili',
    'title.dds': 'Pul Harakati — DDS (Tranzaksiyalar)',
    'title.balance': 'Sheriklar Balansi va Depozitlar',
    'title.daily': 'Kunlik Hisob va Kassa Tahlili',
    'title.finmodel': '12 oylik Moliyaviy Model va P&L',
    'title.finances': 'Boshqaruv Balansi va Moliya',
    'title.bot_deals': 'Telegram Bot Bitimlari',
    'title.bot_payments': 'Bot To\'lovlari va Cheklar',
    'title.references': 'Spravochniklar va Qoidalar',
    'title.handover': 'Topshirish-qabul, KPI va FOT',
    'title.default': 'Pul va Tovar Hisobi Boshqaruv Tizimi',

    // Header & Actions
    'header.export_full': 'Google Sheets / Excel yuklash',
    'header.export_short': 'Eksport',
    'header.logout': 'Chiqish',
    'header.user': 'Foydalanuvchi',

    // Common Buttons & Labels
    'common.search': 'Qidiruv...',
    'common.all': 'Barchasi',
    'common.all_statuses': 'Barcha holatlar',
    'common.all_providers': 'Barcha provayderlar',
    'common.all_stores': 'Barcha do\'konlar',
    'common.clear_filter': 'Filtrni tozalash',
    'common.status': 'Holat',
    'common.actions': 'Amallar',
    'common.approve': 'Asosiyga o\'tkazish',
    'common.delete': 'O\'chirish',
    'common.save': 'Saqlash',
    'common.cancel': 'Bekor qilish',
    'common.add': 'Qo\'shish',
    'common.refresh': 'Yangilash',
    'common.edit': 'Tahrirlash',
    'common.filter': 'Filtr',
    'common.date': 'Sana',
    'common.date_time': 'Sana / Vaqt',
    'common.customer': 'Mijoz',
    'common.customer_contact': 'Mijoz va Bog\'lanish',
    'common.provider': 'Bank / Provayder',
    'common.store': 'Do\'kon / Hamkor',
    'common.limit': 'Mijoz Limiti',
    'common.withdrawn_limit': 'Yechilgan Limit',
    'common.product_qty': 'Tovar / Soni',
    'common.operator_tg': 'Operator / Telegram',
    'common.documents': 'Hujjatlar',
    'common.total': 'Jami',
    'common.total_row': 'JAMI YIG\'INDI',
    'common.seller': 'Sotuvchi',
    'common.customer_payment': 'Mijozga to\'lov',
    'common.agent_commission': 'Agent komissiyasi',
    'common.purchase_cost': 'Xarid xarajati',
    'common.discount_pct': 'Diskont %',
    'common.product_name': 'Mahsulot nomi',
    'common.imei_barcode': 'IMEI / Shtrix',
    'common.agency': 'Agentlik',
    'common.sale_price': 'Sotuv narxi',
    'common.profit': 'Sof foyda',
    'common.margin': 'Marja %',
    'common.cash': 'Kassa (Naqd)',
    'common.bank_card': 'Bank kartasi',
    'common.settlement': 'Hisob-raqam',
    'common.income': 'Kirim',
    'common.expense': 'Chiqim',
    'common.confirm_delete': 'Haqiqatan ham o\'chirmoqchimisiz?',
    'common.system_loading': 'Tizim yuklanmoqda...',
    'common.required': 'Majburiy',

    // Statuses
    'status.in_warehouse': 'Omborda',
    'status.in_transit': 'Yo\'lda',
    'status.pending': 'Kutilmoqda',
    'status.sold': 'Sotilgan',
    'status.need_to_buy': 'Sotib olish kerak',
    'status.money_received': 'Pul tushdi',

    // Deals specific
    'deals.title': 'Bitimlar va Ombor Jadvali',
    'deals.subtitle': 'Mijoz muddatli to\'lov limitlari, agent komissiyasi, tannarx va hisoblangan summalar',
    'deals.add_deal': 'Yangi bitim qo\'shish',

    // Phone Selector
    'phone.brand_select': '1. Brend / Rusumni tanlang',
    'phone.storage_select': '2. Xotira hajmi (GB / TB)',
    'phone.color_select': '3. Texnika rangi',
    'phone.other_brand': 'Boshqalar',
    'phone.other_storage': 'Boshqa GB',
    'phone.other_color': 'Boshqa rang',

    // Dashboard
    'dash.banner_title': 'SWOT Operatsion Boshqaruv Paneli',
    'dash.banner_sub': 'Barcha hisoblar real-vaqt rejimida yangilanadi',
    'dash.liquidity': 'Likvidlik',
    'dash.total_deals': 'Jami bitimlar soni',
    'dash.total_limits': 'Yechilgan limitlar hajmi',
    'dash.agent_commissions': 'Agent komissiyalari',
    'dash.calculated_amount': 'Hisoblangan summa (Mijozga)',
    'dash.warehouse_stock': 'Ombor tovar qoldig\'i',
    'dash.net_profit': 'Sof foyda (P&L)',
    'dash.daily_chart': 'Kunlik bitimlar dinamikasi',
    'dash.profit_chart': 'Kunlik aylanma va foyda grafigi',
    'dash.table_title': 'Kunlik operatsion hisobot (SWOT)',
    'dash.sub_deals': 'Barcha bitimlar soni',
    'dash.sub_limits': 'Yechilgan limitlar (UZS)',
    'dash.sub_commissions': 'Agent komissiyalari (UZS)',
    'dash.sub_calculated': 'Hisoblangan summa (UZS)',
    'dash.sub_warehouse': 'Qoldiq tovarlar qiymati',
    'dash.sub_profit': 'Loyiha sof foydasi',
  },
  ru: {
    // Navigation / Menus
    'menu.dashboard': 'Дашборд',
    'menu.dashboard_sub': 'SWOT анализ по дате',
    'menu.leads': 'Лиды (CRM)',
    'menu.leads_sub': 'Колл-центр и команды',
    'menu.deals': 'Сделки',
    'menu.deals_sub': 'Сделки и склад',
    'menu.warehouse': 'Склад',
    'menu.warehouse_sub': 'Остатки и приход',
    'menu.sales': 'Продажи',
    'menu.sales_sub': 'Реализация и маржа',
    'menu.inventory': 'Склад',
    'menu.inventory_sub': 'Остатки товара',
    'menu.debtors': 'Дебиторы (Долги)',
    'menu.debtors_sub': 'Учет задолженностей и сроки',
    'menu.agents': 'Агенты',
    'menu.agents_sub': 'Комиссии агентов',
    'menu.agents_swot': 'Анализ агентств',
    'menu.agents_swot_sub': 'SWOT анализ агентств',
    'menu.hr': 'HR и табель',
    'menu.hr_sub': 'Сотрудники, зарплата и KPI',
    'menu.dds': 'ДДС — Движение денег',
    'menu.dds_sub': 'Кассовые и банковские потоки',
    'menu.balance': 'Баланс / Депозиты',
    'menu.balance_sub': 'Капитал партнеров',
    'menu.daily': 'Ежедневный учет',
    'menu.daily_sub': 'Ежедневная касса и аудит',
    'menu.finmodel': 'Финмодель',
    'menu.finmodel_sub': '12-мес. план и P&L',
    'menu.bot_deals': 'Сделки из Бота',
    'menu.bot_deals_sub': 'Заявки из Telegram',
    'menu.bot_payments': 'Платежи Бота',
    'menu.bot_payments_sub': 'Контроль чеков и оплат',
    'menu.finances': 'P&L, Касса и Баланс',
    'menu.finances_sub': 'Управленческий баланс',
    'menu.handover': 'Процессы и ФОТ',
    'menu.handover_sub': 'Смены и KPI зарплата',
    'menu.references': 'Справочники',
    'menu.references_sub': 'Филиалы и ставки',

    // Titles
    'title.dashboard': 'Панель Управления SWOT и Свод Финансов',
    'title.deals': 'Таблица Сделок и Склада',
    'title.warehouse': 'Контроль Склада и Прихода',
    'title.sales': 'Учет Продаж и Маржи',
    'title.inventory': 'Склад и Продажи',
    'title.debtors': 'Список Дебиторов и Управление Задолженностью',
    'title.agents': 'Комиссии Агентов и Взаиморасчеты',
    'title.agents_swot': 'SWOT Анализ Агентств',
    'title.dds': 'Движение Денежных Средств — ДДС',
    'title.balance': 'Баланс Партнеров и Депозиты',
    'title.daily': 'Ежедневный Учет и Анализ Кассы',
    'title.finmodel': '12-месячная Финмодель и P&L',
    'title.finances': 'Управленческий Баланс и Финансы',
    'title.bot_deals': 'Сделки из Telegram Бота',
    'title.bot_payments': 'Платежи Бота и Чеки',
    'title.references': 'Справочники и Настройки',
    'title.handover': 'Прием-передача, KPI и ФОТ',
    'title.default': 'Система Учета Денег и Товарного Запаса',

    // Header & Actions
    'header.export_full': 'Экспорт в Google Sheets / Excel',
    'header.export_short': 'Экспорт',
    'header.logout': 'Выйти',
    'header.user': 'Пользователь',

    // Common Buttons & Labels
    'common.search': 'Поиск...',
    'common.all': 'Все',
    'common.all_statuses': 'Все статусы',
    'common.all_providers': 'Все провайдеры (Банки)',
    'common.all_stores': 'Все магазины',
    'common.clear_filter': 'Очистить фильтр',
    'common.status': 'Статус',
    'common.actions': 'Действия',
    'common.approve': 'Перенести в основные',
    'common.delete': 'Удалить',
    'common.save': 'Сохранить',
    'common.cancel': 'Отмена',
    'common.add': 'Добавить',
    'common.refresh': 'Обновить',
    'common.edit': 'Редактировать',
    'common.filter': 'Фильтр',
    'common.date': 'Дата',
    'common.date_time': 'Дата / Время',
    'common.customer': 'Клиент',
    'common.customer_contact': 'Клиент и Связь',
    'common.provider': 'Банк / Провайдер',
    'common.store': 'Магазин / Партнер',
    'common.limit': 'Лимит клиента',
    'common.withdrawn_limit': 'Списанный лимит',
    'common.product_qty': 'Товар / Кол-во',
    'common.operator_tg': 'Оператор / Telegram',
    'common.documents': 'Документы',
    'common.total': 'Итого',
    'common.total_row': 'ИТОГО',
    'common.seller': 'Продавец',
    'common.customer_payment': 'Выплата клиенту',
    'common.agent_commission': 'Комиссия агента',
    'common.purchase_cost': 'Закупочная стоимость',
    'common.discount_pct': 'Дисконт %',
    'common.product_name': 'Наименование товара',
    'common.imei_barcode': 'IMEI / Штрих-код',
    'common.agency': 'Агентство',
    'common.sale_price': 'Цена продажи',
    'common.profit': 'Чистая прибыль',
    'common.margin': 'Маржа %',
    'common.cash': 'Касса (Наличные)',
    'common.bank_card': 'Банковская карта',
    'common.settlement': 'Расчетный счет',
    'common.income': 'Приход',
    'common.expense': 'Расход',
    'common.confirm_delete': 'Вы действительно хотите удалить?',
    'common.system_loading': 'Загрузка системы...',
    'common.required': 'Обязательно',

    // Statuses
    'status.in_warehouse': 'На складе',
    'status.in_transit': 'В пути',
    'status.pending': 'Ожидается',
    'status.sold': 'Продано',
    'status.need_to_buy': 'Нужно купить',
    'status.money_received': 'Деньги поступили',

    // Deals specific
    'deals.title': 'Таблица Сделок и Склада',
    'deals.subtitle': 'Лимиты рассрочки клиентов, комиссии агентов, себестоимость и расчетные суммы',
    'deals.add_deal': 'Добавить новую сделку',

    // Phone Selector
    'phone.brand_select': '1. Выберите бренд / марку',
    'phone.storage_select': '2. Объем памяти (GB / TB)',
    'phone.color_select': '3. Цвет устройства',
    'phone.other_brand': 'Другие бренды',
    'phone.other_storage': 'Другая память',
    'phone.other_color': 'Другой цвет',

    // Dashboard
    'dash.banner_title': 'SWOT Операционная Панель Управления',
    'dash.banner_sub': 'Все расчеты обновляются в режиме реального времени',
    'dash.liquidity': 'Ликвидность',
    'dash.total_deals': 'Всего сделок',
    'dash.total_limits': 'Объем списанных лимитов',
    'dash.agent_commissions': 'Комиссии агентов',
    'dash.calculated_amount': 'Расчетная сумма (Клиенту)',
    'dash.warehouse_stock': 'Товарный остаток склада',
    'dash.net_profit': 'Чистая прибыль (P&L)',
    'dash.daily_chart': 'Динамика сделок по дням',
    'dash.profit_chart': 'График оборота и прибыли',
    'dash.table_title': 'Ежедневный операционный отчет (SWOT)',
    'dash.sub_deals': 'Количество всех сделок',
    'dash.sub_limits': 'Объем лимитов (UZS)',
    'dash.sub_commissions': 'Комиссии агентов (UZS)',
    'dash.sub_calculated': 'Расчетная сумма (UZS)',
    'dash.sub_warehouse': 'Стоимость товарного остатка',
    'dash.sub_profit': 'Чистая прибыль проекта',
  },
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'uz',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key: string, fallback?: string) => fallback || key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('finmodel_lang') as Language;
    return saved === 'ru' ? 'ru' : 'uz';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('finmodel_lang', lang);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'uz' ? 'ru' : 'uz');
  };

  const t = (key: string, fallback?: string): string => {
    return translations[language][key] || fallback || translations.uz[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => useContext(LanguageContext);
export const useLanguage = () => useContext(LanguageContext);
