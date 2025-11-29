import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initializeDatabase, testConnection, pool } from './utils/database.js';
import { kafkaProducer } from './kafka/producer.js';
import { TOPICS } from './kafka/config.js';
import KafkaConsumer from './kafka/consumer.js';

const app = express();
const port = process.env.PORT || 4012;

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json());

// Initialize Kafka consumer
const reportsConsumer = new KafkaConsumer('reports-service');

let kafkaInitialized = false;

// Initialize database and Kafka
async function initializeApp() {
  try {
    console.log('🔧 Initializing Reports Service with Kafka...');
    
    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      console.log('⚠️  Database connection failed, but starting service anyway...');
    } else {
      // Initialize database tables
      await initializeDatabase();
    }
    
    // Initialize Kafka consumer with retry
    initializeKafkaWithRetry().catch(error => {
      console.log('⚠️  Kafka initialization failed, continuing without Kafka:', error.message);
    });
    
    console.log('✅ Reports Service initialized successfully');
  } catch (error) {
    console.log('❌ Reports Service initialization failed:', error.message);
  }
}

async function initializeKafkaWithRetry(retries = 10, delay = 5000) {
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
    // Subscribe to events for reports
    await reportsConsumer.subscribe(TOPICS.BENEFICIARY_DATA_UPDATED, handleBeneficiaryDataUpdated);
    await reportsConsumer.subscribe(TOPICS.INDICATOR_DATA_COLLECTED, handleIndicatorDataCollected);
    
    // Start consuming messages
    await reportsConsumer.run();
    console.log('✅ Kafka consumer initialized successfully');
  } catch (error) {
    console.log('❌ Kafka consumer initialization failed:', error.message);
    throw error;
  }
}

async function handleBeneficiaryDataUpdated(message) {
  console.log('📊 Reports - Beneficiary data updated:', message);
  // Update reports when beneficiary data changes
}

async function handleIndicatorDataCollected(message) {
  console.log('📊 Reports - Indicator data collected:', message);
  // Update reports when new indicator data is available
}

// Helper function to send Kafka events
async function sendKafkaEvent(topic, eventData) {
  if (!kafkaInitialized) {
    console.log('⚠️ Kafka not initialized, skipping event:', topic);
    return false;
  }

  try {
    return await kafkaProducer.send(topic, eventData);
  } catch (error) {
    console.error(`❌ Failed to send Kafka event to ${topic}:`, error.message);
    return false;
  }
}

// Initialize app
initializeApp().catch(console.error);

// Health endpoint
app.get('/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    
    res.json({
      status: dbConnected ? 'healthy' : 'degraded',
      service: 'reports-service',
      database: dbConnected ? 'connected' : 'disconnected',
      kafka: kafkaInitialized ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'reports-service',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: '📊 EvidFlow Reports Service',
    version: '1.0.0',
    endpoints: [
      'GET /reports/templates - Get report templates',
      'POST /reports/templates - Create report template',
      'POST /reports/generate - Generate report',
      'GET /reports/generated - Get generated reports'
    ]
  });
});

// Simple routes for now
app.get('/reports/templates', (req, res) => {
  res.json({
    success: true,
    data: [],
    message: 'Report templates endpoint'
  });
});

app.listen(port, () => {
  console.log(`📊 Reports Service running on port ${port}`);
  console.log(`🏥 Health: http://localhost:${port}/health`);
});
