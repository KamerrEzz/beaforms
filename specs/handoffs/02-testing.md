# Handoff: phase 2 (testing) → phase 3 (code)

## Produced

- `tests/unit/form-state-transitions.test.ts` — Draft → Published → Archived lifecycle, who can trigger each, immutability of published versions
- `tests/unit/authorization.test.ts` — Admin vs Employee access, cross-org isolation, unauthenticated rejection
- `tests/unit/normalization.test.ts` — Email normalization, text truncation, CSV field escaping
- `tests/unit/logic-rules.test.ts` — Conditional jumps (forward, end-of-form, loop prevention, deleted question reference)
- `tests/integration/submission.test.ts` — Atomic submission with version snapshot, idempotency via token, rate limiting (400, 429)
- `tests/integration/notifications.test.ts` — Email/webhook adapter success, failure, timeout, retry idempotency
- `tests/integration/gdpr.test.ts` — Data export, data deletion, retention enforcement, idempotent deletion

## The next phase must know

- **Test runner:** Vitest. No configuration file exists yet — `@code` must create `vitest.config.ts`.
- **No implementation exists.** All test files use `declare` for functions they exercise. `@code` must provide implementations that satisfy the signatures and behaviors asserted here.
- **`declare` statements are signatures, not imports.** The implementation must export functions with matching names and types. The tests will be updated to import from the actual modules once implementation exists.
- **Integration tests require a harness.** They assume an HTTP test client and a test database. `@code` must set up the test infrastructure (Prisma test client, mock HTTP servers for webhooks, rate-limit simulation).
- **Each test is self-contained.** No test depends on another. Failures in one do not cascade.

## Read these sections

- `tests/**/*.test.ts` — the test files above
- `docs/contract.md` — API shapes, error codes, data model
- `specs/goodform.md` § Non-negotiable constraints (R1–R4)
- `specs/goodform.md` § Technical contract — data model and security details

## Coverage summary

| Constraint | Tests covering it | Status |
|---|---|---|
| R1 — GDPR compliance | gdpr.test.ts (export, deletion, retention) | Covered |
| R2 — Integrity (immutable versions) | form-state-transitions.test.ts, submission.test.ts | Covered |
| R3 — RBAC | authorization.test.ts, notification access control | Covered |
| R4 — Idempotency | submission.test.ts (token), notifications.test.ts (retries) | Covered |

## Left undone / uncertain

- **Logic rules for rating/multiselect conditions.** The condition operators (`equals`, `contains`, `greaterThan`, etc.) are not fully enumerated in the spec. The tests cover `equals` only. `@architect` should clarify the full set of operators before `@code` implements the evaluator.
- **CSV export content format.** The contract specifies CSV but does not define column ordering or encoding. The normalization tests cover field escaping; the full export shape is left for `@code` to define and `@audit` to verify.
- **Rate-limit thresholds.** The exact number of allowed submissions per minute per form is not in the spec. The test proves 429 is returned under load but does not assert a specific number.
- **Webhook payload schema.** The contract mentions webhooks but does not define what payload is sent. This is left for `@architect` to define.
