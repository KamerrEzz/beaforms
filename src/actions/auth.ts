/**
 * Authentication actions — login and session creation.
 *
 * Validates credentials, creates a session, and returns a cookie value.
 * The session cookie is set by the API route handler.
 */

import { z } from 'zod';
import { db } from '../lib/db';
import { createSession, invalidateAllSessions } from '../auth/session';
import { normalizeEmail } from '../domain/normalization';
import { verifyPassword } from '../auth/password';
import { getRedis } from '../lib/redis';
import { logger } from '../lib/logger';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export interface LoginResult {
  status: number;
  body: { token: string } | { error: string };
  cookie?: string;
}

export async function login(
  input: unknown,
  correlationId?: string
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn('Login validation failed', { correlationId, errors: parsed.error.flatten() });
    return { status: 400, body: { error: 'Invalid input' } };
  }

  const { email, password } = parsed.data;
  const normalizedEmail = normalizeEmail(email);

  // HIGH FIX #04: Rate limit login attempts — counts only failed attempts.
  // Max attempts per email per 15 minutes. Configurable via RATE_LIMIT_LOGIN_MAX env var.
  const MAX_LOGIN_ATTEMPTS = parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10);
  const redis = getRedis();
  const rateKey = `rate:login:${normalizedEmail}`;

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    logger.warn('Login failed: user not found', { correlationId, email: normalizedEmail });
    return { status: 401, body: { error: 'Invalid credentials' } };
  }

  // CRITICAL FIX: Actually verify the password against the stored hash.
  if (!user.passwordHash) {
    logger.warn('Login failed: no password hash', { correlationId, userId: user.id });
    return { status: 401, body: { error: 'Invalid credentials' } };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    logger.warn('Login failed: invalid password', { correlationId, userId: user.id });
    // Increment rate limit counter only on failed attempts
    const current = await redis.incr(rateKey);
    if (current === 1) {
      await redis.expire(rateKey, 15 * 60);
    }
    if (current > MAX_LOGIN_ATTEMPTS) {
      logger.warn('Login rate limited', { correlationId, email: normalizedEmail });
      return { status: 429, body: { error: 'Too many attempts. Please try again later.' } };
    }
    return { status: 401, body: { error: 'Invalid credentials' } };
  }

  // MEDIUM FIX #07: Invalidate all previous sessions before creating a new one.
  await invalidateAllSessions(user.id);

  const cookie = await createSession(user.id);
  logger.info('Login successful', { correlationId, userId: user.id, role: user.role });

  // Reset rate limiter on successful login so legitimate users are not
  // penalised for past failed attempts.
  await redis.del(rateKey);

  return {
    status: 200,
    body: { token: cookie },
    cookie,
  };
}
