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

// Bir nechta parallel so'rov 401 USER_BLOCKED qaytarsa ham xabar bir marta chiqsin
let blockedNoticeShown = false;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (import.meta.env.VITE_API_URL) {
    axios.defaults.baseURL = import.meta.env.VITE_API_URL;
  }
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

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
      axios
        .get('/api/auth/me')
        .then((res) => {
          setUser(res.data);
        })
        .catch(() => {
          logout();
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
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
    setToken(newToken);
    setUser(newUser);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const logout = () => {
    // Shu qurilmaning push tokenini serverdan o'chiramiz (JWT localStorage'dan — bu funksiya eski yopilishdan chaqirilishi mumkin)
    removePushToken(localStorage.getItem('token'));
    removeWebPushSubscription(localStorage.getItem('token'));
    localStorage.removeItem('token');
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
