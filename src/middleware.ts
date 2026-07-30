/**
 * Astro middleware — attaches correlation ID to every request.
 *
 * The correlation ID is passed through locals so API routes and pages
 * can include it in logs for end-to-end tracing.
 */

import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(({ locals }, next) => {
  locals.correlationId = crypto.randomUUID();
  return next();
});
