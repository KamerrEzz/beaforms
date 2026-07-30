#!/usr/bin/env bash
#
# Goodform — one-command setup for development and production.
# Usage:
#   chmod +x scripts/setup.sh && ./scripts/setup.sh
#   ./scripts/setup.sh --prod    # production mode
#   ./scripts/setup.sh --no-seed # skip sample data
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

info()  { echo -e "\n==> $1"; }
ok()    { echo "  ✓ $1"; }
warn()  { echo "  ⚠ $1"; }
err()   { echo "  ✗ $1"; exit 1; }

PROD=false
NO_SEED=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prod) PROD=true; shift ;;
    --no-seed) NO_SEED=true; shift ;;
    --help) head -15 "$0"; exit 0 ;;
    *) err "Unknown option: $1";;
  esac
done

echo "╔══════════════════════════════════════╗"
echo "║        Goodform — Quick Setup        ║"
echo "╚══════════════════════════════════════╝"

# ---- 1. Prerequisites ----
info "1/6  Checking prerequisites..."

command -v node >/dev/null 2>&1 || err "Node.js not found. Install Node.js 20+"
ok "Node.js $(node --version)"

command -v npm >/dev/null 2>&1 || err "npm not found"
ok "npm $(npm --version)"

command -v psql >/dev/null 2>&1 || warn "psql not found — needed for DB setup"
command -v redis-cli >/dev/null 2>&1 || warn "redis-cli not found — needed for queue/rate-limit"

# ---- 2. Environment file ----
info "2/6  Configuring environment..."

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    ok ".env created from .env.example"
    warn "Edit .env with your real secrets before going to production!"
  else
    err ".env.example not found"
  fi
else
  ok ".env already exists"
fi

if [ "$PROD" = true ]; then
  warn "Production mode: verify DATABASE_URL and SESSION_SECRET in .env"
fi

# ---- 3. Install dependencies ----
info "3/6  Installing npm dependencies..."
npm install --silent 2>/dev/null
ok "npm install complete"

# ---- 4. Database ----
info "4/6  Setting up the database..."

npx prisma generate 2>/dev/null
ok "Prisma client generated"

if npx prisma migrate deploy 2>/dev/null; then
  ok "Database migrations applied"
else
  warn "migrate deploy failed, trying migrate dev..."
  npx prisma migrate dev 2>/dev/null
  ok "Database migrations applied"
fi

if [ "$NO_SEED" = false ]; then
  npx tsx prisma/seed.ts 2>/dev/null && ok "Sample data seeded" || warn "Seed failed"
else
  ok "Skipped seed (--no-seed)"
fi

# ---- 5. Build ----
info "5/6  Building the project..."
npx astro build 2>/dev/null && ok "Build succeeded" || err "Build failed"

# ---- 6. Done ----
info "6/6  Setup complete!"
echo ""
echo "  Development:"
echo "    npx astro dev --port 4321"
echo "    Open http://localhost:4321"
echo ""
echo "  Production:"
echo "    node dist/server/entry.mjs"
echo "    or: docker compose up -d"
echo ""
echo "  Login (after seed):"
echo "    Email:    admin@goodform.local"
echo "    Password: password123"
echo ""
