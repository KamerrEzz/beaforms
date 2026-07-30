/**
 * Public submission action — handles form responses.
 *
 * R2: atomic submission with version snapshot.
 * R4: idempotency via submission token.
 * Rate limiting is enforced via Redis.
 */

import { z } from 'zod';
import { db } from '../lib/db';
import { getRedis } from '../lib/redis';
import { logger } from '../lib/logger';

const submissionSchema = z.object({
  formId: z.string(),
  token: z.string().min(1),
  answers: z.array(
    z.object({
      questionId: z.string(),
      value: z.union([z.string(), z.number(), z.array(z.string())]),
    })
  ),
});

// Rate limit: 20 submissions per form per minute.
const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 20;

export interface SubmissionResult {
  status: number;
  body: { submissionId: string; formVersion: number } | { error: string };
}

export async function submitForm(
  input: unknown,
  correlationId?: string
): Promise<SubmissionResult> {
  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn('Submission validation failed', { correlationId, errors: parsed.error.flatten() });
    return { status: 400, body: { error: 'Invalid input' } };
  }

  const { formId, token, answers } = parsed.data;

  // Rate limiting via Redis sliding window.
  const redis = getRedis();
  const rateKey = `rate:submission:${formId}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW * 1000;

  // Remove old entries and count current window.
  await redis.zremrangebyscore(rateKey, 0, windowStart);
  const count = await redis.zcard(rateKey);

  if (count >= RATE_LIMIT_MAX) {
    logger.warn('Rate limit exceeded', { correlationId, formId });
    return {
      status: 429,
      body: { error: 'Rate limit exceeded. Please try again later.' },
    };
  }

  // Add current request to the window.
  await redis.zadd(rateKey, now, `${now}:${correlationId}`);
  await redis.expire(rateKey, RATE_LIMIT_WINDOW);

  // Check idempotency — same token returns existing submission.
  const existing = await db.submission.findUnique({
    where: { token },
    select: { id: true, version: true },
  });

  if (existing) {
    logger.info('Idempotent submission', { correlationId, submissionId: existing.id });
    return {
      status: 200,
      body: { submissionId: existing.id, formVersion: existing.version },
    };
  }

  // Validate form is published.
  const form = await db.form.findUnique({
    where: { id: formId },
    select: { id: true, status: true, version: true, organizationId: true },
  });

  if (!form) {
    return { status: 400, body: { error: 'Form not found' } };
  }

  if (form.status !== 'Published') {
    return { status: 400, body: { error: 'Form is not accepting submissions' } };
  }

  // Validate required questions are answered.
  const questions = await db.question.findMany({
    where: { formId },
    select: { id: true, required: true },
  });

  const requiredIds = questions.filter((q) => q.required).map((q) => q.id);
  const answeredIds = answers.map((a) => a.questionId);
  const missing = requiredIds.filter((id) => !answeredIds.includes(id));

  if (missing.length > 0) {
    return { status: 400, body: { error: 'Missing required answers' } };
  }

  // Atomic submission with version snapshot.
  const submission = await db.$transaction(async (tx) => {
    const sub = await tx.submission.create({
      data: {
        formId,
        token,
        version: form.version,
      },
    });

    await tx.answer.createMany({
      data: answers.map((a) => ({
        submissionId: sub.id,
        questionId: a.questionId,
        value: a.value,
      })),
    });

    return sub;
  });

  logger.info('Submission created', {
    correlationId,
    submissionId: submission.id,
    formVersion: form.version,
  });

  return {
    status: 200,
    body: { submissionId: submission.id, formVersion: form.version },
  };
}
