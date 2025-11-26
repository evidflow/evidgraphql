const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkAndFixEnum() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking current user_role enum values...');
    
    // Check current enum values
    const enumResult = await client.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'user_role'::regtype
      ORDER BY enumsortorder;
    `);
    
    console.log('Current user_role values:', enumResult.rows.map(row => row.enumlabel));
    
    // Check tables using user_role
    const tablesResult = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE udt_name = 'user_role';
    `);
    
    console.log('Tables using user_role:');
    tablesResult.rows.forEach(row => {
      console.log(`- ${row.table_name}.${row.column_name}`);
    });
    
    // Add missing enum values
    console.log('🔄 Adding missing enum values...');
    
    const missingValues = ['ORG_MEMBER', 'ORG_ADMIN', 'ORG_OWNER'];
    for (const value of missingValues) {
      if (!enumResult.rows.some(row => row.enumlabel === value)) {
        await client.query(`ALTER TYPE user_role ADD VALUE '${value}';`);
        console.log(`✅ Added ${value} to user_role enum`);
      } else {
        console.log(`ℹ️ ${value} already exists in user_role enum`);
      }
    }
    
    console.log('🎉 Enum check and fix completed!');
    
  } catch (error) {
    console.log('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkAndFixEnum();
