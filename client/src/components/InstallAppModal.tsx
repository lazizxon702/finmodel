import React, { useState, useEffect } from 'react';
import {
  Download,
  Smartphone,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Wifi,
  Zap,
  ExternalLink,
  Apple,
  Monitor,
} from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import { Badge, Button, Modal, SegmentedControl } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Tarjima matnidagi **qalin** belgilarini <strong> ga aylantiradi
const rich = (text: string): React.ReactNode =>
  text.split('**').map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-fg">
        {part}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'pc'>('android');
  const [installSuccess, setInstallSuccess] = useState<boolean>(false);

  useEffect(() => {
    // beforeinstallprompt hodisasini tinglash
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Allaqachon o'rnatilgan (standalone) rejimmi
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
      // Brauzer so'rovni bermasa, Android ko'rsatmasini ko'rsatamiz
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

  const done = installSuccess || isInstalled;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="md"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <img src="/macmobi-icon.png" alt="Macmobi ERP" className="h-7 w-7 rounded-control object-contain" />
          <span>Macmobi ERP</span>
          <Badge tone="brand" size="sm">{t('installApp.badge')}</Badge>
        </span>
      }
      description={t('installApp.subtitle')}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Qisqa afzalliklar */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: <Zap className="mb-1 h-4 w-4 text-accent" />, label: t('installApp.fast') },
            { icon: <Wifi className="mb-1 h-4 w-4 text-accent" />, label: t('installApp.offline') },
            { icon: <ShieldCheck className="mb-1 h-4 w-4 text-accent" />, label: t('installApp.secure') },
          ].map((b, i) => (
            <div key={i} className="flex flex-col items-center rounded-control border border-line bg-surface-2 px-1 py-2">
              {b.icon}
              <span className="text-xs font-medium text-fg-secondary">{b.label}</span>
            </div>
          ))}
        </div>

        {done ? (
          <div className="space-y-3 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h4 className="text-lg font-semibold text-fg">{t('installApp.doneTitle')}</h4>
            <p className="mx-auto max-w-sm text-sm text-fg-muted">{t('installApp.doneText')}</p>
            <Button fullWidth onClick={onClose}>
              {t('installApp.doneClose')}
            </Button>
          </div>
        ) : (
          <>
            {/* Brauzer qo'llasa — bir bosishda o'rnatish */}
            {deferredPrompt && (
              <div className="space-y-2.5 rounded-card border border-success/30 bg-success-soft p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-success">
                  <Sparkles className="h-4 w-4" />
                  <span>{t('installApp.quickTitle')}</span>
                </div>
                <Button variant="success" fullWidth size="lg" leftIcon={<Download className="h-5 w-5" />} onClick={handleNativeInstall}>
                  {t('installApp.quickButton')}
                </Button>
              </div>
            )}

            {/* Platforma tanlash */}
            <SegmentedControl
              fullWidth
              value={activeTab}
              onChange={(v) => setActiveTab(v as 'android' | 'ios' | 'pc')}
              items={[
                { value: 'android', label: t('installApp.tab.android'), icon: <Smartphone className="h-4 w-4" /> },
                { value: 'ios', label: t('installApp.tab.ios'), icon: <Apple className="h-4 w-4" /> },
                { value: 'pc', label: t('installApp.tab.pc'), icon: <Monitor className="h-4 w-4" /> },
              ]}
            />

            {activeTab === 'android' && (
              <div className="space-y-3.5 text-xs">
                <div className="space-y-2.5 rounded-card border border-line bg-surface-2 p-3.5">
                  <p className="font-semibold text-fg">{t('installApp.android.title')}</p>
                  <ol className="list-inside list-decimal space-y-1.5 pl-1 leading-relaxed text-fg-secondary">
                    <li>{rich(t('installApp.android.step1'))}</li>
                    <li>{rich(t('installApp.android.step2'))}</li>
                    <li>{t('installApp.android.step3')}</li>
                  </ol>
                </div>

                {/* Bulutli APK varianti */}
                <div className="space-y-2 rounded-card border border-info/30 bg-info-soft p-3.5">
                  <span className="font-semibold text-fg">{t('installApp.apk.title')}</span>
                  <p className="text-xs leading-relaxed text-fg-secondary">{rich(t('installApp.apk.text'))}</p>
                  <Button size="sm" fullWidth leftIcon={<ExternalLink className="h-3.5 w-3.5" />} onClick={handleOpenPWABuilder}>
                    {t('installApp.apk.button')}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'ios' && (
              <div className="space-y-3 rounded-card border border-line bg-surface-2 p-4 text-xs">
                <p className="font-semibold text-fg">{t('installApp.ios.title')}</p>
                <ol className="list-inside list-decimal space-y-2 pl-1 leading-relaxed text-fg-secondary">
                  <li>{rich(t('installApp.ios.step1'))}</li>
                  <li>{rich(t('installApp.ios.step2'))}</li>
                  <li>{rich(t('installApp.ios.step3'))}</li>
                  <li>{rich(t('installApp.ios.step4'))}</li>
                </ol>
              </div>
            )}

            {activeTab === 'pc' && (
              <div className="space-y-3 rounded-card border border-line bg-surface-2 p-4 text-xs">
                <p className="font-semibold text-fg">{t('installApp.pc.title')}</p>
                <p className="leading-relaxed text-fg-secondary">{rich(t('installApp.pc.text'))}</p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default InstallAppModal;
