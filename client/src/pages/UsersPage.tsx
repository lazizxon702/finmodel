import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, KeyRound, Pencil, Plus, RefreshCw, Search, Send, ShieldCheck, Trash2, UserCheck, UsersRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PasswordCell } from '../components/PasswordCell';
import { useTranslation } from '../context/LanguageContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Table,
  TableContainer,
  TableEmpty,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  cn,
  controlClass,
} from '../components/ui';
import { OneTimePasswordModal, PASSWORD_MIN_LENGTH, USERNAME_PATTERN, type PasswordReveal } from './TeamPage';

export interface UserItem {
  visiblePassword?: string | null;
  id: string;
  username: string;
  fullName: string;
  role: string;
  telegramId?: string | null;
  telegramLinked?: boolean;
  isActive: boolean;
  createdAt: string;
  agencyId?: string | null;
  agencyName?: string | null;
  parentAgentId?: string | null;
  parentAgentName?: string | null;
}

interface AgencyOption {
  id: string;
  name: string;
}

// Rol ro'yxati tartibi (nomlari: roles.<ROLE>, izohlari: usersPage.roleDesc_<ROLE>)
export const USER_ROLES = [
  'ADMIN',
  'CFO',
  'COO',
  'MANAGER',
  'CASHIER',
  'AGENT',
  'OPERATOR',
  'REGISTRATURA',
  'CALL_CENTER_HEAD',
  'CALL_CENTER_AGENT',
  'STOREKEEPER',
  'SELLER',
  'HR_MANAGER',
  'VIEWER',
] as const;

interface FormState {
  fullName: string;
  username: string;
  password: string;
  role: string;
  agencyId: string;
  parentAgentId: string;
  telegramId: string;
  isActive: boolean;
}

type FormErrors = Partial<Record<'fullName' | 'username' | 'password' | 'agencyId' | 'telegramId' | 'form', string>>;

const EMPTY_FORM: FormState = {
  fullName: '',
  username: '',
  password: '',
  role: 'OPERATOR',
  agencyId: '',
  parentAgentId: '',
  telegramId: '',
  isActive: true,
};

const iconAction =
  'inline-flex h-11 w-11 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Yaratish / tahrirlash formasi
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  // Parolni tiklash
  const [resetTarget, setResetTarget] = useState<UserItem | null>(null);
  const [resetValue, setResetValue] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  // Yaratilgan / tiklangan parol — faqat bir marta ko'rsatiladi
  const [reveal, setReveal] = useState<PasswordReveal | null>(null);

  const roleLabel = (role: string) => t(`roles.${role}`, role);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
  };

  useEffect(() => {
    if (!alert) return;
    const id = setTimeout(() => setAlert(null), alert.type === 'error' ? 7000 : 4000);
    return () => clearTimeout(id);
  }, [alert]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/auth/users');
      setUsers(Array.isArray(res.data) ? res.data : []);
      setLoadError('');
    } catch (err: any) {
      setLoadError(err?.response?.data?.error || t('usersPage.err_load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
    // Agentliklar — AGENT roli uchun tanlov ro'yxati
    axios
      .get('/api/references/agencies')
      .then((res) => setAgencies((Array.isArray(res.data) ? res.data : []).map((a: any) => ({ id: a.id, name: a.name }))))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agentUsers = useMemo(() => users.filter((u) => u.role === 'AGENT'), [users]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) counts[u.role] = (counts[u.role] || 0) + 1;
    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        t(`roles.${u.role}`, u.role).toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, t]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (item: UserItem, roleOverride?: string) => {
    setEditing(item);
    setForm({
      fullName: item.fullName,
      username: item.username,
      password: '',
      role: roleOverride || item.role,
      agencyId: item.agencyId || '',
      parentAgentId: item.parentAgentId || '',
      telegramId: item.telegramId || '',
      isActive: item.isActive,
    });
    setErrors({});
    setFormOpen(true);
  };

  /** Server xatosini mos maydonga biriktiradi (409 band login, 400 qisqa parol ...) */
  const mapServerError = (err: any): FormErrors => {
    const status = err?.response?.status;
    const message: string = err?.response?.data?.error || t('usersPage.err_save');
    if (status === 409 && /login/i.test(message)) return { username: message };
    if (status === 409 && /telegram/i.test(message)) return { telegramId: message };
    if (status === 400 && /parol/i.test(message)) return { password: message };
    if (status === 400 && /^login/i.test(message)) return { username: message };
    if (status === 400 && /telegram/i.test(message)) return { telegramId: message };
    if (status === 400 && /agentlik|agencyId/i.test(message)) return { agencyId: message };
    return { form: message };
  };

  const submitForm = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const fullName = form.fullName.trim();
    const username = form.username.trim();
    const password = form.password.trim();
    const telegramId = form.telegramId.trim();

    const next: FormErrors = {};
    if (!fullName) next.fullName = t('usersPage.err_fullName');
    if (!editing) {
      if (!USERNAME_PATTERN.test(username)) next.username = t('usersPage.err_username');
      if (password && password.length < PASSWORD_MIN_LENGTH) next.password = t('usersPage.err_password');
    }
    if (form.role === 'AGENT' && !form.agencyId) next.agencyId = t('usersPage.err_agency');
    if (telegramId && !/^-?\d{1,19}$/.test(telegramId)) next.telegramId = t('usersPage.err_telegram');
    setErrors(next);
    if (Object.keys(next).length) return;

    // Rolga bog'liq maydonlar: AGENT → agencyId, OPERATOR → parentAgentId (boshqa rollarda yuborilmaydi)
    const links: Record<string, string | null> = {};
    if (form.role === 'AGENT') links.agencyId = form.agencyId;
    if (form.role === 'OPERATOR') links.parentAgentId = form.parentAgentId || null;

    setSaving(true);
    try {
      if (editing) {
        const isSelf = editing.id === currentUser?.id;
        const payload: Record<string, unknown> = { fullName, ...links };
        // O'z rolini va holatini o'zgartirib bo'lmaydi (server ham rad etadi)
        if (!isSelf) {
          payload.role = form.role;
          payload.isActive = form.isActive;
        }
        if (telegramId !== (editing.telegramId || '')) payload.telegramId = telegramId;
        const res = await axios.put(`/api/auth/users/${editing.id}`, payload);
        setUsers((prev) => prev.map((u) => (u.id === editing.id ? { ...u, ...res.data } : u)));
        setFormOpen(false);
        showAlert('success', t('usersPage.ok_updated'));
      } else {
        const res = await axios.post('/api/auth/users', {
          username,
          fullName,
          role: form.role,
          ...(password ? { password } : {}),
          ...(telegramId ? { telegramId } : {}),
          ...links,
        });
        const { generatedPassword, ...created } = res.data || {};
        setUsers((prev) => [...prev, created as UserItem]);
        setFormOpen(false);
        showAlert('success', t('usersPage.ok_created'));
        setReveal({ fullName, username, password: generatedPassword || password });
      }
    } catch (err: any) {
      setErrors(mapServerError(err));
    } finally {
      setSaving(false);
    }
  };

  // Jadvaldan tezkor rol almashtirish. AGENT uchun agentlik kerak — forma ochiladi.
  const handleQuickRoleChange = async (item: UserItem, newRole: string) => {
    if (newRole === item.role) return;
    if (newRole === 'AGENT') {
      openEdit(item, 'AGENT');
      return;
    }
    setBusyId(item.id);
    try {
      const res = await axios.put(`/api/auth/users/${item.id}`, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === item.id ? { ...u, ...res.data } : u)));
      showAlert('success', t('usersPage.ok_role'));
    } catch (err: any) {
      showAlert('error', err?.response?.data?.error || t('usersPage.err_role'));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (item: UserItem) => {
    if (item.isActive && !window.confirm(t('usersPage.block_confirm', { name: item.fullName }))) return;
    setBusyId(item.id);
    try {
      const res = await axios.put(`/api/auth/users/${item.id}`, { isActive: !item.isActive });
      setUsers((prev) => prev.map((u) => (u.id === item.id ? { ...u, ...res.data } : u)));
      showAlert('success', t('usersPage.ok_status'));
    } catch (err: any) {
      showAlert('error', err?.response?.data?.error || t('usersPage.err_status'));
    } finally {
      setBusyId(null);
    }
  };

  const openReset = (item: UserItem) => {
    setResetTarget(item);
    setResetValue('');
    setResetError('');
  };

  const submitReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!resetTarget) return;
    const password = resetValue.trim();
    if (password && password.length < PASSWORD_MIN_LENGTH) {
      setResetError(t('usersPage.err_password'));
      return;
    }
    setResetting(true);
    setResetError('');
    try {
      const res = await axios.put(`/api/auth/users/${resetTarget.id}`, password ? { password } : { resetPassword: true });
      const target = resetTarget;
      setResetTarget(null);
      setReveal({ fullName: target.fullName, username: target.username, password: res.data?.generatedPassword || password });
    } catch (err: any) {
      setResetError(err?.response?.data?.error || t('usersPage.err_save'));
    } finally {
      setResetting(false);
    }
  };

  const handleDeleteUser = async (item: UserItem) => {
    if (item.id === currentUser?.id) {
      showAlert('error', t('usersPage.delete_self'));
      return;
    }
    if (!window.confirm(t('usersPage.delete_confirm', { name: item.fullName, username: item.username }))) return;
    setBusyId(item.id);
    try {
      await axios.delete(`/api/auth/users/${item.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== item.id));
      showAlert('success', t('usersPage.ok_deleted'));
    } catch (err: any) {
      showAlert('error', err?.response?.data?.error || t('usersPage.err_delete'));
    } finally {
      setBusyId(null);
    }
  };

  const editingSelf = !!editing && editing.id === currentUser?.id;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={<ShieldCheck />}
        title={t('usersPage.title')}
        description={t('usersPage.subtitle')}
        actions={
          <>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => void fetchUsers()}
              disabled={loading}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openAdd}>
              {t('usersPage.add')}
            </Button>
          </>
        }
      />

      {alert && (
        <div
          role={alert.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-2 rounded-control px-3 py-2.5 text-sm',
            alert.type === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
          )}
        >
          {alert.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{alert.message}</span>
        </div>
      )}

      {users.length > 0 && (
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-3 sm:gap-4">
          <StatCard title={t('usersPage.stat_total')} value={users.length} icon={<UsersRound />} tone="brand" />
          <StatCard title={t('usersPage.stat_agents')} value={agentUsers.length} icon={<UserCheck />} tone="violet" />
          <StatCard title={t('usersPage.stat_staff')} value={users.length - agentUsers.length} icon={<ShieldCheck />} tone="info" />
        </div>
      )}

      <Card padding="none">
        {/* Qidiruv va rol filtri */}
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <div className="min-w-0 flex-1">
            <Input
              leftIcon={<Search />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('usersPage.search')}
              aria-label={t('usersPage.search')}
            />
          </div>
          <div className="sm:w-64">
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label={t('usersPage.col_role')}>
              <option value="ALL">
                {t('usersPage.all_roles')} ({users.length})
              </option>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)} ({roleCounts[role] || 0})
                </option>
              ))}
            </Select>
          </div>
          <p className="shrink-0 text-xs tabular-nums text-fg-muted">{t('usersPage.count', { count: filteredUsers.length })}</p>
        </div>

        {loading && users.length === 0 ? (
          <LoadingBlock label={t('common.loading')} />
        ) : loadError ? (
          <EmptyState
            icon={<AlertTriangle />}
            title={t('usersPage.err_load')}
            description={loadError}
            action={
              <Button variant="secondary" onClick={() => void fetchUsers()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : (
          <TableContainer bare>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('usersPage.col_user')}</Th>
                  <Th>{t('usersPage.col_username')}</Th>
                  <Th>{t('usersPage.col_password')}</Th>
                  <Th>{t('usersPage.col_role')}</Th>
                  <Th>{t('usersPage.col_link')}</Th>
                  <Th>{t('usersPage.col_telegram')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th align="right">{t('common.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredUsers.length === 0 && (
                  <TableEmpty colSpan={8} title={t('usersPage.empty')} description={t('usersPage.empty_hint')} />
                )}
                {filteredUsers.map((item) => {
                  const isCurrentUser = item.id === currentUser?.id;
                  const busy = busyId === item.id;
                  const linkText =
                    item.role === 'AGENT' && item.agencyName
                      ? t('usersPage.link_agency', { name: item.agencyName })
                      : item.role === 'OPERATOR' && item.parentAgentName
                        ? t('usersPage.link_agent', { name: item.parentAgentName })
                        : '';
                  return (
                    <Tr key={item.id}>
                      <Td className="min-w-[11rem]">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{item.fullName}</span>
                          {isCurrentUser && (
                            <Badge tone="brand" size="sm">
                              {t('usersPage.you')}
                            </Badge>
                          )}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-xs text-fg-secondary">{item.username}</Td>
                      <Td className="whitespace-nowrap">
                        <PasswordCell value={item.visiblePassword} />
                      </Td>
                      <Td>
                        <select
                          value={item.role}
                          onChange={(e) => void handleQuickRoleChange(item, e.target.value)}
                          disabled={isCurrentUser || busy}
                          aria-label={t('usersPage.col_role')}
                          className={cn(controlClass, 'w-auto min-w-[10rem] py-1.5 text-xs')}
                        >
                          {!USER_ROLES.includes(item.role as (typeof USER_ROLES)[number]) && (
                            <option value={item.role}>{roleLabel(item.role)}</option>
                          )}
                          {USER_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </select>
                      </Td>
                      <Td className="whitespace-nowrap text-fg-secondary">{linkText || <span className="text-fg-muted">—</span>}</Td>
                      <Td>
                        <Badge tone={item.telegramLinked ? 'info' : 'neutral'} icon={<Send className="h-3 w-3" aria-hidden="true" />}>
                          {t(item.telegramLinked ? 'usersPage.telegram_linked' : 'usersPage.telegram_not_linked')}
                        </Badge>
                      </Td>
                      <Td>
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(item)}
                          disabled={isCurrentUser || busy}
                          title={isCurrentUser ? undefined : t(item.isActive ? 'usersPage.block' : 'usersPage.unblock')}
                          className="rounded-full disabled:cursor-not-allowed"
                        >
                          <Badge tone={item.isActive ? 'success' : 'danger'} dot>
                            {t(item.isActive ? 'usersPage.active' : 'usersPage.blocked')}
                          </Badge>
                        </button>
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            className={iconAction}
                            onClick={() => openReset(item)}
                            aria-label={t('usersPage.reset_password')}
                            title={t('usersPage.reset_password')}
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={iconAction}
                            onClick={() => openEdit(item)}
                            aria-label={t('common.edit')}
                            title={t('common.edit')}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {!isCurrentUser && (
                            <button
                              type="button"
                              className={cn(iconAction, 'hover:bg-danger-soft hover:text-danger')}
                              onClick={() => void handleDeleteUser(item)}
                              disabled={busy}
                              aria-label={t('common.delete')}
                              title={t('common.delete')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Yaratish / tahrirlash */}
      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={t(editing ? 'usersPage.edit_title' : 'usersPage.add_title')}
        description={editing ? editing.username : t('usersPage.add_desc')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitForm()} loading={saving}>
              {t(editing ? 'common.save' : 'usersPage.create')}
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

          <Field label={t('usersPage.field_fullName')} required error={errors.fullName} htmlFor="user-fullName">
            <Input
              id="user-fullName"
              autoFocus
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder={t('usersPage.field_fullName_ph')}
              maxLength={120}
              invalid={!!errors.fullName}
            />
          </Field>

          {!editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('usersPage.field_username')}
                required
                error={errors.username}
                hint={t('usersPage.field_username_hint')}
                htmlFor="user-username"
              >
                <Input
                  id="user-username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder={t('usersPage.field_username_ph')}
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
                label={`${t('usersPage.field_password')} (${t('common.optional')})`}
                error={errors.password}
                hint={t('usersPage.field_password_hint')}
                htmlFor="user-password"
              >
                <Input
                  id="user-password"
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
            </div>
          )}

          <Field
            label={t('usersPage.field_role')}
            hint={t(`usersPage.roleDesc_${form.role}`, '')}
            htmlFor="user-role"
          >
            <Select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={editingSelf}>
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </Select>
          </Field>

          {/* AGENT → agentlik (majburiy) */}
          {form.role === 'AGENT' && (
            <Field
              label={t('usersPage.field_agency')}
              required
              error={errors.agencyId}
              hint={agencies.length ? t('usersPage.field_agency_hint') : t('usersPage.field_agency_empty')}
              htmlFor="user-agency"
            >
              <Select
                id="user-agency"
                value={form.agencyId}
                onChange={(e) => setForm({ ...form, agencyId: e.target.value })}
                invalid={!!errors.agencyId}
              >
                <option value="">{t('usersPage.field_agency_select')}</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {/* OPERATOR → agent jamoasi (ixtiyoriy) */}
          {form.role === 'OPERATOR' && (
            <Field
              label={`${t('usersPage.field_parent')} (${t('common.optional')})`}
              hint={t('usersPage.field_parent_hint')}
              htmlFor="user-parent"
            >
              <Select id="user-parent" value={form.parentAgentId} onChange={(e) => setForm({ ...form, parentAgentId: e.target.value })}>
                <option value="">{t('usersPage.field_parent_none')}</option>
                {agentUsers
                  .filter((a) => a.id !== editing?.id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName} ({a.username}){a.agencyName ? ` — ${a.agencyName}` : ''}
                    </option>
                  ))}
              </Select>
            </Field>
          )}

          <Field
            label={`${t('usersPage.field_telegram')} (${t('common.optional')})`}
            error={errors.telegramId}
            hint={t('usersPage.field_telegram_hint')}
            htmlFor="user-telegram"
          >
            <Input
              id="user-telegram"
              value={form.telegramId}
              onChange={(e) => setForm({ ...form, telegramId: e.target.value })}
              inputMode="numeric"
              className="font-mono"
              invalid={!!errors.telegramId}
            />
          </Field>

          {editing && !editingSelf && (
            <label className="flex min-h-touch cursor-pointer items-center gap-3 text-sm text-fg">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-line-strong accent-[rgb(var(--brand))]"
              />
              {t('usersPage.field_active')}
            </label>
          )}

          <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
        </form>
      </Modal>

      {/* Parolni tiklash */}
      <Modal
        open={!!resetTarget}
        onClose={() => !resetting && setResetTarget(null)}
        size="sm"
        title={t('usersPage.reset_title')}
        description={resetTarget ? t('usersPage.reset_desc', { name: resetTarget.fullName, username: resetTarget.username }) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)} disabled={resetting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitReset()} loading={resetting}>
              {t('usersPage.reset_submit')}
            </Button>
          </>
        }
      >
        <form onSubmit={submitReset} noValidate>
          <Field
            label={`${t('usersPage.reset_new_password')} (${t('common.optional')})`}
            error={resetError}
            hint={t('usersPage.field_password_hint')}
            htmlFor="user-reset-password"
          >
            <Input
              id="user-reset-password"
              autoFocus
              value={resetValue}
              onChange={(e) => setResetValue(e.target.value)}
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

export default UsersPage;
