import { Kafka } from 'kafkajs';

const kafka = new Kafka({
    clientId: 'reports-service',
    brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
    retry: {
        initialRetryTime: 100,
        retries: 8
    }
});

export class KafkaConsumer {
    constructor(groupId) {
        this.consumer = kafka.consumer({ 
            groupId: groupId || 'reports-service-group',
            sessionTimeout: 30000,
            heartbeatInterval: 10000,
        });
        this.handlers = new Map();
        this.isRunning = false;
    }

    async connect() {
        try {
            await this.consumer.connect();
            console.log('✅ Analytics Service - Kafka consumer connected successfully');
        } catch (error) {
            console.error('❌ Analytics Service - Kafka consumer connection failed:', error.message);
            throw error;
        }
    }

    async subscribe(topic, handler) {
        try {
            await this.consumer.subscribe({ topic, fromBeginning: true });
            this.handlers.set(topic, handler);
            console.log(`✅ Analytics Service - Subscribed to topic: ${topic}`);
        } catch (error) {
            console.error(`❌ Analytics Service - Failed to subscribe to topic ${topic}:`, error.message);
            throw error;
        }
    }

    async run() {
        try {
            if (this.isRunning) {
                console.log('⚠️ Analytics Service - Consumer is already running');
                return;
            }

            await this.connect();
            
            await this.consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const value = message.value ? JSON.parse(message.value.toString()) : null;
                        console.log(`📨 Analytics Service - Received message from topic: ${topic}`, {
                            partition,
                            offset: message.offset,
                            event_id: value?.event_id
                        });

                        const handler = this.handlers.get(topic);
                        if (handler) {
                            await handler(value);
                            console.log(`✅ Analytics Service - Successfully processed message from topic: ${topic}`);
                        } else {
                            console.warn(`⚠️ Analytics Service - No handler found for topic: ${topic}`);
                        }
                    } catch (error) {
                        console.error(`❌ Analytics Service - Error processing message from topic ${topic}:`, error.message);
                    }
                },
            });

            this.isRunning = true;
            console.log('✅ Analytics Service - Kafka consumer is running');
        } catch (error) {
            console.error('❌ Analytics Service - Kafka consumer failed to run:', error.message);
            setTimeout(() => this.run(), 10000);
        }
    }

    async disconnect() {
        try {
            await this.consumer.disconnect();
            this.isRunning = false;
            console.log('✅ Analytics Service - Kafka consumer disconnected');
        } catch (error) {
            console.error('❌ Analytics Service - Kafka consumer disconnect failed:', error.message);
        }
    }
}

export default KafkaConsumer;
