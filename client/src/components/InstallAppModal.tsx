import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Smartphone, 
  CheckCircle2, 
  Share2, 
  MoreVertical, 
  X, 
  Sparkles, 
  ShieldCheck, 
  Wifi, 
  Zap,
  ExternalLink
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'pc'>('android');
  const [installSuccess, setInstallSuccess] = useState<boolean>(false);

  useEffect(() => {
    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Check if already in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setInstallSuccess(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleNativeInstall = async () => {
    if (!deferredPrompt) {
      // If browser doesn't expose prompt, show android guide
      setActiveTab('android');
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setInstallSuccess(true);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error('Install prompt error:', err);
    }
  };

  const handleOpenPWABuilder = () => {
    window.open('https://www.pwabuilder.com/reportcard?site=https://finmodel-erp-uz.vercel.app', '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-5 sm:p-6 bg-gradient-to-br from-emerald-600 via-teal-700 to-cyan-800 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg p-2">
              <img src="/macmobi-icon.png" alt="Macmobi ERP" className="w-full h-full object-contain rounded-xl" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black tracking-tight">Macmobi ERP</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 border border-white/30 uppercase tracking-wider">
                  Mobile App
                </span>
              </div>
              <p className="text-xs text-emerald-100 font-medium mt-0.5">
                Android (APK) & iOS uchun qulay mobil ilova
              </p>
            </div>
          </div>

          {/* Quick Badges */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/15 text-center">
            <div className="flex flex-col items-center">
              <Zap className="w-4 h-4 text-emerald-300 mb-1" />
              <span className="text-[11px] font-semibold text-emerald-50">100% Tezkor</span>
            </div>
            <div className="flex flex-col items-center border-x border-white/15">
              <Wifi className="w-4 h-4 text-emerald-300 mb-1" />
              <span className="text-[11px] font-semibold text-emerald-50">Offline Kesh</span>
            </div>
            <div className="flex flex-col items-center">
              <ShieldCheck className="w-4 h-4 text-emerald-300 mb-1" />
              <span className="text-[11px] font-semibold text-emerald-50">Xavfsiz Tizim</span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-slate-800 dark:text-slate-100">
          {installSuccess || isInstalled ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="text-lg font-black text-slate-900 dark:text-white">
                Macmobi ERP o'rnatildi!
              </h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Ilova telefoningizning asosiy ekraniga tushdi. Endi har doim bir bosishda brauzersiz to'liq ekranda foydalanishingiz mumkin.
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition-all"
              >
                Tushunarli, yopish
              </button>
            </div>
          ) : (
            <>
              {/* Primary Direct 1-Tap Action if browser supports prompt */}
              {deferredPrompt && (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/50 space-y-2.5">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Tezkor avtomatik o'rnatish mavjud:</span>
                  </div>
                  <button
                    onClick={handleNativeInstall}
                    className="w-full py-3.5 px-4 rounded-xl font-black text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2 transition-all active:scale-98"
                  >
                    <Download className="w-5 h-5 animate-bounce" />
                    <span>Telefonga darhol o'rnatish (1 bosishda)</span>
                  </button>
                </div>
              )}

              {/* Platform Selector Tabs */}
              <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  onClick={() => setActiveTab('android')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'android'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Android (APK)</span>
                </button>
                <button
                  onClick={() => setActiveTab('ios')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'ios'
                      ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span>🍎 iPhone / iPad</span>
                </button>
                <button
                  onClick={() => setActiveTab('pc')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeTab === 'pc'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <span>💻 Kompyuter</span>
                </button>
              </div>

              {/* Instructions by Tab */}
              {activeTab === 'android' && (
                <div className="space-y-3.5 text-xs">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <p className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">1</span>
                      Chrome brauzer orqali to'g'ridan-to'g'ri o'rnatish (WebAPK):
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300 pl-1 leading-relaxed">
                      <li>Chrome brauzerning yuqori o'ng burchagidagi <strong className="text-slate-800 dark:text-white"><MoreVertical className="w-3.5 h-3.5 inline text-emerald-500" /> 3 ta nuqta</strong> belgisini bosing.</li>
                      <li>Ro'yxatdan <strong className="text-emerald-600 dark:text-emerald-400">"Ilovani o'rnatish"</strong> yoki <strong className="text-emerald-600 dark:text-emerald-400">"Bosh ekranga qo'shish"</strong> bandini tanlang.</li>
                      <li>Google Android tizimi ilovani rasmiy ilovalar ro'yxatiga avtomatik qo'shadi!</li>
                    </ol>
                  </div>

                  {/* Cloud APK Option */}
                  <div className="p-3.5 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-900 dark:text-cyan-300">
                        📦 Tayyor .APK fayli kerakmi?
                      </span>
                    </div>
                    <p className="text-[11px] text-cyan-800 dark:text-cyan-300/80 leading-relaxed">
                      Microsoft & Google PWABuilder bulutli servisi orqali ushbu tizimning imzolangan <strong className="font-semibold">.APK</strong> faylini 1 bosishda yuklab olishingiz mumkin.
                    </p>
                    <button
                      onClick={handleOpenPWABuilder}
                      className="w-full mt-1 py-2.5 px-3 rounded-xl font-bold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center justify-center gap-1.5 transition-all text-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>APK Yuklab Olish (PWABuilder Cloud)</span>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'ios' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                  <p className="font-bold text-slate-800 dark:text-white">
                    iPhone (Safari) orqali o'rnatish tartibi:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-slate-600 dark:text-slate-300 pl-1 leading-relaxed">
                    <li>Saytni <strong className="text-slate-800 dark:text-white">Safari</strong> brauzerida oching.</li>
                    <li>Pastki menyudagi <strong className="text-cyan-600 dark:text-cyan-400"><Share2 className="w-3.5 h-3.5 inline mx-1" /> "Ulashish" (Share)</strong> tugmasini bosing.</li>
                    <li>Menyuni biroz pastga surib, <strong className="text-slate-800 dark:text-white">"Bosh ekranga qo'shish" (На экран «Домой»)</strong> tugmasini bosing.</li>
                    <li>Yuqori o'ng burchakdagi <strong className="text-slate-800 dark:text-white">"Qo'shish" (Add)</strong> tugmasini bosing.</li>
                  </ol>
                </div>
              )}

              {activeTab === 'pc' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                  <p className="font-bold text-slate-800 dark:text-white">
                    Kompyuterda (Chrome / Edge / Yandex):
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    Brauzeringiz manzil satrining (URL) o'ng tomonidagi <strong className="text-blue-600 dark:text-blue-400">"Ilovani o'rnatish" (⊕)</strong> tugmasini bosing. Macmobi ERP kompyuteringizga mustaqil dastur sifatida o'rnatiladi.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallAppModal;
