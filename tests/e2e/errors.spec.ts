import { test, expect } from '@playwright/test';
import { adminContext, anonymousContext } from './helpers';
import type { APIRequestContext } from '@playwright/test';

/**
 * Journey 3: Error handling and auth failures
 *
 * - Unauthenticated requests return 401
 * - Invalid form IDs return 404
 * - Validation errors return 400
 */
test.describe('Error handling — auth failures, 404s, validation errors', () => {
  let admin: APIRequestContext;

  test.beforeAll(async () => {
    admin = await adminContext();
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('POST /api/forms (no auth) — returns 401', async () => {
    const anon = await anonymousContext();
    const res = await anon.post('/api/forms', {
      data: { title: 'Should not create' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    await anon.dispose();
  });

  test('GET /api/forms/nonexistent — returns 404', async () => {
    const res = await admin.get('/api/forms/nonexistent-form-id');
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('POST /api/forms (missing title) — returns 400', async () => {
    const res = await admin.post('/api/forms', {
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('POST /api/auth/login (wrong credentials) — returns 401', async () => {
    const anon = await anonymousContext();
    const res = await anon.post('/api/auth/login', {
      data: { email: 'admin@goodform.local', password: 'wrongpassword' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid credentials');
    await anon.dispose();
  });

  test('PATCH /api/forms/nonexistent (no auth) — returns 401', async () => {
    const anon = await anonymousContext();
    const res = await anon.patch('/api/forms/nonexistent-id', {
      data: { title: 'Hack attempt' },
    });
    expect(res.status()).toBe(401);
    await anon.dispose();
  });
});
