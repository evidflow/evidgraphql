export const TOPICS = {
    // MEAL events
    INDICATOR_CREATED: 'indicator.created',
    INDICATOR_UPDATED: 'indicator.updated',
    DATA_COLLECTED: 'data.collected',
    SURVEY_COMPLETED: 'survey.completed',
    
    // Events that trigger MEAL activities
    BENEFICIARY_CREATED: 'beneficiary.created',
    BENEFICIARY_UPDATED: 'beneficiary.updated',
    PROJECT_CREATED: 'project.created',
    
    // Reporting events
    MEAL_REPORT_GENERATED: 'meal.report.generated',
    IMPACT_MEASURED: 'impact.measured'
};

export const KAFKA_CONFIG = {
    CLIENT_ID: 'meal-service',
    GROUP_ID: 'meal-service-group',
    BROKERS: [process.env.KAFKA_BROKER || 'kafka:9092']
};
