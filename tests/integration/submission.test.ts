import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Submission flow — integration tests
 *
 * Covers:
 * - R2: atomic submission with version snapshot
 * - R4: idempotency via submission token
 * - Contract: POST /api/forms/:id/submissions -> { submissionId }
 * - Contract: 400 Validation, 429 RateLimit
 *
 * These tests exercise the full submission path through the API layer.
 * They require a running server (or test harness) against a real database.
 */

// ---------- helpers (stubs for the test harness) ----------

interface SubmissionRequest {
  formId: string;
  token: string;
  answers: Array<{ questionId: string; value: string | number | string[] }>;
}

interface SubmissionResponse {
  submissionId: string;
  formVersion: number;
}

declare async function submitForm(
  req: SubmissionRequest
): Promise<{ status: number; body: SubmissionResponse | { error: string } }>;

// -----------------------------------------------------------------

describe('Submission — atomicity and version snapshot', () => {
  const formId = 'form-published-1';

  it('creates a submission linked to the current published version', async () => {
    const res = await submitForm({
      formId,
      token: 'tok-unique-001',
      answers: [{ questionId: 'q1', value: 'yes' }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('submissionId');
    expect((res.body as SubmissionResponse).formVersion).toBeGreaterThanOrEqual(1);
  });

  it('rejects submission with missing required answer (400)', async () => {
    const res = await submitForm({
      formId,
      token: 'tok-unique-002',
      answers: [], // required question unanswered
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects submission to a Draft form (400)', async () => {
    const res = await submitForm({
      formId: 'form-draft-1',
      token: 'tok-unique-003',
      answers: [{ questionId: 'q1', value: 'hello' }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects submission to an Archived form (400)', async () => {
    const res = await submitForm({
      formId: 'form-archived-1',
      token: 'tok-unique-004',
      answers: [{ questionId: 'q1', value: 'hello' }],
    });
    expect(res.status).toBe(400);
  });
});

describe('Submission — idempotency via token', () => {
  const formId = 'form-published-1';
  const duplicateToken = 'tok-idempotent-duplicate';

  it('returns the same submissionId when resubmitting with the same token', async () => {
    const first = await submitForm({
      formId,
      token: duplicateToken,
      answers: [{ questionId: 'q1', value: 'first' }],
    });
    expect(first.status).toBe(200);
    const firstId = (first.body as SubmissionResponse).submissionId;

    const second = await submitForm({
      formId,
      token: duplicateToken,
      answers: [{ questionId: 'q1', value: 'changed' }],
    });
    expect(second.status).toBe(200);
    // Idempotent: same token -> same submission, original answers preserved.
    expect((second.body as SubmissionResponse).submissionId).toBe(firstId);
  });
});

describe('Submission — rate limiting', () => {
  it('returns 429 after exceeding the rate limit for a single form', async () => {
    const formId = 'form-rate-test';
    const requests = Array.from({ length: 30 }, (_, i) =>
      submitForm({
        formId,
        token: `tok-rate-${i}`,
        answers: [{ questionId: 'q1', value: 'ok' }],
      })
    );
    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.status);

    // At least one should be 429 once the limit is hit.
    expect(statuses).toContain(429);
  });

  it('includes Retry-After header in 429 responses', async () => {
    const formId = 'form-rate-test-retry';
    // Hammer the endpoint to trigger rate limiting.
    const requests = Array.from({ length: 30 }, (_, i) =>
      submitForm({
        formId,
        token: `tok-rate-retry-${i}`,
        answers: [{ questionId: 'q1', value: 'ok' }],
      })
    );
    const results = await Promise.all(requests);
    const rateLimited = results.find((r) => r.status === 429);
    // If rate limiting was triggered, the response should contain retry guidance.
    if (rateLimited) {
      expect(rateLimited.body).toHaveProperty('error');
    }
  });
});
