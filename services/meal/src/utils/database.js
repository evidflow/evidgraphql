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
    console.log('✅ MEAL Service - Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ MEAL Service - Database connection failed:', error.message);
    return false;
  }
};

export const initializeDatabase = async () => {
  try {
    await createMEALTables();
    console.log('✅ MEAL Service - Database initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ MEAL Service - Database initialization failed:', error.message);
    return false;
  }
};

async function createMEALTables() {
  try {
    // MEAL Indicators table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meal_indicators (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        project_id INTEGER,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        indicator_type VARCHAR(100) NOT NULL,
        unit VARCHAR(100),
        target_value DECIMAL,
        baseline_value DECIMAL,
        frequency VARCHAR(50),
        calculation_method VARCHAR(100),
        disaggregation_categories JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indicator Data table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS indicator_data (
        id SERIAL PRIMARY KEY,
        indicator_id INTEGER REFERENCES meal_indicators(id),
        organization_id INTEGER NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        value DECIMAL NOT NULL,
        disaggregation JSONB DEFAULT '{}',
        data_source VARCHAR(255),
        collected_by INTEGER,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        verified_by INTEGER,
        verified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Surveys table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS surveys (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        survey_type VARCHAR(100),
        questions JSONB NOT NULL,
        target_respondents JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'draft',
        start_date DATE,
        end_date DATE,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Survey Responses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS survey_responses (
        id SERIAL PRIMARY KEY,
        survey_id INTEGER REFERENCES surveys(id),
        organization_id INTEGER NOT NULL,
        beneficiary_id INTEGER,
        respondent_info JSONB DEFAULT '{}',
        responses JSONB NOT NULL,
        completed_at TIMESTAMP,
        submitted_by INTEGER,
        status VARCHAR(50) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // MEAL Reports table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meal_reports (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        report_type VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        period_start DATE,
        period_end DATE,
        indicators_data JSONB DEFAULT '{}',
        achievements TEXT,
        challenges TEXT,
        recommendations TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        generated_by INTEGER,
        approved_by INTEGER,
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ MEAL tables created successfully');
  } catch (error) {
    console.error('MEAL table creation failed:', error.message);
    throw error;
  }
}

export { pool };
