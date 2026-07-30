# Goodform

A self-hosted, mobile-first form builder alternative to Typeform, built for small businesses that need GDPR compliance and full data control.

## Prerequisites

- Node.js 20 or later
- PostgreSQL 17 or later
- Redis 7 or later
- Docker and Docker Compose (optional, for containerized setup)

## Local Setup

```bash
# Clone the repository
git clone <repository-url>
cd goodform

# Install dependencies
npm install

# Copy environment variables and configure
cp .env.example .env
# Edit .env with your database, Redis, and SMTP credentials

# Push the database schema
npm run db:push

# Seed the database (creates a default admin user)
npm run db:seed

# Start the development server
npm run dev
```

The application runs at `http://localhost:4321` by default.

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:password@localhost:5432/goodform` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `SESSION_SECRET` | Secret for session signing (use a random string in production) | `change-me-to-a-random-string` |
| `SMTP_HOST` | SMTP server hostname | `smtp.example.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP authentication username | `notifications@example.com` |
| `SMTP_PASS` | SMTP authentication password | `change-me` |
| `SMTP_FROM` | Sender address for outgoing emails | `Goodform <notifications@example.com>` |
| `WEBHOOK_SECRET` | Secret for webhook signature verification | `change-me-to-a-random-string` |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the development server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build locally |
| `npm run start` | Start the production server |
| `npm run test` | Run the test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:push` | Push the schema to the database without creating a migration |
| `npm run db:migrate` | Create and apply a development migration |
| `npm run db:migrate:prod` | Apply pending migrations in production |
| `npm run db:seed` | Seed the database with default data |
| `npm run db:reset` | Reset the database and reapply all migrations |
| `npm run db:studio` | Open Prisma Studio for database inspection |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run the linter (not yet configured) |
| `npm run docker:dev` | Start all services in Docker (development) |
| `npm run docker:prod` | Start all services in Docker (production) |

## Docker Setup

### Development

```bash
npm run docker:dev
```

This starts PostgreSQL, Redis, and the application with development settings. The database data persists in a Docker volume.

### Production

Create a `docker-compose.prod.yml` and `.env.production` file with production credentials. Then:

```bash
npm run docker:prod
```

The production image uses a multi-stage build: it compiles the application, prunes dev dependencies, runs as a non-root user, and includes a health check at `/api/health/live`.

## Deployment

### Docker

1. Build the image: `docker build -t goodform .`
2. Run with environment variables pointing to your PostgreSQL and Redis instances.
3. Expose port 4321.

### Kubernetes

- Deploy the Docker image as a Deployment with at least 1 replica.
- Use a Service of type `LoadBalancer` or an Ingress to expose port 4321.
- Store `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, and SMTP credentials in a Secret.
- Use a liveness probe on `/api/health/live` (port 4321).

## Integration Setup

### SMTP

Configure the SMTP environment variables to enable email notifications on form submissions. Goodform uses Nodemailer to send emails through your SMTP server.

### Webhooks

Set `WEBHOOK_SECRET` to enable signed webhook delivery. Webhooks are dispatched asynchronously via BullMQ and are retried automatically on failure. The notification status for each submission can be queried via the API.

## Backup and Restore

### Backup

```bash
# Dump the PostgreSQL database
pg_dump -U goodform goodform > goodform-backup.sql
```

### Restore

```bash
# Restore from backup
psql -U goodform goodform < goodform-backup.sql
```

For point-in-time recovery, enable PostgreSQL's WAL archiving. Redis data is ephemeral (sessions and job queues) and does not require backup.

## Security

All 9 OWASP findings from the security audit have been fixed. Key security measures:

- **Authentication:** Argon2id password hashing via oslo. Sessions managed by Lucia Auth.
- **Authorization:** Role-based access control (Admin, Employee) enforced at the API level, not just the UI.
- **Rate limiting:** Login attempts limited to 5 per email per 15 minutes. Submission rate limiting uses an atomic Redis counter.
- **GDPR:** Data export and deletion endpoints enforce organization scoping. Users cannot access or modify data from other organizations.
- **Security headers:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy applied to all responses.
- **Session management:** Previous sessions are invalidated on login.
- **HTML escaping:** User-controlled values are escaped before HTML interpolation in email templates.

See [SECURITY.md](SECURITY.md) for the vulnerability reporting process.

## Known Limitations

- **No visual form builder.** Forms are defined through the API or by editing the database directly. A drag-and-drop UI is out of scope.
- **No payment fields.** Payment processing is not supported.
- **No real-time features.** WebSockets and live collaboration are not implemented.
- **No self-service registration.** Users are created by an Admin. There is no signup endpoint.
- **No email service configured out of the box.** SMTP credentials must be provided externally.
- **GDPR deletion is asynchronous.** Actual data removal is processed by a BullMQ worker, not instantly.

## License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md).

For commercial use inquiries, contact the project maintainer.
