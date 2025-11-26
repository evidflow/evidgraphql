import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
const port = process.env.PORT || 4006;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// ==================== HEALTH & INFO ENDPOINTS ====================

app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM beneficiaries');
    const beneficiaryCount = parseInt(result.rows[0].count);
    
    res.json({
      status: 'healthy',
      service: 'beneficiary-service',
      beneficiary_count: beneficiaryCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'beneficiary-service',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: '👥 EvidFlow Beneficiary Service',
    version: '1.0.0',
    system: 'NGO/MEAL Platform',
    endpoints: [
      'GET /health - Health check',
      'GET /beneficiaries - List beneficiaries',
      'POST /beneficiaries - Create beneficiary',
      'GET /beneficiaries/:id - Get beneficiary',
      'PUT /beneficiaries/:id - Update beneficiary',
      'DELETE /beneficiaries/:id - Delete beneficiary'
    ]
  });
});

// ==================== BENEFICIARY ENDPOINTS ====================

// Get all beneficiaries for organization
app.get('/beneficiaries', async (req, res) => {
  try {
    const { organization_id } = req.query;
    
    if (!organization_id) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required'
      });
    }

    const result = await pool.query(
      `SELECT * FROM beneficiaries 
       WHERE organization_id = $1 
       ORDER BY created_at DESC`,
      [organization_id]
    );

    res.json({
      success: true,
      beneficiaries: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get beneficiaries error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch beneficiaries'
    });
  }
});

// Create beneficiary
app.post('/beneficiaries', async (req, res) => {
  try {
    const {
      name,
      contact_info,
      age,
      gender,
      location,
      demographics,
      vulnerability_score,
      organization_id
    } = req.body;

    if (!name || !organization_id) {
      return res.status(400).json({
        success: false,
        error: 'Name and organization ID are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO beneficiaries 
       (name, contact_info, age, gender, location, demographics, vulnerability_score, organization_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [name, contact_info, age, gender, location, demographics || {}, vulnerability_score || 0.0, organization_id]
    );

    res.json({
      success: true,
      beneficiary: result.rows[0],
      message: 'Beneficiary created successfully'
    });
  } catch (error) {
    console.error('Create beneficiary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create beneficiary'
    });
  }
});

// Get beneficiary by ID
app.get('/beneficiaries/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT b.*, o.name as organization_name 
       FROM beneficiaries b 
       JOIN organizations o ON b.organization_id = o.id 
       WHERE b.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Beneficiary not found'
      });
    }

    res.json({
      success: true,
      beneficiary: result.rows[0]
    });
  } catch (error) {
    console.error('Get beneficiary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch beneficiary'
    });
  }
});

// Update beneficiary
app.put('/beneficiaries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && value !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await pool.query(
      `UPDATE beneficiaries SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Beneficiary not found'
      });
    }

    res.json({
      success: true,
      beneficiary: result.rows[0],
      message: 'Beneficiary updated successfully'
    });
  } catch (error) {
    console.error('Update beneficiary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update beneficiary'
    });
  }
});

// Delete beneficiary
app.delete('/beneficiaries/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM beneficiaries WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Beneficiary not found'
      });
    }

    res.json({
      success: true,
      message: 'Beneficiary deleted successfully'
    });
  } catch (error) {
    console.error('Delete beneficiary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete beneficiary'
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`👥 Beneficiary Service running on port ${port}`);
  console.log(`🏥 Health: http://localhost:${port}/health`);
});
