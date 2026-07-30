# Handoff: Integration test rewrite — `declare` stubs → real action imports

## What changed

Three integration test files were rewritten to import from the actual action
modules instead of using `declare async function` stubs.

### File 1: `tests/integration/submission.test.ts`

| Before | After |
|---|---|
| `declare async function submitForm(req)` taking a typed object | `import { submitForm } from '../../src/actions/submissions'` — real signature `(input: unknown, correlationId?: string)` |
| Hardcoded form IDs (`form-published-1`, `form-draft-1`, etc.) | IDs come from `beforeEach` Prisma fixtures using auto-generated cuid values |
| No data setup | `beforeEach` creates an organization, published form with required question, draft form, archived form |
| No cleanup | `afterEach` deletes all test data in FK-safe order |

**Type narrowing:** Tests use `'submissionId' in res.body` to narrow the union
`{ submissionId: string; formVersion: number } | { error: string }` instead of
the old `as SubmissionResponse` cast.

**Rate limit tests:** Create their own published form within each test (via `db`)
so the Redis rate-limit key is unique per test and does not leak between runs.

### File 2: `tests/integration/notifications.test.ts`

| Before | After |
|---|---|
| `declare async function getNotificationStatus(submissionId)` | `import { getNotificationStatus, retryEmail, retryWebhook } from '../../src/actions/notifications'` |
| `declare async function retryEmail/retryWebhook(submissionId)` 1-arg | Real signatures: `(submissionId: string, organizationId: string, correlationId?: string)` — **organizationId is now mandatory** (FINDING-03 fix) |
| Hardcoded submission IDs (`sub-email-1`, `sub-email-fail`, etc.) | Real submission IDs from `beforeEach` Prisma fixtures |
| No data setup | `beforeEach` creates org, form, submissions with notification jobs in various statuses (sent, failed, delivered) |
| No cleanup | `afterEach` deletes all test data |

**Test data per scenario:** Each `describe` block sets up exactly the submissions
and notification jobs its tests need. The "access control" test now checks that
the shape includes `email` and `webhook` properties — role enforcement belongs
to the HTTP middleware layer, not the action function.

### File 3: `tests/integration/gdpr.test.ts`

| Before | After |
|---|---|
| `declare async function requestDataExport(req)` taking `{ organizationId, userId? }` | `import { requestDataExport, requestDataDeletion } from '../../src/actions/gdpr'` — real signature `(input: unknown, organizationId: string, correlationId?: string)` |
| `declare async function requestDataDeletion(req)` taking `{ organizationId, userId?, olderThanDays? }` | Real signature: `(input: unknown, organizationId: string, correlationId?: string)` — **organizationId is a separate 2nd param** (FINDING-01 fix) |
| Hardcoded org IDs (`org-1`, `org-nonexistent`) | Real org ID from `beforeEach` fixture; `org-nonexistent` literal still used for the rejection test |
| No data setup | `beforeEach` creates org, form, submissions with answers |
| No cleanup | `afterEach` deletes all test data |

**Role-check test adjusted:** The old "rejects when caller is not Admin" test
used `expect([200, 401, 403]).toContain(res.status)` — a placeholder asserting
the endpoint exists. The action function does not enforce RBAC (the HTTP
middleware does), so the new test asserts `res.status === 200` for valid input
to a valid org. A separate test already covers the nonexistent-org rejection.

## Signatures verified against actual modules

| Function | Real signature | Tests pass these params |
|---|---|---|
| `submitForm` | `(input: unknown, correlationId?: string)` | `(input)` — `correlationId` omitted |
| `getNotificationStatus` | `(submissionId: string, organizationId: string, correlationId?: string)` | `(subId, orgId)` |
| `retryEmail` | `(submissionId: string, organizationId: string, correlationId?: string)` | `(subId, orgId)` |
| `retryWebhook` | `(submissionId: string, organizationId: string, correlationId?: string)` | `(subId, orgId)` |
| `requestDataExport` | `(input: unknown, organizationId: string, correlationId?: string)` | `({}, orgId)` or `({ userId }, orgId)` |
| `requestDataDeletion` | `(input: unknown, organizationId: string, correlationId?: string)` | `({}, orgId)` or `({ userId }, orgId)` |

## Infrastructure requirements

These tests **require** both PostgreSQL and Redis running:

- PostgreSQL: the `DATABASE_URL` env var must point to a running instance
- Redis: the `REDIS_URL` env var must point to a running instance (used by
  rate limiting in `submitForm` and BullMQ queue adds in `retryEmail`/`retryWebhook`)

Without Redis, `submitForm` (rate limiter), `retryEmail`, and `retryWebhook`
(BullMQ queue add) will throw connection errors.

## Left undone

- **BullMQ queue ops are not mocked.** If Redis is unavailable, `retryEmail`
  and `retryWebhook` will throw at `emailQueue.add()` / `webhookQueue.add()`.
  The idempotency tests that call retry twice expect both calls to succeed.
  Either Redis must be available or the queue calls need conditional handling.
- **Rate-limit window sharing.** Two rate-limit tests run sequentially in the
  same `describe` block. Each creates a form with a unique ID so Redis keys
  do not collide. This is correct as written but relies on cuid uniqueness.
- **GDPR async deletion.** The `requestDataDeletion` action enqueues via BullMQ
  but does not actually delete data — the worker does. The tests only verify
  that the request is accepted (202), not that data is actually removed.
