import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test database connection
pool.on('connect', () => {
    console.log('✅ Templates Service - Database connection successful');
});

pool.on('error', (err) => {
    console.error('❌ Templates Service - Database connection error:', err.message);
});

export async function initDatabase() {
    try {
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Templates Service - Database connection established');
        
        // Initialize email_templates table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS email_templates (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL,
                name VARCHAR(255) NOT NULL,
                subject VARCHAR(500) NOT NULL,
                content TEXT NOT NULL,
                template_type VARCHAR(50) DEFAULT 'transactional',
                variables JSONB DEFAULT '[]',
                is_active BOOLEAN DEFAULT true,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        console.log('✅ Templates Service - Database tables initialized');
        return true;
    } catch (error) {
        console.error('❌ Templates Service - Database initialization failed:', error.message);
        return false;
    }
}
