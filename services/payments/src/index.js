import express from 'express';
import cors from 'cors';
import { initDatabase, pool } from './utils/database.js';
import paymentRoutes from './routes/paymentRoutes.js';

const app = express();
const PORT = process.env.PORT || 4007;

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'payments-service',
        timestamp: new Date().toISOString(),
        database: pool ? 'connected' : 'disconnected'
    });
});

// Routes
app.use('/payments', paymentRoutes);

// Initialize and start server
async function startServer() {
    try {
        console.log('🔧 Initializing Payments Service...');
        
        // Initialize database
        const dbInitialized = await initDatabase();
        if (!dbInitialized) {
            console.log('⚠️ Payments Service - Starting without database connection');
        }
        
        app.listen(PORT, () => {
            console.log(`💳 Payments Service running on port ${PORT}`);
            console.log(`🏥 Health: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('❌ Failed to start Payments Service:', error.message);
        process.exit(1);
    }
}

startServer();
