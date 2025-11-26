import { kafka, CONSUMER_GROUPS } from './config.js';

class KafkaConsumer {
    constructor(groupId) {
        this.consumer = kafka.consumer({ 
            groupId: groupId || 'default-group' 
        });
        this.connected = false;
        this.handlers = new Map();
    }

    async connect() {
        if (!this.connected) {
            await this.consumer.connect();
            this.connected = true;
            console.log(`✅ Kafka Consumer connected to group: ${this.consumer.options.groupId}`);
        }
    }

    async subscribe(topic, handler) {
        try {
            await this.connect();
            await this.consumer.subscribe({ topic, fromBeginning: true });
            this.handlers.set(topic, handler);
            console.log(`✅ Subscribed to topic: ${topic}`);
        } catch (error) {
            console.error(`❌ Failed to subscribe to ${topic}:`, error);
            throw error;
        }
    }

    async run() {
        await this.consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const handler = this.handlers.get(topic);
                    if (handler) {
                        const value = JSON.parse(message.value.toString());
                        console.log(`📥 Processing message from ${topic}`);
                        await handler(value);
                    }
                } catch (error) {
                    console.error(`❌ Error processing message from ${topic}:`, error);
                }
            },
        });
    }

    async disconnect() {
        if (this.connected) {
            await this.consumer.disconnect();
            this.connected = false;
            console.log('✅ Kafka Consumer disconnected');
        }
    }
}

export default KafkaConsumer;
