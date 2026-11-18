# ManageEDocs: Target System Architecture

Status: **target**. The NestJS app in `apps/api` is the current production system. The Spring Boot backend in `backend/` is being built towards this design. Decisions are recorded in [architecture-decisions.md](architecture-decisions.md).

## 1. System context

```mermaid
flowchart LR
  user[Staff users<br/>admins · records managers · reviewers] -->|HTTPS| web[ManageEDocs Web SPA]
  ext[External collaborator] -->|expiring share link| web
  web -->|REST /api/v1| api[ManageEDocs API<br/>Spring Boot]
  api --> db[(MySQL 8.4)]
  api --> obj[(S3 / MinIO<br/>document binaries)]
  api -.optional.-> av[ClamAV]
  api -.optional.-> ocr[Tika / Tesseract]
  api -.optional.-> ai[AI provider<br/>opt-in per tenant]
  api --> mail[SMTP]
  esign[E-signature provider] -->|signed webhook| api
```

## 2. Containers and deployment

```mermaid
flowchart TB
  subgraph edge[Edge]
    nginx[Nginx<br/>TLS · security headers · static SPA · rate limit]
  end
  subgraph app[Application]
    api[Spring Boot API<br/>stateless · N replicas]
    worker[Same image, profile=worker<br/>outbox dispatcher · jobs · schedulers]
  end
  subgraph data[Data]
    mysql[(MySQL 8.4<br/>InnoDB · utf8mb4 · UTC)]
    minio[(MinIO / S3<br/>SSE · versioning)]
  end
  nginx -->|/| spa[Static React build]
  nginx -->|/api/v1| api
  api --> mysql
  api --> minio
  worker --> mysql
  worker --> minio
  prom[Prometheus] -->|/actuator/prometheus| api
```

The API and worker run from one artifact with two profiles, so scaling does not need a broker (ADR-007).

## 3. Backend modules

```mermaid
flowchart LR
  identity --> tenancy
  documents --> storage
  documents --> taxonomy[taxonomy<br/>cabinets · folders · sub-dividers · doc types · metadata]
  documents --> permissions
  search --> permissions
  workflows --> documents
  retention --> documents
  sharing --> permissions
  processing --> documents
  processing --> storage
  records[records-tracking<br/>physical files · dispatch · returns · requests] --> tenancy
  documents -.events.-> audit
  workflows -.events.-> audit
  identity -.events.-> audit
  documents -.events.-> notifications
  workflows -.events.-> notifications
```

| Module | Responsibility |
|---|---|
| `identity` | Login, refresh rotation, lockout, password reset, MFA (later), current principal |
| `tenancy` | Tenants (formerly BusinessUnit), branches/departments, tenant settings, tenant context |
| `users` | User lifecycle, roles, groups |
| `permissions` | RBAC + resource ACLs (cabinet/folder/document), central `AccessPolicy` |
| `taxonomy` | Cabinets (Personal/Private/Default), folders, sub-dividers, document types, metadata schemas, tags |
| `documents` | Logical document, immutable versions, check-in/out locks, lifecycle state machine |
| `storage` | `StoragePort` + S3 adapter, presigned URLs, reconciliation |
| `processing` | Outbox, job runner, scan/extract/index pipeline, retries, dead letters |
| `search` | FULLTEXT + metadata search, facets, saved searches, permission-filtered |
| `workflows` | Versioned definitions, instances, tasks, transitions, delegation, deadlines |
| `retention` | Policies, legal holds, disposition runs with dry-run and approval |
| `sharing` | Internal shares, expiring external links |
| `audit` | Append-only hash-chained events, query and export |
| `notifications` | In-app and email notifications |
| `reporting` | Dashboard metrics and reports (xlsx/pdf), all tenant- and permission-scoped |
| `records` | Ported Part A: physical file inventory, dispatch/return, movements, requests |

## 4. Document ingestion

```mermaid
sequenceDiagram
  autonumber
  participant UI as React
  participant API as DocumentsController
  participant SVC as DocumentService
  participant AP as AccessPolicy
  participant S3 as StoragePort
  participant DB as MySQL
  participant W as Worker
  UI->>API: POST /api/v1/documents (multipart, folderId)
  API->>AP: canUpload(principal, folder)
  AP-->>API: allowed / 404
  API->>SVC: ingest(stream, safeName)
  SVC->>SVC: sniff type vs allowlist, SHA-256, size limit
  SVC->>S3: put t/{tenant}/d/{doc}/v/1/{uuid}
  SVC->>DB: tx: document + version(status=PENDING_SCAN) + outbox(DocumentVersionUploaded) + audit
  Note over SVC,S3: if tx fails → compensating delete of object<br/>orphan sweeper as backstop
  API-->>UI: 201 {id, processingStatus: PENDING_SCAN}
  W->>DB: claim outbox (SKIP LOCKED)
  W->>W: scan → extract text/OCR → index
  W->>DB: version status AVAILABLE | QUARANTINED | FAILED (retry/backoff/DLQ)
  UI->>API: poll / notification → status AVAILABLE
```

## 5. Retrieval and download

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant AP as AccessPolicy
  participant S3
  UI->>API: GET /api/v1/documents/{id}/versions/{v}/content-url
  API->>AP: canDownload(principal, document)
  alt denied or other tenant
    API-->>UI: 404 (audit: ACCESS_DENIED)
  else allowed
    API->>S3: presign GET (300 s, content-disposition = sanitized name)
    API-->>UI: {url, expiresAt} (audit: DOCUMENT_DOWNLOAD)
  end
```

## 6. Authentication

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant DB
  UI->>API: POST /api/v1/auth/login {email, password}
  API->>DB: verify BCrypt, lockout counter, tenant active
  API-->>UI: 200 {accessToken (10 min), user} + Set-Cookie refresh (HttpOnly, SameSite=Strict)
  Note over UI: access token kept in memory only
  UI->>API: POST /api/v1/auth/refresh (cookie + X-Requested-With)
  API->>DB: hash lookup → rotate (revoke old, issue new in same family)
  alt reused (already rotated) token
    API->>DB: revoke whole family
    API-->>UI: 401
  end
```

## 7. Approval workflow (default definition)

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted: submit
  Submitted --> UnderReview: reviewer claims
  UnderReview --> RevisionRequested: request changes
  RevisionRequested --> Resubmitted: resubmit (new version)
  Resubmitted --> UnderReview
  UnderReview --> Approved: approve (all required approvers)
  UnderReview --> Rejected: reject
  Approved --> Published: publish
  Published --> Archived: archive / retention
  Rejected --> [*]
  Archived --> [*]
```

## 8. Core data model (abridged)

```mermaid
erDiagram
  TENANT ||--o{ USER : has
  TENANT ||--o{ CABINET : owns
  CABINET ||--o{ FOLDER : contains
  FOLDER ||--o{ FOLDER : nests
  FOLDER ||--o{ SUB_DIVIDER : contains
  FOLDER ||--o{ DOCUMENT : holds
  SUB_DIVIDER ||--o{ DOCUMENT : holds
  DOCUMENT_TYPE ||--o{ METADATA_FIELD : defines
  DOCUMENT_TYPE ||--o{ DOCUMENT : classifies
  DOCUMENT ||--|{ DOCUMENT_VERSION : "immutable versions"
  DOCUMENT ||--o{ DOCUMENT_METADATA_VALUE : has
  DOCUMENT_VERSION ||--o| DOCUMENT_TEXT : extracted
  CABINET ||--o{ ACL_ENTRY : secured_by
  FOLDER ||--o{ ACL_ENTRY : secured_by
  DOCUMENT ||--o{ ACL_ENTRY : secured_by
  WORKFLOW_DEFINITION ||--|{ WORKFLOW_DEFINITION_VERSION : versions
  WORKFLOW_DEFINITION_VERSION ||--o{ WORKFLOW_INSTANCE : pins
  WORKFLOW_INSTANCE ||--o{ WORKFLOW_TASK : creates
  WORKFLOW_INSTANCE ||--o{ WORKFLOW_TRANSITION : history
  RETENTION_POLICY ||--o{ CABINET : applies_to
  DOCUMENT ||--o{ LEGAL_HOLD_ITEM : held_by
  TENANT ||--o{ AUDIT_EVENT : records
```

## 9. Security boundaries

- The browser holds only an in-memory access token. It never holds storage credentials or receives internal paths.
- Every controller method runs through Spring Security, and authorisation decisions go through `AccessPolicy`. Tenant comes from the principal (ADR-004).
- Not-found and forbidden responses are indistinguishable for cross-tenant resources.
- Uploads are validated by content, scanned before they become `AVAILABLE`, and stored under server-generated keys.
- Logs never contain tokens, passwords, presigned URLs or document text.
