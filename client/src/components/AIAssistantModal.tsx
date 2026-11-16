import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Bot, Gauge, KeyRound, RefreshCw, Send, ShieldAlert, Trash2, WifiOff, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { formatTime } from '../utils/format';
import { Button, Input, Modal, Spinner, cn } from './ui';

// Kalit FAQAT serverda saqlanadi (GEMINI_API_KEY). Klient kalitni so'ramaydi, saqlamaydi va yubormaydi.

type ErrorKind = 'key' | 'quota' | 'network' | 'blocked' | 'other';

interface Message {
  id: string;
  sender: 'user' | 'assistant' | 'error';
  text: string;
  time: string;
  /** Javob bergan model nomi (faqat assistant) */
  model?: string;
  /** Xato turi — ikonka va rang uchun (faqat error) */
  kind?: ErrorKind;
  /** Qayta urinishda yuboriladigan savol (faqat error) */
  retryText?: string;
}

interface AiStatus {
  configured: boolean;
  model: string;
}

// Server xato kodi → ko'rinish (server/src/routes/ai.routes.ts dagi AiErrorCode)
const ERROR_KIND: Record<string, ErrorKind> = {
  NO_KEY: 'key',
  INVALID_KEY: 'key',
  MODEL_NOT_FOUND: 'key',
  QUOTA_EXCEEDED: 'quota',
  TIMEOUT: 'network',
  NETWORK: 'network',
  UPSTREAM_ERROR: 'network',
  EMPTY_RESPONSE: 'network',
  BLOCKED: 'blocked',
};

const ERROR_VIEW: Record<ErrorKind, { icon: LucideIcon; className: string }> = {
  key: { icon: KeyRound, className: 'bg-warning-soft text-warning' },
  quota: { icon: Gauge, className: 'bg-warning-soft text-warning' },
  network: { icon: WifiOff, className: 'bg-danger-soft text-danger' },
  blocked: { icon: ShieldAlert, className: 'bg-info-soft text-info' },
  other: { icon: AlertTriangle, className: 'bg-danger-soft text-danger' },
};

// OPERATOR va AGENT faqat o'z bitimlarini ko'radi — ularga moliya savollari taklif qilinmaydi
const SCOPED_ROLES = ['OPERATOR', 'AGENT', 'REGISTRATURA'];
// Kassa va Trust raqamlarini ko'ra oladigan rollar (serverdagi FINANCE_ROLES bilan bir xil)
const FINANCE_ROLES = ['ADMIN', 'MANAGER', 'CFO', 'COO', 'CASHIER', 'VIEWER'];

function quickQuestionKeys(role?: string): string[] {
  if (!role || SCOPED_ROLES.includes(role)) return ['deals_today', 'my_pending', 'my_month'];
  if (FINANCE_ROLES.includes(role)) return ['deals_today', 'trust', 'cash', 'debtors'];
  return ['deals_today', 'debtors'];
}

const HISTORY_LIMIT = 10;
const MAX_MESSAGE_CHARS = 4000;
let messageSeq = 0;
const nextId = () => `m${Date.now()}-${++messageSeq}`;

export const AIAssistantModal: React.FC = () => {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  // Bir vaqtda faqat bitta so'rov (tugma bloklanishidan tashqari qo'shimcha himoya)
  const sendingRef = useRef(false);

  // Yuqori panel yoki yon menyudan ochish
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-ai-assistant', handleOpen);
    return () => window.removeEventListener('open-ai-assistant', handleOpen);
  }, []);

  // Eski versiya brauzerda saqlab qo'ygan kalit qoldig'ini o'chiramiz
  useEffect(() => {
    try {
      localStorage.removeItem('finmodel_gemini_api_key');
    } catch {
      // e'tiborsiz
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    try {
      const res = await axios.get<AiStatus>('/api/ai/status');
      setStatus(res.data);
    } catch (e: any) {
      setStatus(null);
      setStatusError(e?.response?.data?.error || t('aiAssistant.status_error'));
    } finally {
      setStatusLoading(false);
    }
  }, [t]);

  // Har ochilganda: sozlanganmi va qaysi model
  useEffect(() => {
    if (isOpen) void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Boshqa foydalanuvchi kirsa suhbat tozalanadi
  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [user?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const notConfigured = status?.configured === false;
  const canSend = !sending && !notConfigured;

  /**
   * Savolni yuboradi. `retryOf` berilsa — o'sha xato xabari o'chiriladi va savol qayta yuboriladi
   * (foydalanuvchi xabari takror qo'shilmaydi).
   */
  const sendQuery = async (rawText: string, retryOf?: string) => {
    const text = rawText.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text || sendingRef.current || notConfigured) return;
    sendingRef.current = true;
    setSending(true);

    // Tarix: faqat haqiqiy savol-javoblar (xato xabarlari va joriy savol kirmaydi)
    const base = retryOf ? messages.filter((m) => m.id !== retryOf) : messages;
    const dialog = base.filter((m) => m.sender !== 'error');
    const prior = retryOf ? dialog.slice(0, -1) : dialog;
    const history = prior.slice(-HISTORY_LIMIT).map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', text: m.text }));

    const time = formatTime(new Date());
    setMessages(retryOf ? base : [...base, { id: nextId(), sender: 'user', text, time }]);

    try {
      const res = await axios.post('/api/ai/chat', { message: text, history, language });
      const reply = typeof res.data?.reply === 'string' ? res.data.reply : '';
      if (!reply) throw Object.assign(new Error('empty'), { response: { status: 502, data: {} } });
      setMessages((prev) => [
        ...prev,
        { id: nextId(), sender: 'assistant', text: reply, time: formatTime(new Date()), model: res.data?.model || status?.model },
      ]);
    } catch (err: any) {
      const data = err?.response?.data;
      const httpStatus = err?.response?.status;
      // Server qaytargan matn AYNAN ko'rsatiladi; javob umuman kelmagan bo'lsa — tarmoq xatosi
      const errorText =
        (typeof data?.error === 'string' && data.error) ||
        (err?.response ? t('aiAssistant.error_unknown', { status: httpStatus ?? '?' }) : t('aiAssistant.error_no_response'));
      const kind: ErrorKind = err?.response ? ERROR_KIND[String(data?.code || '')] || 'other' : 'network';
      setMessages((prev) => [
        ...prev,
        { id: nextId(), sender: 'error', text: errorText, time: formatTime(new Date()), kind, retryText: text },
      ]);
      // Kalit bilan bog'liq xato — holat yozuvini ham yangilaymiz
      if (data?.code === 'NO_KEY') setStatus((prev) => (prev ? { ...prev, configured: false } : prev));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !canSend) return;
    setInput('');
    void sendQuery(text);
  };

  const quickKeys = quickQuestionKeys(user?.role);
  const lastMessageId = messages[messages.length - 1]?.id;

  return (
    <Modal
      open={isOpen}
      onClose={() => setIsOpen(false)}
      flush
      title={
        <span className="flex items-center gap-2">
          <Bot className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          {t('aiAssistant.title')}
        </span>
      }
      description={
        statusLoading && !status
          ? t('aiAssistant.checking')
          : status?.configured
            ? t('aiAssistant.model', { model: status.model })
            : t('aiAssistant.subtitle')
      }
    >
      <div className="flex h-[min(72dvh,36rem)] flex-col">
        {/* Sozlanmagan / holat xatosi */}
        {(notConfigured || statusError) && (
          <div
            role="alert"
            className={cn(
              'flex flex-col gap-2 border-b border-line px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5',
              notConfigured ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'
            )}
          >
            <span className="flex items-start gap-2">
              {notConfigured ? (
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{notConfigured ? t('aiAssistant.not_configured') : statusError}</span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void loadStatus()}
              loading={statusLoading}
            >
              {t('aiAssistant.check_again')}
            </Button>
          </div>
        )}

        {/* Tez savollar — rolga mos */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-2 sm:px-5">
          <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto" role="group" aria-label={t('aiAssistant.quick_label')}>
            {quickKeys.map((key) => (
              <button
                key={key}
                type="button"
                disabled={!canSend}
                onClick={() => void sendQuery(t(`aiAssistant.q_${key}_text`))}
                className="inline-flex min-h-[2.25rem] shrink-0 items-center whitespace-nowrap rounded-full border border-line bg-surface px-3 text-xs font-medium text-fg-secondary transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t(`aiAssistant.q_${key}`)}
              </button>
            ))}
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              disabled={sending}
              aria-label={t('aiAssistant.clear')}
              title={t('aiAssistant.clear')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Xabarlar */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-surface px-4 py-4 sm:px-5" aria-live="polite">
          {messages.length === 0 && !sending && (
            <div className="flex h-full flex-col items-center justify-center px-2 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-accent">
                <Bot className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-fg">{t('aiAssistant.intro_title')}</p>
              <p className="mt-1 max-w-xs text-sm leading-relaxed text-fg-muted">{t('aiAssistant.intro')}</p>
            </div>
          )}

          {messages.map((m) => {
            if (m.sender === 'error') {
              const view = ERROR_VIEW[m.kind || 'other'];
              const Icon = view.icon;
              return (
                <div key={m.id} role="alert" className={cn('max-w-[92%] rounded-card px-3 py-2.5 text-sm', view.className)}>
                  <p className="flex items-center gap-2 text-xs font-semibold">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t(`aiAssistant.error_title_${m.kind || 'other'}`)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                  {m.retryText && m.id === lastMessageId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      leftIcon={<RefreshCw className="h-4 w-4" />}
                      disabled={!canSend}
                      onClick={() => void sendQuery(m.retryText!, m.id)}
                    >
                      {t('aiAssistant.retry')}
                    </Button>
                  )}
                </div>
              );
            }
            const mine = m.sender === 'user';
            return (
              <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[88%] whitespace-pre-wrap break-words rounded-card px-3 py-2 text-sm leading-relaxed',
                    mine ? 'bg-brand text-brand-fg' : 'border border-line bg-surface-2 text-fg'
                  )}
                >
                  {m.text}
                </div>
                <p className="mt-1 px-1 text-xs tabular-nums text-fg-muted">
                  {m.time}
                  {!mine && m.model ? `, ${m.model}` : ''}
                </p>
              </div>
            );
          })}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-fg-muted" role="status">
              <Spinner size="sm" className="text-accent" />
              {t('aiAssistant.thinking')}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Savol kiritish */}
        <form
          onSubmit={submit}
          className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-3"
        >
          <div className="min-w-0 flex-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('aiAssistant.placeholder')}
              aria-label={t('aiAssistant.placeholder')}
              maxLength={MAX_MESSAGE_CHARS}
              disabled={notConfigured}
              enterKeyHint="send"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            loading={sending}
            disabled={!input.trim() || !canSend}
            aria-label={t('aiAssistant.send')}
            title={t('aiAssistant.send')}
          >
            {!sending && <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </Modal>
  );
};
export default AIAssistantModal;
