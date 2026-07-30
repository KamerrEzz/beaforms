import { test, expect } from '@playwright/test';
import { adminContext } from './helpers';
import type { APIRequestContext } from '@playwright/test';

/**
 * Journey 2: GDPR data export
 *
 * - Request a data export for the organization
 * - Verify the download URL works
 * - Request data deletion and verify it's accepted
 */
test.describe('GDPR — data export and deletion', () => {
  let admin: APIRequestContext;

  test.beforeAll(async () => {
    admin = await adminContext();
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('POST /api/gdpr/data-export — returns a download URL', async () => {
    const res = await admin.post('/api/gdpr/data-export', {
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.downloadUrl).toBeDefined();
    expect(body.downloadUrl).toMatch(/^https?:\/\//);
  });

  test('POST /api/gdpr/data-export — download URL serves real JSON', async () => {
    // Create an export first
    const exportRes = await admin.post('/api/gdpr/data-export', { data: {} });
    const { downloadUrl } = await exportRes.json();

    // Download the export file
    const downloadRes = await admin.get(downloadUrl);
    expect(downloadRes.status()).toBe(200);
    expect(downloadRes.headers()['content-type']).toContain('json');
    const data = await downloadRes.json();
    expect(data.organizationId).toBeDefined();
    expect(data.submissions).toBeDefined();
  });

  test('POST /api/gdpr/data-deletion — returns 202 Accepted', async () => {
    const res = await admin.post('/api/gdpr/data-deletion', {
      data: { olderThanDays: 365 },
    });
    expect(res.status()).toBe(202);
    const body = await res.json();
    expect(body.message).toBeDefined();
    expect(body.message).toContain('accepted');
  });
});
