import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Bot,
  X,
  Send,
  Sparkles,
  HelpCircle,
  TrendingUp,
  Package,
  Layers,
  ArrowDownUp,
  CreditCard,
  ShieldAlert,
  Coins,
  ChevronRight,
  Maximize2,
  Minimize2,
  KeyRound,
  Trash2,
  Check,
  ExternalLink,
  Cpu
} from 'lucide-react';
import { formatMoney } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  source?: 'gemini' | 'knowledge_base';
  model?: string;
}

export const AIAssistantModal: React.FC = () => {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return localStorage.getItem('finmodel_gemini_api_key') || '';
  });
  const [tempApiKey, setTempApiKey] = useState(geminiApiKey);
  const [keySaved, setKeySaved] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen for open event from Header or Sidebar
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-ai-assistant', handleOpen);
    return () => window.removeEventListener('open-ai-assistant', handleOpen);
  }, []);

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          sender: 'agent',
          text:
            language === 'ru'
              ? 'Здравствуйте! Я ваш официальный интеллектуальный AI Ассистент Macmobi ERP на базе Google Gemini. Я знаю всё о сделках, складе, ДДС, расчетах Кодир ака, командах Жахонгира и Фариды и формулах от А до Я. Чем могу помочь?'
              : 'Assalomu alaykum! Men Macmobi ERP tizimining rasmiy Intellektual AI Maslahatchisiman (Google Gemini quvvatida). Tizimdagi barcha sahifalar, formulalar, ombor, DDS, Qodir aka hisoblari va bitimlar bo\'yicha barcha savollaringizga to\'liq javob beraman. Qanday yordam bera olaman?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          source: geminiApiKey ? 'gemini' : 'knowledge_base',
          model: geminiApiKey ? 'Google Gemini 1.5 Flash' : 'Macmobi AI Engine'
        },
      ]);
    }
  }, [language]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSaveApiKey = () => {
    localStorage.setItem('finmodel_gemini_api_key', tempApiKey.trim());
    setGeminiApiKey(tempApiKey.trim());
    setKeySaved(true);
    setTimeout(() => {
      setKeySaved(false);
      setShowKeyModal(false);
    }, 1200);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'agent',
        text:
          language === 'ru'
            ? 'Чат очищен. Я готов ответить на любые вопросы по системе FinModel ERP!'
            : 'Suhbat tozalandi. FinModel ERP bo\'yicha yangi savollaringizni berishingiz mumkin!',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: geminiApiKey ? 'gemini' : 'knowledge_base'
      }
    ]);
  };

  const handleSendQuery = async (queryText?: string) => {
    const textToSend = (queryText !== undefined ? queryText : input).trim();
    if (!textToSend || isTyping) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (queryText === undefined) {
      setInput('');
    }
    setIsTyping(true);

    try {
      // Call backend AI endpoint connected to Google Gemini
      const res = await axios.post('/api/ai/chat', {
        message: textToSend,
        history: messages.slice(-6).map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model',
          text: m.text
        })),
        userRole: user?.role || 'ADMIN',
        apiKey: geminiApiKey || undefined,
        language
      });

      const replyText = res.data?.reply || 'Javob olindi.';
      const agentMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'agent',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: res.data?.source,
        model: res.data?.model
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      console.error('AI chat error:', err);
      const fallbackMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'agent',
        text:
          language === 'ru'
            ? '⚠️ Произошла ошибка при обращении к серверу. Попробуйте еще раз или проверьте подключение.'
            : '⚠️ Serverga ulanishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Interactive Chat Modal (Triggered from Top Header and Sidebar) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-6 bg-slate-950/60 backdrop-blur-sm animate-fade-in pb-[env(safe-area-inset-bottom)] sm:pb-0">
          <div className="w-full sm:w-[500px] h-[92vh] sm:h-[680px] bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/30 border border-white/20">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-extrabold text-sm leading-tight text-white flex items-center gap-1.5">
                      <span>Macmobi AI Agent</span>
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-400 font-bold">
                      {geminiApiKey ? 'Google Gemini 1.5 Pro/Flash' : 'Google Gemini AI Integratsiyasi'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Gemini API Key configuration button */}
                <button
                  type="button"
                  onClick={() => setShowKeyModal(true)}
                  title="Google Gemini API kalitini kiritish (ixtiyoriy)"
                  className="p-2 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition"
                >
                  <KeyRound className="w-4 h-4" />
                </button>

                {/* Clear Chat */}
                <button
                  type="button"
                  onClick={handleClearChat}
                  title="Suhbatni tozalash"
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {/* Close */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Topic Chips */}
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
              <button
                onClick={() => handleSendQuery('FinModel sayti o\'zi nima va qanday ishlaydi? Barcha sahifalarni tushuntir')}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-500/25 transition border border-indigo-500/20"
              >
                🌟 Sayt qanday ishlaydi?
              </button>
              <button
                onClick={() => handleSendQuery('Bugungi jami foyda, yechilgan limit va umumiy statistika qancha?')}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-500/25 transition border border-emerald-500/20"
              >
                📊 Hozirgi statistika
              </button>
              <button
                onClick={() => handleSendQuery('Qodir aka bilan hisob-kitob, 5% bonus va chek xarajati qanday hisoblanadi?')}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-500/25 transition border border-amber-500/20"
              >
                🧾 Qodir aka 5% bonusi
              </button>
              <button
                onClick={() => handleSendQuery('Omborda qancha tovar bor va IMEI skaneridan qanday kirim qilinadi?')}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] font-bold bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 rounded-lg hover:bg-cyan-500/25 transition border border-cyan-500/20"
              >
                📦 Ombor va IMEI
              </button>
              <button
                onClick={() => handleSendQuery('Jahongir va Farida jamoalari lidlari va agentlar reytingi haqida tushuntir')}
                className="whitespace-nowrap px-2.5 py-1 text-[11px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-500/25 transition border border-purple-500/20"
              >
                👥 Jamoalar & Lidlar
              </button>
            </div>

            {/* Messages Body */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 custom-scrollbar bg-slate-50/50 dark:bg-slate-900/60">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-br-none shadow-md shadow-emerald-600/20'
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200 dark:border-slate-700 shadow-sm whitespace-pre-line'
                    }`}
                  >
                    {m.text}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 px-1">
                    <span className="text-[9px] text-slate-400">{m.timestamp}</span>
                    {m.source === 'gemini' && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 font-bold">
                        ✨ Gemini Flash
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-1.5 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-28">
                  <Cpu className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
                  <span className="text-[10px] text-slate-400 font-medium animate-pulse">Gemini o'ylamoqda...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <input
                type="text"
                placeholder={
                  language === 'ru'
                    ? 'Спросите об ERP, сделках, формулах, складе или ДДС...'
                    : 'Sayt, bitimlar, formulalar, ombor yoki DDS bo\'yicha so\'rang...'
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendQuery()}
                className="flex-1 px-4 py-2.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleSendQuery()}
                disabled={!input.trim() || isTyping}
                className="p-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white shadow-md shadow-emerald-600/30 transition active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini API Key Configuration Drawer / Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800 dark:text-white">Google Gemini API Kaliti</h4>
                  <p className="text-[11px] text-slate-500">Shaxsiy bepul kalitni ulash</p>
                </div>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
              Google AI Studio’dan bepul olingan API kalitingizni kiritsangiz, FinModel AI Agenti to'g'ridan-to'g'ri 
              <strong className="text-emerald-500"> Google Gemini 1.5/2.0 Flash</strong> neyrotarmog'i orqali javob beradi.
            </p>

            <div className="space-y-3 mb-4">
              <input
                type="password"
                placeholder="AIzaSy..."
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex items-center justify-between text-[11px]">
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1 font-semibold"
                >
                  <span>Google AI Studio'dan bepul kalit olish</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                {geminiApiKey && (
                  <button
                    onClick={() => {
                      setTempApiKey('');
                      setGeminiApiKey('');
                      localStorage.removeItem('finmodel_gemini_api_key');
                    }}
                    className="text-rose-500 hover:underline"
                  >
                    O'chirish
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowKeyModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleSaveApiKey}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-black shadow-md hover:from-emerald-500 hover:to-teal-500 transition flex items-center justify-center gap-1.5"
              >
                {keySaved ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Saqlandi!</span>
                  </>
                ) : (
                  <span>Saqlash</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default AIAssistantModal;
