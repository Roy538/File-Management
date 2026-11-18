# Implementation Log

Each entry records what changed, why, how it was verified, and what remains. Newest entries are first.

## Branch map

| Branch | Purpose | Base |
|---|---|---|
| `security/tenant-isolation-hardening` | Interim NestJS fixes for critical audit findings (ADR-013) | `Login` |
| `docs/phase0-audit-architecture` | Phase 0 audit, target architecture, ADRs, this log, design references | `Login` |
| `feature/springboot-backend-foundation` | New Spring Boot + MySQL backend (`backend/`), Phase 2 foundation | `Login` |

## 2026-11-18: Phase 0 discovery and baseline ✅
- Audit: [initial-audit.md](initial-audit.md). Key result: the backend is NestJS/Postgres, not the mandated Spring Boot/MySQL. There are two critical cross-tenant data exposures.
- Baseline: API Jest 65/83 (18 stale), Vitest misconfigured, both `tsc` clean, web build passes (one 1.44 MB chunk). The Node shim is broken by `.nvmrc`=20.
- Owner decisions: **patch, then migrate** (ADR-001/002). Keep physical-file tracking and port it as `records`. The UI follows the reference screens in `Images/`.

## 2026-11-18: Interim security hardening (NestJS) ✅
- Branch `security/tenant-isolation-hardening`. See ADR-013 for scope.
- Verified: API Jest **98/98** (15 new regression tests for access rules and upload validation). API and web `tsc` clean. Vitest exits 0 (no unit tests yet).
- Not yet verified at runtime: the Docker daemon was down, so the live API was not exercised against Postgres. **Next:** run the e2e smoke against the live stack, specifically cross-BU `GET /documents/:id`, which should now return 404.
- Known remaining (deferred to the Spring Boot rewrite): workflow *definitions* are global, not per tenant (no `businessUnitId` column); `SUPER_ADMIN` is treated as a normal user by the visibility rules (restrictive, safe); the refresh token is still in `localStorage` (fixed by ADR-005 in the new backend).

## 2026-11-18: Phase 1 target architecture ✅
- [system-overview.md](../architecture/system-overview.md) with context, container, module, ingestion, retrieval, auth, workflow and ER diagrams.
- [architecture-decisions.md](../architecture/architecture-decisions.md), ADR-001 to ADR-013.

## 2026-11-18: Phase 2 Spring Boot foundation ✅ (first slice)
- Branch `feature/springboot-backend-foundation`, `backend/`: Spring Boot 4.0.9, Java 21, MySQL 8.4, Flyway 11.
- Delivered: tenancy (`@TenantId` discriminator, fail-closed), identity (login, lockout, rotating HttpOnly refresh cookie with reuse detection, `/me`), hash-chained audit, RFC 9457 errors with correlation IDs, stateless security, CORS, security headers, OpenAPI.
- **Verified:** `mvn verify` reports BUILD SUCCESS: 12 unit tests (including ArchUnit layering rules) and 8 Testcontainers MySQL 8.4 integration tests. Flyway V1 applies cleanly, and Hibernate `validate` passes against the real schema.
- Finding fixed during verification: MySQL `JSON` columns re-serialise content, which broke audit hash verification. `audit_event.details` is now `TEXT` holding canonical JSON (ADR-011 amended). V1 had never been applied outside ephemeral test containers.
- Next: Phase 3 slice. Taxonomy (cabinets/folders/sub-dividers/doc types), `AccessPolicy`, storage port (MinIO), document upload/versions/download, plus the React `features/auth` move to the new cookie-based session.

## Phase plan (remaining)
| Phase | Scope | Status |
|---|---|---|
| 2 | Backend foundation: security, tenancy, identity, audit, error model, OpenAPI, Testcontainers | 🚧 |
| 3 | Taxonomy (cabinets/folders/sub-dividers/doc types/metadata), documents + versions, storage, check-in/out, permissions | ⏳ |
| 4 | Processing pipeline (outbox/jobs), search (FULLTEXT), workflows (versioned), retention + legal hold, sharing, notifications | ⏳ |
| 5 | Records tracking port (inventory/dispatch/returns/requests), reports, dashboard metrics, e-signature, conversion tools | ⏳ |
| 6 | Frontend rebuild per `Images/` references: design tokens, shell, launcher, explorer, upload, viewer, admin | ⏳ |
| 7 | Data migration Postgres → MySQL (ADR-010), hardening, e2e scenarios A–I, performance, backups | ⏳ |
| 8 | Cutover and handover | ⏳ |
