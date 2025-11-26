import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { kafkaProducer, TOPICS } from '../../../shared/kafka/producer.js';
import KafkaConsumer from '../../../shared/kafka/consumer.js';

const app = express();
const port = process.env.PORT || 4008;

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:8080'],
  credentials: true
}));

app.use(express.json());

// Initialize Kafka consumer for notification service
const notificationConsumer = new KafkaConsumer('notification-service');

// Initialize Kafka consumer
async function initializeKafkaConsumer() {
  // Subscribe to notification events
  await notificationConsumer.subscribe(TOPICS.NOTIFICATION_CREATED, handleNotification);
  
  // Start consuming messages
  await notificationConsumer.run();
}

async function handleNotification(message) {
  console.log('📥 Processing notification:', message);
  // Implement notification logic (email, push, in-app, etc.)
}

// Initialize the service
initializeKafkaConsumer().catch(console.error);

// Health endpoint
app.get('/health', async (req, res) => {
  res.json({
    status: 'healthy',
    service: 'notification-service',
    kafka: 'connected',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    message: '🔔 EvidFlow Notification Service with Kafka',
    version: '1.0.0',
    status: 'running'
  });
});

// Start server
app.listen(port, () => {
  console.log(`🔔 Notification Service with Kafka running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await notificationConsumer.disconnect();
  process.exit(0);
});
