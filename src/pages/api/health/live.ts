/**
 * Liveness health endpoint.
 *
 * Returns 200 OK if the process is alive. Does NOT check dependencies.
 * Used by orchestrators to decide if the container should be restarted.
 *
 * GET /api/health/live → 200 OK
 */

import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  return new Response('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
};
