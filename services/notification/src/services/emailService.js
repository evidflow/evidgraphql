import axios from 'axios';

class EmailService {
  constructor() {
    this.baseUrl = process.env.EMAIL_SERVICE_URL || 'http://email-service:8010';
  }

  async sendEmail(to, subject, template, data) {
    try {
      const response = await axios.post(`${this.baseUrl}/send`, {
        to,
        subject,
        template,
        data
      });

      console.log(`✅ Email sent to ${to}: ${response.data.messageId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Email sending failed:', error.message);
      throw error;
    }
  }

  async sendWelcomeEmail(user) {
    return this.sendEmail(
      user.email,
      'Welcome to EvidFlow!',
      'welcome',
      {
        name: user.full_name,
        organization_name: user.organizations?.[0]?.name || 'your organization'
      }
    );
  }

  async sendPaymentConfirmation(user, paymentData) {
    return this.sendEmail(
      user.email,
      'Payment Confirmation - EvidFlow',
      'payment_confirmation',
      {
        name: user.full_name,
        amount: paymentData.amount,
        plan: paymentData.plan,
        reference: paymentData.reference
      }
    );
  }

  async sendBeneficiaryAlert(user, beneficiaryData) {
    return this.sendEmail(
      user.email,
      'New Beneficiary Added - EvidFlow',
      'beneficiary_alert',
      {
        name: user.full_name,
        beneficiary_name: beneficiaryData.name,
        organization_name: beneficiaryData.organization_name
      }
    );
  }
}

export default new EmailService();
