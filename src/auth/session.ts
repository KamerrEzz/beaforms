/**
 * Lucia Auth configuration.
 *
 * Lucia v3 uses a database adapter (Prisma in our case) and oslo for
 * password hashing. Sessions are stored in the Session table and validated
 * on every request by checking expiry.
 */

import { Lucia } from 'lucia';
import { PrismaAdapter } from '@lucia-auth/adapter-prisma';
import { db } from '../lib/db';

const adapter = new PrismaAdapter(db.session, db.user);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === 'production',
    },
  },
  getUserAttributes: (attributes) => ({
    email: attributes.email,
    role: attributes.role,
    organizationId: attributes.organizationId,
  }),
});

// Augment the Lucia types so we can use them in Astro middleware.
declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      role: string;
      organizationId: string;
    };
  }
}

/**
 * Create a session for the given user ID. Returns the session cookie value.
 */
export async function createSession(userId: string): Promise<string> {
  const session = await lucia.createSession(userId, {});
  return lucia.createSessionCookie(session.id).value;
}

/**
 * Invalidate all existing sessions for a user. Called on login to prevent
 * concurrent session accumulation (MEDIUM FIX #07).
 */
export async function invalidateAllSessions(userId: string): Promise<void> {
  await lucia.invalidateSessionsForUser(userId);
}

/**
 * Validate a session ID from a cookie. Returns the session and user, or
 * null if the session is invalid or expired.
 */
export async function validateSession(sessionId: string) {
  return lucia.validateSession(sessionId);
}
