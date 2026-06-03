const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'greenops',
  user: process.env.DB_USER || 'greenops',
  password: process.env.DB_PASSWORD || 'greenops_secret',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        success BOOLEAN DEFAULT true,
        details JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    const bcrypt = require('bcryptjs');
    const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@GreenOps2024', 12);
    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name)
      VALUES ($1, $2, 'admin', 'Admin', 'GreenOps')
      ON CONFLICT (email) DO NOTHING;
    `, ['admin@greenops.local', adminPassword]);

    const demoPassword = await bcrypt.hash('Demo@GreenOps2024', 12);
    await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name)
      VALUES ($1, $2, 'user', 'Demo', 'User')
      ON CONFLICT (email) DO NOTHING;
    `, ['demo@greenops.local', demoPassword]);

  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
