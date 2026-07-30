# Spec: Goodform

## Confirmed requirements

1.  **Producto:** Goodform, alternativa enfocada a Typeform para formularios mobile-first.
2.  **Roles y Alcance:** 
    *   **Dueño/Admin:** Gestión completa (crear, editar, eliminar, ver resultados).
    *   **Empleado:** Visualización de resultados de formularios de su organización.
3.  **Privacidad:** Cumplimiento total de **GDPR** (retención, eliminación).
4.  **Infraestructura:** VPS con Docker/Kubernetes.
5.  **Modelo de fallos:** Prioridad en disponibilidad (asincronía con BullMQ + Redis).
6.  **Escala:** 1,000 formularios/envíos por día.

## Out of scope

1.  Constructores visuales de flujo (drag-and-drop).
2.  Campos de pago.
3.  Funcionalidad en tiempo real (WebSockets).

## Non-negotiable constraints

- [R1] **GDPR Compliance:** Datos personales deben ser gestionables y eliminables.
- [R2] **Integridad:** Las ediciones de formularios no deben corromper respuestas históricas (versiones inmutables).
- [R3] **Seguridad:** Autorización basada en rol (RBAC) en todos los niveles, no solo en UI.
- [R4] **Idempotencia:** Envío de correos y webhooks reintentables.

## Phases

- [x] Phase 1 — Architecture (@architect): technical contract and stack decisions
- [x] Phase 2 — Testing (@testing): expected behavior as tests
- [x] Phase 3 — Code (@code): implementation against those tests
- [x] Phase 4 — Audit (@audit): code meets tests and contract
- [x] Phase 5 — Security (@security): OWASP Top 10 2025 audit
- [ ] Phase 6 — Delivery (@delivery): Docker, CI, observability, migrations (in progress)
- [ ] Phase 7 — Documentation (@docs): README, API, ADRs, license
- [ ] Phase 8 — Closeout (@audit): production readiness verdict

## Technical contract

### Data Model
- Organization: id, name.
- User: id, email, role (Admin|Employee), organizationId.
- Form: id, title, organizationId, status (Draft|Published|Archived), version.
- Question: id, formId, type (Text|Email|Select|MultiSelect|Rating|LongAnswer), required, order, settings (JSON).
- LogicRule: id, questionId, condition (JSON), action (Jump|End).
- Submission: id, formId, token, version, createdAt.
- Answer: id, submissionId, questionId, value.

### API Shape
- See `docs/contract.md` for endpoints, types, and error patterns.

### Security
- Auth: Custom session management via Lucia Auth.
- Authorization: Middleware checking `organizationId` and `role` per endpoint.
- GDPR: Normalization, encryption of PII, retention policies in `src/domain/gdpr.ts`.


## New dependencies found

[Vacío]

## Open findings

- [Phase 1] R1 fixed: GDPR data-export and data-deletion endpoints added.
- [Phase 1] R4 fixed: Notification management endpoints added for both email and webhook retries.
- [Phase 5] CRITICAL — FINDING-01: GDPR endpoints accept user-supplied organizationId, allowing cross-tenant data export/deletion.
- [Phase 5] CRITICAL — FINDING-02: Login does not verify password (complete auth bypass).
- [Phase 5] HIGH — FINDING-03: Notification endpoints missing organization scoping (cross-tenant data leak).
- [Phase 5] HIGH — FINDING-04: No rate limiting on login endpoint (brute-force vector).
- [Phase 5] MEDIUM — FINDING-05: XSS in email HTML builder (user data injected unescaped).
- [Phase 5] MEDIUM — FINDING-06: No security headers configured (CSP, HSTS, X-Frame-Options, etc.).
- [Phase 5] MEDIUM — FINDING-07: Session not invalidated on login (multiple concurrent sessions).
- [Phase 5] LOW — FINDING-08: Rate limiting on submissions is not atomic (race condition).
- [Phase 5] LOW — FINDING-09: Missing nodemailer dependency in package.json.


## Decision log

- [Phase 1] Inicialización del proyecto — Estrategia de stack aprobada (Astro, HTMX, Prisma, Lucia, BullMQ, Redis, PostgreSQL).
