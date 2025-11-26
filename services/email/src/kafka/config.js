export const TOPICS = {
    // Email topics
    EMAIL_VERIFICATION_REQUESTED: 'email.verification.requested',
    EMAIL_WELCOME_REQUESTED: 'email.welcome.requested', 
    EMAIL_INVITATION_REQUESTED: 'email.invitation.requested',
    EMAIL_PASSWORD_RESET_REQUESTED: 'email.password-reset.requested',
    
    // User events that trigger emails
    USER_REGISTERED: 'user.registered',
    USER_EMAIL_VERIFIED: 'user.email.verified',
    USER_PASSWORD_RESET_REQUESTED: 'user.password-reset.requested',
    
    // Organization events that trigger emails
    ORGANIZATION_INVITATION_CREATED: 'organization.invitation.created',
    ORGANIZATION_INVITATION_ACCEPTED: 'organization.invitation.accepted'
};

export const KAFKA_CONFIG = {
    CLIENT_ID: 'email-service',
    GROUP_ID: 'email-service-group',
    BROKERS: [process.env.KAFKA_BROKER || 'kafka:9092']
};
