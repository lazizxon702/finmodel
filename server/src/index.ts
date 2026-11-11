import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { initTelegramBot } from './bot/telegram.bot';

const server = http.createServer(app);

// WebSocket Setup
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

io.on('connection', (socket) => {
  console.log(`⚡ WebSocket client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`🔌 WebSocket client disconnected: ${socket.id}`);
  });
});

// Start Telegram Bot
try {
  initTelegramBot(io);
} catch (e) {
  console.error('Telegram bot init error:', e);
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 FinModel Server ishga tushdi: http://localhost:${PORT}`);
});
