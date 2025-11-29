import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { initializeDatabase, testConnection, pool } from './utils/database.js';
import { kafkaProducer } from './kafka/producer.js';
import { TOPICS } from './kafka/config.js';
import KafkaConsumer from './kafka/consumer.js';

const app = express();
const port = process.env.PORT || 4006;

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Initialize Kafka consumer
const beneficiaryConsumer = new KafkaConsumer('beneficiary-service');

let kafkaInitialized = false;

// Initialize database and Kafka
async function initializeApp() {
  try {
    console.log('🔧 Initializing Beneficiary Service with Kafka...');
    
    // Test database connection
    const connected = await testConnection();
    if (!connected) {
      console.log('⚠️  Database connection failed, but starting service anyway...');
    } else {
      // Initialize database tables
      await initializeDatabase();
    }
    
    // Initialize Kafka consumer with retry
    await initializeKafkaWithRetry();
    
    console.log('✅ Beneficiary Service with Kafka initialized successfully');
  } catch (error) {
    console.log('❌ Beneficiary Service initialization failed:', error.message);
  }
}

async function initializeKafkaWithRetry(retries = 5, delay = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔄 Attempting to initialize Kafka (attempt ${attempt}/${retries})...`);
      await initializeKafkaConsumer();
      kafkaInitialized = true;
      console.log('✅ Kafka initialized successfully');
      return;
    } catch (error) {
      console.log(`❌ Kafka initialization failed (attempt ${attempt}/${retries}):`, error.message);
      if (attempt < retries) {
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.log('❌ Max retries reached, starting service without Kafka');
      }
    }
  }
}

async function initializeKafkaConsumer() {
  try {
    // Subscribe to organization events
    await beneficiaryConsumer.subscribe(TOPICS.ORGANIZATION_CREATED, handleOrganizationCreated);
    await beneficiaryConsumer.subscribe(TOPICS.USER_REGISTERED, handleUserRegistered);
    
    // Start consuming messages
    await beneficiaryConsumer.run();
    console.log('✅ Kafka consumer initialized successfully');
  } catch (error) {
    console.log('❌ Kafka consumer initialization failed:', error.message);
    throw error;
  }
}

async function handleOrganizationCreated(message) {
  console.log('📥 Beneficiary service - Organization created:', message);
  // You can automatically create default custom fields for new organizations
}

async function handleUserRegistered(message) {
  console.log('📥 Beneficiary service - User registered:', message);
  // You can perform actions when new users register
}

// Helper function to send Kafka events
async function sendKafkaEvent(topic, eventData) {
  if (!kafkaInitialized) {
    console.log('⚠️ Kafka not initialized, skipping event:', topic);
    return false;
  }

  try {
    return await kafkaProducer.send(topic, eventData);
  } catch (error) {
    console.error(`❌ Failed to send Kafka event to ${topic}:`, error.message);
    return false;
  }
}

// Initialize app
initializeApp().catch(console.error);

// ==================== HEALTH & INFO ENDPOINTS ====================

app.get('/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    const result = await pool.query('SELECT COUNT(*) FROM beneficiaries');
    const beneficiaryCount = parseInt(result.rows[0].count);
    
    res.json({
      status: dbConnected ? 'healthy' : 'degraded',
      service: 'beneficiary-service',
      database: dbConnected ? 'connected' : 'disconnected',
      kafka: kafkaInitialized ? 'connected' : 'disconnected',
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
    message: '👥 EvidFlow Beneficiary Service with Kafka',
    version: '2.0.0',
    system: 'NGO/MEAL Platform',
    status: 'running',
    endpoints: [
      'GET /health - Health check',
      'GET /beneficiaries - List beneficiaries',
      'POST /beneficiaries - Create beneficiary',
      'GET /beneficiaries/:id - Get beneficiary',
      'PUT /beneficiaries/:id - Update beneficiary',
      'DELETE /beneficiaries/:id - Delete beneficiary',
      'GET /organizations/:orgId/fields - Get custom fields',
      'POST /organizations/:orgId/fields - Add custom field',
      'PUT /organizations/:orgId/fields/:fieldId - Update custom field',
      'DELETE /organizations/:orgId/fields/:fieldId - Delete custom field',
      'POST /organizations/:orgId/schema - Create custom table',
      'GET /organizations/:orgId/schema - Get organization schema'
    ]
  });
});

// ==================== CUSTOM FIELD MANAGEMENT ====================

// Get all custom fields for organization
app.get('/organizations/:orgId/fields', async (req, res) => {
  try {
    const { orgId } = req.params;

    const result = await pool.query(
      `SELECT * FROM custom_fields 
       WHERE organization_id = $1 AND is_active = true
       ORDER BY display_order ASC`,
      [orgId]
    );

    res.json({
      success: true,
      fields: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get custom fields error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch custom fields'
    });
  }
});

// Add custom field
app.post('/organizations/:orgId/fields', async (req, res) => {
  try {
    const { orgId } = req.params;
    const { field_name, field_type, field_label, required, options, validation_rules, display_order } = req.body;

    if (!field_name || !field_type || !field_label) {
      return res.status(400).json({
        success: false,
        error: 'Field name, type, and label are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO custom_fields 
       (organization_id, field_name, field_type, field_label, required, options, validation_rules, display_order) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [orgId, field_name, field_type, field_label, required || false, options || null, validation_rules || null, display_order || 0]
    );

    const newField = result.rows[0];

    // Send Kafka event
    await sendKafkaEvent(TOPICS.CUSTOM_FIELD_ADDED, {
      organization_id: orgId,
      field_id: newField.id,
      field_name: newField.field_name,
      field_type: newField.field_type,
      field_label: newField.field_label
    });

    res.json({
      success: true,
      field: newField,
      message: 'Custom field added successfully'
    });
  } catch (error) {
    console.error('Add custom field error:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Field with this name already exists'
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to add custom field'
    });
  }
});

// Update custom field
app.put('/organizations/:orgId/fields/:fieldId', async (req, res) => {
  try {
    const { orgId, fieldId } = req.params;
    const updates = req.body;

    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (['field_label', 'field_type', 'required', 'options', 'validation_rules', 'display_order', 'is_active'].includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(fieldId, orgId);

    const result = await pool.query(
      `UPDATE custom_fields SET ${fields.join(', ')} 
       WHERE id = $${paramCount} AND organization_id = $${paramCount + 1} 
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Custom field not found'
      });
    }

    const updatedField = result.rows[0];

    // Send Kafka event
    await sendKafkaEvent(TOPICS.CUSTOM_FIELD_UPDATED, {
      organization_id: orgId,
      field_id: updatedField.id,
      field_name: updatedField.field_name,
      changes: updates
    });

    res.json({
      success: true,
      field: updatedField,
      message: 'Custom field updated successfully'
    });
  } catch (error) {
    console.error('Update custom field error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update custom field'
    });
  }
});

// Delete custom field
app.delete('/organizations/:orgId/fields/:fieldId', async (req, res) => {
  try {
    const { orgId, fieldId } = req.params;

    const result = await pool.query(
      'DELETE FROM custom_fields WHERE id = $1 AND organization_id = $2 RETURNING *',
      [fieldId, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Custom field not found'
      });
    }

    const deletedField = result.rows[0];

    // Send Kafka event
    await sendKafkaEvent(TOPICS.CUSTOM_FIELD_DELETED, {
      organization_id: orgId,
      field_id: deletedField.id,
      field_name: deletedField.field_name
    });

    res.json({
      success: true,
      message: 'Custom field deleted successfully'
    });
  } catch (error) {
    console.error('Delete custom field error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete custom field'
    });
  }
});

// ==================== CUSTOM TABLE SCHEMA MANAGEMENT ====================

// Create custom table schema
app.post('/organizations/:orgId/schema', async (req, res) => {
  try {
    const { orgId } = req.params;
    const { table_name, schema_definition } = req.body;

    if (!table_name || !schema_definition) {
      return res.status(400).json({
        success: false,
        error: 'Table name and schema definition are required'
      });
    }

    // Create custom table dynamically
    await createCustomTable(table_name, schema_definition);

    // Save schema definition
    const result = await pool.query(
      `INSERT INTO organization_schemas (organization_id, table_name, schema_definition) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (organization_id) 
       DO UPDATE SET table_name = $2, schema_definition = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [orgId, table_name, schema_definition]
    );

    const schema = result.rows[0];

    // Send Kafka event
    await sendKafkaEvent(TOPICS.SCHEMA_CREATED, {
      organization_id: orgId,
      table_name: table_name,
      schema_definition: schema_definition
    });

    res.json({
      success: true,
      schema: schema,
      message: 'Custom table schema created successfully'
    });
  } catch (error) {
    console.error('Create schema error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create custom table schema'
    });
  }
});

// Get organization schema
app.get('/organizations/:orgId/schema', async (req, res) => {
  try {
    const { orgId } = req.params;

    const result = await pool.query(
      'SELECT * FROM organization_schemas WHERE organization_id = $1',
      [orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No custom schema found for this organization'
      });
    }

    res.json({
      success: true,
      schema: result.rows[0]
    });
  } catch (error) {
    console.error('Get schema error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch organization schema'
    });
  }
});

// ==================== ENHANCED BENEFICIARY ENDPOINTS ====================

// Get all beneficiaries for organization
app.get('/beneficiaries', async (req, res) => {
  try {
    const { organization_id, include_custom_fields = 'true' } = req.query;
    
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

    let beneficiaries = result.rows;

    // Include custom fields metadata if requested
    if (include_custom_fields === 'true') {
      const customFields = await pool.query(
        'SELECT * FROM custom_fields WHERE organization_id = $1 AND is_active = true ORDER BY display_order ASC',
        [organization_id]
      );
      
      beneficiaries = beneficiaries.map(beneficiary => ({
        ...beneficiary,
        _custom_fields_metadata: customFields.rows
      }));
    }

    res.json({
      success: true,
      beneficiaries: beneficiaries,
      count: beneficiaries.length
    });
  } catch (error) {
    console.error('Get beneficiaries error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch beneficiaries'
    });
  }
});

// Create beneficiary with custom fields
app.post('/beneficiaries', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      name,
      contact_info,
      age,
      gender,
      location,
      demographics,
      vulnerability_score,
      organization_id,
      custom_fields = {}
    } = req.body;

    if (!name || !organization_id) {
      return res.status(400).json({
        success: false,
        error: 'Name and organization ID are required'
      });
    }

    // Validate custom fields against organization's field definitions
    const customFieldsResult = await client.query(
      'SELECT * FROM custom_fields WHERE organization_id = $1 AND is_active = true',
      [organization_id]
    );

    const validatedCustomFields = {};
    for (const [fieldName, fieldValue] of Object.entries(custom_fields)) {
      const fieldDef = customFieldsResult.rows.find(f => f.field_name === fieldName);
      if (fieldDef) {
        validatedCustomFields[fieldName] = fieldValue;
      }
    }

    const result = await client.query(
      `INSERT INTO beneficiaries 
       (name, contact_info, age, gender, location, demographics, vulnerability_score, organization_id, custom_fields) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [
        name, 
        contact_info, 
        age, 
        gender, 
        location, 
        demographics || {}, 
        vulnerability_score || 0.0, 
        organization_id,
        validatedCustomFields
      ]
    );

    const newBeneficiary = result.rows[0];

    await client.query('COMMIT');

    // Send Kafka event
    await sendKafkaEvent(TOPICS.BENEFICIARY_CREATED, {
      beneficiary_id: newBeneficiary.id,
      organization_id: organization_id,
      name: name,
      custom_fields_count: Object.keys(validatedCustomFields).length
    });

    res.json({
      success: true,
      beneficiary: newBeneficiary,
      message: 'Beneficiary created successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create beneficiary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create beneficiary'
    });
  } finally {
    client.release();
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

    // Include custom fields metadata
    const beneficiary = result.rows[0];
    const customFields = await pool.query(
      'SELECT * FROM custom_fields WHERE organization_id = $1 AND is_active = true ORDER BY display_order ASC',
      [beneficiary.organization_id]
    );

    beneficiary._custom_fields_metadata = customFields.rows;

    res.json({
      success: true,
      beneficiary: beneficiary
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const updates = req.body;

    // Get current beneficiary data for comparison
    const currentResult = await client.query(
      'SELECT * FROM beneficiaries WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Beneficiary not found'
      });
    }

    const currentBeneficiary = currentResult.rows[0];

    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && value !== undefined) {
        if (key === 'custom_fields') {
          // Merge custom fields instead of replacing
          const currentCustomFields = currentBeneficiary.custom_fields || {};
          const mergedCustomFields = { ...currentCustomFields, ...value };
          fields.push(`custom_fields = $${paramCount}`);
          values.push(mergedCustomFields);
        } else {
          fields.push(`${key} = $${paramCount}`);
          values.push(value);
        }
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

    const result = await client.query(
      `UPDATE beneficiaries SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Beneficiary not found'
      });
    }

    const updatedBeneficiary = result.rows[0];

    await client.query('COMMIT');

    // Send Kafka event
    await sendKafkaEvent(TOPICS.BENEFICIARY_UPDATED, {
      beneficiary_id: id,
      organization_id: updatedBeneficiary.organization_id,
      updated_fields: Object.keys(updates)
    });

    res.json({
      success: true,
      beneficiary: updatedBeneficiary,
      message: 'Beneficiary updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update beneficiary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update beneficiary'
    });
  } finally {
    client.release();
  }
});

// Delete beneficiary
app.delete('/beneficiaries/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;

    // Get beneficiary before deletion for Kafka event
    const beneficiaryResult = await client.query(
      'SELECT * FROM beneficiaries WHERE id = $1',
      [id]
    );

    if (beneficiaryResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Beneficiary not found'
      });
    }

    const beneficiary = beneficiaryResult.rows[0];

    const result = await client.query(
      'DELETE FROM beneficiaries WHERE id = $1 RETURNING *',
      [id]
    );

    await client.query('COMMIT');

    // Send Kafka event
    await sendKafkaEvent(TOPICS.BENEFICIARY_DELETED, {
      beneficiary_id: id,
      organization_id: beneficiary.organization_id,
      name: beneficiary.name
    });

    res.json({
      success: true,
      message: 'Beneficiary deleted successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete beneficiary error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete beneficiary'
    });
  } finally {
    client.release();
  }
});

// ==================== HELPER FUNCTIONS ====================

async function createCustomTable(tableName, schemaDefinition) {
  try {
    const columns = [];
    
    // Add standard columns
    columns.push('id SERIAL PRIMARY KEY');
    columns.push('organization_id INTEGER NOT NULL');
    columns.push('beneficiary_id INTEGER REFERENCES beneficiaries(id)');
    columns.push('created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    columns.push('updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    // Add custom columns from schema definition
    for (const [columnName, columnDef] of Object.entries(schemaDefinition)) {
      const columnType = mapFieldTypeToSQL(columnDef.type);
      columns.push(`${columnName} ${columnType}`);
    }

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        ${columns.join(',\n')}
      )
    `;

    await pool.query(createTableSQL);
    console.log(`✅ Custom table ${tableName} created successfully`);
  } catch (error) {
    console.error('Custom table creation failed:', error);
    throw error;
  }
}

function mapFieldTypeToSQL(fieldType) {
  const typeMap = {
    'text': 'TEXT',
    'number': 'DECIMAL(10,2)',
    'integer': 'INTEGER',
    'boolean': 'BOOLEAN',
    'date': 'DATE',
    'datetime': 'TIMESTAMP',
    'json': 'JSONB'
  };
  
  return typeMap[fieldType] || 'TEXT';
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  try {
    await kafkaProducer.disconnect();
    await beneficiaryConsumer.disconnect();
    await pool.end();
    console.log('✅ Beneficiary Service - Resources cleaned up successfully');
  } catch (error) {
    console.error('❌ Beneficiary Service - Error during shutdown:', error);
  } finally {
    process.exit(0);
  }
});

// Start server
app.listen(port, () => {
  console.log(`👥 Enhanced Beneficiary Service with Kafka running on port ${port}`);
  console.log(`🏥 Health: http://localhost:${port}/health`);
  console.log('🔧 Features: Dynamic fields, Custom tables, Kafka integration');
});
