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
    console.log('✅ Reports Service - Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Reports Service - Database connection failed:', error.message);
    return false;
  }
};

export const initializeDatabase = async () => {
  try {
    await createReportsTables();
    console.log('✅ Reports Service - Database initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Reports Service - Database initialization failed:', error.message);
    return false;
  }
};

async function createReportsTables() {
  try {
    // Report Templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_templates (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        report_type VARCHAR(100) NOT NULL,
        template_config JSONB NOT NULL,
        data_sources JSONB DEFAULT '[]',
        filters JSONB DEFAULT '{}',
        visualizations JSONB DEFAULT '[]',
        is_public BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Generated Reports table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS generated_reports (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        template_id INTEGER REFERENCES report_templates(id),
        report_name VARCHAR(255) NOT NULL,
        report_type VARCHAR(100) NOT NULL,
        period_start DATE,
        period_end DATE,
        filters_applied JSONB DEFAULT '{}',
        data_snapshot JSONB,
        file_path VARCHAR(500),
        file_format VARCHAR(50),
        file_size INTEGER,
        status VARCHAR(50) DEFAULT 'generating',
        generated_by INTEGER,
        generation_time INTEGER,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    // Report Schedules table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_schedules (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        template_id INTEGER REFERENCES report_templates(id),
        schedule_name VARCHAR(255) NOT NULL,
        frequency VARCHAR(50) NOT NULL,
        recipients JSONB DEFAULT '[]',
        format VARCHAR(50) DEFAULT 'pdf',
        last_run TIMESTAMP,
        next_run TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Reports tables created successfully');
  } catch (error) {
    console.error('Reports table creation failed:', error.message);
    throw error;
  }
}

export { pool };
