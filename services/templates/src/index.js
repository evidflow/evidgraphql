import express from 'express';
import cors from 'cors';
import { initDatabase, pool } from './utils/database.js';
import templatesRoutes from './routes/templatesRoutes.js';

const app = express();
const PORT = process.env.PORT || 4013;

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
        service: 'templates-service',
        timestamp: new Date().toISOString(),
        database: pool ? 'connected' : 'disconnected'
    });
});

// Routes
app.use('/templates', templatesRoutes);

// Initialize and start server
async function startServer() {
    try {
        console.log('🔧 Initializing Templates Service...');
        
        // Initialize database
        const dbInitialized = await initDatabase();
        if (!dbInitialized) {
            console.log('⚠️ Templates Service - Starting without database connection');
        }
        
        app.listen(PORT, () => {
            console.log(`📝 Templates Service running on port ${PORT}`);
            console.log(`🏥 Health: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('❌ Failed to start Templates Service:', error.message);
        process.exit(1);
    }
}

startServer();
