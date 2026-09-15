#!/bin/sh
set -e

echo "[startup] Running Prisma migrations..."
# Prisma CLI is copied from the builder stage to /app/node_modules/prisma
node /app/node_modules/prisma/build/index.js migrate deploy

echo "[startup] Starting API server..."
exec node dist/main
