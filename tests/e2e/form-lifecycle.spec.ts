import { test, expect } from '@playwright/test';
import { adminContext, anonymousContext } from './helpers';
import type { APIRequestContext } from '@playwright/test';

/**
 * Journey 1: Full form lifecycle
 *
 * - Create a form (Draft)
 * - Edit it (add questions)
 * - Publish it
 * - Submit a response
 * - View results
 */
test.describe('Form lifecycle — create, edit, publish, submit, view results', () => {
  let admin: APIRequestContext;
  let formId: string;

  test.beforeAll(async () => {
    admin = await adminContext();
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test('POST /api/forms — creates a new form in Draft status', async () => {
    const res = await admin.post('/api/forms', {
      data: { title: 'E2E Test Form' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.form).toBeDefined();
    expect(body.form.title).toBe('E2E Test Form');
    expect(body.form.status).toBe('Draft');
    formId = body.form.id;
  });

  test('PATCH /api/forms/:id — adds questions and updates title', async () => {
    const res = await admin.patch(`/api/forms/${formId}`, {
      data: {
        title: 'E2E Test Form (Updated)',
        questions: [
          { type: 'Text', order: 1, required: true, settings: { label: 'Your name' } },
          { type: 'Email', order: 2, required: true, settings: { label: 'Email' } },
          { type: 'Rating', order: 3, required: false, settings: { label: 'Score', min: 1, max: 5 } },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.form.title).toBe('E2E Test Form (Updated)');
    expect(body.questions).toHaveLength(3);
  });

  test('POST /api/forms/:id/publish — publishes the form', async () => {
    const res = await admin.post(`/api/forms/${formId}/publish`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(1);
  });

  test('POST /api/forms/:id/submissions — submits a response', async () => {
    const anon = await anonymousContext();
    const res = await anon.post(`/api/forms/${formId}/submissions`, {
      data: {
        answers: [
          { questionOrder: 1, value: 'John Doe' },
          { questionOrder: 2, value: 'john@example.com' },
          { questionOrder: 3, value: 5 },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.submissionId).toBeDefined();
    await anon.dispose();
  });

  test('GET /api/forms/:id/results — returns submission results', async () => {
    const res = await admin.get(`/api/forms/${formId}/results`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.submissions).toBeDefined();
    expect(body.submissions.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/forms/:id — gets the published form', async () => {
    const res = await admin.get(`/api/forms/${formId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.form.status).toBe('Published');
    expect(body.form.version).toBe(1);
    expect(body.questions).toHaveLength(3);
  });
});
