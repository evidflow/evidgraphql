import pkg from 'pg';
const { Pool } = pkg;
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Analytics Service - Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Analytics Service - Database connection failed:', error.message);
    return false;
  }
};

export const initializeDatabase = async () => {
  try {
    await createAnalyticsTables();
    console.log('✅ Analytics Service - Database initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Analytics Service - Database initialization failed:', error.message);
    return false;
  }
};

async function createAnalyticsTables() {
  try {
    // Analytics events table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER,
        user_id INTEGER,
        event_type VARCHAR(100) NOT NULL,
        event_name VARCHAR(255) NOT NULL,
        properties JSONB DEFAULT '{}',
        user_agent TEXT,
        ip_address INET,
        session_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Page views table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS page_views (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER,
        user_id INTEGER,
        page_path VARCHAR(500) NOT NULL,
        page_title VARCHAR(500),
        referrer VARCHAR(500),
        session_id VARCHAR(255),
        duration_seconds INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Analytics dashboards
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analytics_dashboards (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        widgets JSONB DEFAULT '[]',
        is_public BOOLEAN DEFAULT false,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // User engagement metrics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_engagement (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        organization_id INTEGER NOT NULL,
        date DATE NOT NULL,
        login_count INTEGER DEFAULT 0,
        session_duration INTEGER DEFAULT 0,
        pages_visited INTEGER DEFAULT 0,
        actions_performed INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, organization_id, date)
      )
    `);

    console.log('✅ Analytics tables created successfully');
  } catch (error) {
    console.error('Analytics table creation failed:', error.message);
    throw error;
  }
}

export { pool };
