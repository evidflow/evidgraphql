import express from 'express';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 4000;
const healthPort = process.env.HEALTH_PORT || 4001;

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:8080'],
  credentials: true
}));

app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'gateway',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    message: '🚀 EvidFlow Gateway Service',
    version: '1.0.0',
    status: 'running',
    services: {
      auth: 'http://localhost:4002',
      organizations: 'http://localhost:4004',
      email: 'http://localhost:8011'
    },
    endpoints: {
      health: 'http://localhost:4001/health',
      graphql: 'http://localhost:4000/graphql'
    }
  });
});

// Start main server
app.listen(port, () => {
  console.log(`🚀 EvidFlow Gateway ready at http://localhost:${port}/`);
});

// Start health server on different port
const healthApp = express();
healthApp.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'gateway-health',
    timestamp: new Date().toISOString()
  });
});

healthApp.listen(healthPort, () => {
  console.log(`🏥 Health server ready at http://localhost:${healthPort}/health`);
});
