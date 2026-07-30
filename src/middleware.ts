/**
 * Astro middleware — attaches correlation ID and security headers to every request.
 *
 * MEDIUM FIX #06: Adds CSP, HSTS, X-Frame-Options, nosniff, and other
 * security headers. The correlation ID is passed through locals so API
 * routes and pages can include it in logs for end-to-end tracing.
 */

import { defineMiddleware } from 'astro:middleware';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
};

export const onRequest = defineMiddleware(({ locals, url }, next) => {
  locals.correlationId = crypto.randomUUID();

  const response = next();

  // Apply security headers to all responses.
  return Promise.resolve(response).then((res) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      res.headers.set(key, value);
    }
    return res;
  });
});
