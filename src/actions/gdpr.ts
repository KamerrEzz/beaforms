/**
 * GDPR actions — data export and deletion.
 *
 * R1: personal data must be manageable and deletable.
 * Deletion is async via BullMQ; export returns a download URL.
 */

import { z } from 'zod';
import { db } from '../lib/db';
import fs from 'node:fs';
import path from 'node:path';
import { buildExportPayload, buildDeletionJob } from '../domain/gdpr';
import { emailQueue } from '../lib/queue';
import { logger } from '../lib/logger';

const exportSchema = z.object({
  userId: z.string().optional(),
});

const deletionSchema = z.object({
  userId: z.string().optional(),
  olderThanDays: z.number().int().positive().optional(),
});

export interface GdprActionResult {
  status: number;
  body: { downloadUrl: string } | { message: string } | { error: string };
}

export async function requestDataExport(
  input: unknown,
  organizationId: string,
  correlationId?: string
): Promise<GdprActionResult> {
  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn('GDPR export validation failed', { correlationId, errors: parsed.error.flatten() });
    return { status: 400, body: { error: 'Invalid input' } };
  }

  const { userId } = parsed.data;

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

  // Write the export to disk for download.
  const exportDir = path.join(process.cwd(), 'data', 'exports', organizationId);
  fs.mkdirSync(exportDir, { recursive: true });
  const filename = `export-${Date.now()}.json`;
  const filePath = path.join(exportDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');

  // Determine the base URL from environment or use a sensible default.
  const baseUrl = process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321';
  const downloadUrl = `${baseUrl}/api/gdpr/data-export/download/${organizationId}/${filename}`;

  logger.info('Data export requested', {
    correlationId,
    organizationId,
    userId,
    submissionCount: payload.submissionCount,
    filePath,
  });

  return { status: 200, body: { downloadUrl } };
}

export async function requestDataDeletion(
  input: unknown,
  organizationId: string,
  correlationId?: string
): Promise<GdprActionResult> {
  const parsed = deletionSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn('GDPR deletion validation failed', { correlationId, errors: parsed.error.flatten() });
    return { status: 400, body: { error: 'Invalid input' } };
  }

  const { userId, olderThanDays } = parsed.data;

  // Verify organization exists.
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) {
    return { status: 400, body: { error: 'Organization not found' } };
  }

  const jobSpec = buildDeletionJob(organizationId, userId, olderThanDays);

  // Enqueue async deletion — the worker handles the actual data removal.
  await emailQueue.add('gdpr-deletion', jobSpec, {
    jobId: `gdpr-delete-${organizationId}-${userId ?? 'all'}-${Date.now()}`,
  });

  logger.info('Data deletion requested', { correlationId, ...jobSpec });

  return { status: 202, body: { message: 'Deletion request accepted' } };
}
