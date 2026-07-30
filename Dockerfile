# ---- Stage 1: build ----
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json astro.config.mjs ./
RUN npx prisma generate
RUN npm run build

# Prune dev dependencies after build
RUN npm prune --omit=dev

# ---- Stage 2: runtime ----
FROM node:20-alpine AS runtime

# Install dumb-init for proper signal handling as PID 1
RUN apk add --no-cache dumb-init

# Create unprivileged user
RUN addgroup --system --gid 1001 app \
 && adduser --system --uid 1001 --ingroup app app

WORKDIR /app

# Copy runtime artifacts
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/package.json ./

# Ensure node_modules are generated for production
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma

# No secrets in image — all secrets via runtime environment variables

USER app

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4321/api/health/live || exit 1

# dumb-init forwards signals to the Node process (PID 1 problem)
CMD ["dumb-init", "node", "dist/server/entry.mjs"]
