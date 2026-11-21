require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const studentRoutes = require('./routes/studentRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Connect to Database
connectDB();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

/**
 * Health check endpoint for Kubernetes Liveness and Readiness Probes.
 * Reports server status and MongoDB connection readiness.
 */
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const isDbReady = dbState === 1;

  const healthData = {
    status: isDbReady ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: NODE_ENV,
    database: {
      status: isDbReady ? 'connected' : 'disconnected',
      readyState: dbState
    }
  };

  if (isDbReady) {
    return res.status(200).json(healthData);
  } else {
    return res.status(503).json(healthData);
  }
});

// Root welcome endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to CloudStudent Backend API',
    version: '1.0.0',
    documentation: '/api/students',
    health: '/health'
  });
});

// API Routes
app.use('/api/students', studentRoutes);

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Resource not found at ${req.originalUrl}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(`[Error Handler] ${err.stack || err.message}`);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start Express Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(` CloudStudent Backend API running on port ${PORT}`);
  console.log(` Environment: ${NODE_ENV}`);
  console.log(` Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`===============================================`);
});

/**
 * Graceful Shutdown Handler for Kubernetes Pod termination
 * Kubernetes sends SIGTERM before SIGKILL giving 30s grace period.
 */
const gracefulShutdown = (signal) => {
  console.log(`[Lifecycle] Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    console.log('[Lifecycle] HTTP server closed.');
    try {
      await mongoose.connection.close(false);
      console.log('[Lifecycle] MongoDB connection closed.');
      process.exit(0);
    } catch (err) {
      console.error('[Lifecycle] Error during MongoDB shutdown:', err);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds if hanging
  setTimeout(() => {
    console.error('[Lifecycle] Forcing shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
