# ── Builder stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

# Copy workspace manifests + lockfile for layer-cache efficiency
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

# Install all deps (dev + prod — needed for prisma generate + nest build)
RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api

# Generate Prisma client then compile
RUN pnpm --filter @fts/api exec prisma generate
RUN pnpm --filter @fts/api build

# ── Runner stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# dumb-init: proper PID-1 signal forwarding (SIGTERM → graceful shutdown)
RUN apk add --no-cache dumb-init

# ── LibreOffice engine (high-fidelity Office <-> PDF conversions) ───────────────
# Adds ~600MB to the image. Set --build-arg INSTALL_LIBREOFFICE=false to skip it;
# the conversion module then falls back to its pure-JS engine automatically.
ARG INSTALL_LIBREOFFICE=true
RUN if [ "$INSTALL_LIBREOFFICE" = "true" ]; then \
      apk add --no-cache libreoffice font-dejavu ttf-liberation && rm -rf /var/cache/apk/*; \
    fi
# resolveSoffice() checks this path exists; if LibreOffice was skipped it simply
# falls through to the pure-JS engine.
ENV LIBREOFFICE_PATH=/usr/bin/soffice

WORKDIR /app

RUN npm install -g pnpm@9

# Copy workspace manifests for prod dep install
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# ── Prisma artifacts ──────────────────────────────────────────────────────────
# Copy generated client (avoids re-running prisma generate without the CLI)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# Copy Prisma CLI so docker-entrypoint.sh can run migrate deploy at startup
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# ── Application artifacts ─────────────────────────────────────────────────────
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

# Run as non-root
RUN chown -R node:node /app
USER node

WORKDIR /app/apps/api
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--", "sh", "docker-entrypoint.sh"]
