export const TOPICS = {
    // User events produced by auth service
    USER_REGISTERED: 'user.registered',
    USER_EMAIL_VERIFIED: 'user.email.verified',
    USER_PASSWORD_RESET_REQUESTED: 'user.password-reset.requested',
    USER_LOGIN: 'user.login',
    USER_VERIFIED: 'user.verified',
    USER_PASSWORD_RESET: 'user.password.reset',
    
    // Email events that auth service produces
    EMAIL_VERIFICATION_REQUESTED: 'email.verification.requested',
    EMAIL_WELCOME_REQUESTED: 'email.welcome.requested',
    EMAIL_PASSWORD_RESET_REQUESTED: 'email.password-reset.requested',
    EMAIL_INVITATION_REQUESTED: 'email.invitation.requested',
    
    // Organization events
    ORGANIZATION_CREATED: 'organization.created',
    ORGANIZATION_UPDATED: 'organization.updated',
    ORGANIZATION_INVITATION_ACCEPTED: 'organization.invitation.accepted'
};

export const KAFKA_CONFIG = {
    CLIENT_ID: 'auth-service',
    GROUP_ID: 'auth-service-group',
    BROKERS: [process.env.KAFKA_BROKER || 'kafka:9092']
};
