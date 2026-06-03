const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const client = require('prom-client');
const winston = require('winston');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 1, 3, 5],
  registers: [register]
});

const httpRequestTotal = new client.Counter({
  name: 'gateway_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: req.path,
      status_code: res.statusCode
    };
    end(labels);
    httpRequestTotal.inc(labels);
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';
const METRICS_SERVICE_URL = process.env.METRICS_SERVICE_URL || 'http://metrics-service:3002';

app.use('/api/auth', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '' },
  on: {
    error: (err, req, res) => {
      logger.error('Auth service proxy error', { error: err.message });
      res.status(502).json({ error: 'Auth service unavailable' });
    }
  }
}));

app.use('/api/metrics', createProxyMiddleware({
  target: METRICS_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/metrics': '' },
  on: {
    error: (err, req, res) => {
      logger.error('Metrics service proxy error', { error: err.message });
      res.status(502).json({ error: 'Metrics service unavailable' });
    }
  }
}));

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
});

module.exports = app;
