export const TOPICS = {
    // Notification events
    NOTIFICATION_SENT: 'notification.sent',
    NOTIFICATION_READ: 'notification.read',
    
    // Events that trigger notifications
    USER_REGISTERED: 'user.registered',
    BENEFICIARY_CREATED: 'beneficiary.created',
    PAYMENT_COMPLETED: 'payment.completed',
    ORGANIZATION_CREATED: 'organization.created',
    
    // Email events
    EMAIL_SENT: 'email.sent',
    EMAIL_FAILED: 'email.failed'
};

export const KAFKA_CONFIG = {
    CLIENT_ID: 'notification-service',
    GROUP_ID: 'notification-service-group',
    BROKERS: [process.env.KAFKA_BROKER || 'kafka:9092']
};
