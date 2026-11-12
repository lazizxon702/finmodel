import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Check, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { Button, Field, Input, Modal } from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { DEALS_SHEET_NAME, DEALS_SHEET_URL, buildAppsScript } from './appsScript';
import { apiError, type Notice } from './dealUtils';

interface Props {
  onClose: () => void;
  /** Hozir to'liq sinxronlash (sahifadagi tugma bilan bir xil amal) */
  onSyncNow: () => void;
  syncing: boolean;
}

/** Google Sheets bilan ikki tomonlama bog'lanish sozlamalari (faqat ADMIN). */
export const SheetsSyncModal: React.FC<Props> = ({ onClose, onSyncNow, syncing }) => {
  const { t } = useTranslation();
  const [scriptUrl, setScriptUrl] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<Notice | null>(null);

  useEffect(() => {
    let alive = true;
    axios
      .get('/api/sync/status')
      .then((res) => {
        if (!alive) return;
        if (res.data?.appsScriptUrl) setScriptUrl(res.data.appsScriptUrl);
        if (res.data?.webhookUrl) setWebhookUrl(res.data.webhookUrl);
      })
      .catch((err) => {
        if (alive) setMessage({ tone: 'danger', text: apiError(err, t) });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const script = useMemo(() => buildAppsScript(webhookUrl), [webhookUrl]);

  const saveConfig = async () => {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await axios.post('/api/sync/configure', { appsScriptUrl: scriptUrl });
      setMessage({ tone: 'success', text: t('dealsPage.sync_saved') });
    } catch (err) {
      setMessage({ tone: 'danger', text: apiError(err, t) });
    } finally {
      setSaving(false);
    }
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setMessage({ tone: 'danger', text: t('dealsPage.sync_copy_failed') });
    }
  };

  const steps = ['sync_step1', 'sync_step2', 'sync_step3', 'sync_step4', 'sync_step5'];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('dealsPage.sync_settings_title')}
      description={t('dealsPage.sync_settings_subtitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button onClick={onSyncNow} loading={syncing} leftIcon={<RefreshCw className="h-4 w-4" />}>
            {t('dealsPage.sync_now')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface-2/50 px-3 py-2.5 text-sm">
          <p className="min-w-0 text-fg-secondary">
            {t('dealsPage.sync_sheet_name')} <span className="font-mono font-medium text-fg">{DEALS_SHEET_NAME}</span>
          </p>
          <a
            href={DEALS_SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
            {t('dealsPage.sync_open_sheet')}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>

        <Field label={t('dealsPage.sync_url_label')} hint={t('dealsPage.sync_url_hint')}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="url"
              className="sm:flex-1"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={scriptUrl}
              onChange={(e) => setScriptUrl(e.target.value)}
            />
            <Button onClick={saveConfig} loading={saving} className="shrink-0">
              {t('common.save')}
            </Button>
          </div>
        </Field>

        {message && (
          <p
            role={message.tone === 'danger' ? 'alert' : 'status'}
            className={
              message.tone === 'danger'
                ? 'rounded-control bg-danger-soft px-3 py-2 text-sm text-danger'
                : 'rounded-control bg-success-soft px-3 py-2 text-sm text-success'
            }
          >
            {message.text}
          </p>
        )}

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-fg-secondary">{t('dealsPage.sync_script_label')}</p>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              onClick={copyScript}
            >
              {copied ? t('common.copied') : t('common.copy')}
            </Button>
          </div>
          <pre className="max-h-48 overflow-auto rounded-control border border-line bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-fg-secondary">
            {script}
          </pre>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-fg">{t('dealsPage.sync_steps_title')}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-fg-secondary">
            {steps.map((key) => (
              <li key={key}>{t(`dealsPage.${key}`)}</li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
};
