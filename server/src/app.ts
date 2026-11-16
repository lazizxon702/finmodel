import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

// Fix BigInt JSON serialization in Prisma
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Route imports
import authRoutes from './routes/auth.routes';
import dealsRoutes from './routes/deals.routes';
import inventoryRoutes from './routes/inventory.routes';
import agentsRoutes from './routes/agents.routes';
import ddsRoutes from './routes/dds.routes';
import balanceRoutes from './routes/balance.routes';
import dailyRoutes from './routes/daily.routes';
import finmodelRoutes from './routes/finmodel.routes';
import financesRoutes from './routes/finances.routes';
import botRoutes from './routes/bot.routes';
import referencesRoutes from './routes/references.routes';
import handoverRoutes from './routes/handover.routes';
import exportRoutes from './routes/export.routes';
import debtorsRoutes from './routes/debtors.routes';
import leadsRoutes from './routes/leads.routes';
import hrRoutes from './routes/hr.routes';
import aiRoutes from './routes/ai.routes';
import syncRoutes from './routes/sync.routes';
import trustRoutes from './routes/trust.routes';
import notificationsRoutes from './routes/notifications.routes';
import teamRoutes from './routes/team.routes';
import storeReportsRoutes from './routes/storeReports.routes';
import daftarRoutes from './routes/daftar.routes';
import salesRoutes from './routes/sales.routes';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure upload folder exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (e) {}
}
app.use('/uploads', express.static(uploadDir));

// Attach routes
app.use('/api/auth', authRoutes);
app.use('/api/deals', dealsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/dds', ddsRoutes);
app.use('/api/balance', balanceRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/finmodel', finmodelRoutes);
app.use('/api/finances', financesRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/references', referencesRoutes);
app.use('/api/handover', handoverRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/debtors', debtorsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/trust', trustRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/store-reports', storeReportsRoutes);
app.use('/api/daftar-reports', daftarRoutes);
app.use('/api/sales', salesRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'FinModel Pul va tovar hisobi API', time: new Date() });
});

export default app;
