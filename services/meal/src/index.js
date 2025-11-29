import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initializeDatabase, testConnection, pool } from './utils/database.js';
import mealRoutes from './routes/mealRoutes.js';
import { kafkaProducer } from './kafka/producer.js';
import { TOPICS } from './kafka/config.js';
import KafkaConsumer from './kafka/consumer.js';

const app = express();
const port = process.env.PORT || 4011;

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json());

// Initialize Kafka consumer
const mealConsumer = new KafkaConsumer('meal-service');

let kafkaInitialized = false;

// Initialize database and Kafka
async function initializeApp() {
  try {
    console.log('🔧 Initializing MEAL Service with Kafka...');
    
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
    
    console.log('✅ MEAL Service initialized successfully');
  } catch (error) {
    console.log('❌ MEAL Service initialization failed:', error.message);
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
    // Subscribe to events for MEAL tracking
    await mealConsumer.subscribe(TOPICS.BENEFICIARY_CREATED, handleBeneficiaryCreated);
    await mealConsumer.subscribe(TOPICS.BENEFICIARY_UPDATED, handleBeneficiaryUpdated);
    
    // Start consuming messages
    await mealConsumer.run();
    console.log('✅ Kafka consumer initialized successfully');
  } catch (error) {
    console.log('❌ Kafka consumer initialization failed:', error.message);
    throw error;
  }
}

async function handleBeneficiaryCreated(message) {
  console.log('📈 MEAL - Beneficiary created:', message);
  // Track beneficiary registration for MEAL indicators
  await sendKafkaEvent(TOPICS.DATA_COLLECTED, {
    indicator_type: 'beneficiary_registration',
    organization_id: message.organization_id,
    value: 1,
    period: new Date().toISOString().split('T')[0].substring(0, 7), // YYYY-MM
    metadata: {
      beneficiary_id: message.beneficiary_id,
      registration_type: 'new'
    }
  });
}

async function handleBeneficiaryUpdated(message) {
  console.log('📈 MEAL - Beneficiary updated:', message);
  // Track beneficiary updates for MEAL indicators
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
      service: 'meal-service',
      database: dbConnected ? 'connected' : 'disconnected',
      kafka: kafkaInitialized ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'meal-service',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: '📈 EvidFlow MEAL Service',
    version: '1.0.0',
    system: 'Monitoring, Evaluation, Accountability, Learning',
    endpoints: [
      'GET /meal/indicators - Get MEAL indicators',
      'POST /meal/indicators - Create indicator',
      'POST /meal/data - Submit indicator data',
      'GET /meal/reports - Generate MEAL reports',
      'POST /meal/surveys - Create survey',
      'POST /meal/surveys/:id/responses - Submit survey response'
    ]
  });
});

// Routes
app.use('/meal', mealRoutes);

app.listen(port, () => {
  console.log(`📈 MEAL Service running on port ${port}`);
  console.log(`🏥 Health: http://localhost:${port}/health`);
});
