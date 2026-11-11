import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users,
  Shield,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit2,
  Lock,
  UserCheck,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  PhoneCall,
  Warehouse,
  BadgeDollarSign
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export interface UserItem {
  id: string;
  username: string;
  fullName: string;
  role: string;
  initialPassword?: string | null;
  telegramId?: string | null;
  isActive: boolean;
  createdAt: string;
}

export const ROLE_LABELS: Record<string, { uz: string; ru: string; color: string; descUz: string }> = {
  ADMIN: {
    uz: 'Super Admin',
    ru: 'Супер Админ',
    color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    descUz: 'Barcha modullarga to\'liq boshqaruv huquqi',
  },
  CFO: {
    uz: 'Moliya Rahbari (CFO)',
    ru: 'Финансовый Директор (CFO)',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    descUz: 'DDS, Balans, Kunlik hisob, Finmodel, Qarzdorlar',
  },
  COO: {
    uz: 'Operatsion Rahbar (COO)',
    ru: 'Операционный Директор (COO)',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    descUz: 'Bitimlar, Ombor, Sotuvlar, Lidlar, SWOT',
  },
  CALL_CENTER_HEAD: {
    uz: 'Koll-markaz Rahbari',
    ru: 'Руководитель Колл-центра',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    descUz: 'Lidlar, Operatorlar nazorati, HR, Agentlar',
  },
  CALL_CENTER_AGENT: {
    uz: 'Koll-markaz Xodimi',
    ru: 'Сотрудник Колл-центра',
    color: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30',
    descUz: 'Lidlarni qabul qilish va bitim yaratish',
  },
  OPERATOR: {
    uz: 'Operator',
    ru: 'Оператор',
    color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    descUz: 'Cheklar, bitimlar va sklad buyurtmalari',
  },
  STOREKEEPER: {
    uz: 'Omborchi (Sklad)',
    ru: 'Складской работник',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    descUz: 'Tovarlarni qabul qilish, ombor nazorati',
  },
  SELLER: {
    uz: 'Sotuvchi (Do\'kon)',
    ru: 'Продавец',
    color: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
    descUz: 'Sotuvlar rasmiylashtirish va nasiya monitoringi',
  },
  HR_MANAGER: {
    uz: 'HR / Tabelchi',
    ru: 'HR Менеджер',
    color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    descUz: 'Xodimlar, tabel, maoshlar va jarimalar',
  },
  VIEWER: {
    uz: 'Kuzatuvchi (Viewer)',
    ru: 'Наблюдатель',
    color: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    descUz: 'Faqat hisobotlarni ko\'rish huquqi',
  },
  MANAGER: {
    uz: 'Menejer',
    ru: 'Менеджер',
    color: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    descUz: 'Savdo va filiallar monitoringi',
  },
  CASHIER: {
    uz: 'Kassir',
    ru: 'Кассир',
    color: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    descUz: 'Kassa harakatlari va cheklar nazorati',
  },
};

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { language } = useLanguage();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Visible passwords toggled per user ID
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Success / Error alerts
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  // Form states
  const [newForm, setNewForm] = useState({
    username: '',
    fullName: '',
    password: '',
    role: 'OPERATOR',
    telegramId: '',
  });

  const [editForm, setEditForm] = useState({
    fullName: '',
    role: 'OPERATOR',
    password: '',
    isActive: true,
  });

  const [resetPasswordValue, setResetPasswordValue] = useState('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/auth/users');
      setUsers(res.data);
    } catch (err: any) {
      showAlert('error', err.response?.data?.error || 'Foydalanuvchilarni yuklashda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 4000);
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showAlert('success', language === 'uz' ? 'Parol nusxalandi!' : 'Пароль скопирован!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Quick Role Change directly in table
  const handleQuickRoleChange = async (userId: string, newRole: string) => {
    try {
      await axios.put(`/api/auth/users/${userId}`, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
      showAlert('success', language === 'uz' ? 'Foydalanuvchi roli yangilandi!' : 'Роль пользователя обновлена!');
    } catch (err: any) {
      showAlert('error', err.response?.data?.error || 'Rolni o\'zgartirishda xatolik');
    }
  };

  // Quick Active Status Toggle
  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    try {
      await axios.put(`/api/auth/users/${userId}`, { isActive: !currentStatus });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isActive: !currentStatus } : u)));
      showAlert('success', language === 'uz' ? 'Holat yangilandi' : 'Статус обновлен');
    } catch (err: any) {
      showAlert('error', err.response?.data?.error || 'Holatni o\'zgartirishda xatolik');
    }
  };

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.username || !newForm.fullName || !newForm.password) {
      showAlert('error', 'Barcha maydonlarni to\'ldiring!');
      return;
    }
    try {
      const res = await axios.post('/api/auth/users', newForm);
      setUsers((prev) => [...prev, res.data]);
      setShowAddModal(false);
      setNewForm({ username: '', fullName: '', password: '', role: 'OPERATOR', telegramId: '' });
      showAlert('success', language === 'uz' ? 'Yangi foydalanuvchi muvaffaqiyatli qo\'shildi!' : 'Пользователь успешно создан!');
    } catch (err: any) {
      showAlert('error', err.response?.data?.error || 'Foydalanuvchi yaratishda xatolik');
    }
  };

  // Update User Details
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      const payload: any = {
        fullName: editForm.fullName,
        role: editForm.role,
        isActive: editForm.isActive,
      };
      if (editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }
      const res = await axios.put(`/api/auth/users/${selectedUser.id}`, payload);
      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, ...res.data } : u)));
      setShowEditModal(false);
      setSelectedUser(null);
      showAlert('success', language === 'uz' ? 'Foydalanuvchi ma\'lumotlari yangilandi!' : 'Данные пользователя обновлены!');
    } catch (err: any) {
      showAlert('error', err.response?.data?.error || 'Yangilashda xatolik');
    }
  };

  // Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !resetPasswordValue.trim()) return;
    try {
      const res = await axios.put(`/api/auth/users/${selectedUser.id}`, { password: resetPasswordValue.trim() });
      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, initialPassword: resetPasswordValue.trim() } : u)));
      setShowResetModal(false);
      setResetPasswordValue('');
      setSelectedUser(null);
      showAlert('success', language === 'uz' ? 'Parol muvaffaqiyatli yangilandi!' : 'Пароль успешно обновлен!');
    } catch (err: any) {
      showAlert('error', err.response?.data?.error || 'Parolni yangilashda xatolik');
    }
  };

  // Delete User
  const handleDeleteUser = async (userToDelete: UserItem) => {
    if (userToDelete.id === currentUser?.id) {
      showAlert('error', 'O\'zingizning profilingizni o\'chira olmaysiz!');
      return;
    }
    const confirmMsg = language === 'uz'
      ? `Haqiqatan ham "${userToDelete.fullName} (${userToDelete.username})" foydalanuvchisini o'chirmoqchimisiz?`
      : `Вы уверены, что хотите удалить "${userToDelete.fullName} (${userToDelete.username})"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await axios.delete(`/api/auth/users/${userToDelete.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      showAlert('success', language === 'uz' ? 'Foydalanuvchi o\'chirildi' : 'Пользователь удален');
    } catch (err: any) {
      showAlert('error', err.response?.data?.error || 'O\'chirishda xatolik yuz berdi');
    }
  };

  // Filtered list
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Alert banner */}
      {alert && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-2 shadow-lg ${
            alert.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
          }`}
        >
          {alert.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-semibold">{alert.message}</span>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-3xl border border-white/10 backdrop-blur-xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {language === 'uz' ? 'Foydalanuvchilar va Rollar Boshqaruvi' : 'Управление Пользователями и Ролями'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {users.length} {language === 'uz' ? 'ta akkaunt' : 'аккаунтов'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              {language === 'uz'
                ? 'Barcha rollar, login va parollar ro\'yxati, yangi akkauntlar va ruxsatlarni sozlash'
                : 'Список всех ролей, логинов и паролей, добавление аккаунтов и настройка доступов'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-white/10 transition active:scale-95"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/30 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'uz' ? 'Yangi Foydalanuvchi' : 'Добавить Пользователя'}</span>
          </button>
        </div>
      </div>

      {/* Quick Role Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {Object.entries(ROLE_LABELS).map(([roleKey, meta]) => {
          const count = users.filter((u) => u.role === roleKey).length;
          const isSelected = roleFilter === roleKey;
          return (
            <button
              key={roleKey}
              onClick={() => setRoleFilter(isSelected ? 'ALL' : roleKey)}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                isSelected
                  ? 'bg-indigo-600/20 border-indigo-500 shadow-md shadow-indigo-500/10'
                  : 'bg-slate-900/40 border-white/5 hover:border-white/20'
              }`}
            >
              <span className="text-[11px] font-bold text-slate-300 truncate">{meta.uz}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-lg font-black text-white">{count}</span>
                <span className="text-[10px] text-slate-500 font-mono">{roleKey}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/50 p-3 rounded-2xl border border-white/5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={
              language === 'uz'
                ? 'F.I.SH, login yoki rol bo\'yicha qidiruv...'
                : 'Поиск по Ф.И.О, логину или роли...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 ml-1" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">{language === 'uz' ? 'Barcha rollar' : 'Все роли'}</option>
            {Object.keys(ROLE_LABELS).map((rk) => (
              <option key={rk} value={rk}>
                {ROLE_LABELS[rk].uz} ({rk})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table / Grid */}
      <div className="bg-slate-900/70 rounded-3xl border border-white/10 overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/40 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">#</th>
                <th className="py-3.5 px-4">{language === 'uz' ? 'Foydalanuvchi (F.I.SH)' : 'Пользователь (Ф.И.О)'}</th>
                <th className="py-3.5 px-4">{language === 'uz' ? 'Login' : 'Логин'}</th>
                <th className="py-3.5 px-4">{language === 'uz' ? 'Parol (Kirish)' : 'Пароль'}</th>
                <th className="py-3.5 px-4">{language === 'uz' ? 'Roli (Ruxsat)' : 'Роль'}</th>
                <th className="py-3.5 px-4">{language === 'uz' ? 'Holat' : 'Статус'}</th>
                <th className="py-3.5 px-4 text-right">{language === 'uz' ? 'Amallar' : 'Действия'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <span>{language === 'uz' ? 'Foydalanuvchilar topilmadi' : 'Пользователи не найдены'}</span>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((item, idx) => {
                  const roleMeta = ROLE_LABELS[item.role] || {
                    uz: item.role,
                    ru: item.role,
                    color: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
                    descUz: '',
                  };
                  const isVisible = visiblePasswords[item.id];
                  const passwordDisplay = item.initialPassword || '••••••••';
                  const isCurrentUser = item.id === currentUser?.id;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isCurrentUser ? 'bg-indigo-950/20' : ''
                      }`}
                    >
                      {/* Index */}
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-500">{idx + 1}</td>

                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center font-bold text-indigo-300 text-xs shadow-inner">
                            {item.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white">{item.fullName}</span>
                              {isCurrentUser && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-500 text-white tracking-wider">
                                  {language === 'uz' ? 'SIZ' : 'ВЫ'}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 block">{roleMeta.descUz}</span>
                          </div>
                        </div>
                      </td>

                      {/* Login / Username */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 text-indigo-300 border border-white/10">
                          {item.username}
                        </span>
                      </td>

                      {/* Password with Eye & Copy */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-950 border border-white/10 text-slate-200 min-w-[90px] text-center select-all">
                            {isVisible ? passwordDisplay : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(item.id)}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                            title={isVisible ? 'Yashirish' : 'Ko\'rish'}
                          >
                            {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          {item.initialPassword && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(item.initialPassword!, item.id)}
                              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg transition"
                              title="Nusxalash"
                            >
                              {copiedId === item.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Role with Quick Dropdown */}
                      <td className="py-3.5 px-4">
                        <select
                          value={item.role}
                          onChange={(e) => handleQuickRoleChange(item.id, e.target.value)}
                          disabled={isCurrentUser}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-xl border cursor-pointer focus:outline-none transition ${roleMeta.color}`}
                        >
                          {Object.keys(ROLE_LABELS).map((rk) => (
                            <option key={rk} value={rk} className="bg-slate-900 text-white font-sans">
                              {ROLE_LABELS[rk].uz}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item.id, item.isActive)}
                          disabled={isCurrentUser}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                            item.isActive
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                              : 'bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
                          }`}
                        >
                          {item.isActive
                            ? language === 'uz'
                              ? 'Faol'
                              : 'Активен'
                            : language === 'uz'
                            ? 'Bloklangan'
                            : 'Заблокирован'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUser(item);
                              setShowResetModal(true);
                            }}
                            className="p-1.5 hover:bg-slate-800 text-amber-400 rounded-lg transition"
                            title="Parolni o'zgartirish"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUser(item);
                              setEditForm({
                                fullName: item.fullName,
                                role: item.role,
                                password: '',
                                isActive: item.isActive,
                              });
                              setShowEditModal(true);
                            }}
                            className="p-1.5 hover:bg-slate-800 text-indigo-400 rounded-lg transition"
                            title="Tahrirlash"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {!isCurrentUser && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(item)}
                              className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded-lg transition"
                              title="O'chirish"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add User */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-lg font-black text-white mb-1 flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              <span>{language === 'uz' ? 'Yangi Foydalanuvchi Qo\'shish' : 'Добавить нового пользователя'}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              {language === 'uz'
                ? 'Yangi xodim uchun login, parol va uning lavozimiga mos rolni tanlang'
                : 'Укажите логин, пароль и выберите подходящую роль сотрудника'}
            </p>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  {language === 'uz' ? 'F.I.SH (To\'liq ismi)' : 'Ф.И.О'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Sardor Aliyev"
                  value={newForm.fullName}
                  onChange={(e) => setNewForm({ ...newForm, fullName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  {language === 'uz' ? 'Login (Foydalanuvchi nomi)' : 'Логин'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: sardor_ali"
                  value={newForm.username}
                  onChange={(e) => setNewForm({ ...newForm, username: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  {language === 'uz' ? 'Parol' : 'Пароль'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: sardor123"
                  value={newForm.password}
                  onChange={(e) => setNewForm({ ...newForm, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  {language === 'uz' ? 'Tizimdagi Roli' : 'Роль в системе'}
                </label>
                <select
                  value={newForm.role}
                  onChange={(e) => setNewForm({ ...newForm, role: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  {Object.keys(ROLE_LABELS).map((rk) => (
                    <option key={rk} value={rk}>
                      {ROLE_LABELS[rk].uz} ({rk})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  {language === 'uz' ? 'Telegram ID (ixtiyoriy)' : 'Telegram ID (необязательно)'}
                </label>
                <input
                  type="text"
                  placeholder="Masalan: 123456789"
                  value={newForm.telegramId}
                  onChange={(e) => setNewForm({ ...newForm, telegramId: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition"
                >
                  {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition"
                >
                  {language === 'uz' ? 'Qo\'shish' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit User */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-lg font-black text-white mb-1 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-indigo-400" />
              <span>{language === 'uz' ? 'Foydalanuvchini Tahrirlash' : 'Редактировать пользователя'}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-5 font-mono">@{selectedUser.username}</p>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  {language === 'uz' ? 'F.I.SH' : 'Ф.И.О'}
                </label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  {language === 'uz' ? 'Roli' : 'Роль'}
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  {Object.keys(ROLE_LABELS).map((rk) => (
                    <option key={rk} value={rk}>
                      {ROLE_LABELS[rk].uz} ({rk})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  {language === 'uz' ? 'Yangi Parol (ixtiyoriy)' : 'Новый пароль (необязательно)'}
                </label>
                <input
                  type="text"
                  placeholder={language === 'uz' ? 'O\'zgartirish uchun kiriting...' : 'Введите для смены...'}
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-slate-800 border-white/20 cursor-pointer"
                />
                <label htmlFor="isActiveToggle" className="text-xs font-bold text-slate-300 cursor-pointer">
                  {language === 'uz' ? 'Akkaunt faol holatda' : 'Аккаунт активен'}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition"
                >
                  {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition"
                >
                  {language === 'uz' ? 'Saqlash' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {showResetModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
            <h3 className="text-lg font-black text-white mb-1 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-400" />
              <span>{language === 'uz' ? 'Parolni O\'zgartirish' : 'Сменить пароль'}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              <strong className="text-white">{selectedUser.fullName}</strong> (@{selectedUser.username}) uchun yangi
              parol kiriting:
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <input
                  type="text"
                  required
                  placeholder="Yangi parol..."
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetModal(false);
                    setSelectedUser(null);
                    setResetPasswordValue('');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition"
                >
                  {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition"
                >
                  {language === 'uz' ? 'Yangilash' : 'Обновить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
