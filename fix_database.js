const { pool } = require('./utils/database.js');

async function fixDatabaseSchema() {
  try {
    console.log('🔧 Fixing database schema...');
    
    // Add missing columns to users table
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS last_login TIMESTAMP
    `);
    console.log('✅ Added missing columns to users table');
    
    // Create password_resets table if it doesn't exist
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'password_resets'
    `);
    
    if (tables.rows.length === 0) {
      await pool.query(`
        CREATE TABLE password_resets (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          reset_code VARCHAR(10) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ Created password_resets table');
    }
    
    console.log('🎉 Database schema fixed successfully');
  } catch (error) {
    console.log('Schema already fixed or error:', error.message);
  }
}

fixDatabaseSchema().then(() => process.exit(0));
