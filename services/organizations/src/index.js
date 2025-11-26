import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initializeDatabase, testConnection, pool } from './utils/database.js';
import { kafkaProducer } from './kafka/producer.js';
import { TOPICS } from './kafka/config.js';
import KafkaConsumer from './kafka/consumer.js';

const app = express();
const port = process.env.PORT || 4004;

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize Kafka consumer for organizations service
const orgConsumer = new KafkaConsumer('org-service');

let kafkaInitialized = false;

// Initialize database and Kafka
async function initializeApp() {
  try {
    console.log('🔧 Initializing Organizations Service with Kafka...');
    
    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      console.log('⚠️  Database connection failed, but starting service anyway...');
    } else {
      // Initialize database tables
      await initializeDatabase();
    }
    
    // Initialize Kafka consumer with retry
    await initializeKafkaWithRetry();
    
    console.log('✅ Organizations Service with Kafka initialized successfully');
  } catch (error) {
    console.log('❌ Organizations Service initialization failed:', error.message);
  }
}

async function initializeKafkaWithRetry(retries = 5, delay = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔄 Attempting to initialize Kafka (attempt ${attempt}/${retries})...`);
      await initializeKafkaConsumer();
      kafkaInitialized = true;
      console.log('✅ Kafka initialized successfully');
      return;
    } catch (error) {
      console.log(`❌ Kafka initialization failed (attempt ${attempt}/${retries}):`, error.message);
      if (attempt < retries) {
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.log('❌ Max retries reached, starting service without Kafka');
      }
    }
  }
}

async function initializeKafkaConsumer() {
  try {
    // Subscribe to user events
    await orgConsumer.subscribe(TOPICS.USER_REGISTERED, handleUserRegistered);
    await orgConsumer.subscribe(TOPICS.USER_VERIFIED, handleUserVerified);
    
    // Start consuming messages
    await orgConsumer.run();
    console.log('✅ Kafka consumer initialized successfully');
  } catch (error) {
    console.log('❌ Kafka consumer initialization failed:', error.message);
    throw error;
  }
}

async function handleUserRegistered(message) {
  console.log('📥 Organizations service - User registered:', message);
}

async function handleUserVerified(message) {
  console.log('📥 Organizations service - User verified:', message);
}

// Initialize app
initializeApp().catch(console.error);

// ==================== HEALTH & INFO ENDPOINTS ====================

app.get('/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    
    let orgCount = 0;
    if (dbConnected) {
      try {
        const orgResult = await pool.query('SELECT COUNT(*) FROM organizations');
        orgCount = parseInt(orgResult.rows[0].count);
      } catch (error) {
        console.log('⚠️  Could not count organizations:', error.message);
      }
    }
    
    res.json({
      status: dbConnected ? 'healthy' : 'degraded',
      service: 'organizations-service',
      database: dbConnected ? 'connected' : 'disconnected',
      kafka: kafkaInitialized ? 'connected' : 'disconnected',
      organization_count: orgCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'organizations-service',
      database: 'disconnected',
      kafka: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: '🏢 EvidFlow Organizations Service with Kafka',
    version: '3.0.0',
    system: 'NGO/MEAL Platform',
    status: 'running',
    endpoints: [
      'GET /health - Health check',
      'GET /organizations/:id - Get organization',
      'GET /organizations/:id/members - Get organization members',
      'POST /organizations/:id/invite - Invite member'
    ]
  });
});

// ==================== ORGANIZATION ENDPOINTS ====================

// Get organization by ID
app.get('/organizations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT o.*, 
              (SELECT COUNT(*) FROM organization_memberships WHERE organization_id = o.id) as member_count
       FROM organizations o 
       WHERE o.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    res.json({
      success: true,
      organization: result.rows[0]
    });
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organization'
    });
  }
});

// Get organization members
app.get('/organizations/:id/members', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.created_at, om.joined_at, om.role as membership_role
       FROM users u
       JOIN organization_memberships om ON u.id = om.user_id
       WHERE om.organization_id = $1
       ORDER BY om.joined_at DESC`,
      [id]
    );

    res.json({
      success: true,
      members: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get organization members error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organization members'
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🏢 Organizations Service with Kafka running on port ${port}`);
  console.log(`🏥 Health: http://localhost:${port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (kafkaInitialized) {
    await kafkaProducer.disconnect();
    await orgConsumer.disconnect();
  }
  process.exit(0);
});