import pkg from 'pg';
const { Pool } = pkg;
import 'dotenv/config';

// Parse the Aiven connection string
const connectionString = process.env.DATABASE_URL?.replace('+asyncpg', '') || 'postgresql://avnadmin:AVNS_W5hwUrg273IWQquF4J7@pg-19ca8e4a-petergatitu61-111d.e.aivencloud.com:14741/evidflow_db';

const poolConfig = {
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

const pool = new Pool(poolConfig);

export const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Auth Service - Database connection successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.log('❌ Auth Service - Database connection failed:', error.message);
    return false;
  }
};

export const initializeDatabase = async () => {
  try {
    const connected = await testConnection();
    if (connected) {
      console.log('✅ Auth Service - Database initialized successfully');
      
      // Check if tables exist, create if they don't
      await createTablesIfNotExist();
    }
    return connected;
  } catch (error) {
    console.log('Auth Service - Database initialization failed:', error.message);
    return false;
  }
};

async function createTablesIfNotExist() {
  try {
    // Check if users table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('🔄 Creating auth service database tables...');
      await createTables();
    } else {
      console.log('✅ Auth Service - Database tables already exist');
    }
  } catch (error) {
    console.log('Auth Service - Table check failed:', error.message);
  }
}

async function createTables() {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'ORG_MEMBER',
        email_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create email_verifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        verification_code VARCHAR(10) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create password_resets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        reset_code VARCHAR(10) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Auth Service - All tables created successfully');
  } catch (error) {
    console.log('Auth Service - Table creation failed:', error.message);
    throw error;
  }
}

export { pool };
