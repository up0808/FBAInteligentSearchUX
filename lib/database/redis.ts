import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

try {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('✅ Redis client initialized successfully');
  } else {
    console.warn(
      '⚠️  Upstash Redis environment variables not set. Chat history will not be saved.',
    );
  }
} catch (error) {
  console.error('❌ Failed to initialize Upstash Redis client:', error);
}

export { redis };