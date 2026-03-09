require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const {
  Server
} = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const routes = require('./routes');
const {
  notFound,
  errorHandler
} = require('./middleware/errorHandler');
const initializeSocket = require('./socket');
const app = express();
const server = http.createServer(app);
const APP_NAME = String(process.env.APP_NAME || 'ScienceBowlOne').trim();
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT) || 5000;
const TRUST_PROXY = String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true';
const ENABLE_CORS = String(process.env.CORS_ENABLED || (NODE_ENV === 'production' ? 'false' : 'true')).toLowerCase() !== 'false';
const ALLOW_VERCEL_PREVIEW_ORIGINS = String(process.env.ALLOW_VERCEL_PREVIEW_ORIGINS || 'false').toLowerCase() === 'true';
const SERVE_STATIC_FRONTEND = String(process.env.SERVE_STATIC_FRONTEND || 'false').toLowerCase() === 'true';
const FRONTEND_DIST_PATH = path.resolve(process.cwd(), process.env.FRONTEND_DIST_PATH || '../frontend/dist');
const parseAllowedOrigins = () => {
  const configuredOrigins = String(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '').split(',').map(origin => origin.trim()).filter(Boolean);
  if (configuredOrigins.length > 0) {
    return Array.from(new Set(configuredOrigins));
  }
  if (NODE_ENV === 'production') {
    return [];
  }
  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
};
const allowedOrigins = parseAllowedOrigins();
const isAllowedOrigin = origin => {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (ALLOW_VERCEL_PREVIEW_ORIGINS) {
    try {
      const hostname = new URL(origin).hostname;
      if (hostname.endsWith('.vercel.app')) return true;
    } catch (_) {
      return false;
    }
  }
  return false;
};
const corsOriginHandler = (origin, callback) => {
  if (isAllowedOrigin(origin)) return callback(null, true);
  return callback(new Error(`Origin not allowed by CORS: ${origin || '<unknown>'}`));
};
const ioOptions = {
  pingTimeout: 60000,
  pingInterval: 25000
};
if (ENABLE_CORS) {
  ioOptions.cors = {
    origin: corsOriginHandler,
    methods: ['GET', 'POST'],
    credentials: true
  };
}
const io = new Server(server, ioOptions);
app.set('io', io);
if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}
connectDB();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:']
    }
  },
  crossOriginEmbedderPolicy: false
}));
if (ENABLE_CORS) {
  app.use(cors({
    origin: corsOriginHandler,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
}
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});
if (NODE_ENV !== 'development') {
  app.use('/api', limiter);
}
app.use(express.json({
  limit: process.env.REQUEST_SIZE_LIMIT || '10kb'
}));
app.use(express.urlencoded({
  extended: true,
  limit: process.env.REQUEST_SIZE_LIMIT || '10kb'
}));
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use('/api', routes);
initializeSocket(io);
if (SERVE_STATIC_FRONTEND) {
  app.use(express.static(FRONTEND_DIST_PATH));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    return res.sendFile(path.join(FRONTEND_DIST_PATH, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: `${APP_NAME} API`,
      version: '1.0.0',
      documentation: '/api/health'
    });
  });
}
app.use(notFound);
app.use(errorHandler);
const isBrokenPipeError = err => {
  const code = err?.code;
  const message = String(err?.message || '');
  return code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED' || message.includes('EPIPE');
};
process.stdout.on('error', err => {
  if (isBrokenPipeError(err)) return;
});
process.stderr.on('error', err => {
  if (isBrokenPipeError(err)) return;
});
server.listen(PORT, () => {
  console.log(`${APP_NAME} backend listening on port ${PORT} (${NODE_ENV})`);
});
process.on('unhandledRejection', err => {
  if (isBrokenPipeError(err)) return;
  console.error('Unhandled Promise Rejection:', err);
  if (NODE_ENV === 'development') return;
  server.close(() => {
    if (io.statsInterval) clearInterval(io.statsInterval);
    process.exit(1);
  });
});
process.on('uncaughtException', err => {
  if (isBrokenPipeError(err)) return;
  console.error('Uncaught Exception:', err);
  if (NODE_ENV === 'development') return;
  process.exit(1);
});
module.exports = {
  app,
  server,
  io
};
