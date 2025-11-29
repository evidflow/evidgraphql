import express from 'express';
import pkg from '../../../shared/middleware/auth.js';
const { authenticateToken } = pkg;
import { pool } from '../utils/database.js';

const router = express.Router();

// Get onboarding steps
router.get('/steps', async (req, res) => {
  try {
    const { orgId } = req.query;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    const result = await pool.query(
      `SELECT * FROM onboarding_steps 
       WHERE organization_id = $1 AND is_active = true 
       ORDER BY step_order ASC`,
      [orgId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get onboarding steps error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get onboarding steps'
    });
  }
});

// Update onboarding progress
router.post('/progress', async (req, res) => {
  try {
    const {
      organization_id,
      user_id,
      step_id,
      completed,
      metadata
    } = req.body;

    if (!organization_id || !user_id || !step_id) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID, user ID, and step ID are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO onboarding_progress 
       (organization_id, user_id, step_id, completed, metadata) 
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, user_id, step_id) 
       DO UPDATE SET completed = $4, metadata = $5, updated_at = NOW()
       RETURNING *`,
      [
        organization_id,
        user_id,
        step_id,
        completed || false,
        metadata || {}
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Onboarding progress updated successfully'
    });
  } catch (error) {
    console.error('Update onboarding progress error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update onboarding progress'
    });
  }
});

export default router;
