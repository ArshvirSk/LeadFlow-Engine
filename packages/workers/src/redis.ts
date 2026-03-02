import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

connection.on('ready', () => {
    // BullMQ requires noeviction so jobs are never silently dropped
    connection.config('SET', 'maxmemory-policy', 'noeviction').catch(() => {
        // CONFIG may be disabled on managed Redis — warning is cosmetic in that case
    });
});

connection.on('error', (err: Error) => {
    console.error('[redis] error', err.message);
});

export const makeQueue = <T>(name: string) =>
    new Queue<T>(name, { connection, defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 } });
