/**
 * GDPR actions — data export and deletion.
 *
 * R1: personal data must be manageable and deletable.
 * Deletion is async via BullMQ; export returns a download URL.
 */

import { z } from 'zod';
import { db } from '../lib/db';
import { buildExportPayload, buildDeletionJob } from '../domain/gdpr';
import { emailQueue } from '../lib/queue';
import { logger } from '../lib/logger';

const exportSchema = z.object({
  organizationId: z.string(),
  userId: z.string().optional(),
});

const deletionSchema = z.object({
  organizationId: z.string(),
  userId: z.string().optional(),
  olderThanDays: z.number().int().positive().optional(),
});

export interface GdprActionResult {
  status: number;
  body: { downloadUrl: string } | { message: string } | { error: string };
}

export async function requestDataExport(
  input: unknown,
  correlationId?: string
): Promise<GdprActionResult> {
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn('GDPR export validation failed', { correlationId, errors: parsed.error.flatten() });
    return { status: 400, body: { error: 'Invalid input' } };
  }

  const { organizationId, userId } = parsed.data;

  // Verify organization exists.
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) {
    return { status: 400, body: { error: 'Organization not found' } };
  }

  // Gather submissions for the organization.
  const submissions = await db.submission.findMany({
    where: {
      form: { organizationId },
    },
    include: {
      answers: { select: { questionId: true, value: true } },
    },
  });

  const payload = buildExportPayload(organizationId, userId, submissions);

  // In production, this would serialize to a file and return a signed URL.
  // For now, return a placeholder URL.
  const downloadUrl = `https://exports.goodform.local/${organizationId}/${Date.now()}.json`;

  logger.info('Data export requested', {
    correlationId,
    organizationId,
    userId,
    submissionCount: payload.submissionCount,
  });

  return { status: 200, body: { downloadUrl } };
}

export async function requestDataDeletion(
  input: unknown,
  correlationId?: string
): Promise<GdprActionResult> {
  const parsed = deletionSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn('GDPR deletion validation failed', { correlationId, errors: parsed.error.flatten() });
    return { status: 400, body: { error: 'Invalid input' } };
  }

  const { organizationId, userId, olderThanDays } = parsed.data;

  // Verify organization exists.
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) {
    return { status: 400, body: { error: 'Organization not found' } };
  }

  const jobSpec = buildDeletionJob(organizationId, userId, olderThanDays);

  // Enqueue async deletion — the worker handles the actual data removal.
  await emailQueue.add('gdpr-deletion', jobSpec, {
    jobId: `gdpr-delete:${organizationId}:${userId ?? 'all'}:${Date.now()}`,
  });

  logger.info('Data deletion requested', { correlationId, ...jobSpec });

  return { status: 202, body: { message: 'Deletion request accepted' } };
}
