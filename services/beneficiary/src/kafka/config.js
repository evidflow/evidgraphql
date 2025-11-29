export const TOPICS = {
    // Beneficiary events
    BENEFICIARY_CREATED: 'beneficiary.created',
    BENEFICIARY_UPDATED: 'beneficiary.updated',
    BENEFICIARY_DELETED: 'beneficiary.deleted',
    
    // Custom field events
    CUSTOM_FIELD_ADDED: 'custom_field.added',
    CUSTOM_FIELD_UPDATED: 'custom_field.updated',
    CUSTOM_FIELD_DELETED: 'custom_field.deleted',
    
    // Schema events
    SCHEMA_CREATED: 'schema.created',
    SCHEMA_UPDATED: 'schema.updated',
    
    // Events from other services that we consume
    ORGANIZATION_CREATED: 'organization.created',
    USER_REGISTERED: 'user.registered'
};

export const KAFKA_CONFIG = {
    CLIENT_ID: 'beneficiary-service',
    GROUP_ID: 'beneficiary-service-group',
    BROKERS: [process.env.KAFKA_BROKER || 'evidgraphql-kafka-1:9092']
};
