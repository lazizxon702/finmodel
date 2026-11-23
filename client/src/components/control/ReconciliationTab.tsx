import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Paperclip } from 'lucide-react';
import { Badge, Button, Card, Field, Input, LoadingBlock, Select, StatCard, Table, TableContainer, TableEmpty, Tbody, Td, Th, Thead, Tr, cn, controlClass } from '../ui';
import { AmountInput } from '../AmountInput';
import { useTranslation } from '../../context/LanguageContext';
import { formatDate, formatMoney, todayYmd } from '../../utils/format';

// 9-blok (egasi, 23.11.2026): provayder bilan sverka akti.
type ColumnKey = 'date' | 'amount' | 'imei' | 'contract';
const COLS: ColumnKey[] = ['date', 'amount', 'imei', 'contract'];
const errText = (e: any, f: string) => e?.response?.data?.error || f;

const toB64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export const ReconciliationTab: React.FC = () => {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [providerId, setProviderId] = useState('');
  const [start, setStart] = useState(() => todayYmd().slice(0, 8) + '01');
  const [end, setEnd] = useState(todayYmd());
  const [total, setTotal] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<{ name: string; type: string; b64: string } | null>(null);
  const [parsed, setParsed] = useState<{ headers: string[]; sample: unknown[][]; rowCount: number } | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ColumnKey, number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[] | null>(null);

  const loadHistory = () => axios.get('/api/control/recon').then((r) => setHistory(r.data)).catch(() => setHistory([]));
  useEffect(() => {
    axios.get('/api/references/providers').then((r) => {
      const list = Array.isArray(r.data) ? r.data : [];
      setProviders(list);
      if (list[0]) setProviderId((p) => p || list[0].id);
    });
    void loadHistory();
  }, []);

  const pickFile = async (f: File) => {
    setError('');
    setParsed(null);
    setMapping({});
    const b64 = await toB64(f);
    setFile({ name: f.name, type: f.type || 'application/octet-stream', b64 });
    if (/\.(xlsx|csv|txt)$/i.test(f.name)) {
      try {
        const r = await axios.post('/api/control/recon/parse', { fileName: f.name, dataBase64: b64 });
        setParsed(r.data);
        setMapping(r.data.guess || {});
      } catch (e) {
        setError(errText(e, t('common.error')));
      }
    }
  };

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await axios.post('/api/control/recon', {
        providerId,
        startDate: start,
        endDate: end,
        providerTotal: total === '' ? null : total,
        note: note.trim() || null,
        file: file ? { fileName: file.name, mimeType: file.type, dataBase64: file.b64 } : null,
        mapping: parsed && mapping.amount !== undefined ? mapping : null,
      });
      setResult({ ...r.data, periodStart: start, periodEnd: end });
      void loadHistory();
    } catch (e) {
      setError(errText(e, t('common.error')));
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    const r = await axios.get(`/api/control/recon/${id}`);
    setResult({ ...r.data, providerTotal: r.data.providerTotal, result: r.data.result });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('common.provider')} required>
            <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('control.rc_from')} required>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={t('control.rc_to')} required>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label={t('control.rc_total')} hint={t('control.rc_total_hint')}>
            <AmountInput value={total} onChange={(v) => setTotal(v ? Number(v) : "")} className={controlClass + " tabular-nums"} />
          </Field>
        </div>
        <Field label={t('control.rc_note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-control border border-line-strong px-3 py-2 text-sm">
            <Paperclip className="h-4 w-4" aria-hidden="true" />
            {file ? file.name : t('control.rc_file')}
            <input
              type="file"
              accept=".xlsx,.csv,image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
                e.target.value = '';
              }}
            />
          </label>
          <span className="text-xs text-fg-muted">{t('control.rc_file_hint')}</span>
        </div>

        {parsed && (
          <div className="space-y-2 rounded-control bg-surface-2/60 p-3">
            <p className="text-sm font-medium">{t('control.rc_mapping', { count: parsed.rowCount })}</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {COLS.map((c) => (
                <Field key={c} label={t(`control.rc_col_${c}`)} required={c === 'amount'}>
                  <Select
                    value={mapping[c] === undefined ? '' : String(mapping[c])}
                    onChange={(e) => setMapping((m) => ({ ...m, [c]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  >
                    <option value="">—</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <div className="overflow-x-auto text-xs">
              <table className="min-w-full">
                <thead>
                  <tr>{parsed.headers.map((h, i) => <th key={i} className="whitespace-nowrap px-2 py-1 text-left text-fg-muted">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {parsed.sample.map((r, i) => (
                    <tr key={i}>{parsed.headers.map((_, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{r[j] == null ? '' : String(r[j]).slice(0, 30)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button onClick={run} loading={busy} disabled={!providerId}>
          {t('control.rc_run')}
        </Button>
      </Card>

      {result && <ReconResult data={result} />}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-fg">{t('control.rc_history')}</h3>
        {!history ? (
          <LoadingBlock />
        ) : (
          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('common.provider')}</Th>
                  <Th>{t('control.col_period')}</Th>
                  <Th align="right">{t('control.rc_provider_sum')}</Th>
                  <Th align="right">{t('control.rc_our_sum')}</Th>
                  <Th align="right">{t('control.rc_diff')}</Th>
                  <Th>{t('control.rc_created')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {history.length === 0 && <TableEmpty colSpan={6} title={t('control.rc_none')} />}
                {history.map((a) => {
                  const diff = (a.providerTotal ?? 0) - a.ourTotal;
                  return (
                    <Tr key={a.id} clickable onClick={() => open(a.id)}>
                      <Td>{a.providerName}</Td>
                      <Td numeric>
                        {formatDate(a.periodStart)} — {formatDate(a.periodEnd)}
                      </Td>
                      <Td align="right" numeric>{a.providerTotal === null ? '—' : formatMoney(a.providerTotal)}</Td>
                      <Td align="right" numeric>{formatMoney(a.ourTotal)}</Td>
                      <Td align="right" numeric className={cn(Math.abs(diff) >= 1 && 'font-semibold text-danger')}>{formatMoney(diff)}</Td>
                      <Td numeric className="text-xs text-fg-muted">{formatDate(a.createdAt)}</Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableContainer>
        )}
      </section>
    </div>
  );
};

const ReconResult: React.FC<{ data: any }> = ({ data }) => {
  const { t } = useTranslation();
  const r = data.result || {};
  const diff = Number(r.diff) || 0;
  const list = (key: string, rows: any[] | undefined, provider: boolean) => (
    <section className="space-y-1">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        {t(`control.rc_list_${key}`)} <Badge tone={rows?.length ? (key === 'matched' ? 'success' : 'danger') : 'neutral'} size="sm">{rows?.length || 0}</Badge>
      </h4>
      {!!rows?.length && (
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                {provider && <Th>{t('control.rc_row')}</Th>}
                {key !== 'providerOnly' && <Th>№</Th>}
                <Th>{t('control.col_since')}</Th>
                {provider && <Th align="right">{t('control.rc_provider_sum')}</Th>}
                {key !== 'providerOnly' && <Th align="right">{t('control.rc_our_sum')}</Th>}
                {key === 'mismatched' && <Th align="right">{t('control.rc_diff')}</Th>}
                {provider && <Th>{t('control.rc_key')}</Th>}
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((x, i) => (
                <Tr key={i}>
                  {provider && <Td numeric>{x.row}</Td>}
                  {key !== 'providerOnly' && <Td numeric>#{x.dealNumber}</Td>}
                  <Td numeric>{formatDate(x.providerDate || x.date)}</Td>
                  {provider && <Td align="right" numeric>{formatMoney(x.providerAmount)}</Td>}
                  {key !== 'providerOnly' && <Td align="right" numeric>{formatMoney(x.ourAmount ?? x.amount)}</Td>}
                  {key === 'mismatched' && <Td align="right" numeric className="text-danger">{formatMoney(x.diff)}</Td>}
                  {provider && <Td className="text-xs text-fg-muted">{x.by ? t(`control.rc_by_${x.by}`) : x.contract || x.imei || '—'}</Td>}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      )}
    </section>
  );
  return (
    <Card className="space-y-4">
      <h3 className="font-semibold">
        {t('control.rc_result', { provider: data.providerName })} · {formatDate(data.periodStart)} — {formatDate(data.periodEnd)}
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title={t('control.rc_provider_sum')} value={data.providerTotal === null ? '—' : formatMoney(data.providerTotal)} />
        <StatCard title={t('control.rc_our_sum')} value={formatMoney(data.ourTotal)} hint={t('control.rc_our_count', { count: data.ourCount })} />
        <StatCard title={t('control.rc_diff')} value={formatMoney(diff)} tone={Math.abs(diff) >= 1 ? 'danger' : 'success'} />
      </div>
      {r.compared ? (
        <>
          {list('providerOnly', r.providerOnly, true)}
          {list('oursOnly', r.oursOnly, false)}
          {list('mismatched', r.mismatched, true)}
          {list('matched', r.matched, true)}
        </>
      ) : (
        <>
          <p className="text-xs text-fg-muted">{t('control.rc_no_compare')}</p>
          {list('ourDeals', r.ourDeals, false)}
        </>
      )}
    </Card>
  );
};
