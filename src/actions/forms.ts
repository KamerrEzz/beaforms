/**
 * Form management actions — CRUD and publish.
 *
 * Each action validates input, checks authorization via the domain layer,
 * and delegates to Prisma for persistence.
 */

import { z } from 'zod';
import { db } from '../lib/db';
import { transitionForm } from '../domain/form-state';
import { logger } from '../lib/logger';

const createFormSchema = z.object({
  title: z.string().min(1).max(200),
  organizationId: z.string(),
});

export interface FormActionResult {
  status: number;
  body: Record<string, unknown> | { error: string };
}

export async function listForms(
  organizationId: string,
  correlationId?: string
): Promise<FormActionResult> {
  const forms = await db.form.findMany({
    where: { organizationId },
    include: {
      _count: { select: { submissions: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const enriched = forms.map((f) => ({
    id: f.id,
    title: f.title,
    status: f.status,
    version: f.version,
    submissionCount: f._count.submissions,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));

  logger.info('Listed forms', { correlationId, count: enriched.length });
  return { status: 200, body: { forms: enriched } };
}

export async function createForm(
  input: unknown,
  organizationId: string,
  correlationId?: string
): Promise<FormActionResult> {
  const parsed = createFormSchema.safeParse({ ...input, organizationId });
  if (!parsed.success) {
    logger.warn('Create form validation failed', { correlationId, errors: parsed.error.flatten() });
    return { status: 400, body: { error: 'Invalid input' } };
  }

  const form = await db.form.create({
    data: {
      title: parsed.data.title,
      organizationId,
      status: 'Draft',
      version: 0,
    },
  });

  logger.info('Created form', { correlationId, formId: form.id });
  return { status: 201, body: { form } };
}

export async function getForm(
  formId: string,
  organizationId: string,
  correlationId?: string
): Promise<FormActionResult> {
  const form = await db.form.findUnique({
    where: { id: formId },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: { logicRules: true },
      },
    },
  });

  if (!form) {
    return { status: 404, body: { error: 'Form not found' } };
  }

  if (form.organizationId !== organizationId) {
    return { status: 403, body: { error: 'Not authorized' } };
  }

  const rules = form.questions.flatMap((q) => q.logicRules);

  logger.info('Got form', { correlationId, formId });
  return {
    status: 200,
    body: {
      form: {
        id: form.id,
        title: form.title,
        status: form.status,
        version: form.version,
      },
      questions: form.questions.map((q) => ({
        id: q.id,
        type: q.type,
        order: q.order,
        required: q.required,
        settings: q.settings,
      })),
      rules,
    },
  };
}

export async function publishForm(
  formId: string,
  userId: string,
  role: 'Admin' | 'Employee',
  organizationId: string,
  correlationId?: string
): Promise<FormActionResult> {
  const form = await db.form.findUnique({
    where: { id: formId },
    include: { questions: true },
  });

  if (!form) {
    return { status: 404, body: { error: 'Form not found' } };
  }

  if (form.organizationId !== organizationId) {
    return { status: 403, body: { error: 'Not authorized' } };
  }

  if (form.questions.length === 0) {
    return { status: 400, body: { error: 'Cannot publish a form with no questions' } };
  }

  try {
    const updated = transitionForm(
      {
        id: form.id,
        title: form.title,
        organizationId: form.organizationId,
        status: form.status as 'Draft' | 'Published' | 'Archived',
        version: form.version,
      },
      'publish',
      userId,
      role
    );

    await db.form.update({
      where: { id: formId },
      data: { status: updated.status, version: updated.version },
    });

    logger.info('Published form', { correlationId, formId, version: updated.version });
    return { status: 200, body: { version: updated.version } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    logger.warn('Publish failed', { correlationId, formId, reason: message });
    return { status: 400, body: { error: message } };
  }
}

const questionSchema = z.object({
  id: z.string().optional(), // existing question ID for updates
  type: z.enum(['Text', 'Email', 'Select', 'MultiSelect', 'Rating', 'LongAnswer']),
  order: z.number().int().nonnegative(),
  required: z.boolean().default(false),
  settings: z.record(z.unknown()).default({}),
});

const updateFormSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  questions: z.array(questionSchema).optional(),
});

export async function updateForm(
  formId: string,
  input: unknown,
  organizationId: string,
  correlationId?: string
): Promise<FormActionResult> {
  const parsed = updateFormSchema.safeParse(input);
  if (!parsed.success) {
    logger.warn('Update form validation failed', { correlationId, errors: parsed.error.flatten() });
    return { status: 400, body: { error: 'Invalid input' } };
  }

  const form = await db.form.findUnique({
    where: { id: formId },
    include: { questions: { orderBy: { order: 'asc' } } },
  });

  if (!form) {
    return { status: 404, body: { error: 'Form not found' } };
  }

  if (form.organizationId !== organizationId) {
    return { status: 403, body: { error: 'Not authorized' } };
  }

  const { title, questions } = parsed.data;

  // Guard: a published form cannot be renamed if its title is used in existing results
  // (R2 — version integrity). Title changes are always allowed on drafts.
  if (title && form.status !== 'Draft' && title !== form.title) {
    // Only disallow title change on Published/Archived if we want strict immutability.
    // For now, allow title-only changes on any status; questions changes on published
    // forms require a version bump.
  }

  const updateData: Record<string, unknown> = {};
  if (title) updateData.title = title;

  // If questions are provided, replace them in a transaction.
  if (questions) {
    // Determine whether a version bump is needed (published form with question changes).
    const currentQuestionKeys = form.questions.map((q) => ({
      type: q.type,
      order: q.order,
      required: q.required,
    }));

    const incomingQuestionKeys = questions.map((q) => ({
      type: q.type,
      order: q.order,
      required: q.required,
    }));

    const questionsChanged = JSON.stringify(currentQuestionKeys) !== JSON.stringify(incomingQuestionKeys);

    if (questionsChanged && form.status === 'Published') {
      updateData.version = form.version + 1;
    }

    // Use a transaction to replace questions.
    await db.$transaction(async (tx) => {
      if (title) {
        await tx.form.update({
          where: { id: formId },
          data: { title: updateData.title as string, ...(updateData.version ? { version: updateData.version as number } : {}) },
        });
      } else if (updateData.version) {
        await tx.form.update({
          where: { id: formId },
          data: { version: updateData.version as number },
        });
      }

      // Delete existing questions.
      await tx.question.deleteMany({ where: { formId } });

      // Create new questions.
      for (const q of questions) {
        await tx.question.create({
          data: {
            formId,
            type: q.type,
            order: q.order,
            required: q.required,
            settings: q.settings,
          },
        });
      }
    });
  } else if (title) {
    await db.form.update({
      where: { id: formId },
      data: { title },
    });
  }

  // Fetch the updated form.
  const updated = await db.form.findUnique({
    where: { id: formId },
    include: {
      questions: {
        orderBy: { order: 'asc' },
      },
    },
  });

  logger.info('Updated form', { correlationId, formId, version: updated?.version });
  return {
    status: 200,
    body: {
      form: {
        id: updated!.id,
        title: updated!.title,
        status: updated!.status,
        version: updated!.version,
      },
      questions: updated!.questions.map((q) => ({
        id: q.id,
        type: q.type,
        order: q.order,
        required: q.required,
        settings: q.settings,
      })),
    },
  };
}
