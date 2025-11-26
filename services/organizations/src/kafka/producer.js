import { kafka } from './config.js';

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
            return true;
        } catch (error) {
            console.error('❌ Kafka producer error:', error);
            return false;
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

export const kafkaProducer = new KafkaProducer();
