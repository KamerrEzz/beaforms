/**
 * BullMQ worker for email and webhook notification dispatch.
 *
 * R4: idempotency — BullMQ deduplicates by job ID. Both adapters are
 * stateless and log correlation IDs for traceability.
 *
 * Email: uses nodemailer in production, a dev fake in development.
 * Webhook: HTTP POST with HMAC-SHA256 signature and exponential backoff.
 */

import { Worker, Job } from 'bullmq';
import { getRedis } from '../lib/redis';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { sendEmail, type EmailPayload } from './adapters/email';
import { sendWebhook, type WebhookPayload } from './adapters/webhook';

interface NotificationJobData {
  submissionId: string;
  organizationId: string;
}

async function processEmailJob(job: Job<NotificationJobData>) {
  const { submissionId } = job.data;
  const correlationId = `email:${submissionId}:${job.id}`;

  logger.info('Processing email job', { correlationId, jobId: job.id });

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      form: {
        include: {
          organization: { select: { name: true } },
        },
      },
      answers: {
        include: {
          question: { select: { settings: true } },
        },
      },
    },
  });

  if (!submission) {
    logger.warn('Submission not found for email job', { correlationId });
    return { success: false, reason: 'submission_not_found' };
  }

  const payload: EmailPayload = {
    to: `respondent-${submission.token}@goodform.local`,
    subject: `Response received: ${submission.form.title}`,
    html: buildEmailHtml(submission),
    correlationId,
  };

  try {
    await sendEmail(payload);

    await db.notificationJob.upsert({
      where: { id: `email-${submissionId}` },
      create: {
        id: `email-${submissionId}`,
        submissionId,
        channel: 'email',
        status: 'sent',
        attempts: 1,
        lastAttempt: new Date(),
      },
      update: {
        status: 'sent',
        attempts: { increment: 1 },
        lastAttempt: new Date(),
      },
    });

    logger.info('Email sent successfully', { correlationId });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    await db.notificationJob.upsert({
      where: { id: `email-${submissionId}` },
      create: {
        id: `email-${submissionId}`,
        submissionId,
        channel: 'email',
        status: 'failed',
        attempts: 1,
        lastAttempt: new Date(),
        payload: { error: message },
      },
      update: {
        status: 'failed',
        attempts: { increment: 1 },
        lastAttempt: new Date(),
        payload: { error: message },
      },
    });

    logger.error('Email dispatch failed', { correlationId, error: message });
    throw err; // BullMQ will retry based on backoff config.
  }
}

async function processWebhookJob(job: Job<NotificationJobData>) {
  const { submissionId, organizationId } = job.data;
  const correlationId = `webhook:${submissionId}:${job.id}`;

  logger.info('Processing webhook job', { correlationId, jobId: job.id });

  // Fetch the submission for the webhook payload.
  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      answers: {
        include: {
          question: { select: { settings: true } },
        },
      },
    },
  });

  if (!submission) {
    logger.warn('Submission not found for webhook job', { correlationId });
    return { success: false, reason: 'submission_not_found' };
  }

  const payload: WebhookPayload = {
    url: process.env.WEBHOOK_URL ?? `https://hooks.goodform.local/${organizationId}`,
    secret: process.env.WEBHOOK_SECRET ?? '',
    body: {
      event: 'submission.created',
      submissionId,
      formId: submission.formId,
      version: submission.version,
      createdAt: submission.createdAt.toISOString(),
      answers: submission.answers.map((a) => ({
        questionId: a.questionId,
        value: a.value,
      })),
    },
    correlationId,
  };

  try {
    await sendWebhook(payload);

    await db.notificationJob.upsert({
      where: { id: `webhook-${submissionId}` },
      create: {
        id: `webhook-${submissionId}`,
        submissionId,
        channel: 'webhook',
        status: 'delivered',
        attempts: 1,
        lastAttempt: new Date(),
      },
      update: {
        status: 'delivered',
        attempts: { increment: 1 },
        lastAttempt: new Date(),
      },
    });

    logger.info('Webhook delivered successfully', { correlationId });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    await db.notificationJob.upsert({
      where: { id: `webhook-${submissionId}` },
      create: {
        id: `webhook-${submissionId}`,
        submissionId,
        channel: 'webhook',
        status: 'failed',
        attempts: 1,
        lastAttempt: new Date(),
        payload: { error: message },
      },
      update: {
        status: 'failed',
        attempts: { increment: 1 },
        lastAttempt: new Date(),
        payload: { error: message },
      },
    });

    logger.error('Webhook dispatch failed', { correlationId, error: message });
    throw err;
  }
}

/**
 * Escape HTML special characters to prevent XSS.
 * MEDIUM FIX #05: User-supplied data must be escaped before HTML interpolation.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml(submission: {
  form: { title: string };
  answers: Array<{ question: { settings: unknown }; value: unknown }>;
}): string {
  const rows = submission.answers
    .map((a) => {
      const settings = a.question.settings as Record<string, unknown>;
      const label = settings.label ? escapeHtml(String(settings.label)) : 'Question';
      const value = escapeHtml(
        Array.isArray(a.value) ? a.value.join(', ') : String(a.value)
      );
      return `<tr><td style="padding:8px;border:1px solid #ddd;">${label}</td><td style="padding:8px;border:1px solid #ddd;">${value}</td></tr>`;
    })
    .join('');

  return `
    <h2>Response to: ${escapeHtml(submission.form.title)}</h2>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr><th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Question</th><th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;">Answer</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Start the workers.
const connection = getRedis();

const emailWorker = new Worker('notifications:email', processEmailJob, {
  connection,
  concurrency: 5,
});

const webhookWorker = new Worker('notifications:webhook', processWebhookJob, {
  connection,
  concurrency: 3,
});

emailWorker.on('failed', (job, err) => {
  logger.error('Email job failed', { jobId: job?.id, error: err.message });
});

webhookWorker.on('failed', (job, err) => {
  logger.error('Webhook job failed', { jobId: job?.id, error: err.message });
});

logger.info('Notification workers started');

export { emailWorker, webhookWorker };
