import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, CheckCircle2, AlertCircle, Barcode } from 'lucide-react';
import { formatMoney, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { Button, Field, Input, Modal } from './ui';

interface BarcodeScannerModalProps {
  item: any;
  onClose: () => void;
  onSuccess: () => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  item,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();

  const [imei1, setImei1] = useState(item.imeiBarcode !== '-' ? item.imeiBarcode : '');
  const [imei2, setImei2] = useState(item.imei2 !== '-' ? item.imei2 : '');
  const [color, setColor] = useState(item.color !== '-' ? item.color : '');
  const [storageGb, setStorageGb] = useState(item.storageGb !== '-' ? item.storageGb : '');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const imei2Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCameraActive) {
      const scanner = new Html5QrcodeScanner(
        'reader',
        {
          fps: 10,
          qrbox: { width: 280, height: 180 },
          rememberLastUsedCamera: true,
        },
        false
      );

      scanner.render(
        (decodedText) => {
          // Kamera skaneri FAQAT maydonni to'ldiradi — saqlash (handleSubmit) chaqirilmaydi
          if (!imei1) {
            setImei1(decodedText);
          } else if (!imei2) {
            setImei2(decodedText);
          }
          // Skanerlangach kamerani to'xtatish
          scanner.clear().catch(console.error);
          setIsCameraActive(false);
        },
        () => {
          // kadr o'qilmagan xatolarini e'tiborsiz qoldiramiz
        }
      );

      scannerRef.current = scanner;

      return () => {
        if (scannerRef.current) {
          scannerRef.current.clear().catch(console.error);
        }
      };
    }
  }, [isCameraActive, imei1, imei2]);

  // Saqlash FAQAT "Omborga qabul qilish" tugmasi qo'lda bosilganda ishlaydi.
  // Skaner (kamera yoki USB/Bluetooth) hech qachon bu funksiyani chaqirmaydi.
  const handleSubmit = async () => {
    if (submitting) return;
    if (!imei1.trim()) {
      setError(t('scanner.imei1Required'));
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await axios.put(`/api/inventory/${item.id}/receive`, {
        imeiBarcode: imei1.trim(),
        imei2: imei2.trim(),
        color: color.trim(),
        storageGb: storageGb.trim(),
      });

      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || t('scanner.receiveError'));
    } finally {
      setSubmitting(false);
    }
  };

  // Apparat skanerlari kod oxirida Enter yuboradi — bu formani saqlamasligi kerak.
  // IMEI 1 dan keyin fokus IMEI 2 ga o'tadi; boshqa maydonlarda Enter e'tiborsiz.
  const onScanKeyDown =
    (next?: React.RefObject<HTMLInputElement>) => (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      next?.current?.focus();
    };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-accent" />
          {t('scanner.title')}
        </span>
      }
      description={t('scanner.subtitle', { number: item.dealNumber, product: item.productName })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="success"
            onClick={handleSubmit}
            loading={submitting}
            leftIcon={<CheckCircle2 className="h-4 w-4" />}
          >
            {t('scanner.receive')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Kelgan tovar ma'lumoti */}
        <div className="grid grid-cols-2 gap-3 rounded-card border border-line bg-surface-2 p-3 text-xs">
          <div>
            <span className="block text-fg-muted">{t('scanner.from')}</span>
            <span className="font-semibold text-fg">{item.storeName}</span>
          </div>
          <div>
            <span className="block text-fg-muted">{t('scanner.arrivalDate')}</span>
            <span className="font-semibold tabular-nums text-fg">{formatDate(item.date)}</span>
          </div>
          <div>
            <span className="block text-fg-muted">{t('scanner.receiptNo')}</span>
            <span className="font-semibold tabular-nums text-accent">№{item.dealNumber}</span>
          </div>
          <div>
            <span className="block text-fg-muted">{t('scanner.purchasePrice')}</span>
            <span className="font-semibold tabular-nums text-success">{formatMoney(item.purchaseCost)}</span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-control border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Forma Enter bilan hech qachon yuborilmaydi (onSubmit bloklangan) */}
        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          {/* Kamera: skanerning o'zi ataylab qora fonda (.keep-colors) */}
          {isCameraActive ? (
            <div className="space-y-2">
              <div id="reader" className="keep-colors min-h-[220px] w-full overflow-hidden rounded-card bg-black" />
              <Button variant="secondary" fullWidth onClick={() => setIsCameraActive(false)}>
                {t('scanner.stopCamera')}
              </Button>
            </div>
          ) : (
            <Button fullWidth size="lg" leftIcon={<Camera className="h-4 w-4" />} onClick={() => setIsCameraActive(true)}>
              {t('scanner.startCamera')}
            </Button>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('scanner.imei1')} required>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="352887831..."
                value={imei1}
                onChange={(e) => setImei1(e.target.value)}
                onKeyDown={onScanKeyDown(imei2Ref)}
                leftIcon={<Barcode />}
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label={t('scanner.imei2')}>
              <Input
                ref={imei2Ref}
                type="text"
                inputMode="numeric"
                placeholder="352887832..."
                value={imei2}
                onChange={(e) => setImei2(e.target.value)}
                onKeyDown={onScanKeyDown()}
                leftIcon={<Barcode />}
                className="font-mono tabular-nums"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('scanner.color')}>
              <Input
                type="text"
                placeholder={t('scanner.colorPlaceholder')}
                value={color}
                onChange={(e) => setColor(e.target.value)}
                onKeyDown={onScanKeyDown()}
              />
            </Field>
            <Field label={t('scanner.storage')}>
              <Input
                type="text"
                placeholder={t('scanner.storagePlaceholder')}
                value={storageGb}
                onChange={(e) => setStorageGb(e.target.value)}
                onKeyDown={onScanKeyDown()}
              />
            </Field>
          </div>
        </form>
      </div>
    </Modal>
  );
};
export default BarcodeScannerModal;
