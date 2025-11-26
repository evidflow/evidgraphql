import { Kafka } from 'kafkajs';

const kafka = new Kafka({
    clientId: 'email-service',
    brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
    retry: {
        initialRetryTime: 100,
        retries: 8
    }
});

export class KafkaConsumer {
    constructor() {
        this.consumer = kafka.consumer({ 
            groupId: 'email-service-group',
            sessionTimeout: 30000,
            heartbeatInterval: 10000,
        });
        this.handlers = new Map();
        this.isRunning = false;
    }

    async connect() {
        try {
            await this.consumer.connect();
            console.log('✅ Email Service - Kafka consumer connected successfully');
        } catch (error) {
            console.error('❌ Email Service - Kafka consumer connection failed:', error.message);
            throw error;
        }
    }

    async subscribe(topic, handler) {
        try {
            await this.consumer.subscribe({ topic, fromBeginning: true });
            this.handlers.set(topic, handler);
            console.log(`✅ Email Service - Subscribed to topic: ${topic}`);
        } catch (error) {
            console.error(`❌ Email Service - Failed to subscribe to topic ${topic}:`, error.message);
            throw error;
        }
    }

    async run() {
        try {
            if (this.isRunning) {
                console.log('⚠️ Email Service - Consumer is already running');
                return;
            }

            await this.connect();
            
            await this.consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const value = message.value ? JSON.parse(message.value.toString()) : null;
                        console.log(`📨 Email Service - Received message from topic: ${topic}`, {
                            partition,
                            offset: message.offset,
                            value
                        });

                        // Call the appropriate handler based on topic
                        const handler = this.handlers.get(topic);
                        if (handler) {
                            await handler(value);
                            console.log(`✅ Email Service - Successfully processed message from topic: ${topic}`);
                        } else {
                            console.warn(`⚠️ Email Service - No handler found for topic: ${topic}`);
                        }
                    } catch (error) {
                        console.error(`❌ Email Service - Error processing message from topic ${topic}:`, error.message);
                        // Don't throw to avoid stopping the consumer
                    }
                },
            });

            this.isRunning = true;
            console.log('✅ Email Service - Kafka consumer is running');
        } catch (error) {
            console.error('❌ Email Service - Kafka consumer failed to run:', error.message);
            // Retry connection after delay
            setTimeout(() => this.run(), 10000);
        }
    }

    async disconnect() {
        try {
            await this.consumer.disconnect();
            this.isRunning = false;
            console.log('✅ Email Service - Kafka consumer disconnected');
        } catch (error) {
            console.error('❌ Email Service - Kafka consumer disconnect failed:', error.message);
        }
    }
}

export default KafkaConsumer;
