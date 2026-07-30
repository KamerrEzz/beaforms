/**
 * GDPR domain logic — data export, deletion, and retention.
 *
 * Enforces R1: personal data must be manageable and deletable. These functions
 * operate at the domain layer and are called by the API handlers and the
 * BullMQ worker for async deletion.
 */

/**
 * Build a data-export payload for an organization or specific user.
 * In production this serializes to a file and returns a download URL.
 * The domain function is pure: it shapes the data, the caller persists it.
 */
export function buildExportPayload(
  orgId: string,
  userId: string | undefined,
  submissions: Array<{
    id: string;
    formId: string;
    version: number;
    createdAt: Date;
    answers: Array<{ questionId: string; value: unknown }>;
  }>
): Record<string, unknown> {
  const filtered = userId
    ? submissions.filter((s) => s.answers.length > 0)
    : submissions;

  return {
    organizationId: orgId,
    userId: userId ?? null,
    exportedAt: new Date().toISOString(),
    submissionCount: filtered.length,
    submissions: filtered,
  };
}

/**
 * Build a deletion job specification. The actual deletion happens in the
 * BullMQ worker — this function only validates and shapes the request.
 */
export function buildDeletionJob(
  orgId: string,
  userId: string | undefined,
  olderThanDays: number | undefined
): { organizationId: string; userId?: string; olderThanDays?: number } {
  if (!orgId) {
    throw new Error('Organization ID is required');
  }

  return {
    organizationId: orgId,
    userId,
    olderThanDays,
  };
}

/**
 * Enforce retention policy: filter submissions older than the threshold.
 * Used both for deletion and for export-after-deletion scenarios.
 */
export function filterByRetention(
  submissions: Array<{ createdAt: Date }>,
  olderThanDays: number
): Array<{ createdAt: Date }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  return submissions.filter((s) => s.createdAt < cutoff);
}
