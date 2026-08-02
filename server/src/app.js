import http from 'http';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { config } from './config/env.js';
import { connectDB } from './config/db.js';
import { startCronJobs } from './services/cron.service.js';
import { initSocket } from './services/socket.service.js';
import { redis } from './services/redis.service.js';
import { logger, httpLogger } from './utils/logger.js';

import authRoutes from './routes/auth.routes.js';
import donorRoutes from './routes/donor.routes.js';
import requestRoutes from './routes/request.routes.js';
import orgRoutes from './routes/org.routes.js';
import adminRoutes from './routes/admin.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import dns from 'node:dns/promises';
dns.setServers(['1.1.1.1', '8.8.8.8']);

const app = express();
const server = http.createServer(app);
const io = initSocket(server);

// Connect to Database (Only if not in test env)
if (config.NODE_ENV !== 'test') {
  connectDB();
  // Start background cron jobs (request auto-expiry, stale reservation cleanup, etc.)
  startCronJobs();
}

// Dedicated Rate Limiters
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many OTP requests. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowed = config.CORS_ORIGIN.split(',').map(o => o.trim().replace(/\/$/, ''));
    if (allowed.includes('*') || !origin || allowed.includes(origin.replace(/\/$/, ''))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// HTTP Structured Logging with Correlation ID
app.use(httpLogger);

// Serve static upload assets
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/v1/auth/otp', otpLimiter);
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/donors', donorRoutes);
app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/orgs', orgRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// Health Check Endpoint
app.get('/api/v1/health', async (req, res) => {
  const mongoConnected = mongoose.connection.readyState === 1;
  const redisConnected = redis.isReady();
  res.json({
    status: mongoConnected ? 'UP' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      mongodb: mongoConnected ? 'CONNECTED' : 'DISCONNECTED',
      redis: redisConnected ? 'CONNECTED' : 'FALLBACK_MEMORY',
    },
    environment: config.NODE_ENV,
    memoryUsage: {
      rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
    },
  });
});

// Base route for API check
app.get('/api/v1', (req, res) => {
  res.json({ message: '🩸 Blood Network API is live' });
});

// Handle 404 Route
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error(`Global Error Handler: ${err.message}`, {
    reqId: req?.id || 'unknown',
    error: err,
    path: req?.originalUrl || req?.url,
    method: req?.method,
  });

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  if (err.name === 'MongoServerError' && err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate entry — this record already exists' });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// Listen on Port
if (config.NODE_ENV !== 'test') {
  server.listen(config.PORT, () => {
    console.log(`🚀 Server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
  });
}

export { app, server, io };
export default app;
