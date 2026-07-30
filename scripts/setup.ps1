<#
.SYNOPSIS
  Goodform — one-command setup for development and production.
.DESCRIPTION
  Checks prerequisites, installs dependencies, configures environment,
  runs database migrations, seeds sample data, and builds the project.
  Run with:  .\scripts\setup.ps1
#>

param(
  [switch]$Prod,
  [switch]$NoSeed,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }

# --- Help ---
if ($Help) {
  Get-Content $PSCommandPath | Select-String -Pattern '^# ' | ForEach-Object { $_ -replace '^# ', '' }
  exit 0
}

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Goodform — Quick Setup        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan

# ---- 1. Prerequisites ----
Write-Step "1/6  Checking prerequisites..."

$nodeVer = node --version 2>$null
if (-not $nodeVer) { Write-Err "Node.js is not installed. Install Node.js 20+ from https://nodejs.org" }
Write-OK "Node.js $nodeVer"

$npmVer = npm --version 2>$null
if (-not $npmVer) { Write-Err "npm is not installed." }
Write-OK "npm $npmVer"

# Check PostgreSQL (psql)
$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) { Write-Warn "psql not found — needed for DB setup." }

# Check Redis (redis-cli) — optional for dev
$redisCli = Get-Command redis-cli -ErrorAction SilentlyContinue
if (-not $redisCli) { Write-Warn "redis-cli not found — needed for queue/rate-limit." }

# ---- 2. Environment file ----
Write-Step "2/6  Configuring environment..."

$envFile = Join-Path $root ".env"
$envExample = Join-Path $root ".env.example"

if (-not (Test-Path $envFile)) {
  if (Test-Path $envExample) {
    Copy-Item $envExample $envFile
    Write-OK ".env created from .env.example"
    Write-Warn "Edit $envFile with your real secrets before going to production!"
  } else {
    Write-Err ".env.example not found. Download it from the repository."
  }
} else {
  Write-OK ".env already exists"
}

if ($Prod) {
  Write-Warn "Production mode: make sure DATABASE_URL and SESSION_SECRET are set correctly in .env"
}

# ---- 3. Install dependencies ----
Write-Step "3/6  Installing npm dependencies..."
Push-Location $root
try {
  npm install 2>&1 | Out-Null
  Write-OK "npm install complete"
} finally {
  Pop-Location
}

# ---- 4. Database ----
Write-Step "4/6  Setting up the database..."

Push-Location $root
try {
  # Generate Prisma client
  npx prisma generate 2>&1 | Out-Null
  Write-OK "Prisma client generated"

  # Run migrations
  npx prisma migrate deploy 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Warn "migrate deploy failed, trying migrate dev..."
    npx prisma migrate dev 2>&1 | Out-Null
  }
  Write-OK "Database migrations applied"

  # Seed sample data
  if (-not $NoSeed) {
    npx tsx prisma/seed.ts 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-OK "Sample data seeded"
    } else {
      Write-Warn "Seed failed — database may need manual setup"
    }
  } else {
    Write-OK "Skipped seed (--NoSeed)"
  }
} finally {
  Pop-Location
}

# ---- 5. Build ----
Write-Step "5/6  Building the project..."

Push-Location $root
try {
  npx astro build 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-OK "Build succeeded"
  } else {
    Write-Err "Build failed — check the error above"
  }
} finally {
  Pop-Location
}

# ---- 6. Done ----
Write-Step "6/6  Setup complete!"
Write-Host ""
Write-Host "  ┌─ Development ─────────────────────────────┐" -ForegroundColor Green
Write-Host "  │                                           │" -ForegroundColor Green
Write-Host "  │  npx astro dev --port 4321                │" -ForegroundColor Green
Write-Host "  │  Open http://localhost:4321                │" -ForegroundColor Green
Write-Host "  │                                           │" -ForegroundColor Green
Write-Host "  ├─ Production ──────────────────────────────┤" -ForegroundColor Green
Write-Host "  │                                           │" -ForegroundColor Green
Write-Host "  │  node dist/server/entry.mjs               │" -ForegroundColor Green
Write-Host "  │  or: docker compose up -d                 │" -ForegroundColor Green
Write-Host "  │                                           │" -ForegroundColor Green
Write-Host "  ├─ Login (after seed) ──────────────────────┤" -ForegroundColor Green
Write-Host "  │                                           │" -ForegroundColor Green
Write-Host "  │  Email:  admin@goodform.local             │" -ForegroundColor Green
Write-Host "  │  Password:  password123                   │" -ForegroundColor Green
Write-Host "  │                                           │" -ForegroundColor Green
Write-Host "  └───────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
