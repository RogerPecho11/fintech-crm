import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { initializeDatabase } from './database/connection';
import { setupSocketIO } from './services/socketService';
import { startCronJobs } from './services/cronService';
import { initSlaDefaults } from './services/slaService';

// Routes
import authRoutes from './routes/auth';
import merchantRoutes from './routes/merchants';
import userRoutes from './routes/users';
import dashboardRoutes from './routes/dashboard';
import taskRoutes from './routes/tasks';
import documentRoutes from './routes/documents';
import commentRoutes from './routes/comments';
import webhookRoutes from './routes/webhooks';
import reportRoutes from './routes/reports';
import calendarRoutes from './routes/calendar';
import notificationRoutes from './routes/notifications';
import slaRoutes from './routes/sla';
import configRoutes from './routes/config';
import mexicoRoutes from './routes/mexico';
import transactionsRoutes from './routes/transactions';
import monitoringRoutes from './routes/monitoring';

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

setupSocketIO(io);

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:5173',
    ];
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // permissive for Railway — tighten in production if needed
    }
  },
  credentials: true,
}));
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(rateLimiter);

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Attach io to request
app.use((req: any, _res, next) => {
  req.io = io;
  next();
});

// API Routes
const API_PREFIX = '/api/v1';
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/merchants`, merchantRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${API_PREFIX}/tasks`, taskRoutes);
app.use(`${API_PREFIX}/documents`, documentRoutes);
app.use(`${API_PREFIX}/comments`, commentRoutes);
app.use(`${API_PREFIX}/webhooks`, webhookRoutes);
app.use(`${API_PREFIX}/reports`, reportRoutes);
app.use(`${API_PREFIX}/calendar`, calendarRoutes);
app.use(`${API_PREFIX}/notifications`, notificationRoutes);
app.use(`${API_PREFIX}/sla`, slaRoutes);
app.use(`${API_PREFIX}/config`, configRoutes);
app.use(`${API_PREFIX}/mexico`, mexicoRoutes);
app.use(`${API_PREFIX}/transactions`, transactionsRoutes);
app.use(`${API_PREFIX}/monitoring`, monitoringRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    await initializeDatabase();
    console.log('✅ Database connected');

    await initSlaDefaults();
    console.log('✅ SLA defaults initialized');

    startCronJobs(io);
    console.log('✅ Cron jobs started');

    httpServer.listen(PORT, () => {
      console.log(`🚀 Fintech CRM API running on port ${PORT}`);
      console.log(`📡 WebSocket server ready`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();

export { io };
