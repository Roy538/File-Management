# File Tracking & Document Management System

A production-grade hybrid system for tracking physical files and managing digital documents across multiple business units and branches.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, TailwindCSS 3.4, TanStack Query/Table |
| Backend | NestJS 10, TypeScript, Fastify adapter |
| Database | PostgreSQL 16 via Prisma ORM |
| Object storage | MinIO (dev) / AWS S3 (prod) |
| Queue | Redis 7 + BullMQ |
| OCR | Python/FastAPI + Tesseract |
| E-signature | Self-hosted Documenso |
| Email | Nodemailer (Mailhog in dev) |

## Quick Start (Docker)

```bash
# 1. Copy environment file and set your secrets
cp .env.example .env

# 2. Start all services (builds images on first run — takes ~3 min)
pnpm docker:up
```

Services available after startup:

| Service | URL |
|---|---|
| Web UI | http://localhost:5173 |
| API | http://localhost:3000 |
| API Docs (Swagger) | http://localhost:3000/api/docs |
| MinIO Console | http://localhost:9001 |
| Mailhog | http://localhost:8025 |

Default dev credentials (from `prisma/seed.ts`):
- Admin: `admin@fts.local` / `Admin1234!`
- Officer: `officer@fts.local` / `Admin1234!`

## Local Development (without Docker)

### Prerequisites
- Node.js 20 LTS (`nvm use` — reads `.nvmrc`)
- pnpm 9.x: `npm install -g pnpm@9`
- PostgreSQL 16 and Redis 7 (or run just the infra via Docker — see below)

```bash
# Start only the infrastructure containers
docker compose -f infra/docker-compose.yml up postgres redis minio mailhog -d

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env   # edit DATABASE_URL etc. to point to localhost

# Apply DB schema
pnpm --filter @fts/api exec prisma migrate dev

# Seed the database
pnpm --filter @fts/api exec prisma db seed

# Run API in watch mode (terminal 1)
pnpm dev:api

# Run web dev server (terminal 2)
pnpm dev:web
```

## Production Deployment

### 1. Build and push images

```bash
export REGISTRY=ghcr.io/your-org   TAG=1.0.0

docker build -f apps/api/Dockerfile  -t $REGISTRY/fts-api:$TAG  .
docker build -f apps/web/Dockerfile  -t $REGISTRY/fts-web:$TAG  .
docker build -f services/ocr-worker/Dockerfile \
             -t $REGISTRY/fts-ocr-worker:$TAG \
             services/ocr-worker

docker push $REGISTRY/fts-api:$TAG
docker push $REGISTRY/fts-web:$TAG
docker push $REGISTRY/fts-ocr-worker:$TAG
```

### 2. Configure the server

```bash
# Copy compose files and create .env.prod from the example
scp infra/docker-compose.yml infra/docker-compose.prod.yml user@server:/opt/fts/
scp .env.example user@server:/opt/fts/.env.prod
# Edit /opt/fts/.env.prod — fill in all secrets
```

### 3. Deploy

```bash
ssh user@server
cd /opt/fts
export REGISTRY=ghcr.io/your-org TAG=1.0.0

# Pull and restart with prod overrides
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Database migrations run automatically at API startup via `docker-entrypoint.sh`.

### E-signature (Documenso)

Uncomment the `documenso` service in `infra/docker-compose.yml` (dev) or it is always included in `docker-compose.prod.yml`. After first boot:
1. Open `http://host:3001`, complete the Documenso setup wizard
2. Create an API key and copy it into `DOCUMENSO_API_KEY`
3. Register a webhook pointing to `https://your-domain/api/esignature/webhook` and set `DOCUMENSO_WEBHOOK_SECRET`
4. Restart the API container

### Using AWS S3 instead of MinIO

In `.env.prod`:
```
STORAGE_DRIVER=s3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET=fts-documents-prod
```
Remove the `minio` service from `docker-compose.prod.yml`.

## Key Scripts

```bash
pnpm dev            # start api + web in watch mode (concurrently)
pnpm build          # build all packages
pnpm test           # run all tests
pnpm typecheck      # type-check all packages
pnpm lint           # lint all packages
pnpm docker:up      # start full docker-compose dev stack
pnpm docker:down    # stop docker-compose stack
```

## Project Structure

```
apps/
  api/          NestJS 10 backend (Fastify adapter)
  web/          React 18 + Vite 5 frontend
packages/
  shared-types/ Enums and DTOs shared between api and web
services/
  ocr-worker/   Python/FastAPI + Tesseract microservice
infra/
  docker-compose.yml       Development stack
  docker-compose.prod.yml  Production overrides
  init-db.sql              Creates the documenso DB on first pg init
```

## Build Phases

| Phase | Status | Description |
|---|---|---|
| 1  | ✅ Done | Monorepo scaffolding, Docker Compose, CI skeleton |
| 2  | ✅ Done | Auth (JWT access+refresh), RBAC, org structure (BU → Branch) |
| 3  | ✅ Done | Physical file inventory (status machine, CRUD, search) |
| 4  | ✅ Done | Dispatch & return (state transitions, dedicated endpoints) |
| 5  | ✅ Done | Location tracking, movement history, audit trail |
| 6  | ✅ Done | Full-text search, dashboard stats |
| 7  | ✅ Done | Notifications (overdue cron), reports (Excel export) — **Part A milestone** |
| 8  | ✅ Done | Cabinets/Folders/SubDividers/DocTypes hierarchy, ACL, tree UI |
| 9  | ✅ Done | S3/MinIO upload, document versioning, OCR via BullMQ, lifecycle state machine |
| 10 | ✅ Done | PDF viewer + annotation/redaction (react-pdf + pdf-lib), Documenso e-signature bridge |
| 11 | ✅ Done | Workflow approval chains, retention policy scheduler |
| 12 | ✅ Done | Rate limiting (ThrottlerGuard), S3 SSE-AES256, unit tests (83 passing), CI pipeline |
| 13 | ✅ Done | Production Dockerfiles (non-root, dumb-init, healthcheck), nginx security headers, compose hardening |
