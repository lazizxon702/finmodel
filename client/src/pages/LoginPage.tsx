import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, ShieldCheck, Sparkles, Building2, Globe } from 'lucide-react';
import { ROLE_DEFAULT_HOME } from '../components/Sidebar';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login', { username, password });
      login(res.data.token, res.data.user);
      const userRole = res.data.user?.role || 'OPERATOR';
      const homePath = ROLE_DEFAULT_HOME[userRole] || '/';
      navigate(homePath);
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.error ||
          (language === 'uz'
            ? 'Kirishda xatolik yuz berdi. Login yoki parolni tekshiring.'
            : 'Ошибка входа. Проверьте логин или пароль.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-3 sm:p-4">
      <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-5 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5),0_1px_0_rgba(255,255,255,0.1)_inset] relative overflow-hidden">
        {/* Decorative blur glows */}
        <div className="absolute -top-14 -right-14 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-14 -left-14 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Top bar with 3D Language Toggle */}
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-1.5 text-xs text-indigo-300 font-semibold">
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>Macmobi ERP</span>
          </div>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5 shadow-inner">
            <button
              type="button"
              onClick={() => setLanguage('uz')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                language === 'uz'
                  ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-[0_2px_4px_rgba(0,0,0,0.3)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🇺🇿 UZ
            </button>
            <button
              type="button"
              onClick={() => setLanguage('ru')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                language === 'ru'
                  ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-[0_2px_4px_rgba(0,0,0,0.3)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🇷🇺 RU
            </button>
          </div>
        </div>

        {/* Brand */}
        <div className="text-center mb-8 relative z-10">
          <div className="flex items-center justify-center mx-auto mb-3">
            <img 
              src="/macmobi-logo.png" 
              alt="Macmobi ERP" 
              className="h-16 max-w-[240px] object-contain drop-shadow-xl filter"
            />
          </div>
          <p className="text-xs text-indigo-200/90 mt-1 font-semibold tracking-wide">
            biznesni boshqarish tizimi
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs text-center font-medium shadow-inner animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          <div>
            <label className="block text-xs font-bold text-gray-300 mb-1.5">
              {language === 'uz' ? 'Foydalanuvchi nomi (Login)' : 'Имя пользователя (Логин)'}
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-indigo-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white/10 transition shadow-inner"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-300 mb-1.5">
              {language === 'uz' ? 'Parol' : 'Пароль'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-indigo-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white/10 transition shadow-inner"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 btn-3d bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl text-sm shadow-[0_4px_0_0_#3730a3,0_8px_16px_rgba(79,70,229,0.3)] flex items-center justify-center gap-2 transition active:translate-y-[2px] disabled:opacity-50"
          >
            {loading ? (
              <span>{language === 'uz' ? 'Kirilmoqda...' : 'Вход...'}</span>
            ) : (
              <>
                <span>{language === 'uz' ? 'Tizimga kirish' : 'Войти в систему'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
export default LoginPage;
