import { Kafka, Partitioners } from 'kafkajs';
import crypto from 'crypto';

const kafka = new Kafka({
    clientId: 'templates-service',
    brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
    retry: {
        initialRetryTime: 100,
        retries: 8
    }
});

export class KafkaProducer {
    constructor() {
        this.producer = kafka.producer({ 
            createPartitioner: Partitioners.LegacyPartitioner 
        });
        this.isConnected = false;
    }

    async connect() {
        if (this.isConnected) return;
        
        try {
            await this.producer.connect();
            this.isConnected = true;
            console.log('✅ Templates Service - Kafka producer connected successfully');
        } catch (error) {
            console.error('❌ Templates Service - Kafka producer connection failed:', error.message);
            throw error;
        }
    }

    async send(topic, eventData) {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const message = {
                value: JSON.stringify({
                    ...eventData,
                    event_id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    service: 'templates-service'
                })
            };

            await this.producer.send({
                topic,
                messages: [message]
            });
            
            console.log(`✅ Templates Service - Sent event to topic: ${topic}`);
            return true;
        } catch (error) {
            console.error(`❌ Templates Service - Failed to send event to topic ${topic}:`, error.message);
            return false;
        }
    }

    async disconnect() {
        try {
            await this.producer.disconnect();
            this.isConnected = false;
            console.log('✅ Templates Service - Kafka producer disconnected');
        } catch (error) {
            console.error('❌ Templates Service - Kafka producer disconnect failed:', error.message);
        }
    }
}

// Create and export a singleton instance
export const kafkaProducer = new KafkaProducer();
export default KafkaProducer;
