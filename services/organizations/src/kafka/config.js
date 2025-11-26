import { Kafka } from 'kafkajs';

const kafkaConfig = {
    clientId: process.env.SERVICE_NAME || 'evidflow-service',
    brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
    retry: {
        initialRetryTime: 100,
        retries: 8
    }
};

export const kafka = new Kafka(kafkaConfig);

// Topic names
export const TOPICS = {
    // User events
    USER_REGISTERED: 'user.registered',
    USER_VERIFIED: 'user.verified',
    USER_LOGIN: 'user.login',
    USER_PASSWORD_RESET: 'user.password_reset',
    
    // Organization events
    ORGANIZATION_CREATED: 'organization.created',
    ORGANIZATION_UPDATED: 'organization.updated',
    ORGANIZATION_INVITATION_SENT: 'organization.invitation.sent',
    ORGANIZATION_INVITATION_ACCEPTED: 'organization.invitation.accepted',
    
    // Email events
    EMAIL_VERIFICATION_REQUESTED: 'email.verification.requested',
    EMAIL_WELCOME_REQUESTED: 'email.welcome.requested',
    EMAIL_PASSWORD_RESET_REQUESTED: 'email.password_reset.requested',
    EMAIL_INVITATION_REQUESTED: 'email.invitation.requested',
    
    // Notification events
    NOTIFICATION_CREATED: 'notification.created',
    
    // Analytics events
    ANALYTICS_USER_ACTIVITY: 'analytics.user_activity',
    ANALYTICS_ORGANIZATION_ACTIVITY: 'analytics.organization_activity'
};

// Consumer groups
export const CONSUMER_GROUPS = {
    EMAIL_SERVICE: 'email-service',
    NOTIFICATION_SERVICE: 'notification-service',
    ANALYTICS_SERVICE: 'analytics-service',
    AUTH_SERVICE: 'auth-service',
    ORG_SERVICE: 'org-service'
};
