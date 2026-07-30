# Deploy — Goodform

## Prerequisites

| Dependency | Version | Required for |
|------------|---------|-------------|
| Node.js    | ≥ 20    | Runtime |
| PostgreSQL | ≥ 15    | Primary database |
| Redis      | ≥ 7     | Session store, rate limiter, BullMQ queue |
| npm        | ≥ 10    | Package management |

## Quick start (development)

```bash
# One-command setup (Linux/Mac)
chmod +x scripts/setup.sh && ./scripts/setup.sh

# One-command setup (Windows PowerShell)
.\scripts\setup.ps1

# Or skip seed data
.\scripts\setup.ps1 -NoSeed

# Start the dev server
npx astro dev --port 4321
```

The setup script checks prerequisites, creates `.env` from `.env.example`, installs dependencies, runs migrations, seeds sample data, and builds the project.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `REDIS_URL` | **Yes** | `redis://localhost:6379` | Redis connection string |
| `SESSION_SECRET` | **Yes** | — | Random string for session encryption |
| `SMTP_HOST` | No | — | SMTP server for email notifications |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `SMTP_FROM` | No | `Goodform <notifications@goodform.local>` | From address for emails |
| `PUBLIC_SITE_URL` | No | `http://localhost:4321` | Public URL (used for GDPR export links) |
| `WEBHOOK_SECRET` | No | `''` | Secret for outbound webhook signing |
| `RATE_LIMIT_LOGIN_MAX` | No | `5` | Max failed login attempts per 15 min |
| `NODE_ENV` | No | `development` | `production` enables secure cookies, strict logging |

> **Security**: `SESSION_SECRET` and `WEBHOOK_SECRET` must be unique, random strings. Generate with:
> ```bash
> node -e "console.log(crypto.randomBytes(32).toString('hex'))"
> ```

## Production deployment

### Option A: Docker (recommended)

The project includes a production-ready `Dockerfile` with:
- Multi-stage build (smaller final image)
- Unprivileged `app` user (not root)
- `dumb-init` for proper signal handling (PID 1)
- Health check endpoint at `/api/health/live`

Build and run:

```bash
# Build the image
docker build -t goodform:latest .

# Run with your production database
docker run -d \
  --name goodform \
  -p 4321:4321 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://user:pass@host:5432/goodform \
  -e REDIS_URL=redis://host:6379 \
  -e SESSION_SECRET="$(node -e "console.log(crypto.randomBytes(32).toString('hex'))")" \
  -e PUBLIC_SITE_URL=https://forms.yourdomain.com \
  goodform:latest
```

### Option B: Bare metal (with process manager)

```bash
# 1. Clone, install, build
git clone <repo> && cd beaforms
npm install --production
npx prisma generate
npx prisma migrate deploy
npm run build

# 2. Run with a process manager (e.g. pm2)
npm install -g pm2
pm2 start dist/server/entry.mjs --name goodform -i max

# 3. Reverse proxy (nginx example)
cat > /etc/nginx/sites-available/goodform << 'EOF'
server {
    listen 80;
    server_name forms.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
```

## Background worker

The notification worker (email reminders, webhooks) runs separately. Start it alongside the web server:

```bash
node dist/worker/notification-worker.mjs
```

In Docker, run a second container with the same image but a different command:

```bash
docker run -d \
  --name goodform-worker \
  --env-file .env \
  goodform:latest \
  node dist/worker/notification-worker.mjs
```

## Database

### Migrations

```bash
# Apply pending migrations
npx prisma migrate deploy

# Create a new migration (development)
npx prisma migrate dev --name describe_change

# Reset database (destroys data)
npx prisma migrate reset
```

### Backups

```bash
# PostgreSQL
pg_dump -U goodform -h localhost goodform > backup_$(date +%F).sql

# Restore
psql -U goodform -h localhost goodform < backup_2025-01-01.sql
```

### Seed data (development)

```bash
npx tsx prisma/seed.ts
```

This creates:
- **Organization**: Goodform Demo
- **Admin user**: `admin@goodform.local` / `password123`

## Monitoring

### Health endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health/live` | Liveness probe (returns 200 if server is alive) |
| `GET /api/health/ready` | Readiness probe (checks DB + Redis connectivity) |

### Docker health check

The Dockerfile includes a built-in `HEALTHCHECK` that pings `/api/health/live` every 30 seconds.

### Logging

- Structured JSON logging via `src/lib/logger.ts`
- Log level controlled by `LOG_LEVEL` (default: `info`)
- In production, logs go to stdout/stderr (capture with your log aggregator)

## Verification checklist

Before going live, run through this check:

- [ ] `SESSION_SECRET` is a unique random string
- [ ] `NODE_ENV=production` set (enables secure cookies)
- [ ] `PUBLIC_SITE_URL` points to your real domain (GDPR export URLs)
- [ ] Database is backed up and restore tested
- [ ] Redis is configured with persistence (AOF + RDB)
- [ ] Docker uses `--restart=unless-stopped` or systemd
- [ ] Background worker is running for notifications
- [ ] Reverse proxy terminates TLS (HTTPS)
- [ ] Health checks pass (`/api/health/live`, `/api/health/ready`)
- [ ] Rate limiter values are appropriate for your traffic

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `500 TypeError: invalidateSessionsForUser is not a function` | Wrong Lucia v2 method name | Update to Lucia v3 API (see `src/auth/session.ts`) |
| `429 Too many attempts` on login | Rate limit exceeded | Wait 15 min or run `redis-cli DEL "rate:login:*"` |
| BullMQ jobs fail silently | Colon in queue name/job ID | BullMQ rejects `:` — use `-` instead (already fixed) |
| GDPR export returns broken URL | `PUBLIC_SITE_URL` not set | Set it to your domain |
| "Cannot find module" on build | Wrong import depth | Check `../` count in route files under `pages/api/` |
