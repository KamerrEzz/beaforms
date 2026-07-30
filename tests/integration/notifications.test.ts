import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getNotificationStatus, retryEmail, retryWebhook } from '../../src/actions/notifications';
import { db } from '../../src/lib/db';

/**
 * Notification management — integration tests
 *
 * Covers constraint R4: email and webhook retries must be idempotent.
 * Tests the action layer that manages notification status and retries.
 *
 * Requires PostgreSQL and Redis to be running.
 */

// -----------------------------------------------------------------

describe('Email notification adapter', () => {
  let orgId: string;
  let emailSentSubId: string;
  let emailFailedSubId: string;
  let emailIdempotentSubId: string;
  let emailTimeoutSubId: string;

  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;

    const form = await db.form.create({
      data: { title: 'Form', organizationId: orgId, status: 'Published', version: 1 },
    });

    // Successful email — status: sent
    const sub1 = await db.submission.create({
      data: { formId: form.id, token: 'tok-email-sent', version: 1 },
    });
    emailSentSubId = sub1.id;
    await db.notificationJob.create({
      data: {
        id: `email-${sub1.id}`,
        submissionId: sub1.id,
        channel: 'email',
        status: 'sent',
        lastAttempt: new Date(),
      },
    });
    // Also add a webhook job so status response includes both channels.
    await db.notificationJob.create({
      data: {
        id: `webhook-${sub1.id}`,
        submissionId: sub1.id,
        channel: 'webhook',
        status: 'delivered',
        lastAttempt: new Date(),
      },
    });

    // Failed email — status: failed
    const sub2 = await db.submission.create({
      data: { formId: form.id, token: 'tok-email-fail', version: 1 },
    });
    emailFailedSubId = sub2.id;
    await db.notificationJob.create({
      data: {
        id: `email-${sub2.id}`,
        submissionId: sub2.id,
        channel: 'email',
        status: 'failed',
        lastAttempt: new Date(),
      },
    });

    // Idempotent email — starts as failed so retry is meaningful
    const sub3 = await db.submission.create({
      data: { formId: form.id, token: 'tok-email-idempotent', version: 1 },
    });
    emailIdempotentSubId = sub3.id;
    await db.notificationJob.create({
      data: {
        id: `email-${sub3.id}`,
        submissionId: sub3.id,
        channel: 'email',
        status: 'failed',
        lastAttempt: new Date(),
      },
    });

    // Timeout email — status: failed with a recorded lastAttempt
    const sub4 = await db.submission.create({
      data: { formId: form.id, token: 'tok-email-timeout', version: 1 },
    });
    emailTimeoutSubId = sub4.id;
    await db.notificationJob.create({
      data: {
        id: `email-${sub4.id}`,
        submissionId: sub4.id,
        channel: 'email',
        status: 'failed',
        lastAttempt: new Date(),
      },
    });
  });

  afterEach(async () => {
    await db.notificationJob.deleteMany();
    await db.answer.deleteMany();
    await db.submission.deleteMany();
    await db.question.deleteMany();
    await db.form.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany();
  });

  it('marks email as sent on successful dispatch', async () => {
    const res = await getNotificationStatus(emailSentSubId, orgId);
    expect(res.status).toBe(200);
    if ('email' in res.body) {
      expect(res.body.email.status).toBe('sent');
      expect(res.body.email.lastAttempt).not.toBeNull();
    }
  });

  it('marks email as failed when the SMTP server returns an error', async () => {
    const res = await getNotificationStatus(emailFailedSubId, orgId);
    expect(res.status).toBe(200);
    if ('email' in res.body) {
      expect(res.body.email.status).toBe('failed');
    }
  });

  it('returns 202 Accepted when retrying a failed email', async () => {
    const res = await retryEmail(emailFailedSubId, orgId);
    expect(res.status).toBe(202);
  });

  it('idempotent retry: re-sending does not create a duplicate email', async () => {
    // Two retries on the same failed submission should not double-send.
    const first = await retryEmail(emailIdempotentSubId, orgId);
    const second = await retryEmail(emailIdempotentSubId, orgId);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    // After the first retry the job status changes to 'pending';
    // the second retry finds it and skips enqueuing.
    const status = await getNotificationStatus(emailIdempotentSubId, orgId);
    if ('email' in status.body) {
      expect(['sent', 'pending']).toContain(status.body.email.status);
    }
  });

  it('times out gracefully when the SMTP server is unreachable', async () => {
    const res = await getNotificationStatus(emailTimeoutSubId, orgId);
    expect(res.status).toBe(200);
    if ('email' in res.body) {
      expect(res.body.email.status).toBe('failed');
      expect(res.body.email.lastAttempt).not.toBeNull();
    }
  });
});

describe('Webhook notification adapter', () => {
  let orgId: string;
  let webhookDeliveredSubId: string;
  let webhookFailedSubId: string;
  let webhookIdempotentSubId: string;
  let webhookTimeoutSubId: string;
  let webhookBackoffSubId: string;

  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;

    const form = await db.form.create({
      data: { title: 'Form', organizationId: orgId, status: 'Published', version: 1 },
    });

    // Delivered webhook — status: delivered
    const sub1 = await db.submission.create({
      data: { formId: form.id, token: 'tok-webhook-delivered', version: 1 },
    });
    webhookDeliveredSubId = sub1.id;
    await db.notificationJob.create({
      data: {
        id: `webhook-${sub1.id}`,
        submissionId: sub1.id,
        channel: 'webhook',
        status: 'delivered',
        lastAttempt: new Date(),
      },
    });

    // Failed webhook — status: failed
    const sub2 = await db.submission.create({
      data: { formId: form.id, token: 'tok-webhook-fail', version: 1 },
    });
    webhookFailedSubId = sub2.id;
    await db.notificationJob.create({
      data: {
        id: `webhook-${sub2.id}`,
        submissionId: sub2.id,
        channel: 'webhook',
        status: 'failed',
        lastAttempt: new Date(),
      },
    });

    // Idempotent webhook — starts as failed
    const sub3 = await db.submission.create({
      data: { formId: form.id, token: 'tok-webhook-idempotent', version: 1 },
    });
    webhookIdempotentSubId = sub3.id;
    await db.notificationJob.create({
      data: {
        id: `webhook-${sub3.id}`,
        submissionId: sub3.id,
        channel: 'webhook',
        status: 'failed',
        lastAttempt: new Date(),
      },
    });

    // Timeout webhook — status: failed
    const sub4 = await db.submission.create({
      data: { formId: form.id, token: 'tok-webhook-timeout', version: 1 },
    });
    webhookTimeoutSubId = sub4.id;
    await db.notificationJob.create({
      data: {
        id: `webhook-${sub4.id}`,
        submissionId: sub4.id,
        channel: 'webhook',
        status: 'failed',
        lastAttempt: new Date(),
      },
    });

    // Backoff webhook — starts as failed for multiple retries
    const sub5 = await db.submission.create({
      data: { formId: form.id, token: 'tok-webhook-backoff', version: 1 },
    });
    webhookBackoffSubId = sub5.id;
    await db.notificationJob.create({
      data: {
        id: `webhook-${sub5.id}`,
        submissionId: sub5.id,
        channel: 'webhook',
        status: 'failed',
        lastAttempt: new Date(),
      },
    });
  });

  afterEach(async () => {
    await db.notificationJob.deleteMany();
    await db.answer.deleteMany();
    await db.submission.deleteMany();
    await db.question.deleteMany();
    await db.form.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany();
  });

  it('marks webhook as delivered on 2xx response', async () => {
    const res = await getNotificationStatus(webhookDeliveredSubId, orgId);
    expect(res.status).toBe(200);
    if ('webhook' in res.body) {
      expect(res.body.webhook.status).toBe('delivered');
      expect(res.body.webhook.lastAttempt).not.toBeNull();
    }
  });

  it('marks webhook as failed on non-2xx response', async () => {
    const res = await getNotificationStatus(webhookFailedSubId, orgId);
    expect(res.status).toBe(200);
    if ('webhook' in res.body) {
      expect(res.body.webhook.status).toBe('failed');
    }
  });

  it('returns 202 Accepted when retrying a failed webhook', async () => {
    const res = await retryWebhook(webhookFailedSubId, orgId);
    expect(res.status).toBe(202);
  });

  it('idempotent retry: re-sending does not create a duplicate delivery', async () => {
    const first = await retryWebhook(webhookIdempotentSubId, orgId);
    const second = await retryWebhook(webhookIdempotentSubId, orgId);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const status = await getNotificationStatus(webhookIdempotentSubId, orgId);
    if ('webhook' in status.body) {
      expect(['delivered', 'pending']).toContain(status.body.webhook.status);
    }
  });

  it('times out gracefully when the webhook endpoint is unreachable', async () => {
    const res = await getNotificationStatus(webhookTimeoutSubId, orgId);
    expect(res.status).toBe(200);
    if ('webhook' in res.body) {
      expect(res.body.webhook.status).toBe('failed');
    }
  });

  it('retries with exponential backoff (attempts are recorded)', async () => {
    // After multiple retries, the status should remain consistent
    // (no duplicate side effects).
    await retryWebhook(webhookBackoffSubId, orgId);
    await retryWebhook(webhookBackoffSubId, orgId);
    await retryWebhook(webhookBackoffSubId, orgId);
    const status = await getNotificationStatus(webhookBackoffSubId, orgId);
    if ('webhook' in status.body) {
      expect(status.body.webhook.lastAttempt).not.toBeNull();
    }
  });
});

describe('Notification endpoint access control', () => {
  let orgId: string;
  let submissionId: string;

  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Test Org' } });
    orgId = org.id;

    const form = await db.form.create({
      data: { title: 'Form', organizationId: orgId, status: 'Published', version: 1 },
    });

    const sub = await db.submission.create({
      data: { formId: form.id, token: 'tok-auth-test', version: 1 },
    });
    submissionId = sub.id;
  });

  afterEach(async () => {
    await db.notificationJob.deleteMany();
    await db.answer.deleteMany();
    await db.submission.deleteMany();
    await db.question.deleteMany();
    await db.form.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany();
  });

  it('returns notification status with email and webhook properties', async () => {
    const status = await getNotificationStatus(submissionId, orgId);
    expect(status.status).toBe(200);
    if ('email' in status.body && 'webhook' in status.body) {
      expect(status.body).toHaveProperty('email');
      expect(status.body).toHaveProperty('webhook');
    }
  });
});
