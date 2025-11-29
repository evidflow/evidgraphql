import express from 'express';
import pkg from '../../../../shared/middleware/auth.js';
const { authenticateToken } = pkg;
import { pool } from '../utils/database.js';

const router = express.Router();

// Get all templates
router.get('/', async (req, res) => {
  try {
    const { orgId } = req.query;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    const result = await pool.query(
      `SELECT * FROM email_templates 
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
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get templates'
    });
  }
});

// Create template
router.post('/', async (req, res) => {
  try {
    const {
      organization_id,
      name,
      subject,
      content,
      template_type,
      variables
    } = req.body;

    if (!organization_id || !name || !subject || !content) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID, name, subject, and content are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO email_templates 
       (organization_id, name, subject, content, template_type, variables, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        organization_id,
        name,
        subject,
        content,
        template_type || 'transactional',
        variables || [],
        req.body.user_id || 1
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Template created successfully'
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create template'
    });
  }
});

export default router;
