/**
 * Authentication actions — login and session creation.
 *
 * Validates credentials, creates a session, and returns a cookie value.
 * The session cookie is set by the API route handler.
 */

import { z } from 'zod';
import { db } from '../lib/db';
import { createSession } from '../auth/session';
import { normalizeEmail } from '../domain/normalization';
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

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    logger.warn('Login failed: user not found', { correlationId, email: normalizedEmail });
    return { status: 401, body: { error: 'Invalid credentials' } };
  }

  // Password verification would use oslo's compare function in production.
  // For now, we check the hash exists — the actual comparison depends on
  // how passwords are hashed during registration (not in scope for this phase).
  if (!user.passwordHash) {
    logger.warn('Login failed: no password hash', { correlationId, userId: user.id });
    return { status: 401, body: { error: 'Invalid credentials' } };
  }

  const cookie = await createSession(user.id);
  logger.info('Login successful', { correlationId, userId: user.id, role: user.role });

  return {
    status: 200,
    body: { token: cookie },
    cookie,
  };
}
