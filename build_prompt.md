# Build Prompt — File Tracking & Inventory Management System

Paste this into an agentic coding tool (Claude Code, Cursor, Windsurf, etc.) in the empty project folder you want it built in. It's written to be run in one sitting or phase-by-phase — see "How to use this" at the bottom.

---

## Prompt

You are a senior full-stack engineer building a production-grade **File Tracking and Inventory Management System** from scratch. Work incrementally, phase by phase, and after each phase run the tests and show me the result before moving to the next phase.

### Project context

This system gives registry staff real-time visibility of every physical file, from intake to dispatch, return, archival, or disposal. It serves multiple business units (e.g. MyCredit, Tijaara, Zazipay) and multiple branches per unit. A comparable live system (PinPoint / manageedocs.com/mycredit) confirms the login flow should select a Business Unit ("Group") and Branch ("Fileroom") before credentials, and should support local login now with room for AD/SSO/Google login later.

### Functional requirements — build all of these

1. **File Inventory** — master register: file number, customer name, business unit, branch, date created, current storage location (cabinet/shelf/box/row), volume number, status (`Available`, `Dispatched`, `Returned`, `Archived`, `Missing`).
2. **File Dispatch** — capture dispatch date, file number, person collecting, department, purpose, expected return date, authorizing person, processing user. Status auto-changes to `Dispatched`. Block dispatching a file that is already dispatched; instead raise a duplicate-request notification.
3. **File Return** — capture return date, returned-by, received-by, condition, and whether it was returned to the correct location (yes/no). If "no," capture actual location + remarks. Status auto-changes to `Available` (or stays flagged if unresolved).
4. **File Location Tracking** — always show the file's current location: either its shelf/cabinet coordinates (when available) or holder/department/dispatch-date (when dispatched).
5. **Movement History** — a permanent, non-deletable audit trail per file of every dispatch/return/relocation.
6. **Search** — by file number, customer name, current holder, dispatch date.
7. **Dashboard** — total files, files in registry, currently dispatched, overdue, missing, returned today, dispatched today.
8. **Notifications** — trigger on: file overdue, dispatched file not returned within expected period, file returned to wrong location, duplicate request for an already-dispatched file.
9. **Reports** — daily dispatch report, daily returns report, outstanding files report, files by department, file movement history, missing files report, monthly dispatch statistics. All exportable to Excel and PDF.
10. **User roles** — Registry Administrator (full access incl. reports), Registry Officer (dispatch/receive/search/reports), Department User (search/request/view own files only). Enforce with route guards, not just UI hiding.
11. **Audit Trail** — every action (logins, dispatches, returns, edits) logged with actor + timestamp. Nothing is ever hard-deleted; use a soft-delete/`isActive` flag everywhere.

### Non-functional requirements

- Every dispatch/return/relocation must update the File's current state **and** insert a Movement/history row inside a single database transaction — state and history must never drift apart.
- Role-based access control enforced server-side on every endpoint.
- Passwords hashed (bcrypt/argon2); JWT access + refresh tokens; forgot-password flow.
- Search and dashboard queries should return in under 1 second at tens-of-thousands-of-files scale.
- Fully containerized (Docker) so it can run on cloud or on-premise without code changes.

### Technology stack — use exactly this

- **Frontend:** React 18 + TypeScript, Vite, TailwindCSS, TanStack Query + TanStack Table.
- **Backend:** Node.js + NestJS (TypeScript), one module per functional area below.
- **Database:** PostgreSQL 16 via Prisma ORM.
- **Auth:** JWT (access + refresh), bcrypt password hashing, RBAC guards for the 3 roles above. Structure auth as a pluggable strategy so SAML/OAuth2 (AD/SSO/Google) can be added later without rearchitecting.
- **Background jobs:** Redis + BullMQ for overdue checks and notification dispatch (run on a schedule, e.g. hourly).
- **Notifications:** in-app notification feed + email via Nodemailer.
- **Reports/export:** ExcelJS for Excel, Puppeteer or pdf-lib for PDF.
- **Containerization:** Docker + Docker Compose (services: `api`, `web`, `postgres`, `redis`).
- **Testing:** Jest + Supertest for the API, React Testing Library + Playwright for the frontend/e2e.
- **CI:** GitHub Actions workflow that lints, tests, and builds on every push.

### Data model — implement these entities in `prisma/schema.prisma`

- `BusinessUnit` (id, name)
- `Branch` (id, businessUnitId, name, address)
- `User` (id, name, email, passwordHash, role: `ADMIN` | `OFFICER` | `DEPT_USER`, branchId)
- `File` (id, fileNumber, customerName, businessUnitId, branchId, dateCreated, status, currentLocation, volumeNumber)
- `Dispatch` (id, fileId, dispatchDate, collectedBy, department, purpose, expectedReturnDate, authorizedBy, processedByUserId)
- `Return` (id, fileId, dispatchId, returnDate, returnedBy, receivedBy, condition, correctLocation: boolean, actualLocation, remarks)
- `FileMovement` (id, fileId, action, actorUserId, department, timestamp, remarks) — append-only
- `Notification` (id, type, fileId, targetUserId, message, isRead, createdAt)
- `AuditLog` (id, actorUserId, action, entityType, entityId, beforeState, afterState, timestamp)

### Project structure — scaffold exactly this

```
file-tracking-system/
├── apps/
│   ├── api/                      # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/             # login, JWT, RBAC guards, forgot-password
│   │   │   ├── users/            # users, roles, branches, business units
│   │   │   ├── inventory/        # File entity, master register CRUD
│   │   │   ├── dispatch/         # Dispatch module
│   │   │   ├── returns/          # Return module
│   │   │   ├── tracking/         # current-location + movement history
│   │   │   ├── notifications/    # BullMQ jobs, email, in-app feed
│   │   │   ├── reports/          # Excel/PDF report generation
│   │   │   ├── audit/            # global audit-log interceptor
│   │   │   ├── common/           # guards, interceptors, decorators, filters
│   │   │   └── main.ts
│   │   ├── prisma/schema.prisma
│   │   ├── test/
│   │   └── Dockerfile
│   └── web/                      # React frontend
│       ├── src/
│       │   ├── pages/            # Login, Dashboard, Inventory, Dispatch, Return, Reports
│       │   ├── components/       # DataTable, StatusBadge, Forms, Charts
│       │   ├── features/         # feature-scoped hooks/state
│       │   ├── lib/              # API client, auth context
│       │   └── main.tsx
│       ├── e2e/
│       └── Dockerfile
├── packages/shared-types/        # DTOs/enums shared by api + web
├── infra/
│   ├── docker-compose.yml
│   └── docker-compose.prod.yml
├── docs/
├── .github/workflows/ci.yml
├── .env.example
└── README.md
```

### Build in this order — do not skip ahead

1. **Scaffolding** — monorepo, Docker Compose (postgres, redis, api, web), NestJS + React projects wired up, GitHub Actions running lint/test.
2. **Auth & org structure** — `BusinessUnit`, `Branch`, `User` entities, seed data for the 3 business units + one branch each, JWT login + refresh + forgot-password, RBAC guards, and the login screen (Business Unit → Branch → credentials).
3. **File Inventory** — `File` entity, CRUD API, master register list/detail UI, status modeled as a proper state machine (not free text).
4. **Dispatch & Return** — both modules, transactional status + history updates, duplicate-dispatch blocking.
5. **Tracking, History & Audit** — current-location view, movement-history timeline, global audit-log interceptor on every mutation.
6. **Search & Dashboard** — indexed search, dashboard KPI cards.
7. **Notifications** — BullMQ scheduled jobs for overdue/not-returned, event-driven alerts for wrong-location and duplicate-request.
8. **Reports** — all 7 report types, Excel + PDF export.
9. **Tests & hardening** — unit + integration tests for status transitions and RBAC boundaries, security pass (session expiry, endpoint-level role checks, dependency audit).
10. **Deployment** — production Docker Compose variant, seed/migration scripts, README with setup instructions.

### Constraints to enforce throughout

- Never hard-delete a record; use `isActive`/`deletedAt`.
- Every status-changing action must be one DB transaction (state + history together).
- Every mutating endpoint must go through the RBAC guard and audit interceptor — no bypassing the service layer.
- Keep forms fast for high-volume data entry (minimal required fields, tab/keyboard-friendly, file-number-first search).

### After each phase

Run the relevant tests, show me a summary of what was built and any decisions you made, and wait for my go-ahead before starting the next phase.

---

## How to use this

- **One shot:** paste the whole prompt as-is if you want the agent to attempt the full build in one long session (higher risk of drift on a project this size).
- **Phase by phase (recommended):** paste the prompt once so the agent has full context, then after phase 1 completes, just say "continue with phase 2," etc. This keeps each step reviewable.
- Fill in the deployment target (cloud/on-prem/hybrid) before phase 10 — the prompt above assumes Docker either way, so this doesn't block starting.
