import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test database connection
pool.on('connect', () => {
    console.log('✅ Notification Service - Database connection successful');
});

pool.on('error', (err) => {
    console.error('❌ Notification Service - Database connection error:', err.message);
});

export async function initDatabase() {
    try {
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Notification Service - Database connection established');
        
        // Initialize notifications table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'info',
                is_read BOOLEAN DEFAULT false,
                read_at TIMESTAMP,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        console.log('✅ Notification Service - Database tables initialized');
        return true;
    } catch (error) {
        console.error('❌ Notification Service - Database initialization failed:', error.message);
        return false;
    }
}
