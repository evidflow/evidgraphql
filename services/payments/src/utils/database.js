import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test database connection
pool.on('connect', () => {
    console.log('✅ Payments Service - Database connection successful');
});

pool.on('error', (err) => {
    console.error('❌ Payments Service - Database connection error:', err.message);
});

export async function initDatabase() {
    try {
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('✅ Payments Service - Database connection established');
        
        // Initialize payments table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER NOT NULL,
                beneficiary_id INTEGER NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                currency VARCHAR(10) DEFAULT 'KES',
                payment_method VARCHAR(50) DEFAULT 'paystack',
                status VARCHAR(20) DEFAULT 'pending',
                reference_id VARCHAR(100),
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        console.log('✅ Payments Service - Database tables initialized');
        return true;
    } catch (error) {
        console.error('❌ Payments Service - Database initialization failed:', error.message);
        return false;
    }
}
