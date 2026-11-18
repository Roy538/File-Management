# ManageEDocs Backend (Spring Boot)

The target backend for ManageEDocs: a Java 21 / Spring Boot 4.0 modular monolith on MySQL 8.4, with Flyway owning the schema and S3/MinIO holding document binaries. It follows the conventions of the owner's reference platform (`BulkSMS` backend) where they fit a DMS. See *Conventions* below.

> Status: **Phase 3 core document management.** The NestJS app in `apps/api` remains the production system until cutover (ADR-001/002).

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
└── storage/       StoragePort + S3StorageAdapter (presigned downloads)
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

All paths are prefixed with `/api/v1`. OpenAPI: `/api/v1/openapi`, Swagger UI: `/api/v1/docs`.

### Document guarantees
- **Content validation:** the extension must be on the allowlist and the leading bytes must match its signature. The client's MIME type and filename are never trusted; filenames are sanitised. Size limit: `DOCUMENT_MAX_BYTES`.
- **Storage:** server-generated keys (`t/{tenant}/d/{document}/{uuid}`) and a SHA-256 per version. Bytes are streamed to storage *outside* the database transaction. If the transaction fails, the object is deleted (compensation).
- **Versions are immutable:** a restore creates a new version that copies the old one. `expectedCurrentVersionNo` and `entityVersion` reject stale writers with 409.
- **Check-out locks** expire (`DOCUMENT_LOCK_DURATION`). Others get 409 while one is held. An admin override needs `DOCUMENTS_LOCK_OVERRIDE` and is audited.
- **Downloads** are presigned links valid for 5 minutes (`STORAGE_DOWNLOAD_TTL`), issued only after the rights check and audited.
- **Duplicates:** byte-identical content already visible to the uploader is reported on upload.
- **Not yet:** malware scanning, text extraction and indexing (Phase 4 pipeline; versions stay `STORED` until then), retention and legal hold on delete (Phase 4), and the orphan-object reconciliation sweep (Phase 4).

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
| `EnumConstraintIT` | every enum value is accepted by its CHECK constraint |
| unit | access rules, file inspection, folder paths, audit hashing, lockout, UUIDv7 |
