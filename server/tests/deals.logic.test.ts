import { beforeEach, describe, expect, it, vi } from 'vitest';

// Bazasiz sof testlar: prisma va tashqi servislar soxta (mock) — hech qanday tarmoq/baza so'rovi ketmaydi
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    deal: { findFirst: vi.fn() },
  },
}));
vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/services/sheetsSync.service', () => ({
  pushDealToGoogleSheets: vi.fn(async () => ({ success: false })),
}));
vi.mock('../src/services/notification.service', () => ({
  notifyDealDecision: vi.fn(async () => undefined),
}));

import { APPROVED_ONLY, dealScopeWhere, isScopedRole } from '../src/services/access.service';
import { initialApprovalStatus } from '../src/services/calculation.service';
import {
  EXPENSE_ROLES,
  HttpError,
  KPI_METRICS,
  approvalAfterEdit,
  buildDealProducts,
  cleanCustomerText,
  combineTashkentDayAndTime,
  computeKpi,
  dateRangeWhere,
  dealDateTimeLabel,
  dealItemsView,
  dealWriteDenial,
  isNoonMarker,
  kpiDealValue,
  parseAccount,
  parseApprovalFilter,
  parseDealDateInput,
  pickItemsInput,
  resolveDealDateForCreate,
  resolveDealDateForUpdate,
  scopedDealWhere,
  serializeDeal,
  tashkentYmd,
  toDeviceItemsJson,
  maskDealForRole,
  maskTotalsForRole,
} from '../src/routes/deals.routes';

const user = (role: string, id = 'u1') => ({ id, role, username: id, fullName: id }) as any;

describe("Ruxsat doirasi (dealScopeWhere)", () => {
  beforeEach(() => {
    prismaMock.user.findMany.mockReset();
    prismaMock.user.findUnique.mockReset();
  });

  it("OPERATOR faqat o'zi kiritgan bitimlarni ko'radi", async () => {
    expect(await dealScopeWhere(user('OPERATOR', 'op1'))).toEqual({ createdById: 'op1' });
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("AGENT: o'zi + jamoasidagi operatorlar + o'z agentligi", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'op1' }, { id: 'op2' }]);
    prismaMock.user.findUnique.mockResolvedValue({ agencyId: 'ag1' });
    expect(await dealScopeWhere(user('AGENT', 'agent1'))).toEqual({
      OR: [{ createdById: { in: ['agent1', 'op1', 'op2'] } }, { agencyId: 'ag1' }],
    });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { parentAgentId: 'agent1' }, select: { id: true } });
  });

  it("AGENT agentlikka biriktirilmagan bo'lsa — faqat jamoasi", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockResolvedValue({ agencyId: null });
    expect(await dealScopeWhere(user('AGENT', 'agent1'))).toEqual({ OR: [{ createdById: { in: ['agent1'] } }] });
  });

  it("REGISTRATURA butun Registratura jamoasi kiritgan bitimlarni ko'radi (boshqalarnikini — yo'q)", async () => {
    expect(await dealScopeWhere(user('REGISTRATURA', 'reg1'))).toEqual({ createdBy: { role: 'REGISTRATURA' } });
    expect(isScopedRole('REGISTRATURA')).toBe(true);
  });

  it("REGISTRATURA Bitimlar ro'yxatida HAMMA cheklarni ko'radi, lekin moliyaviy maydonlar yashiriladi", async () => {
    expect(await scopedDealWhere(user('REGISTRATURA', 'reg1'), { id: 'd1' })).toEqual({ AND: [{}, { id: 'd1' }] });
    const dto = { id: 'd1', withdrawnLimit: 10, calculatedAmount: 7, profit: 3, agentAmount: 1, totalPurchaseCost: 8, marginPct: 0.3 };
    expect(maskDealForRole(dto, 'REGISTRATURA')).toMatchObject({ withdrawnLimit: 10, calculatedAmount: 7, totalPurchaseCost: 0, profit: 0, agentAmount: 0, marginPct: 0, financeHidden: true });
    expect(maskDealForRole(dto, 'ADMIN')).toBe(dto);
    expect(maskDealForRole(dto, 'OPERATOR')).toBe(dto);
    const totals = { dealCount: 2, totalWithdrawn: 20, totalCalculatedAmount: 14, totalPurchaseCost: 16, totalProfit: 6, totalAgentAmount: 2 };
    expect(maskTotalsForRole(totals, 'REGISTRATURA')).toMatchObject({ dealCount: 2, totalWithdrawn: 20, totalCalculatedAmount: 14, totalPurchaseCost: 0, totalProfit: 0, totalAgentAmount: 0 });
    expect(maskTotalsForRole(totals, 'ADMIN')).toBe(totals);
  });

  it("boshqa rollar uchun cheklov yo'q", async () => {
    for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'CFO', 'COO', 'VIEWER', 'STOREKEEPER', 'SELLER']) {
      expect(await dealScopeWhere(user(role))).toEqual({});
    }
  });

  it("scopedDealWhere doirani har doim AND bilan qo'shadi (qidiruvdagi OR doirani buzmaydi)", async () => {
    const search = { OR: [{ customerName: { contains: 'x' } }] };
    expect(await scopedDealWhere(user('OPERATOR', 'op1'), { id: 'd1' }, undefined, search)).toEqual({
      AND: [{ createdById: 'op1' }, { id: 'd1' }, search],
    });
    expect(await scopedDealWhere(user('ADMIN'), APPROVED_ONLY)).toEqual({ AND: [{}, { approvalStatus: 'APPROVED' }] });
  });

  it('cheklangan rollar: OPERATOR va AGENT', () => {
    expect(isScopedRole('OPERATOR')).toBe(true);
    expect(isScopedRole('AGENT')).toBe(true);
    expect(isScopedRole('ADMIN')).toBe(false);
    expect(isScopedRole('MANAGER')).toBe(false);
  });
});

describe("Yaratish / tahrirlash / o'chirish huquqi", () => {
  it("yangi bitim holati: OPERATOR/AGENT → tasdiq kutadi, qolganlar → darhol tasdiqlangan", () => {
    expect(initialApprovalStatus('OPERATOR')).toBe('PENDING_APPROVAL');
    expect(initialApprovalStatus('AGENT')).toBe('PENDING_APPROVAL');
    // Egasi (20.11.2026): admin'dan boshqa hamma rol — tasdiq kutadi
    expect(initialApprovalStatus('ADMIN')).toBe('APPROVED');
    for (const role of ['MANAGER', 'CASHIER', 'CFO', 'SELLER', 'COO', 'STOREKEEPER']) {
      expect(initialApprovalStatus(role)).toBe('PENDING_APPROVAL');
    }
  });

  it("REGISTRATURA: bitimi tasdiq kutadi; tahrirlash va o'chirish HECH QAYSI holatda yo'q", () => {
    expect(initialApprovalStatus('REGISTRATURA')).toBe('PENDING_APPROVAL');
    for (const status of ['PENDING_APPROVAL', 'APPROVED', 'REJECTED']) {
      expect(dealWriteDenial('edit', 'REGISTRATURA', status)).toBeTruthy();
      expect(dealWriteDenial('delete', 'REGISTRATURA', status)).toBeTruthy();
    }
  });

  it("tahrirlash: OPERATOR/AGENT tasdiqlangan bitimga tega olmaydi", () => {
    for (const role of ['OPERATOR', 'AGENT']) {
      expect(dealWriteDenial('edit', role, 'APPROVED')).toBeTruthy();
      expect(dealWriteDenial('edit', role, 'PENDING_APPROVAL')).toBeNull();
      expect(dealWriteDenial('edit', role, 'REJECTED')).toBeNull();
    }
    for (const role of ['ADMIN', 'MANAGER', 'CASHIER']) {
      expect(dealWriteDenial('edit', role, 'APPROVED')).toBeNull();
    }
  });

  it("o'chirish: ADMIN/MANAGER — istalgan; OPERATOR/AGENT — faqat kutilayotgan; qolganlar — yo'q", () => {
    for (const status of ['PENDING_APPROVAL', 'APPROVED', 'REJECTED']) {
      expect(dealWriteDenial('delete', 'ADMIN', status)).toBeNull();
      expect(dealWriteDenial('delete', 'MANAGER', status)).toBeNull();
      for (const role of ['CASHIER', 'CFO', 'VIEWER', 'SELLER', 'STOREKEEPER']) {
        expect(dealWriteDenial('delete', role, status)).toBeTruthy();
      }
    }
    for (const role of ['OPERATOR', 'AGENT']) {
      expect(dealWriteDenial('delete', role, 'PENDING_APPROVAL')).toBeNull();
      expect(dealWriteDenial('delete', role, 'APPROVED')).toBeTruthy();
      expect(dealWriteDenial('delete', role, 'REJECTED')).toBeTruthy();
    }
  });

  it("rad etilgan bitimni OPERATOR/AGENT tuzatsa — yana tasdiqqa qaytadi; admin tahriri holatni o'zgartirmaydi", () => {
    expect(approvalAfterEdit('OPERATOR', 'REJECTED')).toBe('PENDING_APPROVAL');
    expect(approvalAfterEdit('AGENT', 'REJECTED')).toBe('PENDING_APPROVAL');
    expect(approvalAfterEdit('OPERATOR', 'PENDING_APPROVAL')).toBe('PENDING_APPROVAL');
    expect(approvalAfterEdit('ADMIN', 'REJECTED')).toBe('REJECTED');
    expect(approvalAfterEdit('ADMIN', 'APPROVED')).toBe('APPROVED');
  });

  it("chek xarajatini yozish: faqat ADMIN/MANAGER/CASHIER/CFO", () => {
    expect([...EXPENSE_ROLES].sort()).toEqual(['ADMIN', 'CASHIER', 'CFO', 'MANAGER']);
  });

  it("hisob turi tekshiruvi: noto'g'ri qiymat → 400", () => {
    expect(parseAccount(undefined)).toBe('CASH');
    expect(parseAccount('cash')).toBe('CASH');
    expect(parseAccount(' bank_card ')).toBe('BANK_CARD');
    expect(parseAccount('SETTLEMENT_ACCOUNT')).toBe('SETTLEMENT_ACCOUNT');
    try {
      parseAccount('KASSA');
      throw new Error('xato tashlanishi kerak edi');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(400);
      expect((e as HttpError).message).toContain('CASH');
    }
  });

  it('approvalStatus filtri', () => {
    expect(parseApprovalFilter(undefined)).toBeUndefined();
    expect(parseApprovalFilter(undefined, APPROVED_ONLY)).toEqual(APPROVED_ONLY);
    expect(parseApprovalFilter('all', APPROVED_ONLY)).toBeUndefined();
    expect(parseApprovalFilter('pending_approval')).toEqual({ approvalStatus: { in: ['PENDING_APPROVAL'] } });
    expect(parseApprovalFilter('PENDING_APPROVAL,REJECTED')).toEqual({
      approvalStatus: { in: ['PENDING_APPROVAL', 'REJECTED'] },
    });
    expect(() => parseApprovalFilter('BOSHQA')).toThrow(HttpError);
  });
});

describe('Sana + aniq vaqt (Asia/Tashkent)', () => {
  const now = new Date('2026-11-12T09:41:27.000Z'); // Toshkentda 14:41:27

  it('klient yuborgan 12:00+05:00 — faqat kun belgisi', () => {
    expect(isNoonMarker('2026-11-12T12:00:00+05:00')).toBe(true);
    expect(isNoonMarker('2026-11-12T07:00:00.000Z')).toBe(true);
    expect(isNoonMarker('2026-11-12T12:00:01+05:00')).toBe(false);
    expect(isNoonMarker('2026-11-12T00:00:00.000Z')).toBe(false);
    expect(parseDealDateInput('2026-11-12T12:00:00+05:00')).toEqual({ kind: 'day', ymd: '2026-11-12', legacyMarker: true });
    expect(parseDealDateInput('2026-11-12')).toEqual({ kind: 'day', ymd: '2026-11-12', legacyMarker: false });
    expect(parseDealDateInput('')).toEqual({ kind: 'none' });
    expect(parseDealDateInput('2026-11-12T15:30:00+05:00').kind).toBe('exact');
    expect(() => parseDealDateInput('bugun')).toThrow(HttpError);
  });

  it("yaratishda: berilgan kun + hozirgi Toshkent soat:daqiqasi", () => {
    const d = resolveDealDateForCreate('2026-11-10T12:00:00+05:00', now);
    expect(d.toISOString()).toBe('2026-11-10T09:41:27.000Z');
    expect(resolveDealDateForCreate('2026-11-10', now).toISOString()).toBe('2026-11-10T09:41:27.000Z');
    // sana berilmasa — hozir
    expect(resolveDealDateForCreate(undefined, now)).toBe(now);
    // aniq vaqt berilsa — o'zgarmaydi
    expect(resolveDealDateForCreate('2026-11-10T08:15:00+05:00', now).toISOString()).toBe('2026-11-10T03:15:00.000Z');
  });

  it("yarim tundan keyin (Toshkent 00:00–05:00) kiritilgan bitim to'g'ri kunga tushadi", () => {
    const night = new Date('2026-11-11T21:30:00.000Z'); // Toshkentda 12-noyabr 02:30
    const d = resolveDealDateForCreate('2026-11-12T12:00:00+05:00', night);
    expect(d.toISOString()).toBe('2026-11-11T21:30:00.000Z');
    expect(tashkentYmd(d)).toBe('2026-11-12');
  });

  it("tahrirlashda kun o'zgarmasa saqlangan vaqt yo'qolmaydi", () => {
    const existing = new Date('2026-11-11T21:30:00.000Z'); // Toshkent: 12.11 02:30, UTC: 11.11
    expect(resolveDealDateForUpdate(undefined, existing)).toBe(existing);
    expect(resolveDealDateForUpdate('2026-11-12T12:00:00+05:00', existing)).toBe(existing);
    // eski klient formani UTC kuni bilan to'ldiradi — bu ham "o'zgarmagan"
    expect(resolveDealDateForUpdate('2026-11-11T12:00:00+05:00', existing)).toBe(existing);
    // kun haqiqatan o'zgarsa — yangi kun + avvalgi soat:daqiqa
    expect(resolveDealDateForUpdate('2026-11-05T12:00:00+05:00', existing).toISOString()).toBe('2026-11-04T21:30:00.000Z');
    // yangi klient (YYYY-MM-DD, Toshkent kuni) bilan UTC kuni mos kelsa ham kun almashtiriladi
    expect(resolveDealDateForUpdate('2026-11-11', existing).toISOString()).toBe('2026-11-10T21:30:00.000Z');
  });

  it('combineTashkentDayAndTime', () => {
    expect(combineTashkentDayAndTime('2026-01-31', now).toISOString()).toBe('2026-01-31T09:41:27.000Z');
  });

  it("dateTimeLabel: eski (12:00) yozuvda vaqt createdAt dan, aks holda date dan", () => {
    // eski yozuv: date = kun 12:00, createdAt o'sha Toshkent kunida 16:05
    expect(
      dealDateTimeLabel({ date: new Date('2026-11-10T07:00:00.000Z'), createdAt: new Date('2026-11-10T11:05:00.000Z') })
    ).toBe('10.11.2026 16:05');
    // createdAt boshqa kunda (o'tgan sana bilan kiritilgan) — date dan
    expect(
      dealDateTimeLabel({ date: new Date('2026-11-10T07:00:00.000Z'), createdAt: new Date('2026-11-12T11:05:00.000Z') })
    ).toBe('10.11.2026 12:00');
    // aniq vaqtli yangi yozuv — date dan
    expect(
      dealDateTimeLabel({ date: new Date('2026-11-10T09:41:27.000Z'), createdAt: new Date('2026-11-10T11:05:00.000Z') })
    ).toBe('10.11.2026 14:41');
    // Sheets importi (00:00 UTC) — date dan
    expect(dealDateTimeLabel({ date: new Date('2026-11-01T00:00:00.000Z'), createdAt: null })).toBe('01.11.2026 05:00');
  });

  it("sana oralig'i Toshkent kuni chegaralari bilan", () => {
    const r = dateRangeWhere('2026-11-12', '2026-11-12')!;
    expect((r.gte as Date).toISOString()).toBe('2026-11-11T19:00:00.000Z');
    expect((r.lte as Date).toISOString()).toBe('2026-11-12T18:59:59.999Z');
    expect(dateRangeWhere(undefined, undefined)).toBeUndefined();
    expect(dateRangeWhere('2026-11-12T10:00:00.000Z', undefined)).toEqual({ gte: new Date('2026-11-12T10:00:00.000Z') });
    expect(dateRangeWhere('axlat', '')).toBeUndefined();
  });
});

describe('Mijoz ismi va telefoni', () => {
  it("to'ldirgichlar (\"Mijoz\", \"-\") ma'lumot emas", () => {
    expect(cleanCustomerText('Mijoz')).toBeNull();
    expect(cleanCustomerText(' mijoz ')).toBeNull();
    expect(cleanCustomerText('-')).toBeNull();
    expect(cleanCustomerText('—')).toBeNull();
    expect(cleanCustomerText('')).toBeNull();
    expect(cleanCustomerText('   ')).toBeNull();
    expect(cleanCustomerText(null)).toBeNull();
    expect(cleanCustomerText(undefined)).toBeNull();
  });

  it('haqiqiy qiymat saqlanadi (ortiqcha bo\'shliqlarsiz)', () => {
    expect(cleanCustomerText('  Ahmadboyev   Shahzod ')).toBe('Ahmadboyev Shahzod');
    expect(cleanCustomerText('+998 97 102 22 47')).toBe('+998 97 102 22 47');
    expect(cleanCustomerText(998971022247)).toBe('998971022247');
    expect(cleanCustomerText('Mijozov Ali')).toBe('Mijozov Ali');
  });

  it("serializeDeal: ism/telefon to'liq qaytadi, to'ldirgich null bo'ladi", () => {
    const base = { id: 'd1', date: new Date('2026-11-10T09:41:27.000Z'), createdAt: new Date('2026-11-10T09:41:30.000Z') };
    const real = serializeDeal({ ...base, customerName: 'Sarvinoz', customerPhone1: '+998950858494', customerPhone2: '+998901112233' });
    expect(real.customerName).toBe('Sarvinoz');
    expect(real.customerPhone1).toBe('+998950858494');
    expect(real.customerPhone2).toBe('+998901112233');
    expect(real.dateTimeLabel).toBe('10.11.2026 14:41');
    expect(real.dateYmd).toBe('2026-11-10');

    const placeholder = serializeDeal({ ...base, customerName: 'Mijoz', customerPhone1: '-', customerPhone2: null });
    expect(placeholder.customerName).toBeNull();
    expect(placeholder.customerPhone1).toBeNull();
    expect(placeholder.customerPhone2).toBeNull();
  });

  it('serializeDeal: chek xarajati (DDS) holati', () => {
    const base = { id: 'd1', date: new Date('2026-11-10T09:41:27.000Z'), createdAt: null };
    expect('checkExpense' in serializeDeal(base)).toBe(false);
    expect(serializeDeal({ ...base, ddsTransactions: [] }).checkExpense).toBeNull();
    const withTx = serializeDeal({
      ...base,
      ddsTransactions: [{ id: 't1', txNumber: 'TX-1500', amount: '1960000', account: 'CASH', dateTime: new Date(0) }],
    });
    expect(withTx.checkExpense).toMatchObject({ id: 't1', txNumber: 'TX-1500', amount: 1960000, account: 'CASH' });
    expect('ddsTransactions' in withTx).toBe(false);
  });
});

describe("Ko'p mahsulotli bitim", () => {
  const two = [
    { productName: 'iPhone 15 Pro', color: 'Black', storageGb: '256GB', imeiBarcode: '111', imei2: '112', quantity: 1 },
    { productName: 'Samsung S25', color: 'Blue', storageGb: 128, imei1: '222', quantity: 2, price: 9_000_000 },
  ];

  it('yangi `items` va eski `deviceItems` ikkalasi ham qabul qilinadi', () => {
    expect(pickItemsInput({ items: two, deviceItems: [] })).toBe(two);
    expect(pickItemsInput({ deviceItems: two })).toBe(two);
    expect(pickItemsInput({ items: 'x' })).toBeUndefined();
    expect(pickItemsInput({})).toBeUndefined();
  });

  it("mahsulotlar va eski yagona maydonlar sinxron to'ldiriladi", () => {
    const p = buildDealProducts(two, {});
    expect(p.items).toHaveLength(2);
    expect(p.items.map((i) => i.position)).toEqual([0, 1]);
    expect(p.productName).toBe('iPhone 15 Pro + Samsung S25');
    expect(p.quantity).toBe(3);
    expect(p.imeiBarcode).toBe('111');
    expect(p.imei2).toBe('112');
    expect(p.color).toBe('Black');
    expect(p.storageGb).toBe('256GB');
    expect(p.items[1]).toMatchObject({ imei1: '222', storageGb: '128', quantity: 2, price: 9_000_000 });
  });

  it("ro'yxat berilmasa eski yagona maydonlardan bitta mahsulot yasaladi", () => {
    const p = buildDealProducts(undefined, { productName: ' Redmi 13 ', imeiBarcode: '333', quantity: '2', color: 'Green' });
    expect(p.items).toHaveLength(1);
    expect(p.items[0]).toMatchObject({ productName: 'Redmi 13', imei1: '333', quantity: 2, color: 'Green' });
    expect(p.productName).toBe('Redmi 13');
    expect(p.quantity).toBe(2);
  });

  it("bo'sh ro'yxat + mahsulot nomi yo'q → mahsulotsiz bitim", () => {
    const p = buildDealProducts([{ productName: '  ' }], {});
    expect(p.items).toHaveLength(0);
    expect(p.productName).toBeNull();
    expect(p.quantity).toBe(1);
    expect(p.imeiBarcode).toBeNull();
  });

  it('deviceItems (Json) eski klient kalitlari bilan yoziladi', () => {
    const json = toDeviceItemsJson(buildDealProducts(two, {}).items);
    expect(json[0]).toMatchObject({ id: '1', productName: 'iPhone 15 Pro', imeiBarcode: '111', imei1: '111', imei2: '112' });
    expect(json[1]).toMatchObject({ id: '2', imeiBarcode: '222', quantity: 2, price: 9_000_000 });
  });

  it("javobdagi items position bo'yicha tartiblanadi", () => {
    const view = dealItemsView({
      items: [
        { id: 'b', position: 1, productName: 'B', imei1: null, imei2: null, quantity: 1, price: '0' },
        { id: 'a', position: 0, productName: 'A', imei1: '1', imei2: null, quantity: 2, price: '150.5' },
      ],
    });
    expect(view.map((i) => i.id)).toEqual(['a', 'b']);
    expect(view[0]).toMatchObject({ imei1: '1', imeiBarcode: '1', quantity: 2, price: 150.5 });
  });

  it("DealItem qatori yo'q eski bitim: deviceItems yoki yagona maydonlardan yig'iladi", () => {
    const fromJson = dealItemsView({ items: [], deviceItems: [{ productName: 'Eski', imeiBarcode: '9', quantity: 1 }] });
    expect(fromJson).toHaveLength(1);
    expect(fromJson[0]).toMatchObject({ id: null, productName: 'Eski', imei1: '9' });

    const fromLegacy = dealItemsView({ productName: 'Juda eski', imeiBarcode: '7', quantity: 3 });
    expect(fromLegacy).toHaveLength(1);
    expect(fromLegacy[0]).toMatchObject({ productName: 'Juda eski', imei1: '7', quantity: 3 });

    expect(dealItemsView({ productName: null })).toEqual([]);
  });
});

describe('Dashboard KPI', () => {
  const deals = [
    { withdrawnLimit: '10000000', agentAmount: '800000.25', totalPurchaseCost: '7800000.25', calculatedAmount: '7000000', store: { name: 'Novza' } },
    { withdrawnLimit: 5_000_000, agentAmount: 300_000, totalPurchaseCost: 3_800_000, calculatedAmount: 3_500_000, store: { name: 'Qodir oka' } },
    { withdrawnLimit: 2_800_000, agentAmount: -56_000.1, totalPurchaseCost: 1_903_999.9, calculatedAmount: 1_960_000, store: { name: 'Кодир ака' } },
    { withdrawnLimit: 0, agentAmount: 0, totalPurchaseCost: 0, calculatedAmount: 0, store: null },
  ];

  it("har bir bitimning ko'rsatkichdagi ulushi", () => {
    expect(kpiDealValue('totalDeals', deals[0])).toBe(1);
    expect(kpiDealValue('totalLimitVolume', deals[0])).toBe(10_000_000);
    expect(kpiDealValue('totalAgentCommission', deals[0])).toBe(800_000.25);
    expect(kpiDealValue('totalBuyoutExpense', deals[0])).toBe(7_800_000.25);
    expect(kpiDealValue('totalPayout', deals[0])).toBe(7_000_000);
    expect(kpiDealValue('grossMargin', deals[0])).toBe(3_000_000);
    // Qodir aka cheki xarajati faqat Qodir aka do'konida (barcha yozilish variantlari)
    expect(kpiDealValue('totalQodirChekExpense', deals[0])).toBe(0);
    expect(kpiDealValue('totalQodirChekExpense', deals[1])).toBe(3_800_000);
    expect(kpiDealValue('totalQodirChekExpense', deals[2])).toBeCloseTo(1_903_999.9, 6);
  });

  it("KPI = bitimlar ulushlarining yig'indisi (kpi-details total = dashboard kartasi)", () => {
    const kpi = computeKpi(deals);
    expect(kpi.totalDeals).toBe(4);
    for (const metric of KPI_METRICS) {
      if (metric === 'totalDeals') continue;
      let sum = 0;
      for (const d of deals) sum += kpiDealValue(metric, d);
      expect(kpi[metric]).toBeCloseTo(sum, 6);
    }
    expect(kpi.totalLimitVolume).toBe(17_800_000);
    expect(kpi.totalPayout).toBe(12_460_000);
    expect(kpi.grossMargin).toBe(kpi.totalLimitVolume - kpi.totalPayout);
  });

  it("bo'sh ro'yxatda hammasi 0", () => {
    const kpi = computeKpi([]);
    for (const metric of KPI_METRICS) expect(kpi[metric]).toBe(0);
  });
});
