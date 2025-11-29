import express from 'express';
import cors from 'cors';
import { initDatabase, pool } from './utils/database.js';
import notificationRoutes from './routes/notificationRoutes.js';

const app = express();
const PORT = process.env.PORT || 4009;

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
        service: 'notification-service',
        timestamp: new Date().toISOString(),
        database: pool ? 'connected' : 'disconnected'
    });
});

// Routes
app.use('/notifications', notificationRoutes);

// Initialize and start server
async function startServer() {
    try {
        console.log('🔧 Initializing Notification Service...');
        
        // Initialize database
        const dbInitialized = await initDatabase();
        if (!dbInitialized) {
            console.log('⚠️ Notification Service - Starting without database connection');
        }
        
        app.listen(PORT, () => {
            console.log(`🔔 Notification Service running on port ${PORT}`);
            console.log(`🏥 Health: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('❌ Failed to start Notification Service:', error.message);
        process.exit(1);
    }
}

startServer();
