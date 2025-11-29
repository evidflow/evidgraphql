import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initializeDatabase, testConnection, pool } from './utils/database.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import { kafkaProducer } from './kafka/producer.js';
import { TOPICS } from './kafka/config.js';
import KafkaConsumer from './kafka/consumer.js';

const app = express();
const port = process.env.PORT || 4010;

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json());

// Initialize Kafka consumer
const analyticsConsumer = new KafkaConsumer('analytics-service');

let kafkaInitialized = false;

// Initialize database and Kafka
async function initializeApp() {
  try {
    console.log('🔧 Initializing Analytics Service with Kafka...');
    
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
    
    console.log('✅ Analytics Service initialized successfully');
  } catch (error) {
    console.log('❌ Analytics Service initialization failed:', error.message);
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
    // Subscribe to events for analytics
    await analyticsConsumer.subscribe(TOPICS.USER_REGISTERED, handleUserRegistered);
    await analyticsConsumer.subscribe(TOPICS.USER_LOGIN, handleUserLogin);
    await analyticsConsumer.subscribe(TOPICS.BENEFICIARY_CREATED, handleBeneficiaryCreated);
    await analyticsConsumer.subscribe(TOPICS.PAYMENT_COMPLETED, handlePaymentCompleted);
    
    // Start consuming messages
    await analyticsConsumer.run();
    console.log('✅ Kafka consumer initialized successfully');
  } catch (error) {
    console.log('❌ Kafka consumer initialization failed:', error.message);
    throw error;
  }
}

async function handleUserRegistered(message) {
  console.log('📊 Analytics - User registered:', message);
  await trackEvent({
    event_type: 'user',
    event_name: 'user_registered',
    user_id: message.user_id,
    organization_id: message.organization_id,
    properties: {
      email: message.email,
      registration_method: message.registration_method
    }
  });
}

async function handleUserLogin(message) {
  console.log('📊 Analytics - User login:', message);
  await trackEvent({
    event_type: 'user',
    event_name: 'user_login',
    user_id: message.user_id,
    properties: {
      login_method: 'email'
    }
  });
}

async function handleBeneficiaryCreated(message) {
  console.log('📊 Analytics - Beneficiary created:', message);
  await trackEvent({
    event_type: 'beneficiary',
    event_name: 'beneficiary_created',
    user_id: message.user_id,
    organization_id: message.organization_id,
    properties: {
      beneficiary_id: message.beneficiary_id,
      custom_fields_count: message.custom_fields_count
    }
  });
}

async function handlePaymentCompleted(message) {
  console.log('📊 Analytics - Payment completed:', message);
  await trackEvent({
    event_type: 'payment',
    event_name: 'payment_completed',
    user_id: message.user_id,
    organization_id: message.organization_id,
    properties: {
      amount: message.amount,
      plan: message.plan,
      payment_method: 'paystack'
    }
  });
}

async function trackEvent(eventData) {
  try {
    await pool.query(
      `INSERT INTO analytics_events 
       (organization_id, user_id, event_type, event_name, properties) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        eventData.organization_id,
        eventData.user_id,
        eventData.event_type,
        eventData.event_name,
        eventData.properties || {}
      ]
    );
  } catch (error) {
    console.error('Error tracking event:', error);
  }
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
      service: 'analytics-service',
      database: dbConnected ? 'connected' : 'disconnected',
      kafka: kafkaInitialized ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'analytics-service',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: '📊 EvidFlow Analytics Service',
    version: '1.0.0',
    endpoints: [
      'POST /analytics/track - Track analytics event',
      'POST /analytics/pageview - Track page view',
      'GET /analytics/dashboard/:orgId - Get analytics dashboard',
      'GET /analytics/reports/:orgId - Generate analytics reports',
      'GET /analytics/events - Get events for organization'
    ]
  });
});

// Routes
app.use('/analytics', analyticsRoutes);

app.listen(port, () => {
  console.log(`📊 Analytics Service running on port ${port}`);
  console.log(`🏥 Health: http://localhost:${port}/health`);
});
