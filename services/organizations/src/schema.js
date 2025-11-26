const { gql } = require('graphql-tag');

const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
          import: ["@key", "@shareable", "@external", "@requires"])

  type Organization @key(fields: "id") {
    id: ID!
    name: String!
    slug: String!
    description: String
    tier: OrganizationTier!
    owner: User!
    createdAt: String!
    updatedAt: String!
  }

  type OrganizationMember {
    id: ID!
    user: User!
    role: UserRole!
    joinedAt: String!
  }

  enum OrganizationTier {
    STARTER
    GROWTH
    ENTERPRISE
  }

  enum UserRole {
    ORG_OWNER
    ORG_ADMIN
    ORG_MEMBER
  }

  extend type User @key(fields: "id") {
    id: ID! @external
    organizations: [Organization!]!
  }

  type Query {
    organization(id: ID!): Organization
    myOrganizations: [Organization!]!
  }

  type Mutation {
    createOrganization(name: String!, description: String): Organization!
  }
`;

module.exports = typeDefs;
