# ManageEDocs Backend (Spring Boot)

The target backend for ManageEDocs: a Java 21 / Spring Boot 4.0 modular monolith on MySQL 8.4, with Flyway owning the schema and S3/MinIO holding document binaries. It follows the conventions of the owner's reference platform (`BulkSMS` backend) where they fit a DMS. See *Conventions* below.

> Status: **Phase 4 governance and automation.** The NestJS app in `apps/api` remains the production system until cutover (ADR-001/002).

## Layout

```
com.manageedocs
├── config/        SecurityConfig, JwtConfig, SecurityProperties, TimeConfig
├── exception/     ApiException, FieldValidationException, GlobalExceptionHandler, SecurityEventRecorder
├── security/      Permission (capability catalog), RoleDefaults, AppUserDetails, CurrentUser,
│                  PermissionGuard, AppUserDetailsLoader, CallerAuthentication, JsonAuthenticationEntryPoint
├── common/        dto/StandardAPIResponse + PagedResponse, persistence/BaseEntity + Ids (UUIDv7), web/
├── tenancy/       TenantContext + Hibernate @TenantId resolver; model, repository, service (provisioning)
├── identity/      controller (auth, users), dto, model (User, RefreshToken, UserPermission), repository, service
├── audit/         append-only hash-chained audit trail
├── permissions/   ResourceRight bitmask, AclEntry, AccessPolicy (object-level decisions)
├── taxonomy/      cabinets → folders (materialised path) → sub-dividers; document types + metadata schemas
├── documents/     documents, immutable versions, metadata values, check-out locks, upload/download
├── sharing/       access grants on cabinets/folders/documents
├── storage/       StoragePort + S3StorageAdapter (presigned downloads), OrphanObjectSweeper
├── processing/    job queue (outbox), SKIP LOCKED worker, ClamAV scanner port, Tika text extraction
├── search/        FULLTEXT search with in-query permission filtering, facets, snippets
├── retention/     retention policies, legal holds, disposition runs (approval-gated destruction)
├── workflows/     versioned approval workflows, tasks, delegation, escalation, history
└── notifications/ in-app inbox
```

Each feature module uses `controller/ dto/ model/ repository/ service/`. ArchUnit enforces that controllers never touch repositories, that entities never leak into API contracts, and that repositories live in `repository` packages.

## Conventions (aligned with the reference platform)

| Convention | Here |
|---|---|
| Response envelope | Every endpoint, including 401/403/404, returns `StandardAPIResponse {data, errors, message, successful, timestamp, code, correlationId}`. Lists return `PagedResponse {content, page, size, totalElements, totalPages}`. |
| Two-layer authorisation | Layer 1: `@PreAuthorize("hasAuthority('DOCUMENTS_UPLOAD')")` on every endpoint (capabilities = `RoleDefaults` + per-user GRANT/DENY). Layer 2: `AccessPolicy` decides rights on the specific cabinet/folder/document (visibility + ACL grants, capped by capabilities). |
| Not found, never forbidden, for things you cannot see | Invisible objects return 404. Visible but not permitted returns 403. Both are recorded as `ACCESS_DENIED` audit events. |
| Caller | `CurrentUser.get()` returns `AppUserDetails`, rebuilt from the DB on every request (user and organisation active, `token_version` current). Services take the caller object, never raw ids. |
| Delegation | `PermissionGuard`: nobody grants what they do not hold, and platform capabilities are never grantable. Sharing a document is capped the same way. |
| Migrations | `db/migration/{vendor}` (`mysql` today). `ddl-auto: validate`. `EnumConstraintIT` proves every Java enum value is accepted by its CHECK constraint. |
| Ops | Actuator on a separate management port (8079). Profiles: `dev`, `prod`, `test`. An optional `.env` is imported except under `test`. |

Deliberate differences from the reference: tenant filtering is automatic via Hibernate `@TenantId` rather than per-service code; keys are UUIDv7 (the legacy data is UUID, and keys are not enumerable); DTOs are Java records instead of Lombok; tests use Testcontainers MySQL + MinIO instead of H2.

## Access model

| Cabinet visibility | Baseline rights |
|---|---|
| `DEFAULT` | ADMIN: everything. OFFICER: view, download, upload, edit, manage structure. DEPT_USER: view, download. |
| `PRIVATE` | Owner: everything. Others: only through grants. |
| `PERSONAL` | Owner (and organisation admins, for records oversight). |

Grants (`/api/v1/access/...`) add rights on a cabinet, a folder (inherited by every subfolder and document beneath it via the materialised path) or a single document. Effective rights are always capped by the caller's capabilities, so denying `DOCUMENTS_DOWNLOAD` removes download everywhere.

## API (v1)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` (cookie + `X-Requested-With`), `GET /auth/me` (profile + capability codes) |
| Users | `GET/POST /users`, `PUT /users/{id}` (role/active; existing sessions end at once), `PUT /users/{id}/permissions`, `GET /users/permission-catalog` |
| Cabinets | `GET /cabinets?scope=DEFAULT\|PRIVATE\|PERSONAL`, `POST /cabinets`, `GET /cabinets/{id}` (tree with per-node rights), `PUT`/`DELETE /cabinets/{id}`, `POST /cabinets/{id}/folders` |
| Folders | `PATCH /folders/{id}`, `POST /folders/{id}/move` (cross-cabinet, cycle-safe), `DELETE /folders/{id}` (empty only), `POST /folders/{id}/sub-dividers`, `PATCH`/`DELETE /sub-dividers/{id}` |
| Document types | `GET/POST /document-types` (with metadata field schema), `DELETE /document-types/{id}` |
| Documents | `GET /documents?folderId=&subDividerId=&q=&page=&size=`, `POST /documents` (multipart), `GET`/`PUT`/`DELETE /documents/{id}`, `POST /documents/{id}/versions`, `POST /documents/{id}/versions/{n}/restore`, `GET /documents/{id}/content-url?version=&inline=`, `POST /documents/{id}/checkout`, `POST /documents/{id}/release` |
| Access | `GET/POST /access/{cabinets\|folders\|documents}/{id}`, `DELETE /access/grants/{grantId}` |
| Search | `GET /search?q=&cabinetId=&folderId=&documentTypeId=&status=&ownerId=&updatedFrom=&updatedTo=&page=&size=` (results + facets + highlighted snippets) |
| Processing | `GET /documents/{id}/processing`, `POST /documents/{id}/reprocess`, `POST /processing/reindex`, `GET /processing/stats` |
| Retention | `GET/POST /retention/policies`, `DELETE /retention/policies/{id}`, `PUT /retention/cabinets/{id}/policy`, `PUT /retention/document-types/{id}/policy`, `GET /retention/due?withinDays=`, `POST /retention/evaluate`, `GET /retention/runs`, `GET /retention/runs/{id}`, `POST /retention/runs/{id}/approve`, `POST /retention/runs/{id}/cancel` |
| Legal holds | `GET/POST /legal-holds`, `GET /legal-holds/{id}`, `POST /legal-holds/{id}/documents` (ids or folder subtree), `DELETE /legal-holds/{id}/documents/{docId}`, `POST /legal-holds/{id}/release` |
| Workflows | `GET/POST /workflows`, `GET/PUT/DELETE /workflows/{id}` (PUT = new version), `POST/GET /documents/{id}/reviews`, `GET /reviews/{id}`, `POST /reviews/{id}/resubmit`, `POST /reviews/{id}/cancel`, `GET /tasks`, `POST /tasks/{id}/decision`, `POST /tasks/{id}/delegate`, `POST /documents/{id}/publish` |
| Notifications | `GET /notifications?unreadOnly=`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all` |

All paths are prefixed with `/api/v1`. OpenAPI: `/api/v1/openapi`, Swagger UI: `/api/v1/docs`.

### Document guarantees
- **Content validation:** the extension must be on the allowlist and the leading bytes must match its signature. The client's MIME type and filename are never trusted; filenames are sanitised. Size limit: `DOCUMENT_MAX_BYTES`.
- **Storage:** server-generated keys (`t/{tenant}/d/{document}/{uuid}`) and a SHA-256 per version. Bytes are streamed to storage *outside* the database transaction. If the transaction fails, the object is deleted (compensation).
- **Versions are immutable:** a restore creates a new version that copies the old one. `expectedCurrentVersionNo` and `entityVersion` reject stale writers with 409.
- **Check-out locks** expire (`DOCUMENT_LOCK_DURATION`). Others get 409 while one is held. An admin override needs `DOCUMENTS_LOCK_OVERRIDE` and is audited.
- **Downloads** are presigned links valid for 5 minutes (`STORAGE_DOWNLOAD_TTL`), issued only after the rights check and audited.
- **Duplicates:** byte-identical content already visible to the uploader is reported on upload.
- **Processing:** every new version is queued in the same transaction (outbox). A worker claims it with `FOR UPDATE SKIP LOCKED` (safe across replicas), scans it (ClamAV via `CLAMAV_HOST`; otherwise recorded as `SKIPPED`, never as clean) and extracts its text (Tika). The version then becomes `AVAILABLE`, `QUARANTINED` or, after retries, `FAILED`. Only `AVAILABLE` versions can be downloaded.
- **Retention:** ARCHIVE runs automatically and makes the document read-only. DESTROY is only *proposed*: a records manager approves the run, every item is re-checked against holds and policy at execution, and binaries are purged while the row and each version's SHA-256 stay as evidence.
- **Legal holds** block deletion and destruction (not archival) until released with a reason.
- **Reviews:** content is frozen while under review. Submitters can never decide their own review. Requesting changes needs a new version before resubmitting. Overdue tasks escalate once to assignees and administrators.

## Run locally

```bash
docker run -d --name med-mysql -p 3306:3306 -e MYSQL_DATABASE=manageedocs \
  -e MYSQL_USER=manageedocs -e MYSQL_PASSWORD=devpass -e MYSQL_RANDOM_ROOT_PASSWORD=yes mysql:8.4
docker run -d --name med-minio -p 9000:9000 -p 9001:9001 minio/minio:RELEASE.2025-09-07T16-13-09Z server /data --console-address :9001

cd backend
DB_PASSWORD=devpass SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run
```

The `dev` profile seeds organisation **MC** with admin `admin@manageedocs.local` / `ChangeMe-Dev-2026!`. Override these with `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD`. The storage bucket is created on startup if missing.

## Configuration (environment)

| Variable | Default | Notes |
|---|---|---|
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | local MySQL | UTC connection time zone |
| `JWT_SECRET` | dev-only value | **Required** in `prod` (≥ 32 bytes) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `PT10M` / `P7D` | |
| `REFRESH_COOKIE_SECURE` | `true` | `false` only for plain-HTTP local dev |
| `CORS_ORIGINS` | `http://localhost:5173` | comma-separated |
| `STORAGE_ENDPOINT` / `STORAGE_PUBLIC_ENDPOINT` | `http://localhost:9000` / same | the public endpoint is what browsers use for presigned links |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | `minioadmin` locally | **Required** in `prod` |
| `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_PATH_STYLE` | `manageedocs`, `us-east-1`, `true` | |
| `STORAGE_DOWNLOAD_TTL` | `PT5M` | |
| `DOCUMENT_MAX_BYTES`, `UPLOAD_MAX_FILE_SIZE` | 100 MB | keep both in step |
| `CLAMAV_HOST` / `CLAMAV_PORT` | *(blank)* / `3310` | blank disables scanning (versions marked `SKIPPED`) |
| `PROCESSING_POLLER_ENABLED`, `PROCESSING_BATCH_SIZE`, `PROCESSING_MAX_ATTEMPTS`, `PROCESSING_RETRY_BASE`, `PROCESSING_CLAIM_TIMEOUT` | `true`, `10`, `5`, `PT30S`, `PT10M` | |
| `STORAGE_ORPHAN_AGE` | `PT1H` | objects with no version row older than this are swept daily |
| `DOCUMENT_LOCK_DURATION` | `PT8H` | |
| `MANAGEMENT_PORT` | `8079` | never expose publicly |

## Tests

```bash
mvn test      # unit tests + ArchUnit rules (no Docker)
mvn verify    # + integration tests on real MySQL 8.4 and MinIO via Testcontainers (Docker required)
```

| Suite | Covers |
|---|---|
| `AuthFlowIT` | login, generic failures, lockout, same email in two organisations, refresh rotation and reuse detection, anti-CSRF header, logout, audit chain |
| `DocumentFlowIT` | directive scenarios A, B, C, D, F: exact-bytes round trip through MinIO, spoofed files rejected, duplicates, department users read-only, private cabinets invisible until shared, denials audited, versions and restore, check-out conflicts and admin override, stale-write rejection, metadata schema validation, cross-cabinet folder moves, guarded deletes, revocation on deactivation and on capability deny |
| `ProcessingAndSearchIT` | scan, extract and index, then find by body text with snippet offsets. Also covers: no download before scan, quarantine, scanner outage retried then dead-lettered then reprocessed (scenario H), search never leaking across permissions or organisations, concurrent workers claiming each job exactly once, orphan sweep |
| `RetentionAndLegalHoldIT` | scenario G: auto-archive (type policy beats cabinet policy), destruction only after approval, holds placed before and after the proposal, binaries really purged, hold blocks manual delete until released, cancelled runs, folder-subtree holds |
| `WorkflowIT` | scenario E: submit, frozen content, request changes, resubmit after a new version, escalation, ALL-mode step with delegation, approve, publish. Also: segregation of duties, definition versioning, reject, cross-organisation isolation, private inboxes |
| `EnumConstraintIT` | every enum value (17 enums) is accepted by its CHECK constraint |
| unit | access rules, file inspection, folder paths, audit hashing, lockout, UUIDv7 |
