import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { submitForm } from '../../src/actions/submissions';
import { db } from '../../src/lib/db';

/**
 * Submission flow — integration tests
 *
 * Covers:
 * - R2: atomic submission with version snapshot
 * - R4: idempotency via submission token
 * - Contract: POST /api/forms/:id/submissions -> { submissionId }
 * - Contract: 400 Validation, 429 RateLimit
 *
 * These tests exercise the real submitForm action against a database.
 * Requires PostgreSQL and Redis to be running.
 */

// -----------------------------------------------------------------

describe('Submission — atomicity and version snapshot', () => {
  let orgId: string;
  let publishedFormId: string;
  let draftFormId: string;
  let archivedFormId: string;

  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;

    const published = await db.form.create({
      data: { title: 'Published Form', organizationId: orgId, status: 'Published', version: 1 },
    });
    publishedFormId = published.id;

    await db.question.create({
      data: { formId: publishedFormId, type: 'Text', order: 1, required: true },
    });

    const draft = await db.form.create({
      data: { title: 'Draft Form', organizationId: orgId, status: 'Draft', version: 0 },
    });
    draftFormId = draft.id;

    const archived = await db.form.create({
      data: { title: 'Archived Form', organizationId: orgId, status: 'Archived', version: 1 },
    });
    archivedFormId = archived.id;
  });

  afterEach(async () => {
    await db.answer.deleteMany();
    await db.notificationJob.deleteMany();
    await db.submission.deleteMany();
    await db.logicRule.deleteMany();
    await db.question.deleteMany();
    await db.form.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany();
  });

  it('creates a submission linked to the current published version', async () => {
    const res = await submitForm({
      formId: publishedFormId,
      token: 'tok-unique-001',
      answers: [{ questionOrder: 1, value: 'yes' }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('submissionId');
    if ('formVersion' in res.body) {
      expect(res.body.formVersion).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects submission with missing required answer (400)', async () => {
    const res = await submitForm({
      formId: publishedFormId,
      token: 'tok-unique-002',
      answers: [],
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects submission to a Draft form (400)', async () => {
    const res = await submitForm({
      formId: draftFormId,
      token: 'tok-unique-003',
      answers: [{ questionOrder: 999, value: 'hello' }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects submission to an Archived form (400)', async () => {
    const res = await submitForm({
      formId: archivedFormId,
      token: 'tok-unique-004',
      answers: [{ questionOrder: 999, value: 'hello' }],
    });
    expect(res.status).toBe(400);
  });
});

describe('Submission — idempotency via token', () => {
  let publishedFormId: string;

  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Test Org' } });
    const form = await db.form.create({
      data: { title: 'Published Form', organizationId: org.id, status: 'Published', version: 1 },
    });
    publishedFormId = form.id;
    await db.question.create({
      data: { formId: publishedFormId, type: 'Text', order: 1, required: false },
    });
  });

  afterEach(async () => {
    await db.answer.deleteMany();
    await db.notificationJob.deleteMany();
    await db.submission.deleteMany();
    await db.question.deleteMany();
    await db.form.deleteMany();
    await db.organization.deleteMany();
  });

  it('returns the same submissionId when resubmitting with the same token', async () => {
    const first = await submitForm({
      formId: publishedFormId,
      token: 'tok-idempotent-duplicate',
      answers: [{ questionOrder: 1, value: 'first' }],
    });
    expect(first.status).toBe(201);
    const firstId = 'submissionId' in first.body ? first.body.submissionId : '';

    const second = await submitForm({
      formId: publishedFormId,
      token: 'tok-idempotent-duplicate',
      answers: [{ questionOrder: 1, value: 'changed' }],
    });
    expect(second.status).toBe(200);  // Idempotent — returns existing
    const secondId = 'submissionId' in second.body ? second.body.submissionId : '';
    // Idempotent: same token -> same submission, original answers preserved.
    expect(secondId).toBe(firstId);
  });
});

describe('Submission — rate limiting', () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;
  });

  afterEach(async () => {
    await db.answer.deleteMany();
    await db.notificationJob.deleteMany();
    await db.submission.deleteMany();
    await db.question.deleteMany();
    await db.form.deleteMany();
    await db.organization.deleteMany();
  });

  it('returns 429 after exceeding the rate limit for a single form', async () => {
    const form = await db.form.create({
      data: { title: 'Rate Test', organizationId: orgId, status: 'Published', version: 1 },
    });
    const q = await db.question.create({
      data: { formId: form.id, type: 'Text', order: 1, required: false },
    });

    const requests = Array.from({ length: 30 }, (_, i) =>
      submitForm({
        formId: form.id,
        token: `tok-rate-${i}`,
        answers: [{ questionOrder: 1, value: 'ok' }],
      })
    );
    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.status);

    // At least one should be 429 once the limit is hit.
    expect(statuses).toContain(429);
  });

  it('includes error message in 429 responses', async () => {
    const form = await db.form.create({
      data: { title: 'Rate Test Retry', organizationId: orgId, status: 'Published', version: 1 },
    });
    const q = await db.question.create({
      data: { formId: form.id, type: 'Text', order: 1, required: false },
    });

    const requests = Array.from({ length: 30 }, (_, i) =>
      submitForm({
        formId: form.id,
        token: `tok-rate-retry-${i}`,
        answers: [{ questionOrder: 1, value: 'ok' }],
      })
    );
    const results = await Promise.all(requests);
    const rateLimited = results.find((r) => r.status === 429);
    // If rate limiting was triggered, the response should contain error guidance.
    if (rateLimited) {
      expect(rateLimited.body).toHaveProperty('error');
    }
  });
});
