import express from 'express';
import { pool } from '../utils/database.js';

const router = express.Router();

// Get MEAL indicators
router.get('/indicators', async (req, res) => {
  try {
    const { orgId } = req.query;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    const result = await pool.query(
      `SELECT * FROM meal_indicators 
       WHERE organization_id = $1 AND is_active = true 
       ORDER BY created_at DESC`,
      [orgId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get indicators error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get indicators'
    });
  }
});

// Create indicator
router.post('/indicators', async (req, res) => {
  try {
    const {
      organization_id,
      project_id,
      name,
      description,
      indicator_type,
      unit,
      target_value,
      baseline_value,
      frequency,
      calculation_method,
      disaggregation_categories
    } = req.body;

    if (!organization_id || !name || !indicator_type) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID, name, and indicator type are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO meal_indicators 
       (organization_id, project_id, name, description, indicator_type, unit, target_value, 
        baseline_value, frequency, calculation_method, disaggregation_categories, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING *`,
      [
        organization_id,
        project_id,
        name,
        description,
        indicator_type,
        unit,
        target_value,
        baseline_value,
        frequency,
        calculation_method,
        disaggregation_categories || [],
        req.body.user_id || 1
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Indicator created successfully'
    });
  } catch (error) {
    console.error('Create indicator error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create indicator'
    });
  }
});

export default router;
