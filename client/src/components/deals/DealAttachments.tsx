import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FileText, Paperclip, Trash2 } from 'lucide-react';
import { Button, Select, cn } from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { apiError } from './dealUtils';

/** Chek hujjati turlari (server: DEAL_ATTACHMENT_KINDS) */
export const ATTACHMENT_KINDS = ['CONTRACT', 'APP_SCREENSHOT', 'CONFIRMATION'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export interface DealAttachmentMeta {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  createdById?: string | null;
}

const MAX_BYTES = 3 * 1024 * 1024;

/** Rasmni 1600px gacha kichraytirib JPEG (0.8) qiladi — telefon surati ~300 KB bo'ladi. PDF o'zgarmaydi. */
async function prepareFile(file: File): Promise<{ dataBase64: string; mimeType: string; fileName: string }> {
  const toB64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  const isImage = /^image\/(jpeg|png|webp)$/.test(file.type);
  if (!isImage) return { dataBase64: await toB64(file), mimeType: file.type || 'application/octet-stream', fileName: file.name };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) return { dataBase64: await toB64(file), mimeType: file.type, fileName: file.name };
    return { dataBase64: await toB64(blob), mimeType: 'image/jpeg', fileName: file.name.replace(/\.\w+$/, '') + '.jpg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Faylni chekka yuklaydi (yangi chek saqlangandan keyin ham shu ishlatiladi) */
export async function uploadDealAttachment(dealId: string, kind: AttachmentKind, file: File): Promise<DealAttachmentMeta> {
  const prepared = await prepareFile(file);
  if (Math.ceil((prepared.dataBase64.length * 3) / 4) > MAX_BYTES) throw new Error('too_big');
  const res = await axios.post(`/api/deals/${dealId}/attachments`, { kind, ...prepared });
  return res.data;
}

/** Fayl tanlash maydoni: turi + fayl (rasm yoki PDF). Yangi chek formasida ham, Batafsil'da ham ishlatiladi. */
export const AttachmentPicker: React.FC<{
  disabled?: boolean;
  onPick: (kind: AttachmentKind, file: File) => void;
}> = ({ disabled, onPick }) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<AttachmentKind>('CONTRACT');
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)} disabled={disabled} className="sm:max-w-[16rem]">
        {ATTACHMENT_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`dealsPage.att_kind_${k}`)}
          </option>
        ))}
      </Select>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(kind, f);
          e.target.value = '';
        }}
      />
      <Button type="button" variant="secondary" size="sm" leftIcon={<Paperclip className="h-4 w-4" />} disabled={disabled} onClick={() => input.current?.click()}>
        {t('dealsPage.att_add')}
      </Button>
    </div>
  );
};

/** Chek hujjatlari ro'yxati: ko'rish, qo'shish, o'chirish */
export const DealAttachments: React.FC<{
  dealId: string;
  canAdd: boolean;
  canDelete: (a: DealAttachmentMeta) => boolean;
  onCount?: (n: number) => void;
}> = ({ dealId, canAdd, canDelete, onCount }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<DealAttachmentMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    axios
      .get(`/api/deals/${dealId}/attachments`)
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setItems(list);
        onCount?.(list.length);
      })
      .catch((e) => setError(apiError(e, t)));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const open = async (a: DealAttachmentMeta) => {
    try {
      const r = await axios.get(`/api/deals/${dealId}/attachments/${a.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(apiError(e, t));
    }
  };

  const add = async (kind: AttachmentKind, file: File) => {
    setBusy(true);
    setError('');
    try {
      await uploadDealAttachment(dealId, kind, file);
      await load();
    } catch (e: any) {
      setError(e?.message === 'too_big' ? t('dealsPage.att_too_big') : apiError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: DealAttachmentMeta) => {
    if (!window.confirm(t('dealsPage.att_delete_confirm', { name: a.fileName }))) return;
    setBusy(true);
    try {
      await axios.delete(`/api/deals/${dealId}/attachments/${a.id}`);
      await load();
    } catch (e) {
      setError(apiError(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-fg">{t('dealsPage.att_title')}</h3>
      {items === null ? (
        <p className="text-sm text-fg-muted">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">{t('dealsPage.att_none')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-control border border-line text-sm">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <button type="button" className="min-w-0 flex-1 truncate text-left text-accent hover:underline" onClick={() => open(a)}>
                {t(`dealsPage.att_kind_${a.kind}`)} · {a.fileName}
              </button>
              <span className="shrink-0 tabular-nums text-xs text-fg-muted">{Math.max(1, Math.round(a.size / 1024))} KB</span>
              {canDelete(a) && (
                <button
                  type="button"
                  aria-label={t('common.delete')}
                  className={cn('shrink-0 rounded p-1 text-fg-muted hover:text-danger')}
                  onClick={() => remove(a)}
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd && <AttachmentPicker disabled={busy} onPick={add} />}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
};
