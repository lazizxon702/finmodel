import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from './LanguageContext';

interface NotificationItem {
  id: string;
  message: string;
  time: string;
  type: 'payment' | 'deal' | 'info';
}

interface SocketContextType {
  socket: Socket | null;
  /** Hozir serverga ulanganmi */
  connected: boolean;
  notifications: NotificationItem[];
  dismissNotification: (id: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  notifications: [],
  dismissNotification: () => {},
});

/** Server yuboradigan "ma'lumot yangilandi" hodisalari (useRealtime bilan tinglanadi). */
export type RealtimeEvent = 'deals:updated' | 'dds:updated' | 'trust:updated';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Hodisa kelgan paytdagi joriy til bilan tarjima qilish uchun
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_API_URL || undefined;
    // Cheksiz qayta ulanish, lekin oraliq 2s dan 30s gacha o'sib boradi (server yoki tarmoq
    // vaqtincha yo'q bo'lsa ham keyin o'zi tiklanadi; serverless muhitda so'rovlar siyrak bo'ladi).
    const s = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    // Ulanish xatosi konsolni to'ldirmasin — socket.io o'zi qayta urinadi
    s.on('connect_error', () => setConnected(false));

    s.on('new_bot_payment', (data: any) => {
      const item: NotificationItem = {
        id: Math.random().toString(),
        message: data?.message || tRef.current('layout.new_payment'),
        time: new Date().toLocaleTimeString(),
        type: 'payment',
      };
      setNotifications((prev) => [item, ...prev]);
    });

    s.on('new_bot_deal', (data: any) => {
      const item: NotificationItem = {
        id: Math.random().toString(),
        message: data?.message || tRef.current('layout.new_deal'),
        time: new Date().toLocaleTimeString(),
        type: 'deal',
      };
      setNotifications((prev) => [item, ...prev]);
    });

    return () => {
      s.removeAllListeners();
      s.disconnect();
    };
  }, []);

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <SocketContext.Provider value={{ socket, connected, notifications, dismissNotification }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);

/**
 * Real vaqt hodisasini tinglaydi. Ulanish yo'q bo'lsa hech narsa qilmaydi (xatosiz).
 * `handler` har renderda yangilanishi mumkin — obuna qayta o'rnatilmaydi.
 *
 *   useRealtime('deals:updated', () => fetchDeals());
 *   useRealtime('trust:updated', (payload) => { ... }, enabled);
 */
export function useRealtime<T = any>(
  event: RealtimeEvent | (string & {}),
  handler: (payload: T) => void,
  enabled: boolean = true
): void {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket || !enabled) return;
    const listener = (payload: T) => {
      try {
        handlerRef.current(payload);
      } catch (err) {
        console.error(`[realtime] "${event}" hodisasini qayta ishlashda xato:`, err);
      }
    };
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event, enabled]);
}
