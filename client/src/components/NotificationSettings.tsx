import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Check, Copy, ExternalLink, RefreshCw, Send, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { formatTime } from '../utils/format';
import { getPushState, initPush, type PushState } from '../services/push';
import { Badge, Button, LoadingBlock, Modal } from './ui';
import type { Tone } from './ui';

interface NotificationSettingsProps {
  open: boolean;
  onClose: () => void;
}

interface StatusDto {
  telegramLinked: boolean;
  pushConfigured: boolean;
  telegramConfigured: boolean;
  deviceTokens: number;
  botUsername: string | null;
}

interface LinkCodeDto {
  code: string;
  deepLink: string | null;
  botUsername: string | null;
  expiresAt: string;
}

interface ChannelResult {
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
  sent?: number;
  failed?: number;
  removed?: number;
}

interface TestResult {
  success: boolean;
  telegram: ChannelResult;
  push: ChannelResult;
}

const STATUS_TONE: Record<ChannelResult['status'], Tone> = { sent: 'success', skipped: 'warning', failed: 'danger' };

const apiError = (e: any, fallback: string): string => e?.response?.data?.error || fallback;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Bo'lim sarlavhasi + o'ngdagi holat nishoni */
const SectionHead: React.FC<{ title: string; badge?: React.ReactNode }> = ({ title, badge }) => (
  <div className="flex items-center justify-between gap-3">
    <h3 className="text-sm font-semibold text-fg">{title}</h3>
    {badge}
  </div>
);

/**
 * Bildirishnoma sozlamalari: Telegram'ni bog'lash/uzish, push holati, ADMIN uchun sinov.
 * Yon menyu va yuqori paneldan ochiladi (hamma rol uchun).
 */
export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ open, onClose }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === 'ADMIN';

  const [status, setStatus] = useState<StatusDto | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [link, setLink] = useState<LinkCodeDto | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState('');
  const [telegramNote, setTelegramNote] = useState('');
  const [copied, setCopied] = useState(false);

  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState('');

  const load = useCallback(async (): Promise<StatusDto | null> => {
    setLoading(true);
    setLoadError('');
    try {
      const [res, pushState] = await Promise.all([axios.get<StatusDto>('/api/notifications/status'), getPushState()]);
      setStatus(res.data);
      setPush(pushState);
      if (res.data.telegramLinked) setLink(null);
      return res.data;
    } catch (e: any) {
      setLoadError(apiError(e, t('notifications.status_error')));
      return null;
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Har ochilganda holat qaytadan olinadi; yopilganda vaqtinchalik natijalar tozalanadi
  useEffect(() => {
    if (!open) return;
    setLink(null);
    setTelegramError('');
    setTelegramNote('');
    setTestResult(null);
    setTestError('');
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const getCode = async () => {
    setTelegramBusy(true);
    setTelegramError('');
    setTelegramNote('');
    try {
      const res = await axios.post<LinkCodeDto>('/api/notifications/telegram/link-code');
      setLink(res.data);
    } catch (e: any) {
      setTelegramError(apiError(e, t('notifications.link_code_error')));
    } finally {
      setTelegramBusy(false);
    }
  };

  const checkLink = async () => {
    setTelegramNote('');
    const fresh = await load();
    if (fresh && !fresh.telegramLinked) setTelegramNote(t('notifications.still_not_linked'));
  };

  const unlink = async () => {
    if (!window.confirm(t('notifications.unlink_confirm'))) return;
    setTelegramBusy(true);
    setTelegramError('');
    try {
      await axios.post('/api/notifications/telegram/unlink');
      setTelegramNote(t('notifications.unlinked'));
      await load();
    } catch (e: any) {
      setTelegramError(apiError(e, t('notifications.unlink_error')));
    } finally {
      setTelegramBusy(false);
    }
  };

  const copyCommand = async () => {
    if (!link) return;
    if (await copyText(`/start ${link.code}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const enablePush = async () => {
    setPushBusy(true);
    try {
      await initPush(
        { channelName: t('notifications.channel_name'), channelDescription: t('notifications.channel_desc') },
        { force: true }
      );
      await load();
    } finally {
      setPushBusy(false);
    }
  };

  const sendTest = async () => {
    setTestBusy(true);
    setTestError('');
    setTestResult(null);
    try {
      const res = await axios.post<TestResult>('/api/notifications/test');
      setTestResult(res.data);
    } catch (e: any) {
      setTestError(apiError(e, t('notifications.test_error')));
    } finally {
      setTestBusy(false);
    }
  };

  const reasonText = (reason?: string) => (reason ? t(`notifications.reason_${reason}`, reason) : '');

  const renderChannel = (label: string, result: ChannelResult, withCounts: boolean) => (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-fg-secondary">{label}</span>
      <span className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        {result.reason && <span>{reasonText(result.reason)}</span>}
        {withCounts && result.status !== 'skipped' && (
          <span className="tabular-nums">
            {t('notifications.test_push_counts', {
              sent: result.sent ?? 0,
              failed: result.failed ?? 0,
              removed: result.removed ?? 0,
            })}
          </span>
        )}
        <Badge tone={STATUS_TONE[result.status] || 'neutral'}>{t(`notifications.test_status_${result.status}`, result.status)}</Badge>
      </span>
    </div>
  );

  const botUsername = link?.botUsername || status?.botUsername || '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('notifications.title')}
      description={t('notifications.subtitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void load()} loading={loading}>
            {t('common.refresh')}
          </Button>
        </>
      }
    >
      {!status && loading && <LoadingBlock label={t('common.loading')} />}

      {loadError && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{loadError}</span>
        </div>
      )}

      {status && (
        <div className="divide-y divide-line">
          {/* Telegram */}
          <section className="space-y-3 pb-5">
            <SectionHead
              title={t('notifications.telegram')}
              badge={
                <Badge tone={status.telegramLinked ? 'success' : 'neutral'} dot>
                  {t(status.telegramLinked ? 'notifications.telegram_linked' : 'notifications.telegram_not_linked')}
                </Badge>
              }
            />

            {!status.telegramConfigured && (
              <p className="rounded-control bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
                {t('notifications.telegram_not_configured')}
              </p>
            )}

            {status.telegramLinked ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-fg-muted">{t('notifications.telegram_linked_hint')}</p>
                <Button variant="secondary" size="sm" onClick={unlink} loading={telegramBusy} className="shrink-0">
                  {t('notifications.unlink')}
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-fg-muted">{t('notifications.telegram_link_hint')}</p>

                {link && (
                  <div className="space-y-3 rounded-card border border-line bg-surface-2 p-3 sm:p-4">
                    <div>
                      <p className="text-xs font-medium text-fg-muted">{t('notifications.code_label')}</p>
                      <p className="mt-1 select-all break-all font-mono text-xl font-semibold tracking-wide text-fg">{link.code}</p>
                      <p className="mt-1 text-xs text-fg-muted">
                        {t('notifications.code_expires', { time: formatTime(link.expiresAt) })}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs leading-relaxed text-fg-secondary">
                        {botUsername
                          ? t('notifications.instruction_bot', { bot: botUsername })
                          : t('notifications.instruction_nobot')}
                      </p>
                      <p className="mt-1.5 select-all break-all rounded-control border border-line bg-surface px-3 py-2 font-mono text-sm text-fg">
                        /start {link.code}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {link.deepLink && (
                        <a
                          href={link.deepLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-touch items-center justify-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover sm:min-h-[2.5rem]"
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          {t('notifications.open_telegram')}
                        </a>
                      )}
                      <Button
                        variant="secondary"
                        leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        onClick={copyCommand}
                      >
                        {copied ? t('common.copied') : t('notifications.copy_command')}
                      </Button>
                      <Button variant="secondary" onClick={checkLink} loading={loading}>
                        {t('notifications.check_link')}
                      </Button>
                    </div>
                  </div>
                )}

                <Button variant={link ? 'ghost' : 'primary'} onClick={getCode} loading={telegramBusy}>
                  {t(link ? 'notifications.new_code' : 'notifications.get_code')}
                </Button>
              </>
            )}

            {telegramNote && <p className="text-xs text-fg-secondary">{telegramNote}</p>}
            {telegramError && (
              <p role="alert" className="text-xs text-danger">
                {telegramError}
              </p>
            )}
          </section>

          {/* Push */}
          <section className="space-y-3 py-5">
            <SectionHead title={t('notifications.push')} />

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg-secondary">{t('notifications.push_server')}</span>
              <Badge tone={status.pushConfigured ? 'success' : 'warning'} dot>
                {t(status.pushConfigured ? 'notifications.push_server_on' : 'notifications.push_server_off')}
              </Badge>
            </div>
            {!status.pushConfigured && <p className="text-xs leading-relaxed text-fg-muted">{t('notifications.push_server_off_hint')}</p>}

            <div className="flex items-start justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-fg-secondary">
                <Smartphone className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
                {t('notifications.push_device')}
              </span>
              {push?.pluginAvailable && (
                <span className="flex flex-wrap justify-end gap-1.5">
                  <Badge tone={push.permission === 'granted' ? 'success' : push.permission === 'denied' ? 'danger' : 'neutral'}>
                    {t(
                      push.permission === 'granted'
                        ? 'notifications.push_permission_granted'
                        : push.permission === 'denied'
                          ? 'notifications.push_permission_denied'
                          : 'notifications.push_permission_prompt'
                    )}
                  </Badge>
                  <Badge tone={push.registered ? 'success' : 'neutral'}>
                    {t(push.registered ? 'notifications.push_registered' : 'notifications.push_not_registered')}
                  </Badge>
                </span>
              )}
            </div>

            {push && !push.native && <p className="text-xs leading-relaxed text-fg-muted">{t('notifications.push_web_only')}</p>}
            {push && push.native && !push.pluginAvailable && (
              <p className="text-xs leading-relaxed text-fg-muted">{t('notifications.push_old_app')}</p>
            )}
            {push?.pluginAvailable && push.permission === 'denied' && (
              <p className="text-xs leading-relaxed text-fg-muted">{t('notifications.push_permission_denied_hint')}</p>
            )}
            {push?.crashGuard && (
              <p className="rounded-control bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
                {t('notifications.push_crash_guard')}
              </p>
            )}
            {push?.lastError && (
              <p className="break-words text-xs text-danger">{t('notifications.push_last_error', { error: push.lastError })}</p>
            )}

            <p className="text-xs tabular-nums text-fg-muted">{t('notifications.push_devices', { count: status.deviceTokens })}</p>

            {push?.pluginAvailable && status.pushConfigured && !push.registered && push.permission !== 'denied' && (
              <Button variant="secondary" size="sm" onClick={enablePush} loading={pushBusy}>
                {t('notifications.push_enable')}
              </Button>
            )}
          </section>

          {/* Sinov — faqat ADMIN */}
          {isAdmin && (
            <section className="space-y-3 pt-5">
              <SectionHead title={t('notifications.test')} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-fg-muted">{t('notifications.test_hint')}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Send className="h-4 w-4" />}
                  onClick={sendTest}
                  loading={testBusy}
                  className="shrink-0"
                >
                  {t('notifications.test_send')}
                </Button>
              </div>

              {testError && (
                <p role="alert" className="text-xs text-danger">
                  {testError}
                </p>
              )}

              {testResult && (
                <div className="space-y-2 rounded-card border border-line bg-surface-2 p-3">
                  {renderChannel(t('notifications.test_telegram'), testResult.telegram, false)}
                  {renderChannel(t('notifications.test_push'), testResult.push, true)}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
};

export default NotificationSettings;
