import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test database connection
pool.on('connect', () => {
    console.log('✅ Onboarding Service - Database connection successful');
});

pool.on('error', (err) => {
    console.error('❌ Onboarding Service - Database connection error:', err.message);
});

export async function initDatabase() {
    try {
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Onboarding Service - Database connection established');
        
        // Initialize onboarding tables if they don't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS onboarding_steps (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                step_order INTEGER NOT NULL,
                is_active BOOLEAN DEFAULT true,
                required BOOLEAN DEFAULT false,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS onboarding_progress (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                step_id INTEGER NOT NULL,
                completed BOOLEAN DEFAULT false,
                completed_at TIMESTAMP,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(organization_id, user_id, step_id)
            )
        `);
        
        console.log('✅ Onboarding Service - Database tables initialized');
        return true;
    } catch (error) {
        console.error('❌ Onboarding Service - Database initialization failed:', error.message);
        return false;
    }
}
