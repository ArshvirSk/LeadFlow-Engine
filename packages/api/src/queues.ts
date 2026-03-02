import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAMES } from '@leadflow/types';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const isTLS = REDIS_URL.startsWith('rediss://');

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  ...(isTLS ? { tls: {} } : {}),
});

redis.on('error', (err: Error) => {
  console.warn('[api:redis] connection error:', err.message);
});

/** All BullMQ queues — used for Bull Board display (read-only in API) */
export const allQueues = Object.entries(QUEUE_NAMES).map(
  ([, name]) => new Queue(name, { connection: redis })
);
