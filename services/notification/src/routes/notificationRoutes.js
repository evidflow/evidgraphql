import express from 'express';
import pkg from '../../../shared/middleware/auth.js';
const { authenticateToken } = pkg;
import { pool } from '../utils/database.js';

const router = express.Router();

// Get notifications
router.get('/', async (req, res) => {
  try {
    const { orgId, userId } = req.query;

    if (!orgId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID and user ID are required'
      });
    }

    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE organization_id = $1 AND user_id = $2 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [orgId, userId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get notifications'
    });
  }
});

// Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE notifications 
       SET is_read = true, read_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
});

export default router;
