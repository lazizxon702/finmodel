import { Server as SocketIOServer } from 'socket.io';

/**
 * Socket.IO ga yagona kirish nuqtasi. Routelar `emitRealtime('trust:updated')` deb chaqiradi;
 * Socket.IO ishlamayotgan muhitda (masalan Vercel serverless) jimgina o'tkazib yuboriladi.
 *
 * Hodisalar:
 *   deals:updated   — bitim yaratildi / o'zgardi / tasdiqlandi / rad etildi
 *   dds:updated     — DDS tranzaksiyasi qo'shildi / o'chirildi (hisob qoldiqlari o'zgardi)
 *   trust:updated   — Trust qarzi yoki to'lovi o'zgardi
 */
export type RealtimeEvent = 'deals:updated' | 'dds:updated' | 'trust:updated';

let io: SocketIOServer | null = null;

export function setRealtimeServer(server: SocketIOServer) {
  io = server;
}

export function emitRealtime(event: RealtimeEvent, payload: Record<string, unknown> = {}) {
  try {
    io?.emit(event, { ...payload, at: new Date().toISOString() });
  } catch (e) {
    console.warn('Realtime emit xatosi:', (e as Error).message);
  }
}
