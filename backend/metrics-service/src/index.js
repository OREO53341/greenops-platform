const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const client = require('prom-client');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createClient } = require('redis');
const winston = require('winston');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'greenops',
  user: process.env.DB_USER || 'greenops',
  password: process.env.DB_PASSWORD || 'greenops_secret',
  max: 10
});

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.connect().catch((err) => logger.error('Redis connect error', { error: err.message }));

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const energyConsumption = new client.Gauge({
  name: 'greenops_energy_consumption_kwh',
  help: 'Current energy consumption in kWh',
  labelNames: ['source', 'zone'],
  registers: [register]
});

const carbonEmissions = new client.Gauge({
  name: 'greenops_carbon_emissions_gco2',
  help: 'Carbon emissions in gCO2eq',
  labelNames: ['source', 'zone'],
  registers: [register]
});

const renewableRatio = new client.Gauge({
  name: 'greenops_renewable_energy_ratio',
  help: 'Ratio of renewable energy (0-1)',
  labelNames: ['zone'],
  registers: [register]
});

const alertsTriggered = new client.Counter({
  name: 'greenops_alerts_triggered_total',
  help: 'Total alerts triggered',
  labelNames: ['severity', 'type'],
  registers: [register]
});

const energySaved = new client.Gauge({
  name: 'greenops_energy_saved_kwh',
  help: 'Total energy saved through optimizations',
  registers: [register]
});

function seedMetrics() {
  const zones = ['zone-a', 'zone-b', 'zone-c'];
  const sources = ['solar', 'wind', 'grid', 'hydro'];
  zones.forEach(zone => {
    sources.forEach(source => {
      energyConsumption.set({ source, zone }, Math.random() * 500 + 100);
      carbonEmissions.set({ source, zone }, Math.random() * 200 + 50);
    });
    renewableRatio.set({ zone }, Math.random() * 0.6 + 0.3);
  });
  energySaved.set(Math.random() * 10000 + 5000);
}

seedMetrics();
setInterval(seedMetrics, 30000);

async function initMetricsDB() {
  const c = await pool.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS energy_metrics (
        id SERIAL PRIMARY KEY,
        source VARCHAR(100) NOT NULL,
        zone VARCHAR(100) NOT NULL,
        value_kwh NUMERIC(10,3) NOT NULL,
        carbon_gco2 NUMERIC(10,3),
        renewable_ratio NUMERIC(5,4),
        recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        type VARCHAR(100) NOT NULL,
        severity VARCHAR(50) NOT NULL DEFAULT 'warning',
        message TEXT NOT NULL,
        threshold_value NUMERIC(10,3),
        current_value NUMERIC(10,3),
        zone VARCHAR(100),
        source VARCHAR(100),
        resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await c.query(`
      INSERT INTO alerts (type, severity, message, threshold_value, current_value, zone)
      VALUES
        ('high_consumption', 'warning', 'Energy consumption exceeds threshold in Zone A', 400, 487.3, 'zone-a'),
        ('low_renewable', 'critical', 'Renewable energy ratio below 30% in Zone B', 0.3, 0.18, 'zone-b'),
        ('carbon_spike', 'warning', 'Carbon emissions spike detected in Zone C', 150, 198.7, 'zone-c')
      ON CONFLICT DO NOTHING;
    `);
    logger.info('Metrics DB initialized');
  } finally {
    c.release();
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'greenops_jwt_secret_change_in_production';

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'metrics-service', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/energy', verifyToken, async (req, res) => {
  try {
    const cacheKey = 'metrics:energy:latest';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json({ source: 'cache', data: JSON.parse(cached) });
    }
    const zones = ['zone-a', 'zone-b', 'zone-c'];
    const sources = ['solar', 'wind', 'grid', 'hydro'];
    const data = zones.flatMap(zone =>
      sources.map(source => ({
        zone,
        source,
        value_kwh: parseFloat((Math.random() * 500 + 100).toFixed(3)),
        carbon_gco2: parseFloat((Math.random() * 200 + 50).toFixed(3)),
        renewable_ratio: parseFloat((Math.random() * 0.6 + 0.3).toFixed(4)),
        recorded_at: new Date().toISOString()
      }))
    );
    await redisClient.setEx(cacheKey, 30, JSON.stringify(data));
    res.json({ source: 'live', data });
  } catch (err) {
    logger.error('Energy metrics error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch energy metrics' });
  }
});

app.get('/energy/history', verifyToken, async (req, res) => {
  const { zone, source, limit = 100 } = req.query;
  try {
    const now = Date.now();
    const points = Array.from({ length: Math.min(parseInt(limit), 200) }, (_, i) => ({
      recorded_at: new Date(now - i * 5 * 60 * 1000).toISOString(),
      zone: zone || 'zone-a',
      source: source || 'solar',
      value_kwh: parseFloat((Math.random() * 400 + 50 + Math.sin(i / 10) * 80).toFixed(3)),
      carbon_gco2: parseFloat((Math.random() * 150 + 30).toFixed(3)),
      renewable_ratio: parseFloat((0.4 + Math.sin(i / 8) * 0.2 + Math.random() * 0.1).toFixed(4))
    }));
    res.json({ data: points.reverse() });
  } catch (err) {
    logger.error('History error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.get('/alerts', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error('Alerts fetch error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

app.post('/alerts', verifyToken, async (req, res) => {
  const { type, severity, message, threshold_value, current_value, zone, source } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO alerts (type, severity, message, threshold_value, current_value, zone, source) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [type, severity || 'warning', message, threshold_value, current_value, zone, source]
    );
    alertsTriggered.inc({ severity: severity || 'warning', type });
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    logger.error('Alert creation error', { error: err.message });
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

app.patch('/alerts/:id/resolve', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE alerts SET resolved = true, resolved_at = NOW() WHERE id = $1 RETURNING *',
      [parseInt(id)]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

app.get('/summary', verifyToken, async (req, res) => {
  try {
    const alertCount = await pool.query('SELECT COUNT(*) FROM alerts WHERE resolved = false');
    const data = {
      totalEnergyKwh: parseFloat((Math.random() * 50000 + 20000).toFixed(2)),
      renewableRatio: parseFloat((Math.random() * 0.4 + 0.4).toFixed(4)),
      carbonEmissionsGco2: parseFloat((Math.random() * 5000 + 2000).toFixed(2)),
      energySavedKwh: parseFloat((Math.random() * 10000 + 5000).toFixed(2)),
      activeAlerts: parseInt(alertCount.rows[0].count),
      zones: 3,
      sources: ['solar', 'wind', 'grid', 'hydro']
    };
    res.json({ data });
  } catch (err) {
    logger.error('Summary error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    await initMetricsDB();
    app.listen(PORT, () => {
      logger.info(`Metrics Service running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start', { error: err.message });
    process.exit(1);
  }
}

start();

module.exports = app;
