const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const client = require('prom-client');
const winston = require('winston');
const authRoutes = require('./routes/auth');
const { initDB } = require('./db/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

app.logger = logger;

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const authAttempts = new client.Counter({
  name: 'auth_login_attempts_total',
  help: 'Total login attempts',
  labelNames: ['status'],
  registers: [register]
});

const activeTokens = new client.Gauge({
  name: 'auth_active_tokens_total',
  help: 'Number of active JWT tokens issued',
  registers: [register]
});

app.locals.metrics = { authAttempts, activeTokens };

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/', authRoutes);

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    await initDB();
    logger.info('Database initialized');
    app.listen(PORT, () => {
      logger.info(`Auth Service running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start auth service', { error: err.message });
    process.exit(1);
  }
}

start();

module.exports = app;
