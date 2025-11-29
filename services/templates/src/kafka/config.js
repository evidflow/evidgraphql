export const TOPICS = {
    // Templates events
    TEMPLATE_CREATED: 'template.created',
    TEMPLATE_UPDATED: 'template.updated',
    TEMPLATE_DELETED: 'template.deleted',
    
    // Usage events
    TEMPLATE_USED: 'template.used',
    DOCUMENT_GENERATED: 'document.generated'
};

export const KAFKA_CONFIG = {
    CLIENT_ID: 'templates-service',
    GROUP_ID: 'templates-service-group',
    BROKERS: [process.env.KAFKA_BROKER || 'kafka:9092']
};
