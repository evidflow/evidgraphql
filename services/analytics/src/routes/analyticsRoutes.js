import express from 'express';
import { pool } from '../utils/database.js';

const router = express.Router();

// Track analytics event
router.post('/track', async (req, res) => {
  try {
    const { event_type, event_name, properties, user_agent, ip_address, session_id } = req.body;

    if (!event_type || !event_name) {
      return res.status(400).json({
        success: false,
        error: 'Event type and name are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO analytics_events 
       (organization_id, user_id, event_type, event_name, properties, user_agent, ip_address, session_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [
        req.body.organization_id,
        req.body.user_id,
        event_type,
        event_name,
        properties || {},
        user_agent,
        ip_address,
        session_id
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Event tracked successfully'
    });
  } catch (error) {
    console.error('Track event error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track event'
    });
  }
});

// Track page view
router.post('/pageview', async (req, res) => {
  try {
    const { page_path, page_title, referrer, session_id, duration_seconds } = req.body;

    if (!page_path) {
      return res.status(400).json({
        success: false,
        error: 'Page path is required'
      });
    }

    const result = await pool.query(
      `INSERT INTO page_views 
       (organization_id, user_id, page_path, page_title, referrer, session_id, duration_seconds) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        req.body.organization_id,
        req.body.user_id,
        page_path,
        page_title,
        referrer,
        session_id,
        duration_seconds
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Page view tracked successfully'
    });
  } catch (error) {
    console.error('Track page view error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track page view'
    });
  }
});

// Get analytics dashboard
router.get('/dashboard/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;
    const { period = '30d' } = req.query;

    // Get user registrations
    const usersResult = await pool.query(
      `SELECT COUNT(*) as count, DATE(created_at) as date 
       FROM analytics_events 
       WHERE organization_id = $1 AND event_name = 'user_registered' 
       AND created_at >= NOW() - INTERVAL '${period}'
       GROUP BY DATE(created_at) 
       ORDER BY date`,
      [orgId]
    );

    // Get beneficiary registrations
    const beneficiariesResult = await pool.query(
      `SELECT COUNT(*) as count, DATE(created_at) as date 
       FROM analytics_events 
       WHERE organization_id = $1 AND event_name = 'beneficiary_created' 
       AND created_at >= NOW() - INTERVAL '${period}'
       GROUP BY DATE(created_at) 
       ORDER BY date`,
      [orgId]
    );

    // Get top events
    const topEventsResult = await pool.query(
      `SELECT event_name, COUNT(*) as count 
       FROM analytics_events 
       WHERE organization_id = $1 
       AND created_at >= NOW() - INTERVAL '${period}'
       GROUP BY event_name 
       ORDER BY count DESC 
       LIMIT 10`,
      [orgId]
    );

    res.json({
      success: true,
      data: {
        user_registrations: usersResult.rows,
        beneficiary_registrations: beneficiariesResult.rows,
        top_events: topEventsResult.rows,
        period: period
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics dashboard'
    });
  }
});

export default router;
