import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, Eye, EyeOff, AlertCircle, Layers, ArrowDownUp, Handshake, Users } from 'lucide-react';
import { ROLE_DEFAULT_HOME } from '../components/Sidebar';
import { BrandMark, Button, Field, Input, LanguageSwitcher, ThemeToggle } from '../components/ui';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      setError(err.response?.data?.error || t('auth.error'));
    } finally {
      setLoading(false);
    }
  };

  // Brend panelidagi "ichida nima bor" ro'yxati — mavjud menyu tarjimalaridan
  const inside = [
    { icon: Layers, label: t('menu.deals') },
    { icon: ArrowDownUp, label: t('menu.dds_sub') },
    { icon: Handshake, label: t('menu.trust') },
    { icon: Users, label: t('menu.agents_sub') },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-app lg:flex-row">
      {/* Brend paneli: yon menyu bilan bir xil to'q ko'k. Mobilda — yuqori tasma, lg+ da — chap ustun */}
      <div className="fm-nav relative flex shrink-0 flex-col justify-between px-5 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))] lg:w-[44%] lg:max-w-[640px] lg:p-12 xl:p-16">
        <div className="flex items-center gap-3">
          <BrandMark className="h-11 w-11 lg:h-12 lg:w-12" />
          <p className="font-display text-xl font-bold tracking-tight text-white lg:text-2xl">
            Macmobi <span className="align-middle text-xs font-semibold tracking-[0.2em] text-nav-muted">ERP</span>
          </p>
        </div>

        <div className="hidden lg:block">
          <p className="max-w-[14ch] font-display text-[2.75rem] font-bold leading-[1.05] tracking-tight text-white first-letter:uppercase xl:text-[3.25rem]">
            {t('layout.tagline')}
          </p>
          <ul className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-4">
            {inside.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm font-medium text-nav-muted">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-white/10 text-white">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 leading-snug">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden text-xs text-nav-muted/80 lg:block">{t('layout.tashkent_time')}: UTC+5</p>
      </div>

      {/* Forma */}
      <div className="relative -mt-10 flex flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:mt-0 lg:px-10 lg:pt-6">
        {/* Til va mavzu almashtirgichlari (mobilda forma ostida) */}
        <div className="order-last mt-6 flex items-center justify-center gap-2 lg:order-first lg:mt-0 lg:justify-end">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-start justify-center lg:items-center">
          <div className="w-full max-w-[25rem]">
            <div className="rounded-sheet border border-line bg-surface p-5 shadow-pop sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
              <h1 className="text-2xl font-bold leading-tight text-fg lg:text-[2rem]">{t('auth.title')}</h1>
              <p className="mt-1.5 text-sm leading-snug text-fg-muted">{t('auth.subtitle')}</p>

              {error && (
                <div role="alert" className="mt-5 flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <Field label={t('auth.username')} htmlFor="login-username">
                  <Input
                    id="login-username"
                    type="text"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    autoFocus
                    leftIcon={<User />}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('auth.username_placeholder')}
                    className="min-h-[3rem] sm:min-h-[3rem]"
                  />
                </Field>

                <Field label={t('auth.password')} htmlFor="login-password">
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      leftIcon={<Lock />}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('auth.password_placeholder')}
                      className="min-h-[3rem] pr-11 sm:min-h-[3rem]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? t('auth.hide_password') : t('auth.show_password')}
                      title={showPassword ? t('auth.hide_password') : t('auth.show_password')}
                      className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-control text-fg-muted hover:text-fg"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                <Button type="submit" size="lg" fullWidth loading={loading} rightIcon={<ArrowRight className="h-4 w-4" />}>
                  {loading ? t('auth.submitting') : t('auth.submit')}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default LoginPage;
