import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import 'dotenv/config';
import { initializeDatabase, testConnection, pool } from './utils/database.js';
import { 
  hashPassword, 
  verifyPassword, 
  createToken, 
  verifyToken,
  setAuthCookie, 
  clearAuthCookie, 
  getToken
} from './utils/auth.js';
import { kafkaProducer } from './kafka/producer.js';
import { TOPICS } from './kafka/config.js';
import KafkaConsumer from './kafka/consumer.js';

// ==================== ERROR CODES ====================
const ERROR_CODES = {
  AUTH_MISSING_TOKEN: 'AUTH_001',
  AUTH_INVALID_TOKEN: 'AUTH_002',
  AUTH_EXPIRED_TOKEN: 'AUTH_003',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_004',
  AUTH_USER_NOT_FOUND: 'AUTH_005',
  AUTH_ACCOUNT_LOCKED: 'AUTH_006',
  AUTH_ACCOUNT_DEACTIVATED: 'AUTH_007',
  
  VALIDATION_MISSING_FIELDS: 'VAL_001',
  VALIDATION_INVALID_EMAIL: 'VAL_002',
  VALIDATION_WEAK_PASSWORD: 'VAL_003',
  VALIDATION_INVALID_CODE: 'VAL_004',
  VALIDATION_INVALID_TOKEN: 'VAL_005',
  
  BUSINESS_USER_EXISTS: 'BIZ_001',
  BUSINESS_EMAIL_NOT_VERIFIED: 'BIZ_002',
  BUSINESS_INVALID_CREDENTIALS: 'BIZ_003',
  BUSINESS_ORGANIZATION_EXISTS: 'BIZ_004',
  BUSINESS_INVITATION_EXPIRED: 'BIZ_005',
  BUSINESS_INVITATION_ALREADY_USED: 'BIZ_006',
  BUSINESS_INVITATION_NOT_FOUND: 'BIZ_007',
  BUSINESS_ALREADY_MEMBER: 'BIZ_008',
  BUSINESS_VERIFICATION_ALREADY_SENT: 'BIZ_009',
  
  SYSTEM_DATABASE_ERROR: 'SYS_001',
  SYSTEM_KAFKA_ERROR: 'SYS_002',
  SYSTEM_INTERNAL_ERROR: 'SYS_003',
  SYSTEM_RATE_LIMITED: 'SYS_004',
  
  RESOURCE_NOT_FOUND: 'RES_001',
  RESOURCE_ALREADY_EXISTS: 'RES_002',
  RESOURCE_CONFLICT: 'RES_003'
};

const app = express();
const PORT = process.env.PORT || 4002;

// ==================== MIDDLEWARE SETUP ====================

// Cookie parser middleware
app.use(cookieParser());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Only set HSTS in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// CORS configuration - UPDATED FOR BETTER COOKIE SUPPORT
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like curl, mobile apps, etc.)
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',') 
      : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:4002'];
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      console.error(`❌ CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie', 'Set-Cookie'],
  exposedHeaders: ['Set-Cookie', 'Authorization'],
  maxAge: 86400
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Rate limiting
const rateLimitStore = new Map();
const RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000,
  MAX_REQUESTS: 100,
  MAX_AUTH_REQUESTS: 10,
  MAX_VERIFICATION_REQUESTS: 5
};

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const path = req.path;
  const now = Date.now();
  
  let maxRequests = RATE_LIMIT.MAX_REQUESTS;
  if (path.includes('/auth/register') || path.includes('/auth/login')) {
    maxRequests = RATE_LIMIT.MAX_AUTH_REQUESTS;
  } else if (path.includes('/auth/verify') || path.includes('/auth/resend')) {
    maxRequests = RATE_LIMIT.MAX_VERIFICATION_REQUESTS;
  }
  
  const key = `${ip}:${path}`;
  const windowStart = rateLimitStore.get(`${key}_start`) || now;
  const requestCount = rateLimitStore.get(`${key}_count`) || 0;
  
  if (now - windowStart > RATE_LIMIT.WINDOW_MS) {
    rateLimitStore.set(`${key}_start`, now);
    rateLimitStore.set(`${key}_count`, 1);
    next();
  } else {
    const newCount = requestCount + 1;
    rateLimitStore.set(`${key}_count`, newCount);
    
    if (newCount > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later',
        code: ERROR_CODES.SYSTEM_RATE_LIMITED
      });
    }
    next();
  }
});

app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log after response is sent
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// ==================== KAFKA SETUP ====================

const authConsumer = new KafkaConsumer('auth-service');

async function initializeKafkaConsumer() {
  try {
    console.log('🔧 Initializing Kafka consumer for auth service...');
    
    await authConsumer.subscribe(TOPICS.ORGANIZATION_CREATED, handleOrganizationCreated);
    await authConsumer.subscribe(TOPICS.ORGANIZATION_UPDATED, handleOrganizationUpdated);
    
    await authConsumer.run();
    console.log('✅ Kafka consumer initialized successfully');
  } catch (error) {
    console.error('❌ Kafka consumer initialization failed:', error.message);
    setTimeout(initializeKafkaConsumer, 10000);
  }
}

async function handleOrganizationCreated(message) {
  try {
    console.log('📥 Organization created event received:', message);
  } catch (error) {
    console.error('❌ Error handling organization created event:', error);
  }
}

async function handleOrganizationUpdated(message) {
  try {
    console.log('📥 Organization updated event received:', message);
  } catch (error) {
    console.error('❌ Error handling organization updated event:', error);
  }
}

async function sendKafkaEvent(topic, eventData) {
  try {
    if (!kafkaProducer.isConnected) {
      await kafkaProducer.connect();
    }

    await kafkaProducer.send(topic, {
      value: JSON.stringify({
        ...eventData,
        event_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        service: 'auth-service'
      })
    });

    console.log(`✅ Kafka event sent to ${topic}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send Kafka event to ${topic}:`, error.message);
    return false;
  }
}

// ==================== APPLICATION INITIALIZATION ====================

async function initializeApp() {
  try {
    console.log('🚀 Initializing Production Auth Service...');
    
    const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    let dbConnected = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`🔌 Database connection attempt ${attempt}/5...`);
      dbConnected = await testConnection();
      if (dbConnected) break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (!dbConnected) {
      throw new Error('Failed to connect to database after 5 attempts');
    }

    await initializeDatabase();
    console.log('✅ Database initialized successfully');

    // Initialize Kafka if broker is available
    if (process.env.KAFKA_BROKER) {
      await initializeKafkaConsumer();
    } else {
      console.log('⚠️ Kafka broker not configured, skipping Kafka initialization');
    }

    console.log('🎉 Production Auth Service initialized successfully');
    
  } catch (error) {
    console.error('💥 Service initialization failed:', error.message);
    process.exit(1);
  }
}

initializeApp().catch(error => {
  console.error('💥 Fatal error during initialization:', error);
  process.exit(1);
});

// ==================== AUTH MIDDLEWARE ====================

const authenticateToken = async (req, res, next) => {
  try {
    const token = getToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token required',
        code: ERROR_CODES.AUTH_MISSING_TOKEN
      });
    }

    if (token.length < 10) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token format',
        code: ERROR_CODES.AUTH_INVALID_TOKEN
      });
    }

    const decoded = verifyToken(token);
    
    const userResult = await pool.query(
      `SELECT id, email, full_name, role, email_verified, is_active 
       FROM users WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive',
        code: ERROR_CODES.AUTH_USER_NOT_FOUND
      });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    
    const errorCode = error.name === 'TokenExpiredError' 
      ? ERROR_CODES.AUTH_EXPIRED_TOKEN 
      : ERROR_CODES.AUTH_INVALID_TOKEN;
    
    return res.status(401).json({
      success: false,
      error: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      code: errorCode
    });
  }
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: ERROR_CODES.AUTH_MISSING_TOKEN
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS
      });
    }

    next();
  };
};

// ==================== HEALTH & MONITORING ====================

app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'healthy',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  };

  try {
    const dbConnected = await testConnection();
    healthCheck.database = dbConnected ? 'connected' : 'disconnected';
    
    if (!dbConnected) {
      healthCheck.status = 'degraded';
    }

    healthCheck.kafka = kafkaProducer.isConnected ? 'connected' : 'disconnected';
    
    if (!kafkaProducer.isConnected) {
      healthCheck.status = 'degraded';
    }

    const userCount = await pool.query('SELECT COUNT(*) FROM users')
      .then(result => parseInt(result.rows[0].count))
      .catch(() => 0);
    
    healthCheck.metrics = { user_count: userCount };

    const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthCheck);

  } catch (error) {
    healthCheck.status = 'unhealthy';
    healthCheck.error = error.message;
    healthCheck.code = ERROR_CODES.SYSTEM_INTERNAL_ERROR;
    res.status(503).json(healthCheck);
  }
});

// Cookie debugging endpoint
app.get('/auth/debug-cookies', (req, res) => {
  res.json({
    success: true,
    cookies: req.cookies,
    headers: {
      cookie: req.headers.cookie,
      authorization: req.headers.authorization
    }
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'EvidFlow Auth Service',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    status: 'operational',
    cookie_support: 'enabled',
    endpoints: [
      'POST /auth/register - User registration',
      'POST /auth/login - User login',
      'GET /auth/me - Get current user',
      'POST /auth/logout - User logout',
      'POST /auth/verify-email - Verify email',
      'POST /auth/resend-verification - Resend verification',
      'POST /auth/forgot-password - Forgot password',
      'POST /auth/reset-password - Reset password',
      'POST /auth/invitations/send - Send invitation',
      'GET /auth/invitations/:token - Get invitation details',
      'POST /auth/invitations/accept - Accept invitation',
      'PUT /auth/profile - Update profile'
    ]
  });
});

// ==================== AUTH ENDPOINTS ====================

// POST /auth/register - User registration
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, full_name, organization_name } = req.body;

    if (!email || !password || !full_name || !organization_name) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required: email, password, full_name, organization_name',
        code: ERROR_CODES.VALIDATION_MISSING_FIELDS
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        code: ERROR_CODES.VALIDATION_INVALID_EMAIL
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long',
        code: ERROR_CODES.VALIDATION_WEAK_PASSWORD
      });
    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists',
        code: ERROR_CODES.BUSINESS_USER_EXISTS
      });
    }

    const hashedPassword = await hashPassword(password);
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const baseSlug = organization_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const uniqueSlug = `${baseSlug}-${Date.now()}`;

      const orgResult = await client.query(
        `INSERT INTO organizations (name, slug, tier, is_active) 
         VALUES ($1, $2, $3, $4) RETURNING id, name, slug`,
        [organization_name, uniqueSlug, 'STARTER', true]
      );
      const organization = orgResult.rows[0];

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, email_verified, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, full_name, role, created_at`,
        [email, hashedPassword, full_name, 'ORG_OWNER', false, true]
      );
      const user = userResult.rows[0];

      await client.query(
        `INSERT INTO organization_memberships (user_id, organization_id, role) 
         VALUES ($1, $2, $3)`,
        [user.id, organization.id, 'ORG_OWNER']
      );

      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

      await client.query(
        `INSERT INTO email_verifications (email, verification_code, expires_at) 
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [email, verificationCode]
      );

      await client.query('COMMIT');

      await sendKafkaEvent('email.verification.requested', {
        email: user.email,
        full_name: user.full_name,
        verification_code: verificationCode,
        user_id: user.id
      });

      await sendKafkaEvent('user.registered', {
        user_id: user.id,
        email: user.email,
        full_name: user.full_name,
        organization_id: organization.id,
        organization_name: organization.name
      });

      console.log(`✅ User registered: ${user.email}`);

      res.status(201).json({
        success: true,
        message: 'User registered successfully. Please check your email for verification code.',
        data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role
          },
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug
          }
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          error: 'User or organization already exists',
          code: ERROR_CODES.RESOURCE_ALREADY_EXISTS
        });
      }
      
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// POST /auth/login - User login (UPDATED COOKIE SETTINGS)
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
        code: ERROR_CODES.VALIDATION_MISSING_FIELDS
      });
    }

    const userResult = await pool.query(
      `SELECT id, email, password_hash, full_name, role, 
              email_verified, is_active, login_attempts, locked_until
       FROM users WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: ERROR_CODES.BUSINESS_INVALID_CREDENTIALS
      });
    }

    const user = userResult.rows[0];

    if (user.locked_until && user.locked_until > new Date()) {
      return res.status(423).json({
        success: false,
        error: 'Account temporarily locked due to too many failed attempts',
        code: ERROR_CODES.AUTH_ACCOUNT_LOCKED
      });
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    
    if (!validPassword) {
      const newAttempts = (user.login_attempts || 0) + 1;
      let lockedUntil = null;
      
      if (newAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      }
      
      await pool.query(
        'UPDATE users SET login_attempts = $1, locked_until = $2 WHERE id = $3',
        [newAttempts, lockedUntil, user.id]
      );

      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        code: ERROR_CODES.BUSINESS_INVALID_CREDENTIALS
      });
    }

    await pool.query(
      'UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
      [user.id]
    );

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is deactivated',
        code: ERROR_CODES.AUTH_ACCOUNT_DEACTIVATED
      });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        success: false,
        error: 'Please verify your email before logging in',
        code: ERROR_CODES.BUSINESS_EMAIL_NOT_VERIFIED
      });
    }

    const orgsResult = await pool.query(
      `SELECT o.id, o.name, o.slug, om.role 
       FROM organizations o 
       JOIN organization_memberships om ON o.id = om.organization_id 
       WHERE om.user_id = $1 AND o.is_active = true`,
      [user.id]
    );

    const token = createToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Set cookie with proper settings for curl testing
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
      // Don't set domain for localhost
      ...(isProduction && { domain: '.yourdomain.com' })
    });

    console.log(`✅ Login successful for: ${user.email}`);
    console.log(`🍪 Cookie set for ${user.email}`);

    await sendKafkaEvent('user.login', {
      user_id: user.id,
      email: user.email
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          email_verified: user.email_verified,
          organizations: orgsResult.rows
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// POST /auth/logout - Clear authentication cookie
app.post('/auth/logout', (req, res) => {
  try {
    clearAuthCookie(res);
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// GET /auth/me - Get current user
app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT id, email, full_name, role, email_verified, created_at, last_login
       FROM users WHERE id = $1 AND is_active = true`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: ERROR_CODES.AUTH_USER_NOT_FOUND
      });
    }

    const orgsResult = await pool.query(
      `SELECT o.id, o.name, o.slug, o.tier, om.role as membership_role, om.joined_at
       FROM organizations o 
       JOIN organization_memberships om ON o.id = om.organization_id 
       WHERE om.user_id = $1 AND o.is_active = true
       ORDER BY om.joined_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        user: {
          ...userResult.rows[0],
          organizations: orgsResult.rows
        }
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// POST /auth/verify-email - Verify email
app.post('/auth/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email and verification code are required',
        code: ERROR_CODES.VALIDATION_MISSING_FIELDS
      });
    }

    const verificationResult = await pool.query(
      `SELECT id, verification_code, expires_at 
       FROM email_verifications 
       WHERE email = $1 AND expires_at > NOW() AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    );

    if (verificationResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification code',
        code: ERROR_CODES.VALIDATION_INVALID_CODE
      });
    }

    const verification = verificationResult.rows[0];

    if (verification.verification_code !== code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code',
        code: ERROR_CODES.VALIDATION_INVALID_CODE
      });
    }

    const userResult = await pool.query(
      'UPDATE users SET email_verified = true WHERE email = $1 RETURNING id, email, full_name',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: ERROR_CODES.AUTH_USER_NOT_FOUND
      });
    }

    const user = userResult.rows[0];

    await pool.query(
      'UPDATE email_verifications SET used_at = NOW() WHERE id = $1',
      [verification.id]
    );

    await sendKafkaEvent('user.email.verified', {
      user_id: user.id,
      email: user.email
    });

    await sendKafkaEvent('email.welcome.requested', {
      email: user.email,
      full_name: user.full_name,
      user_id: user.id
    });

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Email verification failed',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// POST /auth/resend-verification - Resend verification
app.post('/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
        code: ERROR_CODES.VALIDATION_MISSING_FIELDS
      });
    }

    const userResult = await pool.query(
      'SELECT id, full_name, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: ERROR_CODES.AUTH_USER_NOT_FOUND
      });
    }

    const user = userResult.rows[0];

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified',
        code: ERROR_CODES.BUSINESS_EMAIL_NOT_VERIFIED
      });
    }

    // Check if verification was recently sent
    const recentVerification = await pool.query(
      `SELECT id FROM email_verifications 
       WHERE email = $1 AND created_at > NOW() - INTERVAL '2 minutes' AND used_at IS NULL`,
      [email]
    );

    if (recentVerification.rows.length > 0) {
      return res.status(429).json({
        success: false,
        error: 'Verification code already sent recently. Please wait before requesting another.',
        code: ERROR_CODES.BUSINESS_VERIFICATION_ALREADY_SENT
      });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      `INSERT INTO email_verifications (email, verification_code, expires_at) 
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [email, verificationCode]
    );

    await sendKafkaEvent('email.verification.requested', {
      email: user.email,
      verification_code: verificationCode,
      full_name: user.full_name,
      user_id: user.id,
      is_resend: true
    });

    res.json({
      success: true,
      message: 'Verification code sent successfully'
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend verification code',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// POST /auth/forgot-password - Forgot password
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
        code: ERROR_CODES.VALIDATION_MISSING_FIELDS
      });
    }

    const userResult = await pool.query(
      'SELECT id, full_name FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal whether email exists
      return res.json({
        success: true,
        message: 'If the email exists, a password reset code has been sent'
      });
    }

    const user = userResult.rows[0];

    // Check if reset was recently requested
    const recentReset = await pool.query(
      `SELECT id FROM password_resets 
       WHERE email = $1 AND created_at > NOW() - INTERVAL '5 minutes' AND used_at IS NULL`,
      [email]
    );

    if (recentReset.rows.length > 0) {
      return res.status(429).json({
        success: false,
        error: 'Password reset already requested recently. Please check your email or wait before requesting another.',
        code: ERROR_CODES.SYSTEM_RATE_LIMITED
      });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      `INSERT INTO password_resets (email, reset_code, expires_at) 
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [email, resetCode]
    );

    await sendKafkaEvent('email.password-reset.requested', {
      email: user.email,
      reset_code: resetCode,
      full_name: user.full_name,
      user_id: user.id
    });

    res.json({
      success: true,
      message: 'If the email exists, a password reset code has been sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset request',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// POST /auth/reset-password - Reset password
app.post('/auth/reset-password', async (req, res) => {
  try {
    const { email, code, new_password } = req.body;

    if (!email || !code || !new_password) {
      return res.status(400).json({
        success: false,
        error: 'Email, reset code, and new password are required',
        code: ERROR_CODES.VALIDATION_MISSING_FIELDS
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long',
        code: ERROR_CODES.VALIDATION_WEAK_PASSWORD
      });
    }

    const resetResult = await pool.query(
      `SELECT id, reset_code, expires_at 
       FROM password_resets 
       WHERE email = $1 AND expires_at > NOW() AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    );

    if (resetResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset code',
        code: ERROR_CODES.VALIDATION_INVALID_CODE
      });
    }

    const reset = resetResult.rows[0];

    if (reset.reset_code !== code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reset code',
        code: ERROR_CODES.VALIDATION_INVALID_CODE
      });
    }

    const hashedPassword = await hashPassword(new_password);

    const userResult = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
      [hashedPassword, email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: ERROR_CODES.AUTH_USER_NOT_FOUND
      });
    }

    const user = userResult.rows[0];

    await pool.query(
      'UPDATE password_resets SET used_at = NOW() WHERE id = $1',
      [reset.id]
    );

    await sendKafkaEvent('user.password.reset', {
      user_id: user.id,
      email: email
    });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// POST /auth/invitations/send - Send invitation
app.post('/auth/invitations/send', authenticateToken, requireRole(['ORG_OWNER', 'ORG_ADMIN']), async (req, res) => {
  try {
    const { email, organization_id, role = 'ORG_MEMBER' } = req.body;

    if (!email || !organization_id) {
      return res.status(400).json({
        success: false,
        error: 'Email and organization_id are required',
        code: ERROR_CODES.VALIDATION_MISSING_FIELDS
      });
    }

    // Validate organization membership and permissions
    const membershipResult = await pool.query(
      `SELECT role FROM organization_memberships 
       WHERE user_id = $1 AND organization_id = $2`,
      [req.user.id, organization_id]
    );

    if (membershipResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this organization',
        code: ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS
      });
    }

    const userRole = membershipResult.rows[0].role;
    if (!['ORG_OWNER', 'ORG_ADMIN'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Only organization owners and admins can send invitations',
        code: ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS
      });
    }

    // Get organization details
    const orgResult = await pool.query(
      'SELECT name, slug FROM organizations WHERE id = $1',
      [organization_id]
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found',
        code: ERROR_CODES.RESOURCE_NOT_FOUND
      });
    }

    const organization = orgResult.rows[0];

    // Check if user is already a member
    const existingMember = await pool.query(
      `SELECT u.id FROM users u
       JOIN organization_memberships om ON u.id = om.user_id
       WHERE u.email = $1 AND om.organization_id = $2`,
      [email, organization_id]
    );

    if (existingMember.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'User is already a member of this organization',
        code: ERROR_CODES.BUSINESS_ALREADY_MEMBER
      });
    }

    // Generate unique invitation token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create invitation
      const invitationResult = await client.query(
        `INSERT INTO organization_invitations 
         (email, role, invited_by, organization_id, token, expires_at) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, email, role, token, expires_at, created_at`,
        [email, role, req.user.id, organization_id, token, expiresAt]
      );

      const invitation = invitationResult.rows[0];

      await client.query('COMMIT');

      // Send invitation email
      const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invitations/accept?token=${token}`;
      
      await sendKafkaEvent('email.invitation.requested', {
        email: invitation.email,
        inviter_name: req.user.full_name || req.user.email,
        organization_name: organization.name,
        role: invitation.role,
        invitation_link: invitationLink,
        expires_at: invitation.expires_at
      });

      res.json({
        success: true,
        message: 'Invitation sent successfully',
        data: {
          invitation: {
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            expires_at: invitation.expires_at
          }
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'Invitation already sent to this email for this organization',
          code: ERROR_CODES.BUSINESS_INVITATION_ALREADY_USED
        });
      }
      
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Send invitation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send invitation',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// GET /auth/invitations/:token - Get invitation details
app.get('/auth/invitations/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const invitationResult = await pool.query(
      `SELECT oi.*, o.name as organization_name, o.slug as organization_slug,
              u.full_name as invited_by_name, u.email as invited_by_email
       FROM organization_invitations oi
       JOIN organizations o ON oi.organization_id = o.id
       LEFT JOIN users u ON oi.invited_by = u.id
       WHERE oi.token = $1 AND oi.expires_at > NOW() AND oi.status = 'pending'`,
      [token]
    );

    if (invitationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or expired invitation',
        code: ERROR_CODES.BUSINESS_INVITATION_NOT_FOUND
      });
    }

    const invitation = invitationResult.rows[0];

    res.json({
      success: true,
      data: {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          organization: {
            id: invitation.organization_id,
            name: invitation.organization_name,
            slug: invitation.organization_slug
          },
          invited_by: {
            name: invitation.invited_by_name,
            email: invitation.invited_by_email
          },
          expires_at: invitation.expires_at,
          created_at: invitation.created_at
        }
      }
    });

  } catch (error) {
    console.error('Get invitation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get invitation details',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// POST /auth/invitations/accept - Accept invitation
app.post('/auth/invitations/accept', async (req, res) => {
  try {
    const { token, password, full_name } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Invitation token and password are required',
        code: ERROR_CODES.VALIDATION_MISSING_FIELDS
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long',
        code: ERROR_CODES.VALIDATION_WEAK_PASSWORD
      });
    }

    // Find invitation
    const invitationResult = await pool.query(
      `SELECT oi.*, o.name as organization_name 
       FROM organization_invitations oi
       JOIN organizations o ON oi.organization_id = o.id
       WHERE oi.token = $1 AND oi.expires_at > NOW() AND oi.status = 'pending'`,
      [token]
    );

    if (invitationResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired invitation',
        code: ERROR_CODES.BUSINESS_INVITATION_EXPIRED
      });
    }

    const invitation = invitationResult.rows[0];

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if user already exists
      let userId;
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [invitation.email]
      );

      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
        
        // Update user info if provided
        if (full_name) {
          await client.query(
            'UPDATE users SET full_name = $1 WHERE id = $2',
            [full_name, userId]
          );
        }

        // Check if user is already a member
        const existingMembership = await client.query(
          'SELECT id FROM organization_memberships WHERE user_id = $1 AND organization_id = $2',
          [userId, invitation.organization_id]
        );

        if (existingMembership.rows.length > 0) {
          return res.status(409).json({
            success: false,
            error: 'You are already a member of this organization',
            code: ERROR_CODES.BUSINESS_ALREADY_MEMBER
          });
        }
      } else {
        // Create new user
        const userResult = await client.query(
          `INSERT INTO users (email, password_hash, full_name, role, email_verified, is_active) 
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [invitation.email, hashedPassword, full_name || invitation.email, invitation.role, true, true]
        );
        userId = userResult.rows[0].id;
      }

      // Create organization membership
      await client.query(
        `INSERT INTO organization_memberships (user_id, organization_id, role, invited_by) 
         VALUES ($1, $2, $3, $4)`,
        [userId, invitation.organization_id, invitation.role, invitation.invited_by]
      );

      // Update invitation status
      await client.query(
        'UPDATE organization_invitations SET status = $1, accepted_at = NOW() WHERE id = $2',
        ['accepted', invitation.id]
      );

      await client.query('COMMIT');

      // Send Kafka events
      await sendKafkaEvent('organization.invitation.accepted', {
        invitation_id: invitation.id,
        user_id: userId,
        organization_id: invitation.organization_id,
        role: invitation.role,
        invited_by: invitation.invited_by
      });

      // If new user was created
      if (existingUser.rows.length === 0) {
        await sendKafkaEvent('user.registered', {
          user_id: userId,
          email: invitation.email,
          full_name: full_name || invitation.email,
          organization_id: invitation.organization_id,
          via_invitation: true
        });

        await sendKafkaEvent('email.welcome.requested', {
          email: invitation.email,
          full_name: full_name || invitation.email,
          user_id: userId
        });
      }

      res.json({
        success: true,
        message: 'Invitation accepted successfully',
        data: {
          organization: {
            id: invitation.organization_id,
            name: invitation.organization_name
          }
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to accept invitation',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// PUT /auth/profile - Update profile
app.put('/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { full_name, current_password, new_password } = req.body;

    if (!full_name && !current_password && !new_password) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update provided',
        code: ERROR_CODES.VALIDATION_MISSING_FIELDS
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let updateFields = [];
      let updateValues = [];
      let paramCount = 1;

      // Update full name if provided
      if (full_name) {
        updateFields.push(`full_name = $${paramCount}`);
        updateValues.push(full_name);
        paramCount++;
      }

      // Update password if provided
      if (current_password && new_password) {
        if (new_password.length < 8) {
          return res.status(400).json({
            success: false,
            error: 'New password must be at least 8 characters long',
            code: ERROR_CODES.VALIDATION_WEAK_PASSWORD
          });
        }

        // Verify current password
        const userResult = await client.query(
          'SELECT password_hash FROM users WHERE id = $1',
          [req.user.id]
        );

        if (userResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'User not found',
            code: ERROR_CODES.AUTH_USER_NOT_FOUND
          });
        }

        const validPassword = await verifyPassword(current_password, userResult.rows[0].password_hash);
        if (!validPassword) {
          return res.status(400).json({
            success: false,
            error: 'Current password is incorrect',
            code: ERROR_CODES.BUSINESS_INVALID_CREDENTIALS
          });
        }

        const hashedPassword = await hashPassword(new_password);
        updateFields.push(`password_hash = $${paramCount}`);
        updateValues.push(hashedPassword);
        paramCount++;
      } else if ((current_password && !new_password) || (!current_password && new_password)) {
        return res.status(400).json({
          success: false,
          error: 'Both current password and new password are required to change password',
          code: ERROR_CODES.VALIDATION_MISSING_FIELDS
        });
      }

      // Add updated_at timestamp
      updateFields.push(`updated_at = $${paramCount}`);
      updateValues.push(new Date());
      paramCount++;

      // Add user ID
      updateValues.push(req.user.id);

      // Perform update
      const result = await client.query(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING id, email, full_name, role, email_verified`,
        updateValues
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: result.rows[0]
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      code: ERROR_CODES.SYSTEM_INTERNAL_ERROR
    });
  }
});

// ==================== ERROR HANDLING ====================

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'ENDPOINT_NOT_FOUND'
  });
});

app.use((error, req, res, next) => {
  console.error('💥 Unhandled error:', error);
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(500).json({
    success: false,
    error: isProduction ? 'Internal server error' : error.message,
    code: ERROR_CODES.SYSTEM_INTERNAL_ERROR,
    ...(!isProduction && { stack: error.stack })
  });
});

// ==================== SERVER STARTUP ====================

app.listen(PORT, () => {
  console.log(`
  🔐 Production Auth Service
  📍 Port: ${PORT}
  🏥 Health: http://localhost:${PORT}/health
  🌐 Environment: ${process.env.NODE_ENV || 'development'}
  🍪 Cookie Auth: Enabled
  🔑 Available endpoints:
     POST /auth/register - User registration
     POST /auth/login - User login (sets cookie)
     POST /auth/logout - User logout (clears cookie)
     GET /auth/me - Get current user
     POST /auth/verify-email - Verify email
     POST /auth/resend-verification - Resend verification
     POST /auth/forgot-password - Forgot password
     POST /auth/reset-password - Reset password
     POST /auth/invitations/send - Send invitation
     GET /auth/invitations/:token - Get invitation details
     POST /auth/invitations/accept - Accept invitation
     PUT /auth/profile - Update profile
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  try {
    await kafkaProducer.disconnect();
    await authConsumer.disconnect();
    await pool.end();
    console.log('✅ Resources cleaned up successfully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  } finally {
    process.exit(0);
  }
});

export { ERROR_CODES };
