import { request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4321';

/**
 * Create an authenticated API context as an Admin user.
 */
export async function adminContext(): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/auth/login', {
    data: { email: 'admin@goodform.local', password: 'password123' },
  });
  if (res.status() !== 200) {
    throw new Error(`Admin login failed: ${res.status()} ${await res.text()}`);
  }
  // Extract the cookie header from the response.
  const setCookie = res.headers()['set-cookie'];
  if (!setCookie) throw new Error('No session cookie received');

  // Create a new context with the session cookie.
  await ctx.dispose();
  const authedCtx = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      Cookie: setCookie.split(';')[0],
    },
  });
  return authedCtx;
}

/**
 * Create an unauthenticated API context.
 */
export async function anonymousContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: BASE_URL });
}
