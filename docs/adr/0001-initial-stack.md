# ADR 0001: Initial Stack

**Status:** Accepted
**Date:** 2026-07-30

## Context

Goodform is a self-hosted form builder for small businesses, positioned as a mobile-first alternative to Typeform. The constraints that shape the technology choice:

- **GDPR compliance** is non-negotiable. The system must support data export, deletion, and organization-scoped access.
- **Mobile-first** rendering. Forms must be fast and usable on phones without a heavyweight JavaScript framework.
- **Single developer scaling to a small team.** The stack should be simple enough for one person to maintain, but structured enough for others to contribute.
- **1,000 form submissions per day** target. This is moderate traffic that does not require a distributed architecture, but does need background job processing for email and webhooks.
- **VPS deployment** with Docker. No managed platform dependencies.

## Decision

**Astro + HTMX + Prisma + Lucia Auth + BullMQ + Redis + PostgreSQL.**

| Layer | Technology | Role |
|-------|-----------|------|
| Rendering | Astro 5 with HTMX | Server-rendered pages with interactive islands, no client-side JS bundle by default |
| API | Astro API routes (SSR) | REST endpoints under `/api/*` |
| ORM | Prisma 6 | Schema-first database access, migrations, type-safe queries |
| Auth | Lucia Auth 3 | Session management with Prisma adapter |
| Password hashing | oslo (Argon2id) | Verified, memory-hard hashing |
| Validation | Zod | Request and schema validation |
| Background jobs | BullMQ | Async email and webhook delivery with retries |
| Queue backend | Redis 7 | BullMQ backing store, rate limiting, session cache |
| Database | PostgreSQL 17 | Primary data store |
| Language | TypeScript 5.7 | Full-stack type safety |

## Alternatives Considered

### Next.js instead of Astro

**Pros:** Larger ecosystem, more tutorials, built-in routing and API routes.

**Cons:** Heavier client-side JavaScript by default. App Router adds complexity that is not justified for a primarily server-rendered application. The React rendering model is more than what a form builder needs. Astro's island architecture achieves the same interactivity with less shipped JavaScript.

**Verdict:** Rejected. Astro is the right weight for this project.

### SvelteKit instead of Astro

**Pros:** Excellent reactivity model, smaller runtime than React, good DX.

**Cons:** Smaller ecosystem. Fewer pre-built components. The team (initially one developer) would need to become Svelte-specific experts. SvelteKit's server-side rendering is capable but less mature than Astro's for content-heavy pages.

**Verdict:** Rejected. Astro's content-first model and broader community were more practical.

### Drizzle ORM instead of Prisma

**Pros:** Lighter, faster, SQL-like API, no code generation step.

**Cons:** Less mature migration tooling. Smaller community at the time of decision. Prisma's schema-first approach with `prisma db push` and `prisma migrate` provides a clearer workflow for a project that needs reliable schema management and GDPR-related data operations.

**Verdict:** Rejected. Prisma's migration tooling and type generation are a better fit for the team size and compliance requirements.

### NextAuth (Auth.js) instead of Lucia

**Pros:** Pre-built providers, widely used, easy to integrate.

**Cons:** Opinionated session model. Harder to customize for organization-scoped RBAC. Lucia gives full control over session storage, token format, and authorization logic, which is critical for the multi-tenant, role-based access model Goodform requires.

**Verdict:** Rejected. Lucia's flexibility justified the additional implementation effort.

## Consequences

**Positive:**
- Simpler architecture. The rendering, API, and data layers have clear boundaries without framework-imposed abstraction overhead.
- Full control over auth, session management, and authorization. No fighting an opinionated framework's assumptions.
- Astro ships minimal JavaScript by default, which directly serves the mobile-first requirement.
- Prisma's schema and migration tooling provide a reliable path for GDPR data operations.

**Negative:**
- More manual setup than Next.js. Routing, middleware, and API structure are not pre-configured.
- Smaller HTMX ecosystem compared to React. Some interactive patterns require more server round-trips.
- BullMQ and Redis add operational complexity. The team must monitor queue health and Redis memory.
- Prisma's code generation step adds a build dependency and can cause merge conflicts in `prisma/client`.
