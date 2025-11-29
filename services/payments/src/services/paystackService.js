import axios from 'axios';

class PaystackService {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || 'sk_test_2018a7966c2553883311533d07de6e35f1';
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_5ec0f718267d160b2ac5df5559f9e7a742';
    this.baseUrl = 'https://api.paystack.co';
    
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async initializeTransaction(paymentData) {
    try {
      const { email, amount, reference, metadata, plan, callback_url } = paymentData;
      
      const payload = {
        email,
        amount: Math.round(amount * 100), // Convert to kobo/cent
        reference: reference || `evidflow_${Date.now()}`,
        callback_url: callback_url || `${process.env.FRONTEND_URL}/onboarding/verify`,
        metadata: {
          ...metadata,
          plan,
          site: 'evidflow'
        }
      };

      const response = await this.axiosInstance.post('/transaction/initialize', payload);
      return response.data;
    } catch (error) {
      throw new Error(`Payment initialization failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async verifyTransaction(reference) {
    try {
      const response = await this.axiosInstance.get(`/transaction/verify/${reference}`);
      return response.data;
    } catch (error) {
      throw new Error(`Payment verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async createPlan(planData) {
    try {
      const { name, amount, interval, description } = planData;
      
      const payload = {
        name,
        amount: Math.round(amount * 100),
        interval,
        description
      };

      const response = await this.axiosInstance.post('/plan', payload);
      return response.data;
    } catch (error) {
      throw new Error(`Plan creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  validateWebhook(signature, body) {
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(JSON.stringify(body))
      .digest('hex');
    return hash === signature;
  }
}

export default new PaystackService();
