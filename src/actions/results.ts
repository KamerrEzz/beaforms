/**
 * Results actions — listing, search, and CSV export.
 *
 * Used by Admin and Employee roles within their organization.
 */

import { z } from 'zod';
import { db } from '../lib/db';
import { escapeCsvField } from '../domain/normalization';
import { logger } from '../lib/logger';

export interface ResultsActionResult {
  status: number;
  body: Record<string, unknown> | { error: string };
}

export async function getResults(
  formId: string,
  organizationId: string,
  search?: string,
  correlationId?: string
): Promise<ResultsActionResult> {
  // Verify form belongs to the organization.
  const form = await db.form.findUnique({
    where: { id: formId },
    select: { id: true, organizationId: true },
  });

  if (!form) {
    return { status: 404, body: { error: 'Form not found' } };
  }

  if (form.organizationId !== organizationId) {
    return { status: 403, body: { error: 'Not authorized' } };
  }

  const where: Record<string, unknown> = { formId };

  if (search) {
    where.answers = {
      some: {
        value: { contains: search, mode: 'insensitive' },
      },
    };
  }

  const submissions = await db.submission.findMany({
    where,
    include: {
      answers: {
        include: {
          question: { select: { id: true, type: true, settings: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  logger.info('Got results', { correlationId, formId, count: submissions.length });

  return {
    status: 200,
    body: {
      submissions: submissions.map((s) => ({
        id: s.id,
        token: s.token,
        version: s.version,
        createdAt: s.createdAt,
        answers: s.answers.map((a) => ({
          questionId: a.questionId,
          questionType: a.question.type,
          value: a.value,
        })),
      })),
    },
  };
}

export async function exportResults(
  formId: string,
  organizationId: string,
  correlationId?: string
): Promise<{ status: number; body: string; contentType: string } | ResultsActionResult> {
  const form = await db.form.findUnique({
    where: { id: formId },
    select: { id: true, organizationId: true, title: true },
  });

  if (!form) {
    return { status: 404, body: { error: 'Form not found' } };
  }

  if (form.organizationId !== organizationId) {
    return { status: 403, body: { error: 'Not authorized' } };
  }

  const submissions = await db.submission.findMany({
    where: { formId },
    include: {
      answers: {
        include: {
          question: { select: { id: true, type: true, settings: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Build CSV header from questions.
  const questions = await db.question.findMany({
    where: { formId },
    orderBy: { order: 'asc' },
  });

  const header = [
    'submission_id',
    'token',
    'version',
    'created_at',
    ...questions.map((q) => {
      const settings = q.settings as Record<string, unknown>;
      return settings.label ? String(settings.label) : `question_${q.order}`;
    }),
  ];

  const rows = submissions.map((s) => {
    const answerMap = new Map(s.answers.map((a) => [a.questionId, a.value]));
    return [
      escapeCsvField(s.id),
      escapeCsvField(s.token),
      String(s.version),
      s.createdAt.toISOString(),
      ...questions.map((q) => {
        const val = answerMap.get(q.id);
        if (val === undefined || val === null) return '';
        const str = Array.isArray(val) ? val.join('; ') : String(val);
        return escapeCsvField(str);
      }),
    ].join(',');
  });

  const csv = [header.map(escapeCsvField).join(','), ...rows].join('\n');

  logger.info('Exported results', { correlationId, formId, rowCount: rows.length });

  return {
    status: 200,
    body: csv,
    contentType: 'text/csv',
  };
}
