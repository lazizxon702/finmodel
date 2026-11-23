import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from '../../context/LanguageContext';

/** GET /api/deals/:id/history javobining bitta yozuvi */
interface HistoryItem {
  id: string;
  action: string;
  atLabel: string;
  by: string | null;
  reason: string | null;
  rule: string | null;
  changes: { field: string; label: string; fromText: string; toText: string; money: boolean }[];
}

/** Chek tarixi (egasi, 23.11.2026): kim, qachon, qaysi maydon, eski → yangi, sabab. "Batafsil" oynasida. */
export const DealHistory: React.FC<{ dealId: string }> = ({ dealId }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    axios
      .get(`/api/deals/${dealId}/history`)
      .then((res) => alive && setItems(Array.isArray(res.data) ? res.data : []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [dealId]);

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-fg">{t('dealsPage.history_title')}</h3>
      {failed ? (
        <p className="text-sm text-fg-muted">{t('dealsPage.history_failed')}</p>
      ) : items === null ? (
        <p className="text-sm text-fg-muted">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('dealsPage.history_empty')}</p>
      ) : (
        <ol className="divide-y divide-line rounded-control border border-line text-sm">
          {items.map((h) => (
            <li key={h.id} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-fg">{t(`dealsPage.history_action_${h.action}`)}</span>
                <span className="tabular-nums text-xs text-fg-muted">
                  {h.atLabel}
                  {h.by ? ` · ${h.by}` : ''}
                </span>
              </div>
              {h.changes.map((c) => (
                <p key={c.field} className="break-words text-fg-secondary">
                  <span className="text-fg-muted">{c.label}:</span>{' '}
                  <span className="tabular-nums line-through decoration-fg-muted/60">{c.fromText}</span>
                  {' → '}
                  <span className={c.money ? 'font-medium tabular-nums text-warning' : 'tabular-nums text-fg'}>{c.toText}</span>
                </p>
              ))}
              {h.rule && <p className="break-words text-xs text-danger">{h.rule}</p>}
              {h.reason && (
                <p className="break-words text-xs text-fg-secondary">
                  {t('dealsPage.history_reason')}: {h.reason}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
