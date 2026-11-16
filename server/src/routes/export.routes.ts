import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { Prisma } from '@prisma/client';
import { APPROVED_ONLY, dealScopeWhere, isScopedRole } from '../services/access.service';
import { HttpError, dateRangeWhere, parseApprovalFilter, tashkentYmd } from './deals.routes';

const router = Router();

// GET /api/export/xlsx (Direct Download with live formulas)
router.get('/xlsx', authenticateToken, async (req: AuthRequest, res: Response) => {
  // Registratura: eksportda foyda/agent ustunlari bor — bu rol uchun yopiq (egasi, 16.11.2026)
  if (req.user?.role === 'REGISTRATURA') return res.status(403).json({ error: "Eksport uchun huquqingiz yetarli emas" });
  try {
    const { startDate, endDate, sheets } = req.query as any;

    const requestedSheets = sheets ? (sheets as string).split(',') : null;
    const shouldInclude = (name: string) => !requestedSheets || requestedSheets.includes(name);

    // Ruxsat doirasi: OPERATOR/AGENT faqat o'z doirasidagi bitimlarni eksport qiladi,
    // kompaniya DDS tranzaksiyalari esa ularga umuman berilmaydi.
    const scoped = isScopedRole(req.user!.role);
    const scope = await dealScopeWhere(req.user!);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Macmobi ERP System';
    workbook.created = new Date();

    // Common header style
    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF166534' }, // Forest Green
    };
    const headerFont: Partial<ExcelJS.Font> = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };

    // 1. Сделки_и_Склад
    if (shouldInclude('Сделки_и_Склад')) {
      const ws = workbook.addWorksheet('Сделки_и_Склад', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 2 }],
      });

      const headers = [
        'ID сделки', 'Дата сделки', 'Продавец', 'Банк / Провайдер', 'Дафтар',
        'Имя Фамиля клиента', 'Номер клиента 1', 'Номер клиента 2', 'Магазин / Партнер',
        'Лимит клиента', 'Снятие лимит', 'Агент суммаси', 'Расход агент и выкупка', 'Дисконт выкупа, %',
        '% Агента', 'Расчетное сумма', 'Остаток лимит', 'Разница соотнашение от %',
        'Наимонавание электротехники', 'Колл-во', 'IMEI или Баркод', 'Статус товара',
        'Имя Агентсво', 'Имя агента', 'Доп баланс Daftar', 'Alif Qodiraka должен',
        'Доп баланс Alif Qodiraka', 'Доп баланс Green bazar', 'Доп баланс Trust 1', 'Итого доп баланс',
        'Покупатель / Оптовик', 'Цена продажи, UZS', 'Прибыль, UZS', 'Маржа, %',
        'Получено от покупателя', 'Остаток долга (Дебит)', 'Статус оплаты', 'Примечание'
      ];

      ws.addRow(headers);
      ws.getRow(1).font = headerFont;
      ws.getRow(1).fill = headerFill;
      ws.getRow(1).height = 24;

      // Filtr: doira + (sukut bo'yicha) faqat tasdiqlangan bitimlar — ИТОГО qatori hisob-kitobga mos bo'lsin.
      // approvalStatus=all bilan tasdiqlanmaganlari ham chiqadi. Sana chegaralari Asia/Tashkent bo'yicha.
      const and: Prisma.DealWhereInput[] = [scope];
      const approval = parseApprovalFilter((req.query as any).approvalStatus, APPROVED_ONLY);
      if (approval) and.push(approval);
      const range = dateRangeWhere(startDate, endDate);
      if (range) and.push({ date: range });

      const deals = await prisma.deal.findMany({
        where: { AND: and },
        include: { store: true, provider: true, agency: true, agent: true, buyer: true },
        orderBy: { dealNumber: 'asc' },
      });

      // Total row at row 2
      const totalRow = ws.addRow([
        'ИТОГО', '', '', '', '', '', '', '', '',
        { formula: `SUM(J3:J${deals.length + 2})` }, // Limit
        { formula: `SUM(K3:K${deals.length + 2})` }, // Withdrawn
        { formula: `SUM(L3:L${deals.length + 2})` }, // Agent amount
        { formula: `SUM(M3:M${deals.length + 2})` }, // Purchase cost
        '', '',
        { formula: `SUM(P3:P${deals.length + 2})` }, // Calculated
        { formula: `SUM(Q3:Q${deals.length + 2})` }, // Remaining
        { formula: `SUM(R3:R${deals.length + 2})` }, // Difference
        '', '', '', '', '', '',
        { formula: `SUM(Y3:Y${deals.length + 2})` }, // Daftar
        { formula: `SUM(Z3:Z${deals.length + 2})` }, // Qodir debt
        { formula: `SUM(AA3:AA${deals.length + 2})` }, // Qodir bal
        { formula: `SUM(AB3:AB${deals.length + 2})` }, // Green bazar
        { formula: `SUM(AC3:AC${deals.length + 2})` }, // Trust
        { formula: `SUM(AD3:AD${deals.length + 2})` }, // Extra total
        '',
        { formula: `SUM(AF3:AF${deals.length + 2})` }, // Sale price
        { formula: `SUM(AG3:AG${deals.length + 2})` }, // Profit
        '',
        { formula: `SUM(AI3:AI${deals.length + 2})` }, // Received
        { formula: `SUM(AJ3:AJ${deals.length + 2})` }, // Debt
        '', ''
      ]);
      totalRow.font = { bold: true };
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

      // Add Deal Rows
      deals.forEach((d, idx) => {
        const rNum = idx + 3;
        ws.addRow([
          d.dealNumber,
          tashkentYmd(d.date),
          d.sellerName,
          d.provider?.name || '',
          d.isDaftar ? 'Да' : 'Нет',
          d.customerName || '',
          d.customerPhone1 || '',
          d.customerPhone2 || '',
          d.store?.name || '',
          Number(d.customerLimit),
          Number(d.withdrawnLimit),
          { formula: `K${rNum}*(N${rNum}-0.22)` }, // Agent amount formula
          { formula: `L${rNum}+P${rNum}` }, // Purchase cost formula
          { formula: `IF(K${rNum}>0, (K${rNum}-P${rNum})/K${rNum}, 0)` }, // Discount %
          { formula: `IF(K${rNum}>0, L${rNum}/K${rNum}, 0)` }, // Agent %
          Number(d.calculatedAmount),
          { formula: `J${rNum}-K${rNum}` }, // Remaining limit
          { formula: `K${rNum}-P${rNum}` }, // Difference
          d.productName || '',
          d.quantity,
          d.imeiBarcode || '',
          d.status,
          d.agency?.name || '',
          d.agent?.name || '',
          { formula: `IF(E${rNum}="Да", K${rNum}, 0)` },
          Number(d.qodirDebt),
          Number(d.qodirBalance),
          Number(d.greenBazarBalance),
          Number(d.trustBalance),
          { formula: `Y${rNum}+AA${rNum}+AB${rNum}+AC${rNum}` },
          d.buyer?.name || '',
          Number(d.salePrice),
          { formula: `IF(V${rNum}="SOLD", AF${rNum}-(P${rNum}+R${rNum}), 0)` }, // Corrected profit formula
          { formula: `IF(AF${rNum}>0, AG${rNum}/AF${rNum}, 0)` }, // Margin %
          Number(d.receivedFromBuyer),
          { formula: `IF(V${rNum}="SOLD", AF${rNum}-AI${rNum}, 0)` }, // Debt
          d.paymentStatus,
          d.note || '',
        ]);
      });

      // Format currency and percentage columns
      [10, 11, 12, 13, 16, 17, 18, 25, 26, 27, 28, 29, 30, 32, 33, 35, 36].forEach((colIdx) => {
        ws.getColumn(colIdx).numFmt = '#,##0';
        ws.getColumn(colIdx).width = 16;
      });
      [14, 15, 34].forEach((colIdx) => {
        ws.getColumn(colIdx).numFmt = '0.0%';
        ws.getColumn(colIdx).width = 12;
      });
    }

    // 2. Транзакции_ДДС
    if (!scoped && shouldInclude('Транзакции_ДДС')) {
      const wsDds = workbook.addWorksheet('Транзакции_ДДС', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
      });

      wsDds.addRow(['ID', 'Дата и время', 'Тип операции', 'Счет / Кошелек', 'Тип расхода', 'Категория', 'Источник операции', 'Сумма, UZS', 'Назначение / Описание']);
      wsDds.getRow(1).font = headerFont;
      wsDds.getRow(1).fill = headerFill;

      const txs = await prisma.ddsTransaction.findMany({ orderBy: { dateTime: 'desc' } });
      txs.forEach((t) => {
        wsDds.addRow([
          t.txNumber,
          t.dateTime.toISOString().slice(0, 19).replace('T', ' '),
          t.type === 'INCOME' ? 'Доход' : 'Расход',
          t.account === 'CASH' ? 'Касса (Наличные)' : t.account === 'BANK_CARD' ? 'Банковская карта' : 'Расчетный счет',
          t.expenseType === 'COGS' ? 'Переменные (COGS)' : 'Операционные (OPEX)',
          t.categoryName,
          t.sourcePerson,
          Number(t.amount),
          t.description || '',
        ]);
      });
      wsDds.getColumn(8).numFmt = '#,##0';
      wsDds.getColumn(8).width = 16;
    }

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Macmobi_ERP_Export_${new Date().toISOString().slice(0, 10)}.xlsx"`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error: any) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('Export error:', error);
    return res.status(500).json({ error: 'Excel eksport qilishda xatolik' });
  }
});

export default router;
