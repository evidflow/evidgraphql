export const TOPICS = {
    // Reports events
    REPORT_REQUESTED: 'report.requested',
    REPORT_GENERATED: 'report.generated',
    REPORT_EXPORTED: 'report.exported',
    REPORT_FAILED: 'report.failed',
    
    // Data events for reporting
    BENEFICIARY_DATA_UPDATED: 'beneficiary.data.updated',
    INDICATOR_DATA_COLLECTED: 'indicator.data.collected',
    PAYMENT_DATA_UPDATED: 'payment.data.updated'
};

export const KAFKA_CONFIG = {
    CLIENT_ID: 'reports-service',
    GROUP_ID: 'reports-service-group',
    BROKERS: [process.env.KAFKA_BROKER || 'kafka:9092']
};
