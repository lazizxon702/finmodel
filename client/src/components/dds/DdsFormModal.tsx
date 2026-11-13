import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertCircle, Info } from 'lucide-react';
import { Button, Field, Input, Modal, SegmentedControl, Select, Textarea, cn, controlClass } from '../ui';
import { AmountInput } from '../AmountInput';
import { useTranslation } from '../../context/LanguageContext';
import { todayYmd } from '../../utils/format';
import { apiErrorMessage } from '../dashboard/period';
import { isStoreIncomeCandidate } from '../stores/storeUtils';
import {
  CHECK_EXPENSE_CATEGORY,
  DDS_ACCOUNTS,
  isQodirPaymentCategory,
  isSettlementCategory,
  isStoreIncomeCategory,
  isTrustIncomeCategory,
  type DdsAccount,
} from './constants';

interface StoreOption {
  id: string;
  name: string;
}

type TxType = 'INCOME' | 'EXPENSE';
type ExpenseType = 'COGS' | 'OPEX' | 'INCOME_TRANSFER';

interface DdsFormModalProps {
  open: boolean;
  onClose: () => void;
  categories: string[];
  /** "Mas'ul shaxs" maydonining boshlang'ich qiymati (joriy foydalanuvchi) */
  defaultPerson: string;
  /** 201 javobi: tranzaksiya + balances + trust */
  onSaved: (created: any) => void;
}

interface FormState {
  date: string;
  type: TxType;
  account: DdsAccount;
  expenseType: ExpenseType;
  categoryName: string;
  sourcePerson: string;
  amount: number;
  description: string;
  /** Faqat «Do'kondan tushum» kirimi uchun — qaysi do'kon to'lagani */
  storeId: string;
}

/**
 * Yangi pul operatsiyasi formasi (POST /api/dds).
 * - "Saqlash" bosilganda tugma bloklanadi — ikki marta yuborilmaydi.
 * - Server xatosi (`error`) forma ichida ko'rsatiladi.
 * - Sana bugun bo'lsa server hozirgi vaqtni yozadi (faqat "YYYY-MM-DD" yuboriladi).
 * - «Do'kondan tushum» kirimida do'kon tanlash majburiy (`storeId` yuboriladi) — do'kon qarzi kamayadi.
 * - «Qodir aka to'lovi» faqat chiqim — Qodir akaga qarzimiz kamayadi.
 */
export const DdsFormModal: React.FC<DdsFormModalProps> = ({ open, onClose, categories, defaultPerson, onSaved }) => {
  const { t } = useTranslation();

  // Oddiy (hisob-kitobga ta'sir qilmaydigan) kategoriya — standart tanlov; qarz tasodifan kamayib ketmasin
  const neutralCategory = () => categories.find((c) => !isSettlementCategory(c)) || CHECK_EXPENSE_CATEGORY;

  const initial = (): FormState => ({
    date: todayYmd(),
    type: 'EXPENSE',
    account: 'CASH',
    expenseType: 'OPEX',
    categoryName: neutralCategory(),
    sourcePerson: defaultPerson,
    amount: 0,
    description: '',
    storeId: '',
  });

  const [form, setForm] = useState<FormState>(initial);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; category?: string; store?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // «Do'kondan tushum» uchun do'konlar (bitim formasi ishlatadigan spravochnik); Qodir aka va Trust kirmaydi
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState(false);

  // Har ochilganda formani boshlang'ich holatga qaytaramiz
  useEffect(() => {
    if (!open) return;
    setForm(initial());
    setIsNewCategory(false);
    setNewCategoryName('');
    setErrors({});
    setServerError(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));

  const effectiveCategory = (isNewCategory ? newCategoryName : form.categoryName).trim();
  const isTrust = isTrustIncomeCategory(effectiveCategory);
  const isStoreIncome = isStoreIncomeCategory(effectiveCategory);
  const isQodirPayment = isQodirPaymentCategory(effectiveCategory);
  // Do'kon tanlash faqat kirim + «Do'kondan tushum» bo'lganda kerak (va majburiy)
  const needsStore = form.type === 'INCOME' && isStoreIncome;

  // Do'konlar ro'yxati birinchi marta kerak bo'lganda yuklanadi
  useEffect(() => {
    if (!open || !needsStore || stores.length > 0 || storesLoading) return;
    let cancelled = false;
    setStoresLoading(true);
    setStoresError(false);
    axios
      .get('/api/references/stores')
      .then((res) => {
        if (cancelled) return;
        const list: StoreOption[] = (Array.isArray(res.data) ? res.data : [])
          .filter((s: any) => s && s.id && isStoreIncomeCandidate(s))
          .map((s: any) => ({ id: String(s.id), name: String(s.name || '') }))
          .sort((a: StoreOption, b: StoreOption) => a.name.localeCompare(b.name));
        setStores(list);
      })
      .catch(() => {
        if (!cancelled) setStoresError(true);
      })
      // Bekor qilingan bo'lsa ham bayroq tushiriladi — aks holda keyingi safar yuklanmay qoladi
      .finally(() => setStoresLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, needsStore]);

  const changeType = (type: TxType) => {
    // Faqat kirim («Trust 1 daromadi», «Do'kondan tushum») yoki faqat chiqim («Qodir aka to'lovi»)
    // bo'la oladigan kategoriya turga mos kelmasa — oddiy kategoriyaga almashtiriladi
    const incomeOnly = isTrustIncomeCategory(form.categoryName) || isStoreIncomeCategory(form.categoryName);
    const mismatch = (type === 'EXPENSE' && incomeOnly) || (type === 'INCOME' && isQodirPaymentCategory(form.categoryName));
    if (!isNewCategory && mismatch) {
      patch({ type, categoryName: neutralCategory(), storeId: '' });
    } else {
      patch({ type });
    }
  };

  const changeCategory = (categoryName: string) => {
    // Tizim kategoriyasi tanlansa operatsiya turi avtomatik mos keladi: Trust / do'kon tushumi — kirim, Qodir aka — chiqim
    if (isTrustIncomeCategory(categoryName) || isStoreIncomeCategory(categoryName)) patch({ categoryName, type: 'INCOME' });
    else if (isQodirPaymentCategory(categoryName)) patch({ categoryName, type: 'EXPENSE' });
    else patch({ categoryName });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return; // ikki marta yuborilmasin

    const nextErrors: typeof errors = {};
    if (!form.amount || form.amount <= 0) nextErrors.amount = t('ddsPage.form_amount_required');
    if (!effectiveCategory) nextErrors.category = t('ddsPage.form_category_required');
    // Tur va tizim kategoriyasi mos kelmasa (yangi kategoriya qo'lda yozilganda) — yuborilmaydi
    else if (form.type === 'EXPENSE' && isTrust) nextErrors.category = t('ddsPage.form_trust_income_only');
    else if (form.type === 'EXPENSE' && isStoreIncome) nextErrors.category = t('ddsPage.form_store_income_only');
    else if (form.type === 'INCOME' && isQodirPayment) nextErrors.category = t('ddsPage.form_qodir_expense_only');
    if (needsStore && !form.storeId) nextErrors.store = t('ddsPage.form_store_required');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setServerError(null);
    setSaving(true);
    try {
      const res = await axios.post('/api/dds', {
        // Faqat sana: bugun bo'lsa server hozirgi vaqtni, boshqa kun bo'lsa Toshkent 12:00 ni yozadi
        dateTime: form.date || todayYmd(),
        type: form.type,
        account: form.account,
        expenseType: form.type === 'INCOME' ? 'INCOME_TRANSFER' : form.expenseType,
        categoryName: effectiveCategory,
        sourcePerson: form.sourcePerson.trim(),
        amount: Number(form.amount), // AmountInput butun son qaytaradi
        description: form.description.trim(),
        // Faqat «Do'kondan tushum» kirimida — server shu do'kon qarzini kamaytiradi
        ...(needsStore ? { storeId: form.storeId } : {}),
      });
      onSaved(res.data);
    } catch (err) {
      setServerError(apiErrorMessage(err, t('common.save_error')));
    } finally {
      setSaving(false);
    }
  };

  const formId = 'dds-create-form';

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      closeOnBackdrop={!saving}
      size="lg"
      title={t('ddsPage.form_title')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {serverError && (
          <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <Field label={t('ddsPage.form_type')}>
          <SegmentedControl<TxType>
            ariaLabel={t('ddsPage.form_type')}
            fullWidth
            value={form.type}
            onChange={changeType}
            items={[
              { value: 'EXPENSE', label: t('common.expense'), disabled: saving },
              { value: 'INCOME', label: t('common.income'), disabled: saving },
            ]}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('ddsPage.form_amount')}
            required
            htmlFor="dds-form-amount"
            error={errors.amount}
          >
            <AmountInput
              id="dds-form-amount"
              value={form.amount}
              onChange={(amount) => {
                patch({ amount });
                if (amount > 0) setErrors((prev) => ({ ...prev, amount: undefined }));
              }}
              autoFocus
              disabled={saving}
              placeholder={t('ddsPage.form_amount_placeholder')}
              className={cn(controlClass, 'text-base font-semibold tabular-nums', errors.amount && 'border-danger')}
            />
          </Field>

          <Field
            label={t('common.date')}
            htmlFor="dds-form-date"
            hint={form.date === todayYmd() ? t('ddsPage.form_date_today_hint') : t('ddsPage.form_date_other_hint')}
          >
            <Input
              id="dds-form-date"
              type="date"
              value={form.date}
              max={todayYmd()}
              onChange={(e) => patch({ date: e.target.value })}
              disabled={saving}
              className="tabular-nums"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('accounts.label')} htmlFor="dds-form-account">
            <Select
              id="dds-form-account"
              value={form.account}
              onChange={(e) => patch({ account: e.target.value as DdsAccount })}
              disabled={saving}
            >
              {DDS_ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {t(`accounts.${a}`)}
                </option>
              ))}
            </Select>
          </Field>

          {form.type === 'EXPENSE' && (
            <Field label={t('ddsPage.form_expense_type')} htmlFor="dds-form-expense-type">
              <Select
                id="dds-form-expense-type"
                value={form.expenseType}
                onChange={(e) => patch({ expenseType: e.target.value as ExpenseType })}
                disabled={saving}
              >
                <option value="COGS">{t('ddsPage.class_COGS_long')}</option>
                <option value="OPEX">{t('ddsPage.class_OPEX_long')}</option>
                <option value="INCOME_TRANSFER">{t('ddsPage.class_INCOME_TRANSFER')}</option>
              </Select>
            </Field>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="dds-form-category" className="text-xs font-medium text-fg-secondary">
              {t('common.category')}
              <span className="ml-0.5 text-danger" aria-hidden="true">
                *
              </span>
            </label>
            <button
              type="button"
              onClick={() => setIsNewCategory((v) => !v)}
              disabled={saving}
              className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
            >
              {isNewCategory ? t('ddsPage.form_category_pick') : t('ddsPage.form_category_new')}
            </button>
          </div>
          {isNewCategory ? (
            <Input
              id="dds-form-category"
              value={newCategoryName}
              onChange={(e) => {
                setNewCategoryName(e.target.value);
                if (e.target.value.trim()) setErrors((prev) => ({ ...prev, category: undefined }));
              }}
              placeholder={t('ddsPage.form_category_placeholder')}
              invalid={!!errors.category}
              disabled={saving}
            />
          ) : (
            <Select id="dds-form-category" value={form.categoryName} onChange={(e) => changeCategory(e.target.value)} disabled={saving}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
          {errors.category && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {errors.category}
            </p>
          )}
          {isTrust && (
            <p className="mt-2 flex items-start gap-2 rounded-control bg-info-soft px-3 py-2 text-xs text-info">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{form.type === 'INCOME' ? t('ddsPage.form_trust_note') : t('ddsPage.form_trust_income_only')}</span>
            </p>
          )}
          {isStoreIncome && (
            <p className="mt-2 flex items-start gap-2 rounded-control bg-info-soft px-3 py-2 text-xs text-info">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{form.type === 'INCOME' ? t('ddsPage.form_store_income_note') : t('ddsPage.form_store_income_only')}</span>
            </p>
          )}
          {isQodirPayment && (
            <p className="mt-2 flex items-start gap-2 rounded-control bg-info-soft px-3 py-2 text-xs text-info">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{form.type === 'EXPENSE' ? t('ddsPage.form_qodir_note') : t('ddsPage.form_qodir_expense_only')}</span>
            </p>
          )}
        </div>

        {needsStore && (
          <Field
            label={t('ddsPage.form_store')}
            required
            htmlFor="dds-form-store"
            error={errors.store || (storesError ? t('ddsPage.form_store_load_error') : undefined)}
          >
            <Select
              id="dds-form-store"
              value={form.storeId}
              onChange={(e) => {
                patch({ storeId: e.target.value });
                if (e.target.value) setErrors((prev) => ({ ...prev, store: undefined }));
              }}
              invalid={!!errors.store}
              disabled={saving || storesLoading}
            >
              <option value="">{storesLoading ? t('common.loading') : t('ddsPage.form_store_placeholder')}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label={t('ddsPage.form_person')} htmlFor="dds-form-person" hint={t('ddsPage.form_person_hint')}>
          <Input
            id="dds-form-person"
            value={form.sourcePerson}
            onChange={(e) => patch({ sourcePerson: e.target.value })}
            disabled={saving}
          />
        </Field>

        <Field label={t('common.comment')} htmlFor="dds-form-description">
          <Textarea
            id="dds-form-description"
            rows={2}
            value={form.description}
            onChange={(e) => patch({ description: e.target.value })}
            disabled={saving}
            placeholder={t('ddsPage.form_description_placeholder')}
          />
        </Field>
      </form>
    </Modal>
  );
};
