require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/database');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const initializeSocket = require('./socket');

const app = express();
const server = http.createServer(app);

const parseAllowedOrigins = () => {
  const configured = String(process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  return Array.from(new Set([...configured, ...defaultOrigins]));
};

const allowedOrigins = parseAllowedOrigins();

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  if (allowedOrigins.includes(origin)) return true;

  // Optional wildcard support for Vercel preview domains.
  if (process.env.ALLOW_VERCEL_PREVIEW_ORIGINS === 'true') {
    try {
      const hostname = new URL(origin).hostname;
      return hostname.endsWith('.vercel.app');
    } catch {
      return false;
    }
  }

  return false;
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.set('io', io);

connectDB();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting is skipped in development — React StrictMode double-invokes
// effects causing frequent burst requests that produce noisy 429s.
if (process.env.NODE_ENV !== 'development') {
  app.use('/api', limiter);
}

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Science Bowl Online API',
    version: '1.0.0',
    documentation: '/api/health'
  });
});

app.use('/api', routes);
initializeSocket(io);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const isBrokenPipeError = (err) => {
  const code = err?.code;
  const message = String(err?.message || '');
  return code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED' || message.includes('EPIPE');
};

process.stdout.on('error', (err) => { if (isBrokenPipeError(err)) return; });
process.stderr.on('error', (err) => { if (isBrokenPipeError(err)) return; });

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🧪 Science Bowl Online Server                           ║
║                                                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}                                ║
║   Port: ${PORT}                                              ║
║   API: http://localhost:${PORT}/api                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

process.on('unhandledRejection', (err) => {
  if (isBrokenPipeError(err)) return;
  console.error('Unhandled Promise Rejection:', err);
  if (process.env.NODE_ENV === 'development') return;
  server.close(() => {
    if (io.statsInterval) clearInterval(io.statsInterval);
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  if (isBrokenPipeError(err)) return;
  console.error('Uncaught Exception:', err);
  if (process.env.NODE_ENV === 'development') return;
  process.exit(1);
});

module.exports = { app, server, io };
