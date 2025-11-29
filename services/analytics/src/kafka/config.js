export const TOPICS = {
    // Analytics events
    ANALYTICS_TRACK: 'analytics.track',
    ANALYTICS_PAGEVIEW: 'analytics.pageview',
    
    // Events that generate analytics data
    USER_REGISTERED: 'user.registered',
    USER_LOGIN: 'user.login',
    BENEFICIARY_CREATED: 'beneficiary.created',
    BENEFICIARY_UPDATED: 'beneficiary.updated',
    PAYMENT_COMPLETED: 'payment.completed',
    ORGANIZATION_CREATED: 'organization.created',
    
    // Report events
    REPORT_GENERATED: 'report.generated',
    REPORT_EXPORTED: 'report.exported'
};

export const KAFKA_CONFIG = {
    CLIENT_ID: 'analytics-service',
    GROUP_ID: 'analytics-service-group',
    BROKERS: [process.env.KAFKA_BROKER || 'kafka:9092']
};
