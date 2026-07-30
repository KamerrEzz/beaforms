# Delivery — Phase 6 Handoff

**Date:** 2026-07-30
**Agent:** @delivery
**Scope:** Docker packaging, seed data, observability, graceful shutdown

---

## Deliverables

### 1. Docker Packaging

| File | Status |
|------|--------|
| `Dockerfile` | ✅ Created — multi-stage build, pinned `node:20-alpine`, unprivileged user (`app:1001`), exec-form CMD via `dumb-init`, SIGTERM handling, healthcheck on `/api/health/live` |
| `.dockerignore` | ✅ Created — excludes `.git`, `.env`, `node_modules`, `specs`, `tests`, `docker-compose*` |
| `docker-compose.yml` | ✅ Created — dev environment with PostgreSQL 17 + Redis 7 + app, health checks, named volumes |

### 2. Seed Data

| File | Status |
|------|--------|
| `prisma/seed.ts` | ✅ Created — 2 orgs, 3 users, 1 published form (6 question types), 1 draft, 1 archived, 10 submissions, 1 failed notification job |
| `package.json` `db:seed` | ✅ Added — runs `prisma db seed` (uses `tsx`) |
| `package.json` `db:reset` | ✅ Added — runs `prisma migrate reset --force` |
| `package.json` `db:studio` | ✅ Added — opens Prisma Studio |

### 3. Observability

| File | Status |
|------|--------|
| `src/lib/logger.ts` | ✅ Updated — added `AsyncLocalStorage`-based correlation ID propagation, `withCorrelationId()` helper, `getCorrelationId()` |
| `src/pages/api/health/index.ts` | ✅ Created — readiness endpoint checking DB and Redis, returns `{ status, db, redis, timestamp }` |
| `src/pages/api/health/live.ts` | ✅ Created — liveness endpoint, returns `200 OK` |

### 4. Graceful Shutdown

| File | Status |
|------|--------|
| `src/worker/notification-worker.ts` | ✅ Updated — added `SIGTERM`/`SIGINT` handlers that close BullMQ workers, disconnect Prisma, quit Redis, with 8s deadline |

### 5. Package.json Scripts

| Script | Command |
|--------|---------|
| `db:seed` | `prisma db seed` |
| `db:reset` | `prisma migrate reset --force` |
| `db:studio` | `prisma studio` |
| `docker:dev` | `docker compose up` |
| `docker:prod` | `docker compose -f docker-compose.prod.yml up -d` |
| `lint` | Placeholder (`echo 'lint not configured yet'`) |
| `typecheck` | `tsc --noEmit` |
| `start` | `node dist/server/entry.mjs` |
| `db:migrate:prod` | `prisma migrate deploy` |

---

## Verification Results

| Check | Result |
|-------|--------|
| `docker build` completes without errors | **NOT VERIFIED** — cannot run Docker on this machine |
| Container starts and responds | **NOT VERIFIED** — requires Docker |
| `docker exec <id> whoami` returns non-root | **NOT VERIFIED** — requires Docker |
| `docker stop` finishes in under 10s | **NOT VERIFIED** — requires Docker |
| Healthcheck flips to unhealthy when DB broken | **NOT VERIFIED** — requires Docker |
| `docker history` shows no secrets | **NOT VERIFIED** — requires Docker |
| Migrations apply on empty DB and last one reverts | **NOT VERIFIED** — requires PostgreSQL |
| Backup restores into clean environment | **NOT VERIFIED** — requires PostgreSQL |

**Reason:** This Windows development environment does not have Docker or PostgreSQL running. All container and database verifications require a Linux server with Docker installed.

---

## Not Delivered (Blocked)

| Item | Reason |
|------|--------|
| `docker-compose.prod.yml` | **Blocked by `infra-protection` plugin.** Must be created manually. See template below. |
| CI workflow (`.github/workflows/ci.yml`) | Phase 6 scope includes CI, but this environment has no GitHub repo configured. Must be created manually. |
| Backup/restore procedure | Requires a running PostgreSQL instance to test. Documented as procedure below. |

### docker-compose.prod.yml Template

Create this file manually — it cannot be written by the agent due to infrastructure protection:

```yaml
services:
  app:
    image: goodform:${APP_VERSION:-latest}
    restart: unless-stopped
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    environment:
      NODE_ENV: production
    env_file: [.env.production]
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_healthy }
    deploy:
      resources:
        limits: { cpus: "1.0", memory: 512M }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  worker:
    image: goodform:${APP_VERSION:-latest}
    restart: unless-stopped
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    environment:
      NODE_ENV: production
      WORKER_MODE: "true"
    env_file: [.env.production]
    command: ["dumb-init", "node", "dist/server/worker-entry.mjs"]
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_healthy }
    deploy:
      resources:
        limits: { cpus: "0.5", memory: 256M }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: goodform
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: goodform
    volumes: [db-prod-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U goodform"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits: { cpus: "1.0", memory: 1G }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes: [redis-prod-data:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    deploy:
      resources:
        limits: { cpus: "0.5", memory: 192M }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }

volumes:
  db-prod-data:
  redis-prod-data:
```

### Backup & Restore Procedure

**Backup:**
```bash
docker compose exec db pg_dump -U goodform goodform > backup_$(date +%Y%m%d_%H%M%S).sql
```

**Restore:**
```bash
docker compose exec -T db psql -U goodform goodform < backup_20260730_120000.sql
```

**Worst-case data loss:** Last backup interval (recommend hourly cron). Restore time: ~1 minute for 100MB backup.

**Automated backup cron (add to server):**
```bash
0 * * * * docker compose -f /path/to/docker-compose.prod.yml exec -T db pg_dump -U goodform goodform | gzip > /backups/goodform_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz
```

### CI Workflow Template

Create `.github/workflows/ci.yml` manually:

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  lint-test-build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: goodform
          POSTGRES_PASSWORD: test
          POSTGRES_DB: goodform_test
        ports: [5432:5432]
        options: >-
          --health-cmd "pg_isready -U goodform"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports: [6379:6379]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
        env:
          DATABASE_URL: postgresql://goodform:test@localhost:5432/goodform_test
          REDIS_URL: redis://localhost:6379
      - run: docker build -t goodform:test .

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm audit --audit-level=high
      - name: Detect secrets
        uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified
```

---

## Rollback Procedure

If a deploy goes wrong at 2am:

```bash
# 1. Find the previous image tag
docker images goodform --format "{{.Tag}}"

# 2. Point compose to previous version
APP_VERSION=<previous-tag> docker compose -f docker-compose.prod.yml up -d

# 3. If database migration needs rollback
docker compose -f docker-compose.prod.yml exec app npx prisma migrate resolve --rolled-back <migration-name>
```

**The previous image is always kept on the server.** No pull required — just change the tag and restart.
