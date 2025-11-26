import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixEnum() {
  const client = await pool.connect();
  try {
    console.log('🔄 Fixing enum values mismatch...');
    
    // First, change the organizations table to use text temporarily
    await client.query('ALTER TABLE organizations ALTER COLUMN tier TYPE VARCHAR(50);');
    console.log('✅ Changed tier column to text temporarily');
    
    // Drop the old enum type
    await client.query('DROP TYPE IF EXISTS organization_tier CASCADE;');
    console.log('✅ Dropped old enum type');
    
    // Create the new enum with UPPERCASE values that match the code
    await client.query("CREATE TYPE organization_tier AS ENUM ('STARTER', 'PRO', 'ENTERPRISE');");
    console.log('✅ Created new enum type with STARTER, PRO, ENTERPRISE');
    
    // Update existing records to use the new enum values
    await client.query(`
      UPDATE organizations 
      SET tier = CASE 
        WHEN tier = 'starter' THEN 'STARTER'
        WHEN tier = 'professional' THEN 'PRO' 
        WHEN tier = 'enterprise' THEN 'ENTERPRISE'
        ELSE 'STARTER'
      END;
    `);
    console.log('✅ Updated existing records to new enum values');
    
    // Change the column back to use the enum
    await client.query('ALTER TABLE organizations ALTER COLUMN tier TYPE organization_tier USING tier::organization_tier;');
    console.log('✅ Changed tier column back to enum type');
    
    // Set default value
    await client.query("ALTER TABLE organizations ALTER COLUMN tier SET DEFAULT 'STARTER';");
    console.log('✅ Set default value to STARTER');
    
    console.log('🎉 Enum values fix completed successfully!');
    
  } catch (error) {
    console.log('Error fixing enum:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

fixEnum();
