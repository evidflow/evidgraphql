const { GraphQLError } = require('graphql');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const resolvers = {
  Query: {
    organization: async (_, { id }, { user }) => {
      if (!user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const result = await pool.query(
        `SELECT o.*, u.id as owner_id, u.email as owner_email, u.full_name as owner_name
         FROM organizations o 
         JOIN users u ON o.owner_id = u.id 
         WHERE o.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new GraphQLError('Organization not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      return result.rows[0];
    },

    myOrganizations: async (_, __, { user }) => {
      if (!user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const result = await pool.query(
        `SELECT o.*, u.id as owner_id, u.email as owner_email, u.full_name as owner_name
         FROM organizations o 
         JOIN users u ON o.owner_id = u.id 
         WHERE o.owner_id = $1`,
        [user.id]
      );

      return result.rows;
    },
  },

  Mutation: {
    createOrganization: async (_, { name, description }, { user }) => {
      if (!user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      const slug = name.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substr(2, 9);
      
      const result = await pool.query(
        `INSERT INTO organizations (name, slug, description, owner_id, tier) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [name, slug, description, user.id, 'STARTER']
      );

      return result.rows[0];
    },

    updateOrganization: async (_, { id, name, description }, { user }) => {
      if (!user) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      // Check if user owns the organization
      const orgResult = await pool.query(
        'SELECT owner_id FROM organizations WHERE id = $1',
        [id]
      );

      if (orgResult.rows.length === 0) {
        throw new GraphQLError('Organization not found', {
          extensions: { code: 'NOT_FOUND' }
        });
      }

      if (orgResult.rows[0].owner_id !== user.id) {
        throw new GraphQLError('Not authorized to update this organization', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      const result = await pool.query(
        `UPDATE organizations 
         SET name = COALESCE($1, name), 
             description = COALESCE($2, description),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 
         RETURNING *`,
        [name, description, id]
      );

      return result.rows[0];
    },
  },

  Organization: {
    __resolveReference: async (reference) => {
      const result = await pool.query(
        `SELECT o.*, u.id as owner_id, u.email as owner_email, u.full_name as owner_name
         FROM organizations o 
         JOIN users u ON o.owner_id = u.id 
         WHERE o.id = $1`,
        [reference.id]
      );
      return result.rows[0];
    },

    owner: (organization) => {
      return {
        id: organization.owner_id,
        email: organization.owner_email,
        fullName: organization.owner_name,
      };
    },
  },

  User: {
    organizations: async (user) => {
      const result = await pool.query(
        'SELECT * FROM organizations WHERE owner_id = $1',
        [user.id]
      );
      return result.rows;
    },
  },
};

module.exports = resolvers;
