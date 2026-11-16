import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Lock, User, ArrowRight, Sunrise, Sun, Sunset, Moon, Eye, EyeOff, AlertCircle, Layers, ArrowDownUp, Handshake, Users } from 'lucide-react';
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

  // Toshkent vaqti (jonli soat) va kun vaqtiga qarab salomlashish
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const hour = Number(clock.slice(0, 2));
  const dayPart =
    hour >= 5 && hour < 11
      ? { icon: Sunrise, label: t('auth.greeting_morning') }
      : hour >= 11 && hour < 17
        ? { icon: Sun, label: t('auth.greeting_day') }
        : hour >= 17 && hour < 22
          ? { icon: Sunset, label: t('auth.greeting_evening') }
          : { icon: Moon, label: t('auth.greeting_night') };
  const DayIcon = dayPart.icon;

  // Jonli belgi (maskot): nuqtasi kursorga qaraydi (qayta chizishsiz, CSS o'zgaruvchilari orqali)
  const mascotRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<'user' | 'pass' | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = mascotRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width * 0.74);
      const dy = e.clientY - (r.top + r.height * 0.22);
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(6, len / 24) / len;
      el.style.setProperty('--dx', `${(dx * k).toFixed(1)}px`);
      el.style.setProperty('--dy', `${(dy * k).toFixed(1)}px`);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  // Har bir harf yozilganda belgi biroz "sakraydi"; xato chiqsa — bosh chayqaydi
  const bounce = () => mascotRef.current?.animate([{ scale: '1' }, { scale: '1.09' }, { scale: '1' }], { duration: 180, easing: 'ease-out' });
  useEffect(() => {
    if (!error) return;
    mascotRef.current?.animate(
      [{ translate: '0' }, { translate: '-9px' }, { translate: '8px' }, { translate: '-6px' }, { translate: '4px' }, { translate: '0' }],
      { duration: 450, easing: 'ease-in-out' }
    );
  }, [error]);
  const mascotState = loading ? 'loading' : focus === 'pass' && !showPassword ? 'lock' : error ? 'error' : 'idle';

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
      <div className="fm-nav relative isolate flex shrink-0 flex-col justify-between overflow-hidden px-5 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))] lg:w-[44%] lg:max-w-[640px] lg:p-12 xl:p-16">
        {/* Fonda sekin suzuvchi yorug'lik dog'lari (faqat bezak) */}
        <div aria-hidden="true" className="fm-login-bg absolute inset-0 -z-10 overflow-hidden">
          <span className="fm-login-glow fm-login-glow-a" />
          <span className="fm-login-glow fm-login-glow-b" />
        </div>

        {/* Logo intro: belgi chiziladi, nuqta tushadi, to'lqin tarqaladi, yozuv belgi ortidan chiqadi */}
        <div className="flex items-center gap-3">
          <span className="relative shrink-0">
            <span aria-hidden="true" className="fm-login-ripple" />
            <span aria-hidden="true" className="fm-login-ripple" />
            <BrandMark animated className="relative h-11 w-11 lg:h-12 lg:w-12" />
          </span>
          <p className="fm-login-word font-display text-xl font-bold tracking-tight text-white lg:text-2xl">
            Macmobi <span className="align-middle text-xs font-semibold tracking-[0.2em] text-nav-muted">ERP</span>
          </p>
        </div>

        <div className="hidden lg:block">
          <p
            className="fm-login-rise max-w-[14ch] font-display text-[2.75rem] font-bold leading-[1.05] tracking-tight text-white first-letter:uppercase xl:text-[3.25rem]"
            style={{ '--i': 22 } as React.CSSProperties}
          >
            {t('layout.tagline')}
          </p>
          <ul className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-4">
            {inside.map(({ icon: Icon, label }, idx) => (
              <li
                key={label}
                className="fm-login-rise fm-login-item flex items-center gap-3 text-sm font-medium text-nav-muted"
                style={{ '--i': idx + 25 } as React.CSSProperties}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-white/10 text-white">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 leading-snug">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="fm-login-rise hidden text-xs text-nav-muted/80 lg:block" style={{ '--i': 30 } as React.CSSProperties}>
          {t('layout.tashkent_time')}: UTC+5
        </p>
      </div>

      {/* Forma */}
      <div className="relative isolate -mt-10 flex flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:mt-0 lg:px-10 lg:pt-6">
        {/* Bezak foni: nuqtali to'r va sekin suzuvchi yorug'lik (faqat keng ekranda) */}
        <div aria-hidden="true" className="absolute inset-0 -z-10 hidden overflow-hidden lg:block">
          <span className="fm-login-grid" />
          <span className="fm-login-orb fm-login-orb-a" />
          <span className="fm-login-orb fm-login-orb-b" />
          {/* Pastda oqib turuvchi to'lqinlar */}
          {['a', 'b', 'c'].map((k) => (
            <svg key={k} viewBox="0 0 2880 120" preserveAspectRatio="none" className={`fm-login-wave fm-login-wave-${k}`}>
              <path d="M0 60C240 0 480 120 720 60S1200 120 1440 60S1920 120 2160 60S2640 120 2880 60V120H0Z" />
            </svg>
          ))}
          <span className="fm-login-tile left-[9%] top-[20%] h-12 w-12" style={{ '--r': '-14deg' } as React.CSSProperties} />
          <span className="fm-login-tile right-[12%] top-[26%] h-7 w-7" style={{ '--r': '18deg', animationDelay: '-3s' } as React.CSSProperties} />
          <span className="fm-login-tile bottom-[16%] left-[16%] h-8 w-8" style={{ '--r': '8deg', animationDelay: '-6s' } as React.CSSProperties} />
        </div>

        {/* Til va mavzu almashtirgichlari (mobilda forma ostida) */}
        <div className="order-last mt-6 flex items-center justify-center gap-2 lg:order-first lg:mt-0 lg:justify-end">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-start justify-center lg:items-center">
          <div className="w-full max-w-[24rem]">
            <div className="rounded-sheet border border-line bg-surface p-5 text-center shadow-pop sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
              {/* Jonli belgi: nuqtasi kursorga qaraydi, parol yozilganda o'girilib qulfni ko'rsatadi */}
              <div className="fm-login-rise mb-9 flex justify-center" style={{ '--i': 2 } as React.CSSProperties}>
                <div ref={mascotRef} className="fm-mascot" data-state={mascotState} aria-hidden="true">
                  <div className="fm-mascot-body">
                    <div className="fm-mascot-flip">
                      <div className="fm-mascot-face">
                        <svg viewBox="0 0 48 48" className="h-full w-full">
                          <rect width="48" height="48" rx="13" fill="#2563F0" />
                          <path
                            className="fm-mascot-m"
                            pathLength={1}
                            d="M13.5 34V17.5L24 28l10.5-9.5V34"
                            fill="none"
                            stroke="#fff"
                            strokeWidth="5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="fm-mascot-dot" />
                      </div>
                      <div className="fm-mascot-face fm-mascot-back">
                        <Lock className="h-9 w-9" />
                      </div>
                    </div>
                  </div>
                  <span className="fm-mascot-shadow" />
                </div>
              </div>

              {/* Salomlashish (kun vaqtiga qarab) va jonli Toshkent soati */}
              <div className="fm-login-rise mb-4 flex justify-center" style={{ '--i': 3 } as React.CSSProperties}>
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-fg-secondary shadow-card"
                  title={t('layout.tashkent_time')}
                >
                  <span className="fm-login-live" aria-hidden="true" />
                  <span className="tabular-nums">{clock}</span>
                  <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
                  <DayIcon className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                  <span className="text-brand">{dayPart.label}!</span>
                </span>
              </div>
              <h1 className="fm-login-rise text-[1.75rem] font-bold leading-tight lg:text-[2.5rem]" style={{ '--i': 4 } as React.CSSProperties}>
                <span className="fm-login-title">{t('auth.title')}</span>
              </h1>
              <p className="fm-login-rise mt-2 text-sm leading-snug text-fg-muted" style={{ '--i': 5 } as React.CSSProperties}>
                {t('auth.subtitle')}
              </p>

              {error && (
                <div role="alert" className="mt-5 flex items-start gap-2 text-left rounded-control bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-7 space-y-4 text-left">
                <div className="fm-login-rise" style={{ '--i': 6 } as React.CSSProperties} onFocus={() => setFocus('user')} onBlur={() => setFocus(null)}>
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
                    onChange={(e) => {
                      setUsername(e.target.value);
                      bounce();
                    }}
                    placeholder={t('auth.username_placeholder')}
                    className="min-h-[3rem] sm:min-h-[3rem]"
                  />
                </Field>
                </div>

                <div className="fm-login-rise" style={{ '--i': 7 } as React.CSSProperties} onFocus={() => setFocus('pass')} onBlur={() => setFocus(null)}>
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
                </div>

                <div className="fm-login-rise fm-login-submit" style={{ '--i': 8 } as React.CSSProperties}>
                  <Button type="submit" size="lg" fullWidth loading={loading} rightIcon={<ArrowRight className="h-4 w-4" />}>
                    {loading ? t('auth.submitting') : t('auth.submit')}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default LoginPage;
