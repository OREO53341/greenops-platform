const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'greenops_jwt_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '7d';

function generateTokens(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    firstName: user.first_name,
    lastName: user.last_name
  };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
}

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

router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*[0-9])/),
    body('firstName').trim().isLength({ min: 1, max: 100 }),
    body('lastName').trim().isLength({ min: 1, max: 100 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email, password, firstName, lastName } = req.body;
    try {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        'INSERT INTO users (email, password_hash, role, first_name, last_name) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role, first_name, last_name, created_at',
        [email, passwordHash, 'user', firstName, lastName]
      );
      const user = result.rows[0];
      const { accessToken, refreshToken } = generateTokens(user);
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
        [user.id, require('crypto').createHash('sha256').update(refreshToken).digest('hex')]
      );
      req.app.locals.metrics.activeTokens.inc();
      res.status(201).json({
        message: 'User registered successfully',
        user: { id: user.id, email: user.email, role: user.role, firstName: user.first_name, lastName: user.last_name },
        accessToken,
        refreshToken
      });
    } catch (err) {
      req.app.logger.error('Registration error', { error: err.message });
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 1 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        [email]
      );
      if (result.rows.length === 0) {
        req.app.locals.metrics.authAttempts.inc({ status: 'failure' });
        await pool.query(
          'INSERT INTO audit_logs (action, ip_address, success, details) VALUES ($1, $2, $3, $4)',
          ['login', req.ip, false, JSON.stringify({ email, reason: 'user not found' })]
        );
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        req.app.locals.metrics.authAttempts.inc({ status: 'failure' });
        await pool.query(
          'INSERT INTO audit_logs (user_id, action, ip_address, success) VALUES ($1, $2, $3, $4)',
          [user.id, 'login', req.ip, false]
        );
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const { accessToken, refreshToken } = generateTokens(user);
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
        [user.id, require('crypto').createHash('sha256').update(refreshToken).digest('hex')]
      );
      await pool.query(
        'INSERT INTO audit_logs (user_id, action, ip_address, success) VALUES ($1, $2, $3, $4)',
        [user.id, 'login', req.ip, true]
      );
      req.app.locals.metrics.authAttempts.inc({ status: 'success' });
      req.app.locals.metrics.activeTokens.inc();
      res.json({
        message: 'Login successful',
        user: { id: user.id, email: user.email, role: user.role, firstName: user.first_name, lastName: user.last_name },
        accessToken,
        refreshToken
      });
    } catch (err) {
      req.app.logger.error('Login error', { error: err.message });
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });
  try {
    const payload = jwt.verify(refreshToken, JWT_SECRET);
    const tokenHash = require('crypto').createHash('sha256').update(refreshToken).digest('hex');
    const stored = await pool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()',
      [payload.sub, tokenHash]
    );
    if (stored.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [payload.sub]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    const tokens = generateTokens(user);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
      [user.id, require('crypto').createHash('sha256').update(tokens.refreshToken).digest('hex')]
    );
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', verifyToken, async (req, res) => {
  const { refreshToken } = req.body;
  try {
    if (refreshToken) {
      const tokenHash = require('crypto').createHash('sha256').update(refreshToken).digest('hex');
      await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    }
    req.app.locals.metrics.activeTokens.dec();
    res.json({ message: 'Logged out successfully' });
  } catch {
    res.status(500).json({ error: 'Logout failed' });
  }
});

router.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, role, first_name, last_name, created_at FROM users WHERE id = $1',
      [req.user.sub]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    res.json({ id: user.id, email: user.email, role: user.role, firstName: user.first_name, lastName: user.last_name, createdAt: user.created_at });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: payload });
  } catch {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

module.exports = router;
