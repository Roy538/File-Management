# Build Prompt V2 — File Tracking & Document Management System (Hybrid)

Supersedes the V1 prompt. Paste into an agentic coding tool (Claude Code, Cursor, Windsurf, etc.) in an empty project folder. Written for phase-by-phase use — see the note at the end.

---

## Prompt

You are a senior full-stack engineer building a production-grade **File Tracking & Document Management System**. It has two halves that share one login, one RBAC model, and one audit trail: (1) a physical-file registry (paper files dispatched from and returned to a filing room), and (2) a digital document management system modeled on PinPoint by LSSP Corporation (cabinets/folders hierarchy, OCR upload, PDF markup, e-signature, workflows, retention). Work incrementally, phase by phase, and after each phase run tests and show me the result before continuing.

### Project context

Multiple business units (e.g. MyCredit, Tijaara, Zazipay) and multiple branches per unit. Real reference: PinPoint (lsspdocs.com / manageedocs.com/mycredit) — a live DMS with a Cabinets → Folders → Sub-Dividers → Document Types → Metadata hierarchy, drag-drop OCR upload, check-in/check-out/hold/finalize, PDF annotation/redaction/e-signature, workflows and approvals, retention schedules, and full audit logging (positioned against DOD/HIPAA/ISO/ADA/OSHA/SEC/SOX/FDA/FACTA compliance).

### Build philosophy: build custom, integrate for e-signature only

Build the core system from scratch in one JS/TS codebase so both halves share auth/RBAC/audit. Do **not** fork an existing DMS. The one exception: integrate a self-hosted **Documenso** instance (github.com/documenso/documenso — TypeScript/Prisma/Tailwind, same stack family) via its API for e-signature, instead of building a signing engine. Use Mayan EDMS (cabinets/ACL model), Snipe-IT (checkout/checkin state model), Paperless-ngx and Teedy (OCR/versioning/retention patterns) as design references only — read their docs/ERDs for inspiration, don't copy code.

### Part A — Physical file registry (build first)

1. **File Inventory** — file #, customer, business unit, branch, date created, location (cabinet/shelf/box/row), volume #, status (`Available`/`Dispatched`/`Returned`/`Archived`/`Missing`).
2. **Dispatch** — date, collector, department, purpose, expected return date, authorizer, processor. Auto-status `Dispatched`. Block duplicate dispatch, raise a notification instead.
3. **Return** — date, returned-by, received-by, condition, correct-location flag (+ actual location/remarks if "no"). Auto-status `Available`.
4. **Location tracking** — always-current location, either shelf coordinates or holder/department/date.
5. **Movement history** — permanent, non-deletable audit trail per file.
6. **Search** — by file #, customer, current holder, dispatch date.
7. **Dashboard** — totals, in-registry, dispatched, overdue, missing, returned/dispatched today.
8. **Notifications** — overdue, not-returned-in-time, wrong-location return, duplicate request.
9. **Reports** — daily dispatch, daily returns, outstanding files, files by department, movement history, missing files, monthly stats. Excel + PDF export.
10. **Roles** — Registry Administrator (full), Registry Officer (dispatch/receive/search/reports), Department User (search/request/view own).
11. **Audit trail** — every action logged; nothing hard-deleted (soft-delete/`isActive` flag).

### Part B — Digital document management (build after Part A works)

12. **Cabinets/Folders/Sub-Dividers/Document Types** — CRUD for the full hierarchy; `DocumentACL` so permissions can be set at any level (cabinet, folder, or document).
13. **Upload & OCR** — drag-drop upload to S3/MinIO; each upload creates a `Document` + `DocumentVersion` row (versions are never overwritten); a BullMQ job sends the file to a Tesseract-based OCR worker and writes the extracted text back for full-text search.
14. **Document lifecycle** — check-in, check-out, hold, finalize, archive — modeled as a state machine, every transition audit-logged.
15. **PDF tools** — in-browser viewing/markup/annotation/redaction using `react-pdf` + `pdf-lib`.
16. **E-signature** — self-hosted Documenso instance; an `ESignatureRequest` table tracks status against Documenso's document id; webhook back on completion.
17. **Workflows** — a lightweight `WorkflowInstance` state machine per Document Type for approval chains.
18. **Retention** — `RetentionPolicy` attached to a Cabinet or Document Type; a scheduled job archives/flags/notifies on expiry.
19. **Full-text search** — Postgres `tsvector` on OCR'd text at MVP (upgrade path: Meilisearch/Elasticsearch).

### Technology stack — use exactly this

- **Frontend:** React 18 + TypeScript, Vite, TailwindCSS, TanStack Query + Table, `react-pdf` + `pdf-lib` for PDF viewing/annotation, a Cabinet/Folder tree-view component.
- **Backend:** Node.js + NestJS (TypeScript), one module per functional area (see project structure).
- **Database:** PostgreSQL 16 via Prisma, with `tsvector` columns for OCR text search.
- **Object storage:** AWS S3 or MinIO for every document version.
- **OCR:** Tesseract-based worker (can be a small Python microservice) triggered by a BullMQ job, following the Paperless-ngx/Teedy pattern — communicates only via the job queue, no shared DB schema.
- **E-signature:** self-hosted Documenso, called via its REST API.
- **Auth:** JWT (access + refresh), bcrypt, RBAC guards for the 3 roles + per-cabinet/folder ACLs. Pluggable strategy so AD/SSO/Google can be added later.
- **Background jobs:** Redis + BullMQ (overdue checks, OCR jobs, retention-expiry checks).
- **Reports/export:** ExcelJS (Excel), Puppeteer or pdf-lib (PDF).
- **Containerization:** Docker + Docker Compose — services: `api`, `web`, `postgres`, `redis`, `ocr-worker`, `minio` (or S3 creds), `documenso`.
- **Testing:** Jest + Supertest (API), React Testing Library + Playwright (frontend/e2e).
- **CI:** GitHub Actions — lint, test, build on every push.

### Data model — implement in `prisma/schema.prisma`

Part A (unchanged from the physical registry): `BusinessUnit`, `Branch`, `User`, `File`, `Dispatch`, `Return`, `FileMovement`, `Notification`, `AuditLog`.

Part B (new): `Cabinet` (id, businessUnitId, name, retentionPolicyId), `Folder` (id, cabinetId, name, parentFolderId), `SubDivider` (id, folderId, name), `DocumentType` (id, name, metadataSchema JSONB), `Document` (id, subDividerId, documentTypeId, name, status, currentVersionId, ocrText), `DocumentVersion` (id, documentId, storageKey, checksum, uploadedBy, createdAt), `DocumentACL` (id, documentId/folderId/cabinetId, roleOrUserId, permission), `WorkflowInstance` (id, documentId, workflowDefId, currentState, history JSONB), `ESignatureRequest` (id, documentId, externalProviderId, status, signers JSONB), `RetentionPolicy` (id, name, retentionYears, action).

### Project structure — scaffold exactly this

```
file-tracking-dms/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── auth/  users/  inventory/  dispatch/  returns/  tracking/   # Part A
│   │   │   ├── notifications/  reports/  audit/  common/                   # Part A
│   │   │   ├── cabinets/       # Cabinet/Folder/SubDivider/DocumentType + ACLs
│   │   │   ├── documents/      # upload, versions, check-in/out, hold, finalize
│   │   │   ├── ocr/            # BullMQ jobs -> OCR worker -> writes ocrText
│   │   │   ├── workflows/      # WorkflowInstance engine
│   │   │   ├── esignature/     # Documenso API client + ESignatureRequest
│   │   │   ├── retention/      # RetentionPolicy scheduler
│   │   │   └── main.ts
│   │   ├── prisma/schema.prisma
│   │   ├── test/
│   │   └── Dockerfile
│   └── web/
│       ├── src/
│       │   ├── pages/          # Login, Dashboard, Inventory, Dispatch, Return,
│       │   │                   # Cabinets, DocumentViewer, Workflows, Reports
│       │   ├── components/     # DataTable, StatusBadge, CabinetTree, PdfViewer
│       │   ├── features/
│       │   ├── lib/
│       │   └── main.tsx
│       ├── e2e/
│       └── Dockerfile
├── services/
│   └── ocr-worker/             # Python + Tesseract microservice, own Dockerfile
├── packages/shared-types/
├── infra/
│   ├── docker-compose.yml      # api, web, postgres, redis, ocr-worker, minio, documenso
│   └── docker-compose.prod.yml
├── docs/
├── .github/workflows/ci.yml
├── .env.example
└── README.md
```

### Build in this order — do not skip ahead

1–7 as in the V1 physical-registry plan: scaffolding → auth/org structure (with Business Unit → Branch login flow) → file inventory → dispatch & return → tracking/history/audit → search & dashboard → notifications & reports. **Ship this as a usable milestone before starting Part B.**
8. **Cabinets & digital filing** — hierarchy CRUD, tree-view UI, DocumentACL.
9. **Upload, versioning & OCR** — S3/MinIO upload, DocumentVersion, OCR worker wired through BullMQ, check-in/out/hold/finalize state machine.
10. **PDF tools & e-signature** — react-pdf/pdf-lib markup+redaction; stand up Documenso; build the ESignatureRequest bridge and completion webhook.
11. **Workflows & retention** — WorkflowInstance approval chains; RetentionPolicy scheduler tied into notifications.
12. **QA, UAT & security** — regression across both halves; RBAC/ACL boundary tests at every hierarchy level; encryption-at-rest and signed-URL-expiry checks.
13. **Deployment, training, go-live** — provision object storage/OCR worker/Documenso alongside the core app; train registry staff and document owners separately; roll out branch by branch.

### Constraints to enforce throughout

- Never hard-delete; use `isActive`/`deletedAt` everywhere, including documents and versions.
- Every status-changing action (dispatch/return/check-in/check-out/finalize) is one DB transaction that updates current state and inserts a history row together.
- Every mutating endpoint goes through the RBAC/ACL guard and audit interceptor.
- OCR output is a search aid, never the system of record — always keep the original file.
- E-signature goes through Documenso; do not implement custom cryptographic signing.
- Keep the OCR worker and Documenso as separate containerized services with no shared database schema — communicate only via API/queue.

### After each phase

Run the relevant tests, summarize what was built and any decisions made, and wait for my go-ahead before the next phase.

---

## How to use this

- **Recommended:** ship Part A (physical registry) fully, phase by phase, as a working milestone — it's a complete, usable system on its own. Then start Part B (Cabinets → Upload/OCR → PDF/E-sign → Workflows/Retention) as a second wave, also phase by phase.
- **Before committing to the full build,** spend 1–2 days spinning up Mayan EDMS's own Docker Compose file just to see its cabinet/ACL model first-hand — it's the closest existing analog to what Part B needs, and seeing it running will sharpen the `Cabinet`/`Folder`/`DocumentACL` schema before you write it.
- When Part B reaches document upload, stand up self-hosted Documenso in parallel (`docker compose` from documenso/documenso) so e-signature integration isn't a late surprise.
