import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { ROLE_DEFAULT_HOME } from '../components/Sidebar';
import { Button, Field, Input, LanguageSwitcher, ThemeToggle } from '../components/ui';

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

  return (
    <div className="flex min-h-screen flex-col bg-app px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      {/* Til va mavzu almashtirgichlari */}
      <div className="flex items-center justify-end gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            {/* Logotip rangli fon uchun chizilgan — ikkala rejimda ham to'q plashka ustida turadi */}
            <div className="keep-colors mx-auto mb-4 inline-flex items-center justify-center rounded-card bg-slate-900 px-5 py-3">
              <img src="/macmobi-logo.png" alt="Macmobi ERP" className="h-12 max-w-[200px] object-contain" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">{t('auth.title')}</h1>
            <p className="mt-1 text-sm text-fg-muted">{t('auth.subtitle')}</p>
          </div>

          <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
            {error && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                    className="pr-11"
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

          <p className="mt-4 text-center text-xs text-fg-muted">Macmobi ERP — {t('layout.tagline')}</p>
        </div>
      </div>
    </div>
  );
};
export default LoginPage;
