import { kafka, TOPICS } from './config.js';

class KafkaProducer {
    constructor() {
        this.producer = kafka.producer();
        this.connected = false;
    }

    async connect() {
        if (!this.connected) {
            await this.producer.connect();
            this.connected = true;
            console.log('✅ Kafka Producer connected');
        }
    }

    async sendMessage(topic, message, key = null) {
        try {
            await this.connect();
            
            const messages = [{
                value: JSON.stringify({
                    ...message,
                    timestamp: new Date().toISOString(),
                    service: process.env.SERVICE_NAME
                })
            }];

            if (key) {
                messages[0].key = key;
            }

            await this.producer.send({
                topic,
                messages
            });

            console.log(`📤 Kafka message sent to ${topic}`);
        } catch (error) {
            console.error('❌ Kafka producer error:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.connected) {
            await this.producer.disconnect();
            this.connected = false;
            console.log('✅ Kafka Producer disconnected');
        }
    }
}

// Create singleton instance
export const kafkaProducer = new KafkaProducer();
