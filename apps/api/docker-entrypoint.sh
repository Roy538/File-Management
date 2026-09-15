#!/bin/sh
set -e

echo "[startup] Syncing Prisma schema..."
# Uses db push (no migration files — schema-first approach)
node /app/node_modules/prisma/build/index.js db push --accept-data-loss

echo "[startup] Starting API server..."
exec node dist/main
