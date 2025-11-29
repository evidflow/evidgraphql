import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Get base URL for links
function getBaseUrl() {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
}

// Real email sending function with Resend
async function sendEmail(to, subject, html) {
    try {
        console.log(`📧 Sending email to: ${to}`);
        console.log(`   Subject: ${subject}`);
        
        const { data, error } = await resend.emails.send({
            from: process.env.FROM_EMAIL || 'EvidFlow <nonreply@evidflow.com>',
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

export async function handleWelcomeEmail(data) {
    try {
        console.log('👋 Handling welcome email:', JSON.stringify(data, null, 2));
        
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
            console.error('❌ Invalid welcome email data:', messageData);
            return;
        }
        
        const { email, full_name, organization_name } = messageData;
        
        console.log(`📧 Preparing to send welcome email to: ${email}`);
        
        const subject = `Welcome to ${organization_name || 'EvidFlow'}!`;
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; background: #f9f9f9; }
                    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to ${organization_name || 'EvidFlow'}!</h1>
                    </div>
                    <div class="content">
                        <p>Hello ${full_name},</p>
                        <p>Welcome to our platform! We're excited to have you on board.</p>
                        <p>Your account has been successfully created and you can now start using our services.</p>
                        <p>If you have any questions, feel free to reach out to our support team.</p>
                        <p>Best regards,<br>The ${organization_name || 'EvidFlow'} Team</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 EvidFlow. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        const success = await sendEmail(email, subject, html);
        if (success) {
            console.log('✅ Welcome email sent successfully');
        } else {
            console.log('❌ Failed to send welcome email');
        }
    } catch (error) {
        console.error('❌ Error in handleWelcomeEmail:', error);
    }
}

export async function handlePasswordResetEmail(data) {
    try {
        console.log('🔑 Handling password reset email:', JSON.stringify(data, null, 2));
        
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
            console.error('❌ Invalid password reset email data:', messageData);
            return;
        }
        
        const { email, full_name, reset_token } = messageData;
        
        const baseUrl = getBaseUrl();
        const reset_link = `${baseUrl}/reset-password?token=${reset_token}`;
        
        console.log(`📧 Preparing to send password reset email to: ${email}`);
        
        const subject = 'Reset Your Password';
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; background: #f9f9f9; }
                    .button { background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
                    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Password Reset</h1>
                    </div>
                    <div class="content">
                        <p>Hello ${full_name},</p>
                        <p>We received a request to reset your password for your EvidFlow account. Click the button below to reset it:</p>
                        <p style="text-align: center;">
                            <a href="${reset_link}" class="button">Reset Password</a>
                        </p>
                        <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
                        <p>${reset_link}</p>
                        <p>This reset link will expire in 1 hour.</p>
                        <p>If you didn't request a password reset, please ignore this email.</p>
                        <p>Best regards,<br>The EvidFlow Team</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 EvidFlow. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        const success = await sendEmail(email, subject, html);
        if (success) {
            console.log('✅ Password reset email sent successfully');
        } else {
            console.log('❌ Failed to send password reset email');
        }
    } catch (error) {
        console.error('❌ Error in handlePasswordResetEmail:', error);
    }
}

export async function handleEmailVerification(data) {
    try {
        console.log('🔐 Handling email verification:', JSON.stringify(data, null, 2));
        
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

export async function handleInvitationEmail(data) {
    try {
        console.log('📨 Handling organization invitation:', JSON.stringify(data, null, 2));
        
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

export async function handleNotificationEmail(data) {
    try {
        console.log('🔔 Handling notification email:', JSON.stringify(data, null, 2));
        
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
            console.error('❌ Invalid notification email data:', messageData);
            return;
        }
        
        const { email, full_name, title, message, notification_type } = messageData;
        
        console.log(`📧 Preparing to send notification email to: ${email}`);
        
        const subject = title || 'Notification from EvidFlow';
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #10B981; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; background: #f9f9f9; }
                    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${title || 'EvidFlow Notification'}</h1>
                    </div>
                    <div class="content">
                        <p>Hello ${full_name},</p>
                        <p>${message}</p>
                        <p>Best regards,<br>The EvidFlow Team</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 EvidFlow. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        const success = await sendEmail(email, subject, html);
        if (success) {
            console.log('✅ Notification email sent successfully');
        } else {
            console.log('❌ Failed to send notification email');
        }
    } catch (error) {
        console.error('❌ Error in handleNotificationEmail:', error);
    }
}
