import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initializeDatabase, testConnection, pool } from './utils/database.js';
import { hashPassword, verifyPassword, createToken, verifyToken } from './utils/auth.js';
import { kafkaProducer, TOPICS } from './kafka/producer.js';
import KafkaConsumer from './kafka/consumer.js';

const app = express();
const port = process.env.PORT || 4002;

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize Kafka consumer for auth service
const authConsumer = new KafkaConsumer('auth-service');

// Initialize database and Kafka
async function initializeApp() {
  try {
    console.log('🔧 Initializing MEAL Auth Service with Kafka...');
    
    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      console.log('⚠️  Database connection failed, but starting service anyway...');
    } else {
      // Initialize database tables
      await initializeDatabase();
    }
    
    // Initialize Kafka consumer
    await initializeKafkaConsumer();
    
    console.log('✅ MEAL Auth Service with Kafka initialized successfully');
  } catch (error) {
    console.log('❌ MEAL Auth Service initialization failed:', error.message);
  }
}

async function initializeKafkaConsumer() {
  try {
    // Subscribe to organization events for user management
    await authConsumer.subscribe(TOPICS.ORGANIZATION_CREATED, handleOrganizationCreated);
    await authConsumer.subscribe(TOPICS.ORGANIZATION_UPDATED, handleOrganizationUpdated);
    
    // Start consuming messages
    await authConsumer.run();
    console.log('✅ Kafka consumer initialized successfully');
  } catch (error) {
    console.log('❌ Kafka consumer initialization failed:', error.message);
  }
}

async function handleOrganizationCreated(message) {
  console.log('📥 Organization created event received:', message);
}

async function handleOrganizationUpdated(message) {
  console.log('📥 Organization updated event received:', message);
}

// Initialize app
initializeApp().catch(console.error);

// ==================== HEALTH & INFO ENDPOINTS ====================

app.get('/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    
    let userCount = 0;
    let orgCount = 0;
    if (dbConnected) {
      try {
        const userResult = await pool.query('SELECT COUNT(*) FROM users');
        userCount = parseInt(userResult.rows[0].count);
        const orgResult = await pool.query('SELECT COUNT(*) FROM organizations');
        orgCount = parseInt(orgResult.rows[0].count);
      } catch (error) {
        console.log('⚠️  Could not count data:', error.message);
      }
    }
    
    res.json({
      status: dbConnected ? 'healthy' : 'degraded',
      service: 'meal-auth-service',
      database: dbConnected ? 'connected' : 'disconnected',
      kafka: 'connected',
      user_count: userCount,
      organization_count: orgCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'meal-auth-service',
      database: 'disconnected',
      kafka: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: '🔐 EvidFlow MEAL Auth Service with Kafka',
    version: '4.0.0',
    system: 'NGO/MEAL Platform',
    status: 'running',
    endpoints: [
      'GET /health - Health check',
      'POST /auth/register - User registration',
      'POST /auth/login - User login',
      'POST /auth/logout - User logout',
      'GET /auth/me - Get current user',
      'POST /auth/verify-email - Verify email',
      'POST /auth/resend-verification - Resend verification code',
      'POST /auth/forgot-password - Forgot password',
      'POST /auth/reset-password - Reset password',
      'POST /auth/invitations/accept - Accept invitation',
      'GET /auth/invitations/:token - Get invitation details'
    ]
  });
});

// ==================== AUTH MIDDLEWARE ====================

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token required'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    // Verify user still exists
    const userResult = await pool.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

// ==================== AUTH ENDPOINTS ====================

// User registration
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, full_name, organization_name } = req.body;

    if (!email || !password || !full_name || !organization_name) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required: email, password, full_name, organization_name'
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create organization
      const orgSlug = organization_name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const orgResult = await client.query(
        `INSERT INTO organizations (name, slug, tier) 
         VALUES ($1, $2, $3) RETURNING id, name, slug`,
        [organization_name, orgSlug, 'STARTER']
      );
      const organization = orgResult.rows[0];

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, email_verified) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, role, created_at`,
        [email, hashedPassword, full_name, 'ORG_OWNER', false]
      );
      const user = userResult.rows[0];

      // Create organization membership
      await client.query(
        `INSERT INTO organization_memberships (user_id, organization_id, role) 
         VALUES ($1, $2, $3)`,
        [user.id, organization.id, 'ORG_OWNER']
      );

      // Generate verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Store verification code
      await client.query(
        `INSERT INTO email_verifications (email, verification_code, expires_at) 
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [email, verificationCode]
      );

      await client.query('COMMIT');

      // Send Kafka events
      try {
        await kafkaProducer.sendMessage(TOPICS.USER_REGISTERED, {
          user_id: user.id,
          email: user.email,
          full_name: user.full_name,
          organization_id: organization.id
        });

        await kafkaProducer.sendMessage(TOPICS.ORGANIZATION_CREATED, {
          organization_id: organization.id,
          name: organization.name,
          slug: organization.slug,
          owner_id: user.id
        });

        await kafkaProducer.sendMessage(TOPICS.EMAIL_VERIFICATION_REQUESTED, {
          email: user.email,
          verification_code: verificationCode,
          full_name: user.full_name,
          user_id: user.id
        });

      } catch (kafkaError) {
        console.error('Kafka event sending failed:', kafkaError);
      }

      res.json({
        success: true,
        message: 'User registered successfully. Please check your email for verification code.',
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
        },
        verification_code: verificationCode // For testing
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      details: error.message
    });
  }
});

// User login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.email_verified 
       FROM users u WHERE u.email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Get user's organizations
    const orgsResult = await pool.query(
      `SELECT o.id, o.name, o.slug, om.role 
       FROM organizations o 
       JOIN organization_memberships om ON o.id = om.organization_id 
       WHERE om.user_id = $1`,
      [user.id]
    );

    // Create token
    const token = createToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Send Kafka login event
    try {
      await kafkaProducer.sendMessage(TOPICS.USER_LOGIN, {
        user_id: user.id,
        email: user.email,
        timestamp: new Date().toISOString()
      });
    } catch (kafkaError) {
      console.error('Kafka event sending failed:', kafkaError);
    }

    res.json({
      success: true,
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        email_verified: user.email_verified,
        organizations: orgsResult.rows
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      details: error.message
    });
  }
});

// Get current user
app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT id, email, full_name, role, email_verified, created_at 
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user's organizations with membership details
    const orgsResult = await pool.query(
      `SELECT o.id, o.name, o.slug, o.tier, o.description, om.role as membership_role, om.joined_at
       FROM organizations o 
       JOIN organization_memberships om ON o.id = om.organization_id 
       WHERE om.user_id = $1
       ORDER BY om.joined_at DESC`,
      [req.user.id]
    );

    // Get user's invitations
    const invitationsResult = await pool.query(
      `SELECT oi.id, oi.role, oi.created_at, oi.expires_at,
              o.name as organization_name, o.slug as organization_slug,
              u.full_name as invited_by_name
       FROM organization_invitations oi
       JOIN organizations o ON oi.organization_id = o.id
       LEFT JOIN users u ON oi.invited_by = u.id
       WHERE oi.email = $1 AND oi.status = 'pending' AND oi.expires_at > NOW()`,
      [req.user.email]
    );

    res.json({
      success: true,
      user: {
        ...userResult.rows[0],
        organizations: orgsResult.rows,
        pending_invitations: invitationsResult.rows
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information'
    });
  }
});

// Verify email
app.post('/auth/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email and verification code are required'
      });
    }

    // Find verification code
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
        error: 'Invalid or expired verification code'
      });
    }

    const verification = verificationResult.rows[0];

    if (verification.verification_code !== code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    // Update user as verified
    const userResult = await pool.query(
      'UPDATE users SET email_verified = true WHERE email = $1 RETURNING id, email, full_name',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Mark verification code as used
    await pool.query(
      'UPDATE email_verifications SET used_at = NOW() WHERE id = $1',
      [verification.id]
    );

    // Send Kafka events
    try {
      await kafkaProducer.sendMessage(TOPICS.USER_VERIFIED, {
        user_id: user.id,
        email: user.email,
        timestamp: new Date().toISOString()
      });

      await kafkaProducer.sendMessage(TOPICS.EMAIL_WELCOME_REQUESTED, {
        email: user.email,
        full_name: user.full_name,
        user_id: user.id
      });
    } catch (kafkaError) {
      console.error('Kafka event sending failed:', kafkaError);
    }

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Email verification failed',
      details: error.message
    });
  }
});

// Resend verification code
app.post('/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Check if user exists and is not verified
    const userResult = await pool.query(
      'SELECT id, full_name, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        error: 'Email is already verified'
      });
    }

    // Generate new verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store new verification code
    await pool.query(
      `INSERT INTO email_verifications (email, verification_code, expires_at) 
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [email, verificationCode]
    );

    // Send Kafka event for email verification
    try {
      await kafkaProducer.sendMessage(TOPICS.EMAIL_VERIFICATION_REQUESTED, {
        email: user.email,
        verification_code: verificationCode,
        full_name: user.full_name,
        user_id: user.id
      });
    } catch (kafkaError) {
      console.error('Kafka event sending failed:', kafkaError);
    }

    res.json({
      success: true,
      message: 'Verification code sent successfully',
      verification_code: verificationCode // For testing
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend verification code',
      details: error.message
    });
  }
});

// Forgot password
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, full_name FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal whether email exists or not
      return res.json({
        success: true,
        message: 'If the email exists, a password reset code has been sent'
      });
    }

    const user = userResult.rows[0];

    // Generate reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store reset code
    await pool.query(
      `INSERT INTO password_resets (email, reset_code, expires_at) 
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [email, resetCode]
    );

    // Send Kafka event for password reset email
    try {
      await kafkaProducer.sendMessage(TOPICS.EMAIL_PASSWORD_RESET_REQUESTED, {
        email: user.email,
        reset_code: resetCode,
        full_name: user.full_name,
        user_id: user.id
      });
    } catch (kafkaError) {
      console.error('Kafka event sending failed:', kafkaError);
    }

    res.json({
      success: true,
      message: 'If the email exists, a password reset code has been sent',
      reset_code: resetCode // For testing
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset request',
      details: error.message
    });
  }
});

// Reset password
app.post('/auth/reset-password', async (req, res) => {
  try {
    const { email, code, new_password } = req.body;

    if (!email || !code || !new_password) {
      return res.status(400).json({
        success: false,
        error: 'Email, reset code, and new password are required'
      });
    }

    // Find reset code
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
        error: 'Invalid or expired reset code'
      });
    }

    const reset = resetResult.rows[0];

    if (reset.reset_code !== code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reset code'
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(new_password);

    // Update user password
    const userResult = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
      [hashedPassword, email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Mark reset code as used
    await pool.query(
      'UPDATE password_resets SET used_at = NOW() WHERE id = $1',
      [reset.id]
    );

    // Send Kafka event for password reset
    try {
      await kafkaProducer.sendMessage(TOPICS.USER_PASSWORD_RESET, {
        user_id: user.id,
        email: email,
        timestamp: new Date().toISOString()
      });
    } catch (kafkaError) {
      console.error('Kafka event sending failed:', kafkaError);
    }

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password',
      details: error.message
    });
  }
});

// Get invitation details
app.get('/auth/invitations/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find invitation
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
        error: 'Invalid or expired invitation'
      });
    }

    const invitation = invitationResult.rows[0];

    res.json({
      success: true,
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
    });

  } catch (error) {
    console.error('Get invitation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get invitation details'
    });
  }
});

// Accept invitation
app.post('/auth/invitations/accept', async (req, res) => {
  try {
    const { token, password, full_name } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Invitation token and password are required'
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
        error: 'Invalid or expired invitation'
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
        // User exists, use existing user ID
        userId = existingUser.rows[0].id;
        
        // Update user info if provided
        if (full_name) {
          await client.query(
            'UPDATE users SET full_name = $1 WHERE id = $2',
            [full_name, userId]
          );
        }
      } else {
        // Create new user
        const userResult = await client.query(
          `INSERT INTO users (email, password_hash, full_name, role, email_verified) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [invitation.email, hashedPassword, full_name || invitation.email, invitation.role, true]
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
      try {
        await kafkaProducer.sendMessage(TOPICS.ORGANIZATION_INVITATION_ACCEPTED, {
          invitation_id: invitation.id,
          user_id: userId,
          organization_id: invitation.organization_id,
          role: invitation.role,
          invited_by: invitation.invited_by
        });

        // If new user was created, send user registered event
        if (existingUser.rows.length === 0) {
          await kafkaProducer.sendMessage(TOPICS.USER_REGISTERED, {
            user_id: userId,
            email: invitation.email,
            full_name: full_name || invitation.email,
            organization_id: invitation.organization_id,
            via_invitation: true
          });
        }

      } catch (kafkaError) {
        console.error('Kafka event sending failed:', kafkaError);
      }

      res.json({
        success: true,
        message: 'Invitation accepted successfully',
        organization: {
          id: invitation.organization_id,
          name: invitation.organization_name
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
      details: error.message
    });
  }
});

// Update user profile
app.put('/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { full_name, current_password, new_password } = req.body;

    if (!full_name && !current_password && !new_password) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update provided'
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
        // Verify current password
        const userResult = await client.query(
          'SELECT password_hash FROM users WHERE id = $1',
          [req.user.id]
        );

        if (userResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        const validPassword = await verifyPassword(current_password, userResult.rows[0].password_hash);
        if (!validPassword) {
          return res.status(400).json({
            success: false,
            error: 'Current password is incorrect'
          });
        }

        const hashedPassword = await hashPassword(new_password);
        updateFields.push(`password_hash = $${paramCount}`);
        updateValues.push(hashedPassword);
        paramCount++;
      } else if ((current_password && !new_password) || (!current_password && new_password)) {
        return res.status(400).json({
          success: false,
          error: 'Both current password and new password are required to change password'
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
        user: result.rows[0]
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
      details: error.message
    });
  }
});

// Logout
app.post('/auth/logout', authenticateToken, (req, res) => {
  // In a stateless JWT system, logout is handled client-side by removing the token
  // We could implement a token blacklist here if needed
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// Start server
app.listen(port, () => {
  console.log(`🔐 MEAL Auth Service with Kafka running on port ${port}`);
  console.log(`🏥 Health: http://localhost:${port}/health`);
  console.log(`🔑 Available endpoints:`);
  console.log(`   POST /auth/register - User registration`);
  console.log(`   POST /auth/login - User login`);
  console.log(`   GET /auth/me - Get current user`);
  console.log(`   POST /auth/verify-email - Verify email`);
  console.log(`   POST /auth/resend-verification - Resend verification`);
  console.log(`   POST /auth/forgot-password - Forgot password`);
  console.log(`   POST /auth/reset-password - Reset password`);
  console.log(`   GET /auth/invitations/:token - Get invitation details`);
  console.log(`   POST /auth/invitations/accept - Accept invitation`);
  console.log(`   PUT /auth/profile - Update profile`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await kafkaProducer.disconnect();
  await authConsumer.disconnect();
  process.exit(0);
});
EOF