# Architecture Decision Log

Format: Context → Decision → Consequences. Status: Accepted unless noted.

---

## ADR-001 Patch the NestJS app, then migrate to Spring Boot + MySQL
**Context.** The directive mandates Java 21 / Spring Boot / MySQL 8.4 / Flyway. The existing backend is NestJS + Prisma + PostgreSQL, and it is live with critical tenant-isolation defects (audit C1/C2).
**Decision.** The project owner approved this on 2026-11-18. (1) Fix critical security defects in NestJS now. (2) Build a new Spring Boot modular monolith in `backend/` against MySQL. (3) Cut over once the new backend reaches parity. (4) Retire NestJS.
**Consequences.** For a period two backends exist. Only NestJS serves production until cutover.

## ADR-002 Cutover is per release, not per endpoint
**Context.** Switching the React client to the new backend one feature at a time would leave two authoritative databases (Postgres and MySQL) with cross-references: users ↔ cabinets ↔ documents ↔ workflows. That needs dual writes or sync, which is fragile.
**Decision.** Spring Boot modules are built and verified against MySQL in development. The React API layer is moved to the new `/api/v1` contracts module by module behind a build-time switch (`VITE_API_TARGET`). Production switches in one release, together with a one-shot, idempotent, verifiable Postgres → MySQL data migration (ADR-010).
**Consequences.** There is no dual-write complexity. Cutover needs a rehearsed migration and a rollback plan. NestJS stays in place, untouched, as the fallback until the new system is verified.

## ADR-003 Modular monolith, package by domain
**Decision.** Spring Boot 3.x on Java 21, built with Maven. Code lives under `com.manageedocs.<module>` (identity, tenancy, documents, storage, search, workflows, audit, retention, records-tracking, …). Each module has `api` (controllers + DTOs), `application` (services), `domain` (entities, rules) and `infrastructure`. Modules do not reach into each other's repositories; they call application services or publish events.
**Consequences.** One deployable unit. Boundaries are enforced by package conventions and an ArchUnit test. A module can be extracted later if a real need appears.

## ADR-004 Multi-tenancy: shared schema, tenant discriminator enforced centrally
**Context.** In NestJS, tenant filtering was written by hand in every query and was missed in at least 8 places (audit C1/C2/H6).
**Decision.** Every tenant-owned table gets `tenant_id BINARY(16) NOT NULL`, indexed and leading composite indexes. Hibernate 6 `@TenantId` with a `CurrentTenantIdentifierResolver` reads the tenant **only** from the authenticated principal. Background jobs set tenant context explicitly per job. Tenant isolation is covered by integration tests.
**Consequences.** Forgetting a filter becomes structurally hard. Cross-tenant platform operations (super-admin) need an explicit, audited bypass.

## ADR-005 Authentication: short-lived access JWT in memory, rotating refresh token in an HttpOnly cookie
**Context.** The refresh token is currently in `localStorage` (audit H2).
**Decision.** The access token (JWT, 10 min) lives in memory only. The refresh token is opaque and random, stored **hashed** in MySQL, and sent as an `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie. It rotates on every use, and reuse detection revokes the whole token family. Passwords use BCrypt (cost 12). Accounts lock after repeated failures. CSRF exposure is limited to the cookie-bearing auth endpoints, which require `SameSite=Strict` and a custom header.
**Consequences.** XSS can no longer exfiltrate a long-lived credential. A page reload performs a silent refresh.

## ADR-006 Object storage behind a port; server-generated keys
**Decision.** The `StoragePort` interface has an S3-compatible adapter (AWS SDK v2; MinIO in dev, S3 in prod). Keys follow `t/{tenantId}/d/{documentId}/{uuid}`. *Amended 2026-11-18:* the version number was dropped from the key because it is assigned under a row lock only after the bytes are stored; the `document_version` row links key and version. Client filenames are never used in keys. Downloads use a presigned GET (≤ 5 min), issued only after authorisation. Each version stores a SHA-256 checksum.
**Consequences.** There is no path traversal and no guessable URLs. Orphaned objects from failed transactions are removed by a reconciliation job.

## ADR-007 Async processing: transactional outbox + DB-backed job table (no broker yet)
**Context.** Rule 17: do not over-engineer. Current volumes do not justify RabbitMQ.
**Decision.** Domain events are written to `outbox_event` in the same transaction. A scheduled dispatcher claims rows with `SELECT … FOR UPDATE SKIP LOCKED` (MySQL 8) and runs processing jobs (scan → extract text → index), with attempts, backoff and a dead-letter state. Jobs are idempotent and keyed by `(document_version_id, step)`.
**Consequences.** Delivery is reliable with no extra infrastructure. A `JobRunner` port allows RabbitMQ to be swapped in later.

## ADR-008 Search: MySQL FULLTEXT first, OpenSearch later behind a port
**Decision.** Extracted text goes into `document_text` (FULLTEXT index, ngram parser for partial matches), combined with metadata filters. All queries join through the access-control predicate, so snippets cannot leak. `SearchPort` keeps OpenSearch as a future adapter.

## ADR-009 Workflow definitions are versioned and immutable
**Decision.** `workflow_definition` (logical) has many `workflow_definition_version` rows (immutable steps and transitions). Instances pin the version they started on. Transitions are validated server-side and every transition writes history and audit rows.

## ADR-010 One-shot data migration Postgres → MySQL
**Decision.** A `migration` Spring profile reads the legacy Postgres database over JDBC (read-only) and writes MySQL through the new domain services. It preserves UUIDs, maps BusinessUnit → Tenant, is idempotent and re-runnable, and produces a reconciliation report (row counts and checksums per table). Object storage is reused: existing keys are referenced as they are.
**Consequences.** The legacy database is never modified (Rule 7).

## ADR-011 Audit: append-only, hash-chained
**Decision.** `audit_event` is insert-only. The application DB user has no UPDATE/DELETE grant on it in production. Each row stores `prev_hash` and `hash = SHA-256(prev_hash || canonical(row))` per tenant, so tampering is detectable. Audit is kept separate from application logs.
*Amendment (2026-11-18):* `details` is stored as `TEXT` containing canonical JSON. A MySQL `JSON` column normalises formatting and key order, which changes the bytes and breaks hash re-verification. This was caught by `AuthFlowIT`.

## ADR-012 Frontend: keep Vite/React, restructure by feature, design system per reference
**Decision.** Keep React 18 + Vite + TanStack Query + Tailwind. Add React Hook Form + Zod and minimal Zustand (UI shell state). Move to `src/features/*`, route-level `lazy()`, and a single typed API client. Visual language follows the owner's reference screenshots (`Images/`: PinPoint/ManageEDocs): navy brand, top action bar (Upload · doc-name search · alerts · user), accordion navigation with quick-action tiles, grouped launcher panels, and the cabinet → folder → sub-divider tree with Personal/Private/Default scopes. It is modernised with tokens, accessibility, responsive layout, and loading/empty/error states.

## ADR-013 Interim NestJS hardening (2026-11-18)
**Decision.** Add a shared access helper (`apps/api/src/cabinets/cabinet-access.ts`) used for every document read and write. Bind inventory, dispatch, users, workflows, e-signature and dashboard lookups to the caller's business unit. Validate uploads by extension allowlist plus magic-byte signature, and sanitise filenames. Cross-tenant and inaccessible lookups return **404** so IDs cannot be enumerated.

## ADR-014 Follow the owner's reference platform conventions
**Context.** The owner pointed to their own Spring Boot project (`BulkSMS` backend) as the preferred design and invited improvements.
**Decision.** Adopt its conventions: the response envelope, capability catalog + RoleDefaults + per-user overrides, PermissionGuard, a per-request DB-loaded principal with token-version revocation, `@PreAuthorize` on every endpoint plus service-level scoping, the module layout `controller/dto/model/repository/service`, vendor-partitioned Flyway, a separate management port, and the enum/CHECK drift test. Keep four improvements, stated to the owner: Hibernate `@TenantId` (the reference relies on service code for tenant scoping of join tables), UUIDv7 keys (legacy data is UUID, and keys are not enumerable), records instead of Lombok `@Data` on entities, and Testcontainers instead of H2 (H2 cannot test SKIP LOCKED, as the reference itself notes).
**Consequences.** One mental model across the owner's projects. Capabilities (what features) and ResourceRights (which objects) are distinct concepts with distinct names.

## ADR-015 Object-level access = baseline ∪ grants, capped by capabilities
**Decision.** Rights on an object = baseline from cabinet visibility, role and ownership ∪ grants on the cabinet, every ancestor folder (via the materialised path) and the document, ∩ the ceiling implied by the caller's capabilities. Grants only, no deny entries; a capability DENY is the way to remove an ability. Invisible returns 404, visible but not allowed returns 403, and both are audited as `ACCESS_DENIED` from the exception handler after the request transaction has ended.
