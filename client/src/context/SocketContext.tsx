import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface NotificationItem {
  id: string;
  message: string;
  time: string;
  type: 'payment' | 'deal' | 'info';
}

interface SocketContextType {
  socket: Socket | null;
  notifications: NotificationItem[];
  dismissNotification: (id: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  notifications: [],
  dismissNotification: () => {},
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_API_URL || undefined;
    // Vercel (serverless) WebSocketni qo'llamaydi: cheksiz qayta ulanish urinishlarini cheklaymiz
    const s = io(serverUrl, {
      reconnectionAttempts: 3,
      reconnectionDelay: 5000,
      timeout: 10000,
    });
    setSocket(s);

    s.on('new_bot_payment', (data: any) => {
      const item: NotificationItem = {
        id: Math.random().toString(),
        message: data.message || 'Yangi to\'lov cheki qabul qilindi!',
        time: new Date().toLocaleTimeString(),
        type: 'payment',
      };
      setNotifications((prev) => [item, ...prev]);
    });

    s.on('new_bot_deal', (data: any) => {
      const item: NotificationItem = {
        id: Math.random().toString(),
        message: data.message || 'Yangi buyurtma keldi!',
        time: new Date().toLocaleTimeString(),
        type: 'deal',
      };
      setNotifications((prev) => [item, ...prev]);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <SocketContext.Provider value={{ socket, notifications, dismissNotification }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
