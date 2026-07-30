/**
 * Readiness health endpoint.
 *
 * Returns the status of all critical dependencies (database, Redis).
 * Used by load balancers and orchestrators to decide if the container
 * should receive traffic.
 *
 * GET /api/health → { status: "ok"|"degraded", db, redis, timestamp }
 */

import type { APIRoute } from 'astro';
import { db } from '@/lib/db';
import { getRedis } from '@/lib/redis';

export const GET: APIRoute = async () => {
  const timestamp = new Date().toISOString();
  let dbStatus: 'ok' | 'error' = 'ok';
  let redisStatus: 'ok' | 'error' = 'ok';

  // Check database
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'error';
  }

  // Check Redis
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    if (pong !== 'PONG') redisStatus = 'error';
  } catch {
    redisStatus = 'error';
  }

  const allOk = dbStatus === 'ok' && redisStatus === 'ok';

  return new Response(
    JSON.stringify({
      status: allOk ? 'ok' : 'degraded',
      db: dbStatus,
      redis: redisStatus,
      timestamp,
    }),
    {
      status: allOk ? 200 : 503,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
