import React, { useState } from 'react';
import { CheckCircle2, Copy, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';

/** Parol katagi: yopiq ko'rinadi, ko'z tugmasi ochadi, nusxalash tugmasi buferga oladi. ADMIN — Foydalanuvchilar, AGENT — o'z Jamoasi sahifasida */
export const PasswordCell: React.FC<{ value?: string | null }> = ({ value }) => {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-xs text-fg-muted">{t('usersPage.password_unknown')}</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShown(true); // nusxalab bo'lmasa — ko'rsatamiz, qo'lda ko'chiriladi
    }
  };
  const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg';
  return (
    <span className="inline-flex items-center gap-1">
      <span className="min-w-[7rem] font-mono text-xs text-fg">{shown ? value : '•'.repeat(Math.min(value.length, 10))}</span>
      <button type="button" className={iconBtn} onClick={() => setShown((v) => !v)} title={t(shown ? 'usersPage.password_hide' : 'usersPage.password_show')} aria-label={t(shown ? 'usersPage.password_hide' : 'usersPage.password_show')}>
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      <button type="button" className={iconBtn} onClick={copy} title={t(copied ? 'usersPage.password_copied' : 'usersPage.password_copy')} aria-label={t('usersPage.password_copy')}>
        {copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </button>
    </span>
  );
};
