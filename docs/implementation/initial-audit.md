# ManageEDocs — Phase 0 Initial Technical Assessment

Date: 2026-11-18 · Branch: `Login` @ `8cd49c0`
Scope: Discovery + baseline for the transformation directive in `context.txt` and the engineering contract in `CLAUDE.md.txt`.

Legend: **[V]** = verified by reading code or running a command · **[A]** = assumption / not yet verified.

---

## 1. Headline finding — the stack does not match the mandate

| Layer | Mandated (`context.txt` Part 2, `CLAUDE.md.txt` §2) | Actual codebase | Gap |
|---|---|---|---|
| Frontend | React + TS strict, Vite, React Router, TanStack Query, Zustand, RHF + Zod | React 18 + TS, Vite 5, React Router 6, TanStack Query 5, Tailwind. **No** RHF, Zod or Zustand **[V]** | Small |
| Backend | Java 21 + Spring Boot, Spring Security, JPA, Flyway | **NestJS 10 (Node/TypeScript) + Fastify** **[V]** | **Full rewrite** |
| Database | MySQL 8.4, Flyway migrations | **PostgreSQL 16 via Prisma 5**, schema applied with `prisma db push`; migrations folder is git-ignored **[V]** | **Full re-model + data migration** |
| Queue | RabbitMQ (when justified) | BullMQ on Redis **[V]** | Re-platform |
| Storage | S3/MinIO abstraction | S3/MinIO via AWS SDK **[V]** | Concept carries over |

The backend is about 6,700 lines across 110 TS files and 19 Nest modules, with 22 Prisma models **[V]**. Meeting the mandate means writing a new Spring Boot backend and a MySQL schema with Flyway, then moving the React client over to it. Both governing documents list "major framework replacement" as **requires approval** (`context.txt` Rule 14, `CLAUDE.md.txt` §1.1). This decision is being put to the project owner before implementation starts.

Toolchain available on this machine **[V]**: Java 21.0.11 LTS, Maven 3.9.16, Docker 29.6 (daemon **not running**), Node 22.23.3. No MySQL client is installed. C: has **6.1 GB free** (98% used); D: has 41 GB.

---

## 2. Baseline (run 2026-11-18)

| Check | Result |
|---|---|
| `pnpm` / `node` in repo root | **Broken.** The nvm-windows proxy reads `.nvmrc` = `20`, and Node 20 is not installed. Baseline was run by calling the Node 22 binary directly. **[V]** |
| API `tsc --noEmit` | Pass **[V]** |
| API Jest | **18 failed / 65 passed (83)**. All failures are in `workflows.service.spec.ts`: the test module does not provide `NotificationsService`, which was added to `WorkflowsService` after the test was written. The tests are stale, not a product bug. **[V]** |
| Web `tsc --noEmit` | Pass **[V]** |
| Web Vitest | **Fails.** Vitest picks up `e2e/smoke.spec.ts`, which is a Playwright spec. There are no real unit tests. **[V]** |
| Web build | Pass, but a single **1.44 MB** JS chunk (460 KB gzip), with no code splitting **[V]** |
| Runtime | Docker daemon is down, so Postgres, Redis and MinIO are unavailable. `apps/api/api.err` shows the scheduler failing with `Can't reach database server at localhost:5432` **[V]** |
| Repo hygiene | `apps/api/api.err` (a runtime log) is **tracked in git** and currently modified. `.idea/` is partially tracked **[V]** |

---

## 3. Functional inventory (existing NestJS app)

Two product halves. Status is taken from the code plus the prior build log. A full trace of every flow is pending.

**Part A: physical file tracking.** Inventory, dispatch/return, movements/tracking, file requests, reports (xlsx/pdf), notifications (cron overdue). These are not in the DMS mandate, but Rule 2 says to preserve working functionality.

**Part B: DMS.** Cabinets → folders → sub-dividers hierarchy, document types, cabinet ACLs and visibility (Personal/Private/Default), upload and versioning with a status state machine, check-out fields, OCR (BullMQ with an in-process pdf-parse fallback), global search (`ILIKE` on title and OCR text), workflows (definition JSON + instances, approve/reject/cancel), retention (daily cron, archive/delete/notify), audit log (admin view), e-signature bridge (Documenso), PDF conversion tools, dashboard stats.

Tenancy model: `BusinessUnit` → `Branch`. Users carry `businessUnitId` in the JWT **[V]**.

---

## 4. Findings

### Critical

| # | Finding | Evidence | Impact |
|---|---|---|---|
| C1 | **Cross-tenant document listing and content search.** `listDocuments` filters only on `isActive`, folder, type, status and search. It has no business-unit filter and no cabinet-visibility/ACL filter, and it searches `ocrText`. | `apps/api/src/documents/documents.service.ts:36-58` **[V]** | Any authenticated user in any BU can list every document in the system and find documents by body text. This breaks tenant isolation (directive Part 8.3, Scenario F). |
| C2 | **IDOR on document detail and download.** `findOne(id)` and `getDownloadUrl(docId, versionId)` do no tenant, visibility or ACL check, and they issue a 15-minute signed URL. | `documents.service.ts:62-76`, `:183-189` **[V]** | Any authenticated user who has or guesses a document ID can download it. Scenarios C and F fail. |

### High

| # | Finding | Evidence |
|---|---|---|
| H1 | Client-supplied filename is embedded unsanitised in the S3 key (`${bu}/${docId}/1/${fileName}`). Client MIME type is trusted. There is no extension/type allowlist and no content sniffing. | `documents.controller.ts:52-72`, `documents.service.ts:99` **[V]** |
| H2 | Refresh token is stored in `localStorage`, so any XSS can steal it. | `apps/web/src/lib/api-client.ts:12-22` **[V]** |
| H3 | Schema changes go through `prisma db push` and the migrations directory is git-ignored. There is no reviewable, repeatable migration history, and the deploy entrypoint runs `db push`. | `.gitignore`, `docker-entrypoint.sh`, project log **[V]** |
| H4 | Upload limit is 100 MB, buffered fully in memory (`part.toBuffer()`-style read). There is no streaming or presigned direct upload. | `main.ts:22`, `documents.controller.ts` **[V]** |
| H5 | No malware scanning on upload. | **[V]** (no scanner in code) |
| H6 | Tenant scoping is applied by hand in each service and is unevenly present. For example, `workflows.service.ts` references `businessUnitId` only once. There is no central enforcement such as a repository filter. | grep count per service **[V]**. Per-endpoint verification pending **[A]** |

### Medium

- M1: Stale tests (18 failing) and a misconfigured Vitest, so CI is red. **[V]**
- M2: The 1.44 MB single bundle has no route-level lazy loading. **[V]**
- M3: Inconsistent API response shapes. Prisma entities are returned directly from services/controllers (`findOne` includes raw relations), so there are no DTO contracts. **[V]** (documents module)
- M4: Search uses `contains`/`ILIKE` on `ocrText`, which is unindexed. It will degrade with volume. **[V]**
- M5: Workflow definitions are stored as a JSON blob of steps, and there is no definition versioning, so editing a definition can break running instances. **[A]**, pending a read of `workflows.service.ts`.
- M6: CSP is disabled in helmet (`contentSecurityPolicy: false`). **[V]** `main.ts:19`
- M7: The dev toolchain is fragile: `.nvmrc` pins Node 20, which is not installed. **[V]**

### Low

- L1: Runtime logs (`api.err`) are committed to git. **[V]**
- L2: No forms library or schema validation on the client (hand-rolled `useState` forms). **[A]**, by sampling.
- L3: The dev-bypass login exists. It is gated by `import.meta.env.DEV` and the backend still requires a JWT, so it is low risk. **[V]**

---

## 5. Skills and tools discovered

Available in this environment: `find-skills`, `frontend-design`, `ui-ux-pro-max`, `ux-ui-agent-skills:*` (design-review, a11y-audit, design-tokens, design-qa, …), `ponytail` (minimal-solution / anti-over-engineering), `ponytail-audit`, `code-review`, `security-review`, `simplify`, `run`. `ux-ui-engine` (named in the directive) is **not installed**. The closest equivalents are `ux-ui-agent-skills` and `ui-ux-pro-max`. The Playwright MCP server **failed to connect** this session. No skill has been applied yet. They will be loaded when their phase begins.

---

## 6. Recommended next step

1. Decide the stack question in §1. This is a project-owner decision.
2. Whatever the decision, fix **C1/C2** first. They are live tenant-isolation breaches in the currently deployed code.
3. Get to green: fix the stale workflow tests and the Vitest config, and untrack `api.err`.
