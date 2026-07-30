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

- [ ] Phase 1 — Architecture (@architect): technical contract and stack decisions (in progress)
- [ ] Phase 2 — Testing (@testing): expected behavior as tests
- [ ] Phase 3 — Code (@code): implementation against those tests
- [ ] Phase 4 — Audit (@audit): code meets tests and contract
- [ ] Phase 5 — Security (@security): OWASP Top 10 2025 audit
- [ ] Phase 6 — Delivery (@delivery): Docker, CI, observability, migrations
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

- [Phase 1] Audit R1 Failed: GDPR management/deletion missing in API.
- [Phase 1] Audit R4 Failed: Idempotency/retry endpoints for webhooks/emails missing in API.


## Decision log

- [Phase 1] Inicialización del proyecto — Estrategia de stack aprobada (Astro, HTMX, Prisma, Lucia, BullMQ, Redis, PostgreSQL).
