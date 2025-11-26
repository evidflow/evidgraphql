import { kafka } from './kafka/config.js';

export async function waitForKafka(maxRetries = 30, delay = 2000) {
  const admin = kafka.admin();
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Attempting to connect to Kafka (attempt ${attempt}/${maxRetries})...`);
      await admin.connect();
      
      // Test by listing topics
      const topics = await admin.listTopics();
      console.log('✅ Kafka is ready! Available topics:', topics);
      
      await admin.disconnect();
      return true;
    } catch (error) {
      console.log(`❌ Kafka connection failed (attempt ${attempt}/${maxRetries}):`, error.message);
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.log('❌ Max retries reached, starting service without Kafka');
        return false;
      }
    }
  }
}
