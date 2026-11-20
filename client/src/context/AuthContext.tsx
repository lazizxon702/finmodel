import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { User } from '../types';
import { initPush, removePushToken } from '../services/push';
import { refreshWebPush, removeWebPushSubscription } from '../services/webPush';
import { useTranslation } from './LanguageContext';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
});

// Oxirgi muvaffaqiyatli kirgan foydalanuvchi — internet/server vaqtincha ishlamasa ham ilova ochilib turishi uchun
const USER_CACHE_KEY = 'finmodel_user';
function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
function writeCachedUser(user: User | null) {
  try {
    if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // localStorage yopiq bo'lishi mumkin
  }
}

// Bir nechta parallel so'rov 401 USER_BLOCKED qaytarsa ham xabar bir marta chiqsin
let blockedNoticeShown = false;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (import.meta.env.VITE_API_URL) {
    axios.defaults.baseURL = import.meta.env.VITE_API_URL;
  }
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const [token, setToken] = useState<string | null>(() => {
    const saved = localStorage.getItem('token');
    // MUHIM: sarlavha ILK renderdayoq o'rnatiladi. Keshdagi foydalanuvchi bilan sahifalar darhol ochiladi va ularning so'rovlari
    // shu provayderning useEffect'idan OLDIN ketadi — sarlavha kech qo'yilsa ular tokensiz ketib 401 oladi va foydalanuvchi chiqib ketadi.
    if (saved) axios.defaults.headers.common['Authorization'] = `Bearer ${saved}`;
    return saved;
  });
  // Token bor bo'lsa, keshdagi foydalanuvchi darhol ko'rsatiladi (server javobini kutmasdan)
  const [user, setUser] = useState<User | null>(() => (localStorage.getItem('token') ? readCachedUser() : null));
  const [isLoading, setIsLoading] = useState(() => Boolean(localStorage.getItem('token')) && !readCachedUser());

  // Token muddati o'tsa yoki yaroqsiz bo'lsa — avtomatik chiqish va login sahifasiga qaytish
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (res: any) => res,
      (error: any) => {
        const url: string = error?.config?.url || '';
        // Push tokenini o'chirish so'rovi chiqish paytida yuboriladi — uning 401 javobi e'tiborga olinmaydi
        const ignored = url.includes('/api/auth/login') || url.includes('/api/notifications/device-token');
        if (error?.response?.status === 401 && !ignored) {
          const blocked = error.response.data?.code === 'USER_BLOCKED';
          const hadSession = !!localStorage.getItem('token');
          logout();
          // Bloklangan foydalanuvchiga sababini aytamiz (aks holda u shunchaki login sahifasiga tushib qoladi)
          if (blocked && hadSession && !blockedNoticeShown) {
            blockedNoticeShown = true;
            window.alert(tRef.current('notifications.account_blocked'));
          }
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, []);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // MUHIM (20.11.2026): akkauntdan FAQAT server 401 qaytarsa chiqiladi (token yaroqsiz / foydalanuvchi bloklangan) — buni yuqoridagi
      // interceptor qiladi. Internet uzilishi, server bandligi (503) yoki vaqt tugashi chiqishga sabab EMAS: ilgari shunday holatda
      // telefon foydalanuvchini tizimdan chiqarib yuborardi. Endi keshdagi foydalanuvchi bilan ishlayveradi va fonda qayta uriniladi.
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const load = (attempt: number) => {
        axios
          .get('/api/auth/me')
          .then((res) => {
            if (cancelled) return;
            setUser(res.data);
            writeCachedUser(res.data);
            setIsLoading(false);
          })
          .catch((error: any) => {
            if (cancelled) return;
            if (error?.response?.status === 401) return; // interceptor allaqachon chiqarib yuborgan
            // Kesh bo'lsa — ilova ochiq turadi; bo'lmasa yuklanish ekranida qayta urinamiz
            if (readCachedUser()) setIsLoading(false);
            timer = setTimeout(() => load(attempt + 1), Math.min(30000, 2000 * 2 ** Math.min(attempt, 4)));
          });
      };
      load(0);
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }
    setIsLoading(false);
    return undefined;
  }, [token]);

  // Push: foydalanuvchi aniqlangach qurilmani ro'yxatdan o'tkazamiz (faqat native ilovada; vebda hech narsa qilmaydi)
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    void initPush({
      channelName: tRef.current('notifications.channel_name'),
      channelDescription: tRef.current('notifications.channel_desc'),
    });
    // Web Push (brauzer/iPhone): ruxsat allaqachon berilgan bo'lsa obuna yangi foydalanuvchiga biriktiriladi
    void refreshWebPush();
  }, [userId]);

  const login = (newToken: string, newUser: User) => {
    blockedNoticeShown = false;
    localStorage.setItem('token', newToken);
    writeCachedUser(newUser);
    setToken(newToken);
    setUser(newUser);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const logout = () => {
    // Shu qurilmaning push tokenini serverdan o'chiramiz (JWT localStorage'dan — bu funksiya eski yopilishdan chaqirilishi mumkin)
    removePushToken(localStorage.getItem('token'));
    removeWebPushSubscription(localStorage.getItem('token'));
    localStorage.removeItem('token');
    writeCachedUser(null);
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
