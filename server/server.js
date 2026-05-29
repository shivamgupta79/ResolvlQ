import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import mailRoutes from './routes/mailRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import engineerRoutes from './routes/engineerRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import mlRoutes from './routes/mlRoutes.js';
import inboundRoutes from './routes/inboundRoutes.js';
import { runAnomalyDetection } from './services/anomalyDetectorService.js';
import { pollGmailInbox } from './services/gmailInboundService.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL]
  : ['http://localhost:5173', 'http://localhost:5174'];

// ── Socket.io ──────────────────────────────────────────────────────────────
export const io = new SocketServer(httpServer, {
  cors: { origin: allowedOrigins, credentials: true }
});

io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);
  socket.on('join', (room) => socket.join(room));
  socket.on('disconnect', () => console.log('[Socket] Client disconnected:', socket.id));
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true })); // needed for Twilio form-encoded webhooks
app.use(morgan('dev'));

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (_, res) => res.json({ message: 'ResolvIQ API is running' }));

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/mail', mailRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/engineers', engineerRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/inbound', inboundRoutes);

// ── Error handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

// ── Priority escalation cron (every hour) ─────────────────────────────────
async function runEscalation() {
  try {
    const Complaint = (await import('./models/Complaint.js')).default;
    const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago
    const toEscalate = await Complaint.find({
      status: 'Pending',
      priority: { $in: ['Low', 'Medium'] },
      escalated: false,
      createdAt: { $lt: cutoff }
    });

    for (const c of toEscalate) {
      const oldPriority = c.priority;
      c.priority = c.priority === 'Low' ? 'Medium' : 'High';
      c.escalated = true;
      c.auditLog.push({
        status: c.status,
        changedByName: 'System',
        changedByRole: 'system',
        reason: `Auto-escalated from ${oldPriority} after 4h pending`
      });
      await c.save();
      io.emit('complaint:updated', { _id: c._id, priority: c.priority, escalated: true });
    }
    if (toEscalate.length > 0) {
      console.log(`[Cron] Escalated ${toEscalate.length} complaints`);
    }
  } catch (err) {
    console.error('[Cron] Escalation error:', err.message);
  }
}

cron.schedule('0 * * * *', runEscalation); // every hour

// ── Anomaly detection cron (every 6 hours) ────────────────────────────────
cron.schedule(process.env.ANOMALY_CRON_SCHEDULE || '0 */6 * * *', async () => {
  try {
    const result = await runAnomalyDetection();
    if (result.newAlerts > 0) console.log(`[Cron] Anomaly detection: ${result.newAlerts} new alerts`);
  } catch (err) {
    console.error('[Cron] Anomaly detection error:', err.message);
  }
});

// ── Gmail inbox poll cron (every 5 minutes) ───────────────────────────────
cron.schedule(process.env.GMAIL_POLL_CRON || '*/5 * * * *', async () => {
  try {
    const result = await pollGmailInbox();
    if (result.processed > 0) {
      console.log(`[Cron] Gmail poll: ${result.processed} new complaint(s) created`);
    }
  } catch (err) {
    console.error('[Cron] Gmail poll error:', err.message);
  }
});

// ── DB + Start ─────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fixflow_ai')
  .then(() => {
    console.log('MongoDB connected');
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
