/**
 * Redis connection singleton.
 *
 * Same globalThis pattern as the Prisma client. Used by BullMQ for job
 * queues and by the rate limiter for submission throttling.
 */

import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return globalForRedis.redis;
}
