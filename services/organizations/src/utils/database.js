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
    console.log('✅ Organizations Service - Database connection successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.log('❌ Organizations Service - Database connection failed:', error.message);
    return false;
  }
};

export const initializeDatabase = async () => {
  try {
    const connected = await testConnection();
    if (connected) {
      console.log('✅ Organizations Service - Database initialized successfully');
      await createTablesIfNotExist();
    }
    return connected;
  } catch (error) {
    console.log('Organizations Service - Database initialization failed:', error.message);
    return false;
  }
};

async function createTablesIfNotExist() {
  try {
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'organizations'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('🔄 Creating organizations service database tables...');
      await createTables();
    } else {
      console.log('✅ Organizations Service - Database tables already exist');
      // Ensure the enum type has the correct values
      await ensureEnumValues();
    }
  } catch (error) {
    console.log('Organizations Service - Table check failed:', error.message);
  }
}

async function ensureEnumValues() {
  try {
    // Check if organization_tier enum exists and has correct values
    await pool.query(`
      DO $$ 
      BEGIN 
        -- Create enum type if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_tier') THEN
          CREATE TYPE organization_tier AS ENUM ('STARTER', 'PRO', 'ENTERPRISE');
        ELSE
          -- Add missing enum values if they don't exist
          IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'organization_tier'::regtype AND enumlabel = 'STARTER') THEN
            ALTER TYPE organization_tier ADD VALUE 'STARTER';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'organization_tier'::regtype AND enumlabel = 'PRO') THEN
            ALTER TYPE organization_tier ADD VALUE 'PRO';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'organization_tier'::regtype AND enumlabel = 'ENTERPRISE') THEN
            ALTER TYPE organization_tier ADD VALUE 'ENTERPRISE';
          END IF;
        END IF;
      END $$;
    `);
    console.log('✅ Organization tier enum values verified');
  } catch (error) {
    console.log('Enum verification failed:', error.message);
  }
}

async function createTables() {
  try {
    // First create the enum type
    await pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_tier') THEN
          CREATE TYPE organization_tier AS ENUM ('STARTER', 'PRO', 'ENTERPRISE');
        END IF;
      END $$;
    `);

    // Create organizations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        tier organization_tier DEFAULT 'STARTER',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create organization_memberships table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organization_memberships (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        organization_id INTEGER REFERENCES organizations(id),
        role VARCHAR(50) DEFAULT 'ORG_MEMBER',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, organization_id)
      );
    `);

    // Create organization_invitations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organization_invitations (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        invited_by INTEGER NOT NULL,
        organization_id INTEGER REFERENCES organizations(id),
        token VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        expires_at TIMESTAMP NOT NULL,
        accepted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Organizations Service - All tables created successfully');
  } catch (error) {
    console.log('Organizations Service - Table creation failed:', error.message);
    throw error;
  }
}

export { pool };
