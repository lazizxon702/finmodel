import { defineModule } from '../types';

// Davr filtrlari (DateRangeFilter komponenti ishlatadi)
export default defineModule({
  uz: {
    'period.today': 'Bugun',
    'period.week': 'Hafta',
    'period.month': 'Oy',
    'period.all': 'Hammasi',
    'period.custom': 'Oraliq',
    'period.yesterday': 'Kecha',
    'period.from': 'Boshlanish sanasi',
    'period.to': 'Tugash sanasi',
    'period.label': 'Davr',
    'period.range': '{from} — {to}',
    'period.tashkent_note': 'Sanalar Toshkent vaqti bo\'yicha',
  },
  ru: {
    'period.today': 'Сегодня',
    'period.week': 'Неделя',
    'period.month': 'Месяц',
    'period.all': 'Все',
    'period.custom': 'Период',
    'period.yesterday': 'Вчера',
    'period.from': 'Дата начала',
    'period.to': 'Дата окончания',
    'period.label': 'Период',
    'period.range': '{from} — {to}',
    'period.tashkent_note': 'Даты по времени Ташкента',
  },
  en: {
    'period.today': 'Today',
    'period.week': 'Week',
    'period.month': 'Month',
    'period.all': 'All time',
    'period.custom': 'Range',
    'period.yesterday': 'Yesterday',
    'period.from': 'Start date',
    'period.to': 'End date',
    'period.label': 'Period',
    'period.range': '{from} — {to}',
    'period.tashkent_note': 'Dates are in Tashkent time',
  },
});
