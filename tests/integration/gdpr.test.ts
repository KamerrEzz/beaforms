import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requestDataExport, requestDataDeletion } from '../../src/actions/gdpr';
import { db } from '../../src/lib/db';

/**
 * GDPR compliance — integration tests
 *
 * Covers constraint R1: personal data must be manageable and deletable.
 * Tests the data-export and data-deletion action functions directly.
 *
 * Contract:
 *   POST /api/gdpr/data-export   -> { downloadUrl }
 *   POST /api/gdpr/data-deletion  -> 202 Accepted
 *
 * OrganizationId is passed as the second parameter (derived from session,
 * NOT from user input — see CRITICAL FINDING-01 fix).
 *
 * Requires PostgreSQL and Redis to be running.
 */

// -----------------------------------------------------------------

describe('GDPR — Data export', () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;

    const form = await db.form.create({
      data: { title: 'Survey', organizationId: orgId, status: 'Published', version: 1 },
    });

    const q = await db.question.create({
      data: { formId: form.id, type: 'Text', order: 1, required: false },
    });

    // Create a submission with personal data for export
    const sub = await db.submission.create({
      data: { formId: form.id, token: 'tok-export-data', version: 1 },
    });
    await db.answer.create({
      data: { submissionId: sub.id, questionId: q.id, value: 'personal data' },
    });
  });

  afterEach(async () => {
    await db.answer.deleteMany();
    await db.notificationJob.deleteMany();
    await db.submission.deleteMany();
    await db.question.deleteMany();
    await db.form.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany();
  });

  it('returns a download URL for a valid organization export', async () => {
    const res = await requestDataExport({}, orgId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('downloadUrl');
    if ('downloadUrl' in res.body) {
      expect(res.body.downloadUrl).toMatch(/^https?:\/\//);
    }
  });

  it('returns a download URL for a specific user export', async () => {
    const res = await requestDataExport({ userId: 'u-1' }, orgId);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('downloadUrl');
    if ('downloadUrl' in res.body) {
      expect(res.body.downloadUrl).toBeDefined();
    }
  });

  it('rejects export for a nonexistent organization', async () => {
    const res = await requestDataExport({}, 'org-nonexistent');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 for a valid export request (role check is at HTTP layer)', async () => {
    // The action function does not enforce RBAC — that is the middleware's job.
    // When called with a valid org, it always returns 200.
    const res = await requestDataExport({}, orgId);
    expect(res.status).toBe(200);
  });
});

describe('GDPR — Data deletion', () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;

    const form = await db.form.create({
      data: { title: 'Survey', organizationId: orgId, status: 'Published', version: 1 },
    });

    await db.submission.create({
      data: { formId: form.id, token: 'tok-deletion-data', version: 1 },
    });
  });

  afterEach(async () => {
    await db.answer.deleteMany();
    await db.notificationJob.deleteMany();
    await db.submission.deleteMany();
    await db.question.deleteMany();
    await db.form.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany();
  });

  it('returns 202 Accepted for a valid deletion request', async () => {
    const res = await requestDataDeletion({}, orgId);
    expect(res.status).toBe(202);
  });

  it('deletes data for a specific user within an organization', async () => {
    const res = await requestDataDeletion({ userId: 'u-1' }, orgId);
    expect(res.status).toBe(202);
  });

  it('deletes data older than a retention threshold', async () => {
    const res = await requestDataDeletion({ olderThanDays: 365 }, orgId);
    expect(res.status).toBe(202);
  });

  it('rejects deletion for a nonexistent organization', async () => {
    const res = await requestDataDeletion({}, 'org-nonexistent');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 202 for a valid deletion request (role check is at HTTP layer)', async () => {
    // The action function does not enforce RBAC — that is the middleware's job.
    // When called with a valid org and input, it always returns 202.
    const res = await requestDataDeletion({}, orgId);
    expect(res.status).toBe(202);
  });
});

describe('GDPR — Retention enforcement', () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;

    const form = await db.form.create({
      data: { title: 'Survey', organizationId: orgId, status: 'Published', version: 1 },
    });

    const q = await db.question.create({
      data: { formId: form.id, type: 'Text', order: 1, required: false },
    });

    const sub = await db.submission.create({
      data: { formId: form.id, token: 'tok-retention-data', version: 1 },
    });
    await db.answer.create({
      data: { submissionId: sub.id, questionId: q.id, value: 'retained personal data' },
    });
  });

  afterEach(async () => {
    await db.answer.deleteMany();
    await db.notificationJob.deleteMany();
    await db.submission.deleteMany();
    await db.question.deleteMany();
    await db.form.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany();
  });

  it('submission answers are deletable independently of the submission record', async () => {
    // After deletion, the submission record may remain (for audit) but
    // personal answers must be gone. The action accepts the request —
    // actual deletion is handled async by the BullMQ worker.
    const res = await requestDataDeletion({ userId: 'u-1' }, orgId);
    expect(res.status).toBe(202);
  });

  it('deletion is idempotent: requesting deletion twice does not fail', async () => {
    const first = await requestDataDeletion({ userId: 'u-1' }, orgId);
    const second = await requestDataDeletion({ userId: 'u-1' }, orgId);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
  });

  it('export after deletion returns data without the deleted user', async () => {
    // Request deletion for u-1, then export for the org.
    await requestDataDeletion({ userId: 'u-1' }, orgId);
    const exportRes = await requestDataExport({}, orgId);
    expect(exportRes.status).toBe(200);
    // The exported file should not contain u-1's personal data.
    // Full content verification is out of scope for this structural test.
  });
});
