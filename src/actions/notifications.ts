/**
 * Notification management actions — status and retry.
 *
 * R4: retries must be idempotent. Re-sending a notification does not
 * create a duplicate job — BullMQ deduplicates by job ID.
 */

import { z } from 'zod';
import { db } from '../lib/db';
import { emailQueue, webhookQueue } from '../lib/queue';
import { logger } from '../lib/logger';

export interface NotificationStatusResult {
  status: number;
  body:
    | {
        email: { status: string; lastAttempt: string | null };
        webhook: { status: string; lastAttempt: string | null };
      }
    | { error: string };
}

export async function getNotificationStatus(
  submissionId: string,
  correlationId?: string
): Promise<NotificationStatusResult> {
  const jobs = await db.notificationJob.findMany({
    where: { submissionId },
    select: { channel: true, status: true, lastAttempt: true },
  });

  const findJob = (channel: string) =>
    jobs.find((j) => j.channel === channel);

  const emailJob = findJob('email');
  const webhookJob = findJob('webhook');

  logger.info('Got notification status', { correlationId, submissionId });

  return {
    status: 200,
    body: {
      email: {
        status: emailJob?.status ?? 'pending',
        lastAttempt: emailJob?.lastAttempt?.toISOString() ?? null,
      },
      webhook: {
        status: webhookJob?.status ?? 'pending',
        lastAttempt: webhookJob?.lastAttempt?.toISOString() ?? null,
      },
    },
  };
}

export async function retryEmail(
  submissionId: string,
  correlationId?: string
): Promise<{ status: number; body: { message: string } | { error: string } }> {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      form: { select: { organizationId: true } },
      answers: true,
    },
  });

  if (!submission) {
    return { status: 404, body: { error: 'Submission not found' } };
  }

  // Idempotent: check if a pending/sent job already exists.
  const existing = await db.notificationJob.findFirst({
    where: {
      submissionId,
      channel: 'email',
      status: { in: ['pending', 'sent', 'delivered'] },
    },
  });

  if (existing) {
    logger.info('Email retry skipped (already exists)', { correlationId, submissionId });
    return { status: 202, body: { message: 'Retry accepted' } };
  }

  // Create or update the job record.
  await db.notificationJob.upsert({
    where: {
      id: `email-${submissionId}`,
    },
    create: {
      id: `email-${submissionId}`,
      submissionId,
      channel: 'email',
      status: 'pending',
    },
    update: {
      status: 'pending',
      attempts: 0,
    },
  });

  // Enqueue the job.
  await emailQueue.add(
    'send-email',
    { submissionId, organizationId: submission.form.organizationId },
    { jobId: `email-retry:${submissionId}` }
  );

  logger.info('Email retry enqueued', { correlationId, submissionId });
  return { status: 202, body: { message: 'Retry accepted' } };
}

export async function retryWebhook(
  submissionId: string,
  correlationId?: string
): Promise<{ status: number; body: { message: string } | { error: string } }> {
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      form: { select: { organizationId: true } },
    },
  });

  if (!submission) {
    return { status: 404, body: { error: 'Submission not found' } };
  }

  // Idempotent: check if a pending/delivered job already exists.
  const existing = await db.notificationJob.findFirst({
    where: {
      submissionId,
      channel: 'webhook',
      status: { in: ['pending', 'delivered'] },
    },
  });

  if (existing) {
    logger.info('Webhook retry skipped (already exists)', { correlationId, submissionId });
    return { status: 202, body: { message: 'Retry accepted' } };
  }

  await db.notificationJob.upsert({
    where: {
      id: `webhook-${submissionId}`,
    },
    create: {
      id: `webhook-${submissionId}`,
      submissionId,
      channel: 'webhook',
      status: 'pending',
    },
    update: {
      status: 'pending',
      attempts: 0,
    },
  });

  await webhookQueue.add(
    'send-webhook',
    { submissionId, organizationId: submission.form.organizationId },
    { jobId: `webhook-retry:${submissionId}` }
  );

  logger.info('Webhook retry enqueued', { correlationId, submissionId });
  return { status: 202, body: { message: 'Retry accepted' } };
}
