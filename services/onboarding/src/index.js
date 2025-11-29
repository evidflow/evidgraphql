import express from 'express';
import cors from 'cors';
import { initDatabase, pool } from './utils/database.js';
import onboardingRoutes from './routes/onboardingRoutes.js';

const app = express();
const PORT = process.env.PORT || 4008;

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
        service: 'onboarding-service',
        timestamp: new Date().toISOString(),
        database: pool ? 'connected' : 'disconnected'
    });
});

// Routes
app.use('/onboarding', onboardingRoutes);

// Initialize and start server
async function startServer() {
    try {
        console.log('🔧 Initializing Onboarding Service...');
        
        // Initialize database
        const dbInitialized = await initDatabase();
        if (!dbInitialized) {
            console.log('⚠️ Onboarding Service - Starting without database connection');
        }
        
        app.listen(PORT, () => {
            console.log(`🚀 Onboarding Service running on port ${PORT}`);
            console.log(`🏥 Health: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('❌ Failed to start Onboarding Service:', error.message);
        process.exit(1);
    }
}

startServer();
