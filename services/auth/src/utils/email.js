import 'dotenv/config';

export class EmailService {
  constructor() {
    this.baseUrl = process.env.EMAIL_SERVICE_URL || 'http://email-service:8010';
  }

  async sendVerificationEmail(email, code, name) {
    try {
      const response = await fetch(`${this.baseUrl}/send-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          code,
          name
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send verification email');
      }

      const result = await response.json();
      console.log(`✅ Verification email sent to ${email}: ${result.messageId}`);
      return result;
    } catch (error) {
      console.error('❌ Error calling email service:', error.message);
      // Don't throw error - allow user registration to continue even if email fails
      return { success: false, error: error.message };
    }
  }

  async sendWelcomeEmail(email, name) {
    try {
      const response = await fetch(`${this.baseUrl}/send-welcome`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          name
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send welcome email');
      }

      const result = await response.json();
      console.log(`✅ Welcome email sent to ${email}: ${result.messageId}`);
      return result;
    } catch (error) {
      console.error('❌ Error calling email service for welcome email:', error.message);
      return { success: false, error: error.message };
    }
  }
}
