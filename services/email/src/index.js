import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { KafkaConsumer } from './kafka/consumer.js';
import { 
    handleWelcomeEmail, 
    handleEmailVerification, 
    handleInvitationEmail, 
    handlePasswordResetEmail,
    handleNotificationEmail 
} from './handlers/emailHandlers.js';

const app = express();
const PORT = process.env.PORT || 8010;

// Middleware
app.use(cors());
app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'email-service',
        timestamp: new Date().toISOString()
    });
});

// Test email endpoint
app.post('/test-email', async (req, res) => {
    try {
        const { email, type } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        // Simulate different email types for testing
        const testData = {
            email,
            full_name: 'Test User',
            organization_name: 'Test Organization',
            verification_code: '123456',
            reset_token: 'test-reset-token',
            invitation_token: 'test-invitation-token',
            inviter_name: 'Test Inviter',
            role: 'Admin',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            title: 'Test Notification',
            message: 'This is a test notification from EvidFlow.'
        };

        let handler;
        switch (type) {
            case 'welcome':
                handler = handleWelcomeEmail;
                break;
            case 'verification':
                handler = handleEmailVerification;
                break;
            case 'invitation':
                handler = handleInvitationEmail;
                break;
            case 'password-reset':
                handler = handlePasswordResetEmail;
                break;
            case 'notification':
                handler = handleNotificationEmail;
                break;
            default:
                handler = handleWelcomeEmail;
        }

        await handler(testData);

        res.json({
            success: true,
            message: `Test ${type || 'welcome'} email sent successfully to ${email}`
        });
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send test email'
        });
    }
});

// Kafka consumer initialization
async function initializeKafkaConsumer() {
    try {
        console.log('Initializing Kafka consumer...');
        const consumer = new KafkaConsumer();
        
        // Subscribe to all email topics
        await consumer.subscribe('user.registered', handleWelcomeEmail);
        await consumer.subscribe('email.verification.requested', handleEmailVerification);
        await consumer.subscribe('email.invitation.requested', handleInvitationEmail);
        await consumer.subscribe('password.reset.requested', handlePasswordResetEmail);
        await consumer.subscribe('notification.email.requested', handleNotificationEmail);
        
        await consumer.run();
        console.log('✅ Email Service - Kafka consumer initialized successfully');
        return consumer;
    } catch (error) {
        console.error('❌ Email Service - Kafka consumer initialization failed:', error.message);
        throw error;
    }
}

// Initialize service
async function initializeService() {
    console.log('📧 Email Service with Kafka running on port', PORT);
    
    try {
        await initializeKafkaConsumer();
        console.log('✅ Email Service fully initialized with Resend integration');
        console.log('📨 Available email types: welcome, verification, invitation, password-reset, notification');
        console.log('🧪 Test endpoint: POST http://localhost:' + PORT + '/test-email');
    } catch (error) {
        console.error('❌ Email Service initialization failed:', error.message);
        // Retry after 10 seconds
        setTimeout(initializeService, 10000);
    }
}

// Start server
app.listen(PORT, () => {
    console.log('🏥 Health: http://localhost:' + PORT + '/health');
    initializeService();
});
