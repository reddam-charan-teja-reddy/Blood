import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { connectDB } from './config/db.js';

import authRoutes from './routes/auth.routes.js';
import donorRoutes from './routes/donor.routes.js';
import requestRoutes from './routes/request.routes.js';
import orgRoutes from './routes/org.routes.js';
import adminRoutes from './routes/admin.routes.js';

const app = express();

// Connect to Database (Only if not in test env)
if (config.NODE_ENV !== 'test') {
  connectDB();
}

// Middleware
app.use(cors({
  origin: config.CLIENT_URL,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging middleware
app.use((req, res, next) => {
  if (config.NODE_ENV !== 'test') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/donors', donorRoutes);
app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/orgs', orgRoutes);
app.use('/api/v1/admin', adminRoutes);

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
  console.error('💥 Global Error Handler:', err);

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
  app.listen(config.PORT, () => {
    console.log(`🚀 Server running in ${config.NODE_ENV} mode on port ${config.PORT}`);
  });
}

export default app;
