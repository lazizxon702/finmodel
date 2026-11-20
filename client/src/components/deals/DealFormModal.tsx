import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Info, ShieldAlert } from 'lucide-react';
import { Badge, Button, Field, Input, Modal, Select, Textarea, controlClass, cn } from '../ui';
import { AmountInput } from '../AmountInput';
import { useTranslation } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { formatMoney, todayYmd, toYmdTashkent } from '../../utils/format';
import type { Agency, Deal, Provider, Role, Store } from '../../types';
import { DealItemsEditor, isItemRowFilled, newItemRow, type ItemRow } from './DealItemsEditor';
import { ACCOUNT_CODES, DEAL_STATUSES, type AccountCode, apiError, cleanText, dealItems, isQodirStore, isRegistratura, isScopedRole } from './dealUtils';

/** Lead sahifasidan kelgan boshlang'ich qiymatlar */
export interface DealPrefill {
  customerName?: string;
  customerPhone1?: string;
  customerPhone2?: string;
  customerLimit?: number;
}

interface Props {
  /** Tahrirlanayotgan bitim; yangi bitim uchun null */
  deal: Deal | null;
  prefill?: DealPrefill | null;
  stores: Store[];
  providers: Provider[];
  agencies: Agency[];
  role?: Role | null;
  onClose: () => void;
  /** Server qaytargan bitim (POST javobida checkExpenseResult ham bo'lishi mumkin) */
  onSaved: (saved: any, isEdit: boolean) => void;
}

/** GET /api/deals/my-defaults — kim kiritayotganiga qarab server beradigan avtomatik qiymatlar */
interface MyDefaults {
  agencyId: string | null;
  agencyName: string | null;
  agentId: string | null;
  agentName: string | null;
  registratorId: string | null;
  registratorName: string | null;
  lockAgency: boolean;
  lockAgent: boolean;
}

/** GET /api/registratura/options — registratorlar ro'yxati (faqat ADMIN) */
interface RegistratorOption {
  id: string;
  fullName: string;
  username?: string;
}

interface FormState {
  date: string;
  /** Faqat ADMIN tanlaydi; bo'sh = tanlanmagan */
  registratorId: string;
  providerId: string;
  storeId: string;
  agencyId: string;
  agentId: string;
  customerName: string;
  customerPhone1: string;
  customerPhone2: string;
  customerLimit: number;
  withdrawnLimit: number;
  calculatedAmount: number;
  status: string;
  statusChangeReason: string;
  adminOverrideCode: string;
  isDaftar: boolean;
  autoDdsExpense: boolean;
  ddsAccount: AccountCode;
  note: string;
}

const DISCOUNT_PRESETS = [20, 25, 28, 30, 33, 35, 40];

const parsePct = (raw: number | string) => parseFloat(String(raw).replace(',', '.')) || 0;

function initialForm(deal: Deal | null, prefill: DealPrefill | null | undefined, stores: Store[], providers: Provider[], agencies: Agency[], ownAgencyId = ''): FormState {
  if (deal) {
    return {
      // dateYmd — Toshkent kuni; toISOString().slice(0,10) UTC bo'yicha kesib, kunni bir kun orqaga siljitardi
      date: deal.dateYmd || (deal.date ? toYmdTashkent(deal.date) : todayYmd()),
      registratorId: deal.registrator?.id || '',
      providerId: deal.providerId || '',
      storeId: deal.storeId || '',
      agencyId: deal.agencyId || '',
      agentId: deal.agentId || '',
      customerName: cleanText(deal.customerName),
      customerPhone1: cleanText(deal.customerPhone1),
      customerPhone2: cleanText(deal.customerPhone2),
      customerLimit: Number(deal.customerLimit) || 0,
      withdrawnLimit: Number(deal.withdrawnLimit) || 0,
      calculatedAmount: Number(deal.calculatedAmount) || 0,
      status: deal.status,
      statusChangeReason: deal.statusChangeReason || '',
      adminOverrideCode: '',
      isDaftar: Boolean(deal.isDaftar),
      autoDdsExpense: false,
      ddsAccount: 'CASH',
      note: deal.note || '',
    };
  }
  const limit = Number(prefill?.customerLimit) || 10000000;
  const withdrawn = prefill?.customerLimit ? Math.round(limit * 0.28) : 2800000;
  return {
    date: todayYmd(),
    registratorId: '',
    providerId: providers[0]?.id || '',
    storeId: stores[0]?.id || '',
    // Agentlik oldindan ro'yxatdagi birinchisiga qo'yilmaydi (ilgari hamma bitim "Anvar" ga yozilib ketardi):
    // agent/operator uchun — o'z agentligi, boshqalar o'zi tanlaydi
    agencyId: agencies.some((a) => a.id === ownAgencyId) ? ownAgencyId : '',
    agentId: '',
    customerName: prefill?.customerName || '',
    customerPhone1: prefill?.customerPhone1 || '',
    customerPhone2: prefill?.customerPhone2 || '',
    customerLimit: limit,
    withdrawnLimit: withdrawn,
    calculatedAmount: Math.round(withdrawn * 0.7),
    status: 'PENDING',
    statusChangeReason: '',
    adminOverrideCode: '',
    isDaftar: false,
    autoDdsExpense: false,
    ddsAccount: 'CASH',
    note: '',
  };
}

function initialDiscount(deal: Deal | null): number {
  if (!deal) return 30;
  const limit = Number(deal.withdrawnLimit) || 0;
  const calc = Number(deal.calculatedAmount) || 0;
  return limit > 0 ? Number(((1 - calc / limit) * 100).toFixed(2)) : 30;
}

const sectionTitle = 'text-sm font-semibold text-fg';

/**
 * Bitim qo'shish / tahrirlash oynasi.
 * Saqlash FAQAT "Saqlash" tugmasi bosilganda ishlaydi: matn maydonida Enter (jumladan IMEI
 * skaneri yuboradigan Enter) formani yubormaydi.
 */
export const DealFormModal: React.FC<Props> = ({ deal, prefill, stores, providers, agencies, role, onClose, onSaved }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEdit = Boolean(deal);
  const scoped = isScopedRole(role);
  // Registratura: agentlik/agent tanlanmaydi (server o'zi qo'yadi), mavjud bitim tahrirlanmaydi
  const registratura = isRegistratura(role);
  const admin = role === 'ADMIN';
  const operator = role === 'OPERATOR';

  const [form, setForm] = useState<FormState>(() => initialForm(deal, prefill, stores, providers, agencies, user?.agencyId || ''));
  const [discountPercent, setDiscountPercent] = useState<number | string>(() => initialDiscount(deal));
  const [rows, setRows] = useState<ItemRow[]>(() => {
    const existing = deal ? dealItems(deal) : [];
    return existing.length ? existing.map((it) => newItemRow(it)) : [newItemRow()];
  });
  const [debtAlert, setDebtAlert] = useState<{ hasDebt: boolean; totalDebt: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (updates: Partial<FormState>) => setForm((prev) => ({ ...prev, ...updates }));

  // Yangi chek: agent/operator/registrator avtomatik qiymatlari (ADMIN uchun kerak emas)
  const [defaults, setDefaults] = useState<MyDefaults | null>(null);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  // Registratorlar ro'yxati — faqat ADMIN (boshqalarga server 403 beradi)
  const [registrators, setRegistrators] = useState<RegistratorOption[]>([]);

  useEffect(() => {
    let alive = true;
    if (admin) {
      axios
        .get('/api/registratura/options')
        .then((res) => alive && setRegistrators(Array.isArray(res.data) ? res.data : []))
        .catch(() => undefined);
    } else if (!isEdit) {
      axios
        .get('/api/deals/my-defaults')
        .then((res) => {
          if (!alive) return;
          const d: MyDefaults | null = res.data || null;
          setDefaults(d);
          // AGENT: agentlik qat'iy — o'z agentligi; boshqa agentlikdagi operator qolib ketmasin
          if (role === 'AGENT' && d?.lockAgency && d.agencyId) {
            setForm((prev) => (prev.agencyId === d.agencyId ? prev : { ...prev, agencyId: d.agencyId as string, agentId: '' }));
          }
        })
        .catch(() => undefined)
        .finally(() => alive && setDefaultsLoaded(true));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yangi chekda: OPERATOR agent/operatorni tanlamaydi; AGENT uchun agentlik qat'iy
  const hideAgentPickers = registratura || (operator && !isEdit);
  const lockedAgency = role === 'AGENT' && !isEdit && Boolean(defaults?.lockAgency && defaults.agencyId);
  // Tovar holati: yangi chekda faqat ADMIN tanlaydi (boshqalarga server "Kutilmoqda" qo'yadi)
  const canPickStatus = isEdit || admin;
  // Tahrirda: registrator yo'q, lekin eski erkin matnli sotuvchi bor — admin ko'rib tursin
  const oldSeller = isEdit && !deal!.registrator ? cleanText(deal!.sellerName) : '';

  // Daftar endi qo'lda tanlanmaydi: server o'zi qo'yadi (faqat Imanium + Denov/Jizzax). Bu yerda faqat ko'rsatiladi.
  const autoDaftar = (() => {
    const p = (providers.find((x) => x.id === form.providerId)?.name || '').toLowerCase();
    const s = (stores.find((x) => x.id === form.storeId)?.name || '').toLowerCase();
    return /imani|imanum|imanu|иман/.test(p) && /denov|денов|jizzax|jizzah|жиззах/.test(s);
  })();

  const store = stores.find((s) => s.id === form.storeId);
  const agency = agencies.find((a) => a.id === form.agencyId);
  const agents = agency?.agents || [];
  const statusChanged = isEdit && form.status !== deal!.status;

  const applyDiscount = (pct: number, withdrawn = form.withdrawnLimit) => {
    set({ withdrawnLimit: withdrawn, calculatedAmount: Math.round(withdrawn * (1 - pct / 100)) });
  };

  // Mijoz qarzdorligini tekshirish (ism maydonidan chiqilganda)
  const checkCustomerDebt = async (name: string) => {
    if (!name.trim()) {
      setDebtAlert(null);
      return;
    }
    try {
      const res = await axios.get('/api/debtors/check-customer', { params: { name: name.trim() } });
      setDebtAlert(res.data?.hasDebt ? res.data : null);
    } catch {
      // tekshiruv ishlamasa formani to'xtatmaymiz
    }
  };

  // Enter faqat ko'p qatorli maydon va tugmalarda ishlaydi; oddiy inputda formani yubormaydi
  const blockEnterSubmit = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
  };

  const save = async () => {
    if (saving) return;
    // Registratura mavjud bitimni hech qachon o'zgartira olmaydi (qo'shimcha himoya; asosiy tekshiruv serverda)
    if (registratura && isEdit) return;
    setError('');

    if (!form.date) return setError(t('dealsPage.err_date'));
    if (!form.storeId || !form.providerId) return setError(t('dealsPage.err_store_provider'));
    if (!(form.withdrawnLimit > 0)) return setError(t('dealsPage.err_withdrawn'));

    const filled = rows.filter(isItemRowFilled);
    // Mahsulotsiz kelgan eski bitimni (masalan Sheets'dan) mijoz ma'lumotini tuzatish uchun saqlash mumkin
    const hadNoItems = isEdit && dealItems(deal!).length === 0;
    if (!filled.length && !hadNoItems) return setError(t('dealsPage.err_no_product'));
    if (filled.some((r) => !r.productName.trim())) return setError(t('dealsPage.err_product_name'));

    if (statusChanged && !form.statusChangeReason.trim()) return setError(t('dealsPage.err_status_reason'));

    setSaving(true);
    try {
      // Qarzdor mijoz: administrator kodi serverda tekshiriladi (brauzerda saqlanmaydi)
      if (debtAlert?.hasDebt) {
        let overrideOk = false;
        if (form.adminOverrideCode.trim()) {
          try {
            const vr = await axios.post('/api/auth/verify-override', { code: form.adminOverrideCode });
            overrideOk = Boolean(vr.data?.valid);
          } catch {
            overrideOk = false;
          }
        }
        if (!overrideOk) {
          setError(t('dealsPage.err_debt_override', { amount: formatMoney(debtAlert.totalDebt) }));
          return;
        }
      }

      const payload: Record<string, unknown> = {
        ...form,
        // Sana "YYYY-MM-DD" — vaqtni server o'zi qo'yadi
        date: form.date,
        // To'ldirgich ("Mijoz", "-") YUBORILMAYDI: bo'sh bo'lsa bo'sh satr
        customerName: form.customerName.trim(),
        customerPhone1: form.customerPhone1.trim(),
        customerPhone2: form.customerPhone2.trim(),
        isDaftar: Boolean(form.isDaftar),
        // "Rasxodga qo'shish" — faqat ADMIN, faqat yangi chekda
        autoDdsExpense: admin && !isEdit && Boolean(form.autoDdsExpense),
        items: filled.map((r) => ({
          productName: r.productName.trim(),
          color: r.color.trim(),
          storageGb: r.storageGb.trim(),
          imei1: r.imei1.trim(),
          imeiBarcode: r.imei1.trim(),
          imei2: r.imei2.trim(),
          quantity: r.quantity,
          price: r.price,
        })),
      };
      // Registrator: faqat ADMIN tanlaydi (bo'shatilsa null); boshqalarga server o'zi qo'yadi
      if (admin) payload.registratorId = form.registratorId || null;
      else delete payload.registratorId;
      if (hideAgentPickers) {
        // Registratura / operator: agentlik va operatorni server o'zi qo'yadi
        delete payload.agencyId;
        delete payload.agentId;
      }
      if (!canPickStatus) {
        // Tovar holatini server o'zi "Kutilmoqda" qiladi
        delete payload.status;
        delete payload.statusChangeReason;
      }
      if (deal) {
        payload.debtDueDate = deal.debtDueDate || '';
        payload.salePrice = Number(deal.salePrice) || 0;
        payload.receivedFromBuyer = Number(deal.receivedFromBuyer) || 0;
      }

      const res = deal ? await axios.put(`/api/deals/${deal.id}`, payload) : await axios.post('/api/deals', payload);
      onSaved(res.data, isEdit);
    } catch (err) {
      setError(apiError(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      closeOnBackdrop={false}
      title={isEdit ? t('dealsPage.edit_title', { number: deal!.dealNumber }) : t('deals.add_deal')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} loading={saving}>
            {t('common.save')}
          </Button>
          {error && (
            <p role="alert" className="order-last text-sm text-danger sm:order-first sm:mr-auto sm:max-w-[60%] sm:self-center">
              {error}
            </p>
          )}
        </>
      }
    >
      <form noValidate onSubmit={(e) => e.preventDefault()} onKeyDown={blockEnterSubmit} className="space-y-5">
        {/* ADMIN'dan boshqa hamma kiritgan chek admin tasdig'ini kutadi */}
        {(scoped || (!admin && !isEdit)) && (
          <div className="flex items-start gap-2 rounded-control bg-info-soft px-3 py-2.5 text-sm text-info">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{t(registratura ? 'dealsPage.registratura_notice' : 'dealsPage.scoped_notice')}</p>
          </div>
        )}

        {/* Sana, sotuvchi, provayder, do'kon */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('dealsPage.field_date')} required hint={t('dealsPage.field_date_hint')}>
            <Input type="date" className="tabular-nums" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          {/* Registrator: ADMIN tanlaydi, registratura o'z ismini ko'radi, qolganlarga ko'rsatilmaydi */}
          {admin && (
            <Field label={t('dealsPage.registrator')} hint={oldSeller ? t('dealsPage.old_seller', { name: oldSeller }) : undefined}>
              <Select value={form.registratorId} onChange={(e) => set({ registratorId: e.target.value })}>
                <option value="">{t('dealsPage.registrator_none')}</option>
                {registrators.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                  </option>
                ))}
                {form.registratorId && !registrators.some((r) => r.id === form.registratorId) && (
                  <option value={form.registratorId}>{deal?.registrator?.fullName || form.registratorId}</option>
                )}
              </Select>
            </Field>
          )}
          {registratura && (
            <Field label={t('dealsPage.registrator')}>
              <div className={cn(controlClass, 'flex items-center bg-surface-2')}>{defaults?.registratorName || user?.fullName || ''}</div>
            </Field>
          )}
          <Field label={t('common.provider')} required>
            <Select
              value={form.providerId}
              onChange={(e) => {
                const provider = providers.find((p) => p.id === e.target.value);
                void provider;
                set({ providerId: e.target.value });
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.store')} required>
            <Select value={form.storeId} onChange={(e) => set({ storeId: e.target.value })}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Daftar */}
        <div className="flex flex-col gap-2 rounded-control border border-line bg-surface-2/50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">{t('dealsPage.daftar')}</p>
            <p className="mt-0.5 text-xs text-fg-muted">{t('dealsPage.daftar_auto_hint')}</p>
          </div>
          <Badge tone={autoDaftar ? 'warning' : 'neutral'}>{autoDaftar ? t('common.yes') : t('common.no')}</Badge>
        </div>

        {/* Mijoz */}
        <section className="space-y-3">
          <h3 className={sectionTitle}>{t('common.customer')}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('dealsPage.customer_name')}>
              <Input
                value={form.customerName}
                autoComplete="off"
                onChange={(e) => set({ customerName: e.target.value })}
                onBlur={(e) => checkCustomerDebt(e.target.value)}
              />
            </Field>
            <Field label={t('dealsPage.phone1')}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                className="tabular-nums"
                placeholder="+998 90 123 45 67"
                value={form.customerPhone1}
                onChange={(e) => set({ customerPhone1: e.target.value })}
              />
            </Field>
            <Field label={t('dealsPage.phone2')}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                className="tabular-nums"
                placeholder="+998 90 123 45 67"
                value={form.customerPhone2}
                onChange={(e) => set({ customerPhone2: e.target.value })}
              />
            </Field>
          </div>

          {debtAlert?.hasDebt && (
            <div className="space-y-2 rounded-control bg-warning-soft p-3">
              <p className="flex items-start gap-2 text-sm font-medium text-warning">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {t('dealsPage.debt_alert', { amount: formatMoney(debtAlert.totalDebt) })}
              </p>
              <p className="text-xs text-fg-secondary">{t('dealsPage.debt_alert_hint')}</p>
              <Input
                type="password"
                autoComplete="off"
                className="font-mono"
                placeholder={t('dealsPage.admin_code')}
                aria-label={t('dealsPage.admin_code')}
                value={form.adminOverrideCode}
                onChange={(e) => set({ adminOverrideCode: e.target.value })}
              />
            </div>
          )}
        </section>

        {/* Summalar */}
        <section className="space-y-3">
          <h3 className={sectionTitle}>{t('dealsPage.section_amounts')}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('dealsPage.customer_limit')}>
              <AmountInput
                value={form.customerLimit}
                onChange={(val) => set({ customerLimit: val })}
                placeholder="10 000 000"
                className={cn(controlClass, 'tabular-nums')}
              />
            </Field>
            <Field label={t('dealsPage.withdrawn_limit')} required>
              <AmountInput
                value={form.withdrawnLimit}
                onChange={(val) => applyDiscount(parsePct(discountPercent), val)}
                placeholder="2 800 000"
                className={cn(controlClass, 'font-semibold tabular-nums')}
              />
            </Field>
            <Field label={t('dealsPage.payout_auto')}>
              <div className={cn(controlClass, 'flex items-center bg-surface-2 font-semibold tabular-nums')} aria-live="polite">
                {formatMoney(form.calculatedAmount)}
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-fg-muted">{t('dealsPage.discount_label')}</span>
            {DISCOUNT_PRESETS.map((pct) => {
              const active = Number(discountPercent) === pct;
              return (
                <button
                  key={pct}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setDiscountPercent(pct);
                    applyDiscount(pct);
                  }}
                  className={cn(
                    'min-h-[2.25rem] rounded-control border px-2.5 text-xs font-medium tabular-nums transition-colors sm:min-h-[2rem]',
                    active
                      ? 'border-accent bg-brand-soft text-accent'
                      : 'border-line-strong bg-surface text-fg-secondary hover:bg-surface-2'
                  )}
                >
                  {pct}%
                </button>
              );
            })}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-fg-muted">
              {t('dealsPage.discount_other')}
              <input
                type="number"
                step="any"
                min={0}
                max={100}
                inputMode="decimal"
                value={discountPercent}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  setDiscountPercent(e.target.value);
                  applyDiscount(parsePct(e.target.value));
                }}
                className={cn(controlClass, 'w-20 px-2 text-center tabular-nums')}
              />
              %
            </label>
          </div>

          {isQodirStore(store?.name) && (
            <div className="rounded-control bg-warning-soft px-3 py-2.5 text-sm">
              <p className="font-medium text-warning">{t('dealsPage.qodir_note')}</p>
              {/* Registratura'ga hisoblangan chek summasi (agent ulushi bilan) ko'rsatilmaydi */}
              {!registratura && (
              <p className="mt-0.5 text-xs tabular-nums text-fg-secondary">
                {t('dealsPage.qodir_check_estimate', {
                  amount: formatMoney(Number(form.calculatedAmount) + Number(form.withdrawnLimit) * 0.05),
                })}
              </p>
              )}
            </div>
          )}

          {/* Rasxodga qo'shish — faqat ADMIN (boshqalarda xarajat admin tasdiqlaganda yoziladi) */}
          {admin && !isEdit && (
            <div className="space-y-3 rounded-control border border-line bg-surface-2/50 p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={form.autoDdsExpense}
                onChange={(e) => set({ autoDdsExpense: e.target.checked })}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{t('dealsPage.auto_expense')}</span>
                <span className="mt-0.5 block text-xs tabular-nums text-fg-muted">
                  {form.autoDdsExpense
                    ? t('dealsPage.auto_expense_on', { amount: formatMoney(form.calculatedAmount) })
                    : t('dealsPage.auto_expense_off')}
                </span>
              </span>
            </label>
            {form.autoDdsExpense && (
              <Field label={t('dealsPage.expense_account')}>
                <Select value={form.ddsAccount} onChange={(e) => set({ ddsAccount: e.target.value as AccountCode })}>
                  {ACCOUNT_CODES.map((a) => (
                    <option key={a} value={a}>
                      {t(`accounts.${a}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            </div>
          )}
        </section>

        {/* Mahsulotlar */}
        <section className="rounded-card border border-line bg-surface-2/40 p-3">
          <DealItemsEditor rows={rows} onChange={setRows} />
        </section>

        {/* Holat */}
        {!canPickStatus ? (
          <p className="text-sm text-fg-muted">{t('dealsPage.goods_status_auto', { status: t('dealStatus.PENDING') })}</p>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('dealsPage.goods_status')} required>
            <Select value={form.status} onChange={(e) => set({ status: e.target.value })}>
              {DEAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`dealStatus.${s}`)}
                </option>
              ))}
              {!DEAL_STATUSES.includes(form.status as any) && <option value={form.status}>{t(`dealStatus.${form.status}`)}</option>}
            </Select>
          </Field>
          <Field label={t('dealsPage.status_reason')} required={statusChanged} hint={statusChanged ? t('dealsPage.status_reason_hint') : undefined}>
            <Input value={form.statusChangeReason} onChange={(e) => set({ statusChangeReason: e.target.value })} />
          </Field>
        </div>
        )}

        {/* Operator (yangi chek): agent va operator avtomatik — faqat ko'rsatiladi */}
        {operator && !isEdit && defaultsLoaded && (
          defaults?.agencyName ? (
            <p className="rounded-control border border-line bg-surface-2/50 px-3 py-2.5 text-sm text-fg">
              {t('dealsPage.own_agent_line', { agency: defaults.agencyName, agent: defaults.agentName || '—' })}
            </p>
          ) : (
            <p className="text-sm text-fg-muted">{t('dealsPage.no_agency_assigned')}</p>
          )
        )}

        {/* Agentlik va agent — Registratura va operatorga (yangi chek) ko'rsatilmaydi */}
        {!hideAgentPickers && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('common.agency')}>
            {lockedAgency ? (
              <div className={cn(controlClass, 'flex items-center bg-surface-2')}>{defaults?.agencyName || agency?.name || ''}</div>
            ) : (
            <Select
              value={form.agencyId}
              onChange={(e) => {
                const next = agencies.find((a) => a.id === e.target.value);
                // Agent boshqa agentlikda qolib ketmasin
                set({ agencyId: e.target.value, agentId: next?.agents?.some((a) => a.id === form.agentId) ? form.agentId : '' });
              }}
            >
              <option value="">{t('dealsPage.no_agency')}</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            )}
          </Field>
          <Field label={t('dealsPage.agent')}>
            <Select value={form.agentId} onChange={(e) => set({ agentId: e.target.value })} disabled={!agents.length}>
              <option value="">{t('dealsPage.no_agent')}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        )}

        <Field label={t('common.note')}>
          <Textarea rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
};
