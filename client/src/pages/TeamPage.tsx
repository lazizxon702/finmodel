import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Ban, Check, Copy, KeyRound, Pencil, Plus, RefreshCw, UserCheck, UsersRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PasswordCell } from '../components/PasswordCell';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { formatDate, formatNumber } from '../utils/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  StatCard,
} from '../components/ui';

// Server qoidalari bilan bir xil (server/src/routes/auth.routes.ts)
export const PASSWORD_MIN_LENGTH = 8;
export const USERNAME_PATTERN = /^[^\s]{3,32}$/;

// ---------------------------------------------------------------------------
// Bir martalik parol oynasi — yaratilgan/tiklangan parol faqat shu yerda, bir marta ko'rsatiladi.
// Foydalanuvchilar sahifasi (UsersPage) ham shu komponentni ishlatadi.
// ---------------------------------------------------------------------------
export interface PasswordReveal {
  fullName: string;
  username: string;
  password: string;
}

export const OneTimePasswordModal: React.FC<{ reveal: PasswordReveal | null; onClose: () => void }> = ({ reveal, onClose }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<'password' | 'both' | 'failed' | null>(null);

  useEffect(() => {
    setCopied(null);
  }, [reveal]);

  const copy = async (kind: 'password' | 'both') => {
    if (!reveal) return;
    const text =
      kind === 'password'
        ? reveal.password
        : `${t('team.pw_username')}: ${reveal.username}\n${t('team.pw_password')}: ${reveal.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied('failed');
    }
  };

  return (
    <Modal
      open={!!reveal}
      onClose={onClose}
      size="sm"
      closeOnBackdrop={false}
      closeOnEsc={false}
      title={t('team.pw_title')}
      description={reveal ? t('team.pw_desc', { name: reveal.fullName }) : undefined}
      footer={<Button onClick={onClose}>{t('team.pw_done')}</Button>}
    >
      {reveal && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('team.pw_warning')}</span>
          </div>

          <dl className="divide-y divide-line rounded-card border border-line bg-surface-2">
            <div className="px-3 py-2.5">
              <dt className="text-xs text-fg-muted">{t('team.pw_username')}</dt>
              <dd className="mt-0.5 select-all break-all font-mono text-sm font-medium text-fg">{reveal.username}</dd>
            </div>
            <div className="px-3 py-2.5">
              <dt className="text-xs text-fg-muted">{t('team.pw_password')}</dt>
              <dd className="mt-0.5 select-all break-all font-mono text-lg font-semibold tracking-wide text-fg">{reveal.password}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <Button
              fullWidth
              leftIcon={copied === 'password' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              onClick={() => copy('password')}
            >
              {copied === 'password' ? t('team.pw_copied') : t('team.pw_copy')}
            </Button>
            <Button
              fullWidth
              variant="secondary"
              leftIcon={copied === 'both' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              onClick={() => copy('both')}
            >
              {copied === 'both' ? t('team.pw_copied') : t('team.pw_copy_both')}
            </Button>
            {copied === 'failed' && (
              <p role="alert" className="text-xs text-danger">
                {t('team.pw_copy_failed')}
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Jamoa sahifasi
// ---------------------------------------------------------------------------
interface Operator {
  visiblePassword?: string | null;
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  dealsCount: number;
}

interface AgentOption {
  id: string;
  fullName: string;
  username: string;
  agencyName?: string | null;
}

type FormErrors = { fullName?: string; username?: string; password?: string; form?: string };

const iconAction =
  'inline-flex h-11 w-11 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9';

export const TeamPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === 'ADMIN';

  // ADMIN: qaysi agent jamoasi
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(isAdmin);
  const [agentsError, setAgentsError] = useState('');
  const [agentId, setAgentId] = useState('');

  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Qo'shish / tahrirlash formasi
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Operator | null>(null);
  const [form, setForm] = useState({ fullName: '', username: '', password: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  // Parolni tiklash
  const [resetTarget, setResetTarget] = useState<Operator | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  const [reveal, setReveal] = useState<PasswordReveal | null>(null);

  const canLoad = !isAdmin || !!agentId;
  const requestConfig = isAdmin ? { params: { agentId } } : undefined;

  // ADMIN uchun agentlar ro'yxati
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setAgentsLoading(true);
    setAgentsError('');
    axios
      .get('/api/auth/users')
      .then((res) => {
        if (cancelled) return;
        const list: AgentOption[] = (Array.isArray(res.data) ? res.data : []).filter((u: any) => u.role === 'AGENT');
        setAgents(list);
        setAgentId((prev) => prev || list[0]?.id || '');
      })
      .catch((e) => {
        if (!cancelled) setAgentsError(e?.response?.data?.error || t('team.err_agents'));
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const loadOperators = useCallback(
    async (silent = false) => {
      if (!canLoad) return;
      if (!silent) setLoading(true);
      try {
        const res = await axios.get('/api/team/operators', isAdmin ? { params: { agentId } } : undefined);
        setOperators(Array.isArray(res.data) ? res.data : []);
        setLoadError('');
      } catch (e: any) {
        // Fon yangilanishidagi xato mavjud ro'yxatni buzmaydi
        if (!silent) {
          setOperators([]);
          setLoadError(e?.response?.data?.error || t('team.err_load'));
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [canLoad, isAdmin, agentId, t]
  );

  useEffect(() => {
    setOperators([]);
    setActionError('');
    void loadOperators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, isAdmin]);

  // Bitimlar soni o'zgarsa ro'yxat jimgina yangilanadi
  useRealtime('deals:updated', () => void loadOperators(true), canLoad);

  const openAdd = () => {
    setEditing(null);
    setForm({ fullName: '', username: '', password: '' });
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (op: Operator) => {
    setEditing(op);
    setForm({ fullName: op.fullName, username: op.username, password: '' });
    setErrors({});
    setFormOpen(true);
  };

  const submitForm = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const fullName = form.fullName.trim();
    const username = form.username.trim();
    const password = form.password.trim();

    const next: FormErrors = {};
    if (!fullName) next.fullName = t('team.err_fullName');
    if (!editing) {
      if (!USERNAME_PATTERN.test(username)) next.username = t('team.err_username');
      if (password && password.length < PASSWORD_MIN_LENGTH) next.password = t('team.err_password');
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/api/team/operators/${editing.id}`, { fullName }, requestConfig);
        setFormOpen(false);
      } else {
        const res = await axios.post(
          '/api/team/operators',
          { username, fullName, ...(password ? { password } : {}) },
          requestConfig
        );
        setFormOpen(false);
        // Parol faqat shu yerda, bir marta ko'rsatiladi (server yaratgan yoki qo'lda kiritilgan)
        setReveal({ fullName, username, password: res.data?.generatedPassword || password });
      }
      await loadOperators(true);
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error || t('team.err_save');
      if (status === 409) setErrors({ username: err?.response?.data?.error || t('team.err_username_taken') });
      else if (status === 400 && /parol/i.test(message)) setErrors({ password: message });
      else if (status === 400 && /login/i.test(message)) setErrors({ username: message });
      else setErrors({ form: message });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (op: Operator) => {
    if (op.isActive && !window.confirm(t('team.block_confirm', { name: op.fullName }))) return;
    setBusyId(op.id);
    setActionError('');
    try {
      const res = await axios.put(`/api/team/operators/${op.id}`, { isActive: !op.isActive }, requestConfig);
      setOperators((prev) => prev.map((o) => (o.id === op.id ? { ...o, ...res.data } : o)));
    } catch (err: any) {
      setActionError(err?.response?.data?.error || t('team.err_status'));
    } finally {
      setBusyId(null);
    }
  };

  const openReset = (op: Operator) => {
    setResetTarget(op);
    setResetPassword('');
    setResetError('');
  };

  const submitReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!resetTarget) return;
    const password = resetPassword.trim();
    if (password && password.length < PASSWORD_MIN_LENGTH) {
      setResetError(t('team.err_password'));
      return;
    }
    setResetting(true);
    setResetError('');
    try {
      const res = await axios.put(
        `/api/team/operators/${resetTarget.id}`,
        { resetPassword: password || true },
        requestConfig
      );
      const target = resetTarget;
      setResetTarget(null);
      setReveal({ fullName: target.fullName, username: target.username, password: res.data?.generatedPassword || password });
    } catch (err: any) {
      setResetError(err?.response?.data?.error || t('team.err_save'));
    } finally {
      setResetting(false);
    }
  };

  const activeCount = operators.filter((o) => o.isActive).length;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={<UsersRound />}
        title={t('team.title')}
        description={t(isAdmin ? 'team.subtitle_admin' : 'team.subtitle')}
        actions={
          <>
            <Button
              variant="secondary"
              size="icon"
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
              onClick={() => void loadOperators()}
              disabled={!canLoad || loading}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openAdd} disabled={!canLoad}>
              {t('team.add')}
            </Button>
          </>
        }
      />

      {/* ADMIN: agent tanlash */}
      {isAdmin && (
        <Card>
          {agentsLoading ? (
            <LoadingBlock className="py-4" label={t('common.loading')} />
          ) : agentsError ? (
            <p role="alert" className="text-sm text-danger">
              {agentsError}
            </p>
          ) : agents.length === 0 ? (
            <EmptyState className="py-6" icon={<UsersRound />} title={t('team.no_agents')} description={t('team.no_agents_hint')} />
          ) : (
            <Field label={t('team.agent')} className="max-w-md">
              <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">{t('team.agent_select')}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName} ({a.username}){a.agencyName ? ` — ${a.agencyName}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </Card>
      )}

      {actionError && (
        <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {canLoad && !loading && !loadError && operators.length > 0 && (
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-3 sm:gap-4">
          <StatCard title={t('team.stat_total')} value={formatNumber(operators.length)} icon={<UsersRound />} tone="violet" />
          <StatCard title={t('team.stat_active')} value={formatNumber(activeCount)} icon={<UserCheck />} tone="success" />
          <StatCard
            title={t('team.stat_inactive')}
            value={formatNumber(operators.length - activeCount)}
            icon={<Ban />}
            tone={operators.length - activeCount > 0 ? 'warning' : 'neutral'}
          />
        </div>
      )}

      <Card padding="none">
        <CardHeader
          bordered
          title={t('team.list')}
          description={canLoad && !loadError ? t('team.summary', { count: operators.length, active: activeCount }) : undefined}
        />

        {!canLoad ? (
          <EmptyState icon={<UsersRound />} title={t('team.pick_agent')} description={t('team.pick_agent_hint')} />
        ) : loading ? (
          <LoadingBlock label={t('common.loading')} />
        ) : loadError ? (
          <EmptyState
            icon={<AlertTriangle />}
            title={t('team.err_load')}
            description={loadError}
            action={
              <Button variant="secondary" onClick={() => void loadOperators()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : operators.length === 0 ? (
          <EmptyState
            icon={<UsersRound />}
            title={t('team.empty')}
            description={t('team.empty_hint')}
            action={
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                {t('team.add')}
              </Button>
            }
          />
        ) : (
          <TableContainer bare>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('team.col_name')}</Th>
                  <Th>{t('team.col_username')}</Th>
                  <Th>{t('usersPage.col_password')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th align="right">{t('team.col_deals')}</Th>
                  <Th>{t('team.col_created')}</Th>
                  <Th align="right">{t('common.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {operators.map((op) => (
                  <Tr key={op.id}>
                    <Td className="min-w-[10rem] font-medium">{op.fullName}</Td>
                    <Td className="whitespace-nowrap font-mono text-xs text-fg-secondary">{op.username}</Td>
                    <Td className="whitespace-nowrap">
                      <PasswordCell value={op.visiblePassword} />
                    </Td>
                    <Td>
                      <Badge tone={op.isActive ? 'success' : 'danger'} dot>
                        {t(op.isActive ? 'common.active' : 'team.blocked')}
                      </Badge>
                    </Td>
                    <Td align="right" numeric>
                      {formatNumber(op.dealsCount)}
                    </Td>
                    <Td numeric className="text-fg-secondary">
                      {formatDate(op.createdAt)}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          className={iconAction}
                          onClick={() => openEdit(op)}
                          aria-label={t('common.edit')}
                          title={t('common.edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={iconAction}
                          onClick={() => openReset(op)}
                          aria-label={t('team.reset_password')}
                          title={t('team.reset_password')}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={iconAction}
                          onClick={() => toggleActive(op)}
                          disabled={busyId === op.id}
                          aria-label={t(op.isActive ? 'team.block' : 'team.unblock')}
                          title={t(op.isActive ? 'team.block' : 'team.unblock')}
                        >
                          {op.isActive ? <Ban className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Qo'shish / tahrirlash */}
      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={t(editing ? 'team.edit_title' : 'team.add_title')}
        description={editing ? editing.username : t('team.add_desc')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitForm()} loading={saving}>
              {t(editing ? 'common.save' : 'team.create')}
            </Button>
          </>
        }
      >
        <form onSubmit={submitForm} className="space-y-4" noValidate>
          {errors.form && (
            <div role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
              {errors.form}
            </div>
          )}
          <Field label={t('team.field_fullName')} required error={errors.fullName} htmlFor="team-fullName">
            <Input
              id="team-fullName"
              autoFocus
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder={t('team.field_fullName_ph')}
              maxLength={120}
              invalid={!!errors.fullName}
            />
          </Field>
          {!editing && (
            <>
              <Field
                label={t('team.field_username')}
                required
                error={errors.username}
                hint={t('team.field_username_hint')}
                htmlFor="team-username"
              >
                <Input
                  id="team-username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder={t('team.field_username_ph')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={32}
                  className="font-mono"
                  invalid={!!errors.username}
                />
              </Field>
              <Field
                label={`${t('team.field_password')} (${t('common.optional')})`}
                error={errors.password}
                hint={t('team.field_password_hint')}
                htmlFor="team-password"
              >
                <Input
                  id="team-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="new-password"
                  spellCheck={false}
                  maxLength={72}
                  className="font-mono"
                  invalid={!!errors.password}
                />
              </Field>
            </>
          )}
          {/* Enter bilan yuborish uchun yashirin tugma (asosiy tugma modal pastida) */}
          <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
        </form>
      </Modal>

      {/* Parolni tiklash */}
      <Modal
        open={!!resetTarget}
        onClose={() => !resetting && setResetTarget(null)}
        size="sm"
        title={t('team.reset_title')}
        description={resetTarget ? t('team.reset_desc', { name: resetTarget.fullName, username: resetTarget.username }) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)} disabled={resetting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitReset()} loading={resetting}>
              {t('team.reset_submit')}
            </Button>
          </>
        }
      >
        <form onSubmit={submitReset} noValidate>
          <Field
            label={`${t('team.reset_new_password')} (${t('common.optional')})`}
            error={resetError}
            hint={t('team.field_password_hint')}
            htmlFor="team-reset-password"
          >
            <Input
              id="team-reset-password"
              autoFocus
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="new-password"
              spellCheck={false}
              maxLength={72}
              className="font-mono"
              invalid={!!resetError}
            />
          </Field>
          <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
        </form>
      </Modal>

      <OneTimePasswordModal reveal={reveal} onClose={() => setReveal(null)} />
    </div>
  );
};
export default TeamPage;
