import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Camera, CheckCircle2, QrCode, X, AlertCircle, RefreshCw, Barcode } from 'lucide-react';
import { formatMoney, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';

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
          if (!imei1) {
            setImei1(decodedText);
          } else if (!imei2) {
            setImei2(decodedText);
          }
          // Stop camera once scanned
          scanner.clear().catch(console.error);
          setIsCameraActive(false);
        },
        (err) => {
          // ignore frame decode fails
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imei1.trim()) {
      setError('IMEI 1 kiritilishi yoki skaner qilinishi shart!');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const res = await fetch(`/api/inventory/${item.id}/receive`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          imeiBarcode: imei1.trim(),
          imei2: imei2.trim(),
          color: color.trim(),
          storageGb: storageGb.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Qabul qilishda xatolik');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[94vh] sm:h-auto sm:max-h-[92vh] text-xs text-slate-800 dark:text-slate-200">
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Skaner & Prixod
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px] sm:max-w-none">
                Chek №{item.dealNumber} - {item.productName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Item arrival info card */}
        <div className="p-3 sm:p-4 mx-4 sm:mx-6 mt-3 sm:mt-4 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 grid grid-cols-2 gap-2.5 sm:gap-3 text-[11px] shrink-0">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block font-medium">Qayerdan kelgan:</span>
            <span className="font-bold text-slate-900 dark:text-white text-xs">{item.storeName}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block font-medium">Kelgan sanasi:</span>
            <span className="font-bold text-slate-900 dark:text-white text-xs">{formatDate(item.date)}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block font-medium">Chek raqami:</span>
            <span className="font-bold text-cyan-600 dark:text-cyan-400 text-xs">№{item.dealNumber}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block font-medium">Xarid narxi (Qanchaga):</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">{formatMoney(item.purchaseCost)}</span>
          </div>
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Camera View Area */}
          {isCameraActive ? (
            <div className="space-y-2">
              <div id="reader" className="w-full rounded-2xl overflow-hidden bg-black min-h-[220px]" />
              <button
                type="button"
                onClick={() => setIsCameraActive(false)}
                className="w-full py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl font-bold"
              >
                Kamerani to'xtatish
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsCameraActive(true)}
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 active:scale-[0.99] transition"
            >
              <Camera className="w-4 h-4" />
              <span>Telefon kamerasini yoqish (Skanerlash)</span>
            </button>
          )}

          {/* Dual IMEI inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                IMEI 1 / Shtrix-kod *
              </label>
              <div className="relative">
                <Barcode className="w-4 h-4 text-cyan-600 dark:text-cyan-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="352887831..."
                  value={imei1}
                  onChange={(e) => setImei1(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                IMEI 2 (Dual SIM)
              </label>
              <div className="relative">
                <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="352887832..."
                  value={imei2}
                  onChange={(e) => setImei2(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Color & Storage specs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Rangi</label>
              <input
                type="text"
                placeholder="Natural Titanium, Black..."
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-cyan-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Xotirasi</label>
              <input
                type="text"
                placeholder="256GB, 512GB..."
                value={storageGb}
                onChange={(e) => setStorageGb(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-cyan-500 outline-none"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-xl font-bold transition"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition disabled:opacity-50"
            >
              {submitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>Omborga qabul qilish (Omborda)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default BarcodeScannerModal;
