cat > index_fixed.js << 'EOF'
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { KafkaConsumer } from './kafka/consumer.js';
import { TOPICS } from './kafka/config.js';
import { Resend } from 'resend';

const app = express();
const PORT = process.env.PORT || 8010;

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

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

// Get base URL for invitation links
function getBaseUrl() {
    // Use environment variable or default to production domain
    return process.env.FRONTEND_URL || 'http://api.evidflow.com';
}

// Real email sending function with Resend
async function sendEmail(to, subject, html) {
    try {
        console.log(`📧 Sending email to: ${to}`);
        console.log(`   Subject: ${subject}`);
        
        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'EvidFlow <onboarding@resend.dev>',
            to: [to],
            subject: subject,
            html: html,
        });

        if (error) {
            console.error('❌ Email sending failed:', error);
            return false;
        }

        console.log('✅ Email sent successfully:', data?.id);
        return true;
    } catch (error) {
        console.error('❌ Email sending error:', error);
        return false;
    }
}

// Email handlers - FIXED with correct invitation links
async function handleEmailVerification(data) {
    try {
        console.log('🔐 Handling email verification:', JSON.stringify(data, null, 2));
        
        // Parse the nested value if it exists
        let messageData = data;
        if (data && data.value) {
            try {
                messageData = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            } catch (parseError) {
                console.error('❌ Failed to parse message value:', parseError);
                return;
            }
        }
        
        if (!messageData || !messageData.email) {
            console.error('❌ Invalid email verification data:', messageData);
            return;
        }
        
        const { email, full_name, verification_code } = messageData;
        
        console.log(`📧 Preparing to send verification email to: ${email}`);
        
        const subject = 'Verify Your Email Address';
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
                    .code { background: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; }
                    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to EvidFlow!</h1>
                    </div>
                    <h2>Hello ${full_name},</h2>
                    <p>Thank you for registering with EvidFlow. Please use the following verification code to complete your registration:</p>
                    <div class="code">${verification_code}</div>
                    <p>This code will expire in 24 hours.</p>
                    <p>If you didn't create an account, please ignore this email.</p>
                    <div class="footer">
                        <p>Best regards,<br>The EvidFlow Team</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        console.log(`📨 Sending email to: ${email}`);
        const success = await sendEmail(email, subject, html);
        if (success) {
            console.log('✅ Verification email sent successfully');
        } else {
            console.log('❌ Failed to send verification email');
        }
    } catch (error) {
        console.error('❌ Error in handleEmailVerification:', error);
    }
}

async function handleInvitationEmail(data) {
    try {
        console.log('📨 Handling organization invitation:', JSON.stringify(data, null, 2));
        
        // Parse the nested value if it exists
        let messageData = data;
        if (data && data.value) {
            try {
                messageData = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            } catch (parseError) {
                console.error('❌ Failed to parse message value:', parseError);
                return;
            }
        }
        
        if (!messageData || !messageData.email) {
            console.error('❌ Invalid invitation email data:', messageData);
            return;
        }
        
        const { email, inviter_name, organization_name, role, invitation_token, expires_at } = messageData;
        
        // FIXED: Use the correct domain for invitation links
        const baseUrl = getBaseUrl();
        const invitation_link = `${baseUrl}/invitations/accept?token=${invitation_token}`;
        
        console.log(`📧 Preparing to send invitation email to: ${email}`);
        console.log(`🔗 Using invitation link: ${invitation_link}`);
        
        const subject = `You're invited to join ${organization_name} on EvidFlow`;
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #8B5CF6; color: white; padding: 20px; text-align: center; }
                    .button { background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
                    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
                    .details { background: #f8fafc; padding: 15px; border-radius: 5px; margin: 15px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Organization Invitation</h1>
                    </div>
                    <h2>Hello!</h2>
                    <p><strong>${inviter_name}</strong> has invited you to join <strong>${organization_name}</strong> on EvidFlow.</p>
                    
                    <div class="details">
                        <p><strong>Organization:</strong> ${organization_name}</p>
                        <p><strong>Role:</strong> ${role}</p>
                        <p><strong>Invited by:</strong> ${inviter_name}</p>
                        <p><strong>Expires:</strong> ${new Date(expires_at).toLocaleDateString()}</p>
                    </div>
                    
                    <p>Click the button below to accept this invitation and get started:</p>
                    
                    <a href="${invitation_link}" class="button">Accept Invitation</a>
                    
                    <p>Or copy and paste this link in your browser:</p>
                    <p style="background: #f1f5f9; padding: 10px; border-radius: 3px; word-break: break-all;">
                        ${invitation_link}
                    </p>
                    
                    <p><em>This invitation link will expire on ${new Date(expires_at).toLocaleDateString()}.</em></p>
                    
                    <div class="footer">
                        <p>Best regards,<br>The EvidFlow Team</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        const success = await sendEmail(email, subject, html);
        if (success) {
            console.log('✅ Invitation email sent successfully');
        } else {
            console.log('❌ Failed to send invitation email');
        }
    } catch (error) {
        console.error('❌ Error in handleInvitationEmail:', error);
    }
}

// Other email handlers (welcome, password reset) remain the same...

// Kafka consumer initialization
async function initializeKafkaConsumer() {
    try {
        console.log('Initializing Kafka consumer...');
        const consumer = new KafkaConsumer();
        
        // Subscribe to all email topics
        await consumer.subscribe(TOPICS.EMAIL_VERIFICATION_REQUESTED, handleEmailVerification);
        await consumer.subscribe(TOPICS.EMAIL_WELCOME_REQUESTED, handleWelcomeEmail);
        await consumer.subscribe(TOPICS.EMAIL_INVITATION_REQUESTED, handleInvitationEmail);
        await consumer.subscribe(TOPICS.EMAIL_PASSWORD_RESET_REQUESTED, handlePasswordResetEmail);
        
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
        console.log('📨 Using base URL:', getBaseUrl());
    } catch (error) {
        console.error('❌ Email Service initialization failed:', error.message);
        setTimeout(initializeService, 10000);
    }
}

// Start server
app.listen(PORT, () => {
    console.log('🏥 Health: http://localhost:' + PORT + '/health');
    initializeService();
});
EOF
