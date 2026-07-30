# Security Audit — OWASP Top 10 2025

**Audit date:** 2026-07-30
**Auditor:** @security (initial), @code (fixes)
**Scope:** Full codebase — all API routes, actions, auth, domain, worker, infrastructure

---

## Verdict

**ALL 9 FINDINGS FIXED.** No open CRITICAL or HIGH findings remain.

---

## Findings — Status

| # | Severity | OWASP | Finding | Status |
|---|----------|-------|---------|--------|
| 01 | CRITICAL | A01:2025 | GDPR endpoints accept user-supplied organizationId | FIXED |
| 02 | CRITICAL | A07:2025 | Login never compares password against hash | FIXED |
| 03 | HIGH | A01:2025 | Notification endpoints don't scope by org | FIXED |
| 04 | HIGH | A07:2025 | No rate limiting on login | FIXED |
| 05 | MEDIUM | A05:2025 | XSS in email HTML builder | FIXED |
| 06 | MEDIUM | A02:2025 | No security headers | FIXED |
| 07 | MEDIUM | A07:2025 | Sessions not invalidated on login | FIXED |
| 08 | LOW | A10:2025 | Rate limiter not atomic | FIXED |
| 09 | LOW | A03:2025 | Missing nodemailer dependency | FIXED |

---

## Fix Details

### FINDING-01 — FIXED
**File:** `src/actions/gdpr.ts`, `src/pages/api/gdpr/data-export.ts`, `src/pages/api/gdpr/data-deletion.ts`
**Change:** Removed `organizationId` from Zod schemas. API handlers strip it from body and always use `user.organizationId`. Action functions accept `organizationId` as a separate parameter derived from session.

### FINDING-02 — FIXED
**File:** `src/actions/auth.ts`, `src/auth/password.ts` (new)
**Change:** Created `src/auth/password.ts` with `verifyPassword()` using oslo/Argon2id. Login now calls `verifyPassword(user.passwordHash, password)` and rejects on mismatch.

### FINDING-03 — FIXED
**File:** `src/actions/notifications.ts`, `src/pages/api/submissions/[id]/notifications/*.ts`
**Change:** All notification actions now accept `organizationId` parameter. Each verifies `submission.form.organizationId === organizationId` before proceeding. API handlers pass `user.organizationId`.

### FINDING-04 — FIXED
**File:** `src/actions/auth.ts`
**Change:** Added Redis-based rate limiting: 5 attempts per email per 15 minutes using `INCR` + `EXPIRE`.

### FINDING-05 — FIXED
**File:** `src/worker/notification-worker.ts`
**Change:** Added `escapeHtml()` function. All user-controlled values (form title, question labels, answer values) are escaped before HTML interpolation.

### FINDING-06 — FIXED
**File:** `src/middleware.ts`
**Change:** Added `SECURITY_HEADERS` constant with CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy. Headers applied to all responses.

### FINDING-07 — FIXED
**File:** `src/actions/auth.ts`, `src/auth/session.ts`
**Change:** Added `invalidateAllSessions(userId)` to session.ts. Login calls it before creating new session.

### FINDING-08 — FIXED
**File:** `src/actions/submissions.ts`
**Change:** Replaced sliding window (zremrangebyscore + zcard + zadd) with atomic `INCR` + `EXPIRE` pattern.

### FINDING-09 — FIXED
**File:** `package.json`
**Change:** Added `nodemailer` to dependencies and `@types/nodemailer` to devDependencies.

---

## Findings NOT Confirmed (Verified Safe)

| Concern | Why it is safe |
|---------|---------------|
| SQL Injection via search param | Prisma parameterizes all queries |
| Webhook SSRF | Webhook URL from env, not user input |
| Session cookie attributes | Lucia v3 defaults: httpOnly, sameSite lax |
| Password hashing | oslo/Argon2id via src/auth/password.ts |
| CSRF on submission endpoint | Public endpoint, sameSite lax prevents cross-origin |

---

## Scope Limitations — What Could Not Be Audited

| Area | Reason |
|------|--------|
| Registration flow | Not implemented (no signup endpoint) |
| Docker/infrastructure config | Phase 6 scope |
| Dependency CVEs | npm audit not run |
| CSRF token implementation | Relies on sameSite lax |
| GDPR actual deletion logic | BullMQ worker (Phase 6 scope) |
| Frontend XSS | No frontend templates reviewed |
