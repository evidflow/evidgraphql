import { Kafka } from 'kafkajs';

// Create Kafka instance
const kafka = new Kafka({
    clientId: 'auth-service',
    brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
    retry: {
        initialRetryTime: 100,
        retries: 8
    }
});

export class KafkaProducer {
    constructor() {
        this.producer = kafka.producer();
        this.isConnected = false;
    }

    async connect() {
        if (this.isConnected) return;
        
        try {
            await this.producer.connect();
            this.isConnected = true;
            console.log('✅ Auth Service - Kafka producer connected successfully');
        } catch (error) {
            console.error('❌ Auth Service - Kafka producer connection failed:', error.message);
            throw error;
        }
    }

    async send(topic, messages) {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const messageArray = Array.isArray(messages) ? messages : [messages];
            const formattedMessages = messageArray.map(msg => ({
                value: typeof msg === 'string' ? msg : JSON.stringify(msg)
            }));

            await this.producer.send({
                topic,
                messages: formattedMessages
            });
            
            console.log(`✅ Auth Service - Sent message to topic: ${topic}`);
            return true;
        } catch (error) {
            console.error(`❌ Auth Service - Failed to send message to topic ${topic}:`, error.message);
            return false;
        }
    }

    async disconnect() {
        try {
            await this.producer.disconnect();
            this.isConnected = false;
            console.log('✅ Auth Service - Kafka producer disconnected');
        } catch (error) {
            console.error('❌ Auth Service - Kafka producer disconnect failed:', error.message);
        }
    }
}

// Create and export a singleton instance
export const kafkaProducer = new KafkaProducer();
export default KafkaProducer;
