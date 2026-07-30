/**
 * Request-level auth middleware.
 *
 * Extracts the session cookie, validates it, and attaches the user to the
 * request context. For endpoints that require RBAC, call `authorize()` from
 * the domain layer after extracting the user.
 *
 * This is the single place where HTTP meets domain. The middleware does not
 * duplicate authorization logic — it delegates to `authorize()`.
 */

import type { APIContext, MiddlewareNext } from 'astro';
import { validateSession } from './session';
import { authorize } from '../domain/authorization';
import { logger } from '../lib/logger';

type Endpoint = Parameters<typeof authorize>[1];

/**
 * Extract and validate the session from the request. Returns null if
 * unauthenticated — the caller decides whether to reject.
 */
export async function getSessionUser(context: APIContext) {
  const sessionId = context.cookies.get('session')?.value;
  if (!sessionId) return null;

  const { session, user } = await validateSession(sessionId);
  if (!session) return null;

  return {
    userId: user.id,
    role: user.role as 'Admin' | 'Employee',
    organizationId: user.organizationId,
  };
}

/**
 * Astro middleware that attaches the auth context to locals and enforces
 * RBAC for API routes.
 */
export async function authMiddleware(context: APIContext, next: MiddlewareNext) {
  // Only apply to API routes — pages handle auth differently.
  if (!context.url.pathname.startsWith('/api/')) {
    return next();
  }

  const user = await getSessionUser(context);
  context.locals.user = user;

  // Public endpoints (login, form submission) skip authorization.
  const publicPaths = ['/api/auth/login', /^\/api\/forms\/[^/]+\/submissions$/];
  const isPublic = publicPaths.some((pattern) =>
    typeof pattern === 'string'
      ? context.url.pathname === pattern
      : pattern.test(context.url.pathname)
  );

  if (isPublic) {
    return next();
  }

  // Extract the target org ID from the query string or path.
  // The actual endpoint handler validates the resource exists.
  const targetOrgId = context.url.searchParams.get('org') ?? user?.organizationId;

  if (!targetOrgId) {
    return new Response(JSON.stringify({ error: 'Organization ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Map pathname to endpoint for authorization.
  const endpoint = resolveEndpoint(context.url.pathname, context.method);
  if (!endpoint) {
    return next();
  }

  try {
    authorize(user, endpoint, targetOrgId);
    return next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    const status = message === 'Unauthenticated' ? 401 : 403;
    logger.warn('Authorization denied', {
      correlationId: context.locals.correlationId,
      pathname: context.url.pathname,
      reason: message,
    });
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function resolveEndpoint(pathname: string, method: string): Endpoint | null {
  const segments = pathname.split('/').filter(Boolean);

  // /api/forms
  if (segments[1] === 'forms') {
    if (!segments[2]) return method === 'GET' ? 'forms.list' : 'forms.create';
    if (segments[3] === 'publish') return 'forms.publish';
    if (segments[3] === 'results') return 'results.get';
    if (segments[3] === 'export') return 'results.export';
    if (!segments[3]) return method === 'GET' ? 'forms.get' : 'forms.edit';
  }

  // /api/submissions/:id/notifications
  if (segments[1] === 'submissions' && segments[3] === 'notifications') {
    if (segments[4] === 'retry' && segments[5] === 'email') return 'notifications.retryEmail';
    if (segments[4] === 'retry' && segments[5] === 'webhook') return 'notifications.retryWebhook';
    return 'notifications.get';
  }

  // /api/gdpr
  if (segments[1] === 'gdpr') {
    if (segments[2] === 'data-export') return 'gdpr.export';
    if (segments[2] === 'data-deletion') return 'gdpr.delete';
  }

  return null;
}
