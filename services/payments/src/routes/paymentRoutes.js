import express from 'express';
import pkg from '../../../shared/middleware/auth.js';
const { authenticateToken } = pkg;
import { pool } from '../utils/database.js';

const router = express.Router();

// Process payment
router.post('/process', async (req, res) => {
  try {
    const {
      organization_id,
      beneficiary_id,
      amount,
      currency,
      payment_method,
      metadata
    } = req.body;

    if (!organization_id || !beneficiary_id || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID, beneficiary ID, and amount are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO payments 
       (organization_id, beneficiary_id, amount, currency, payment_method, metadata, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        organization_id,
        beneficiary_id,
        amount,
        currency || 'KES',
        payment_method || 'paystack',
        metadata || {},
        'pending'
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Payment processed successfully'
    });
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process payment'
    });
  }
});

// Get payment history
router.get('/history', async (req, res) => {
  try {
    const { orgId, beneficiaryId } = req.query;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    let query = `SELECT * FROM payments WHERE organization_id = $1`;
    let params = [orgId];

    if (beneficiaryId) {
      query += ` AND beneficiary_id = $2`;
      params.push(beneficiaryId);
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment history'
    });
  }
});

export default router;
