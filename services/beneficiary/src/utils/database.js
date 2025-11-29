import pkg from 'pg';
const { Pool } = pkg;
import 'dotenv/config';

// Parse the Aiven connection string and ensure SSL
const connectionString = process.env.DATABASE_URL?.replace('+asyncpg', '') || 'postgresql://avnadmin:AVNS_W5hwUrg273IWQquF4J7@pg-19ca8e4a-petergatitu61-111d.e.aivencloud.com:14741/evidflow_db';

const poolConfig = {
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
    require: true
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
    console.log('✅ Beneficiary Service - Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Beneficiary Service - Database connection failed:', error.message);
    return false;
  }
};

export const initializeDatabase = async () => {
  try {
    await createCustomTables();
    console.log('✅ Beneficiary Service - Database initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Beneficiary Service - Database initialization failed:', error.message);
    return false;
  }
};

async function createCustomTables() {
  try {
    // Core beneficiaries table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS beneficiaries (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_info JSONB,
        age INTEGER,
        gender VARCHAR(50),
        location JSONB,
        demographics JSONB,
        vulnerability_score DECIMAL(5,2) DEFAULT 0.0,
        organization_id INTEGER NOT NULL,
        custom_fields JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Organization custom schemas table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organization_schemas (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL UNIQUE,
        table_name VARCHAR(255) NOT NULL,
        schema_definition JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Custom fields configuration
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_fields (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        field_name VARCHAR(255) NOT NULL,
        field_type VARCHAR(50) NOT NULL,
        field_label VARCHAR(255) NOT NULL,
        required BOOLEAN DEFAULT false,
        options JSONB,
        validation_rules JSONB,
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(organization_id, field_name)
      )
    `);

    console.log('✅ Custom tables created successfully');
  } catch (error) {
    console.error('Table creation failed:', error.message);
    throw error;
  }
}

export { pool };
