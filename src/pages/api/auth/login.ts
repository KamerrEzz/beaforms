import type { APIRoute } from 'astro';
import { login } from '../../../actions/auth';
import { logger } from '../../../lib/logger';

export const POST: APIRoute = async ({ request, cookies }) => {
  const correlationId = crypto.randomUUID();
  const body = await request.json();

  const result = await login(body, correlationId);

  if (result.status === 200 && result.cookie) {
    cookies.set('session', result.cookie, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
