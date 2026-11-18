/**
 * API contracts, mirroring the backend DTO records (backend/src/main/java/com/manageedocs/<module>/dto).
 * Keep in step with the OpenAPI document at /api/v1/openapi when the backend changes.
 */

export type UUID = string;
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'OFFICER' | 'DEPT_USER';

export interface Paged<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

// ── Identity ──────────────────────────────────────────────────────────
export interface UserProfile {
  id: UUID;
  email: string;
  fullName: string;
  role: Role;
  organisation: { id: UUID; code: string; name: string };
  /** Capability codes, e.g. "documents:upload". UI hints only; the server enforces them. */
  permissions: string[];
}

export interface UserView {
  id: UUID; email: string; firstName: string; lastName: string; role: Role;
  departmentId: UUID | null; active: boolean; lastLoginAt: string | null; locked: boolean;
}

// ── Filing structure ──────────────────────────────────────────────────
export type Visibility = 'DEFAULT' | 'PRIVATE' | 'PERSONAL';
/** Per-object rights the caller holds: view, download, upload, edit, delete, share, manage. */
export type Right = 'view' | 'download' | 'upload' | 'edit' | 'delete' | 'share' | 'manage';

export interface CabinetView {
  id: UUID; name: string; description: string | null; visibility: Visibility; ownerId: UUID | null; rights: Right[];
  retentionPolicyId: UUID | null;
}
export interface SubDividerView { id: UUID; folderId: UUID; name: string }
export interface FolderNode {
  id: UUID; parentId: UUID | null; name: string; depth: number; subDividers: SubDividerView[]; rights: Right[];
}
export interface CabinetTree { cabinet: CabinetView; folders: FolderNode[] }
export interface FolderView { id: UUID; cabinetId: UUID; parentId: UUID | null; name: string; depth: number; rights: Right[] }

export type DataType = 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'ENUM';
export interface MetadataFieldView {
  id: UUID; key: string; label: string; dataType: DataType; required: boolean; allowedValues: string[];
}
export interface DocumentTypeView {
  id: UUID; name: string; description: string | null; fields: MetadataFieldView[]; retentionPolicyId: UUID | null;
}

// ── Documents ─────────────────────────────────────────────────────────
export type DocumentStatus = 'DRAFT' | 'ACTIVE' | 'UNDER_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
export type ProcessingStatus = 'STORED' | 'PROCESSING' | 'AVAILABLE' | 'FAILED' | 'QUARANTINED';

export interface DocumentSummary {
  id: UUID; title: string; status: DocumentStatus; folderId: UUID; subDividerId: UUID | null;
  documentTypeId: UUID | null; currentVersionNo: number; fileName: string | null; contentType: string | null;
  sizeBytes: number; updatedAt: string; lockedBy: UUID | null; rights: Right[];
}

export interface VersionView {
  versionNo: number; fileName: string; contentType: string; sizeBytes: number; sha256: string;
  processingStatus: ProcessingStatus; comment: string | null; restoredFromNo: number | null;
  createdBy: UUID; createdAt: string;
}

export interface MetadataEntry { key: string; label: string; dataType: DataType; value: string | null }

export interface DocumentDetail {
  id: UUID; title: string; status: DocumentStatus; cabinetId: UUID; folderId: UUID; subDividerId: UUID | null;
  documentTypeId: UUID | null; currentVersionNo: number; ownerId: UUID;
  lock: { lockedBy: UUID; lockedAt: string; expiresAt: string; byYou: boolean } | null;
  metadata: MetadataEntry[]; versions: VersionView[]; rights: Right[]; entityVersion: number;
  onLegalHold: boolean; archivedAt: string | null; createdAt: string; updatedAt: string;
}

export interface UploadResult { document: DocumentDetail; possibleDuplicates: UUID[] }
export interface DownloadLink { url: string; expiresAt: string; fileName: string; contentType: string }

export interface ProcessingJobView {
  versionNo: number; versionStatus: ProcessingStatus; jobStatus: 'PENDING' | 'RUNNING' | 'DONE' | 'DEAD';
  attempts: number; scanResult: 'CLEAN' | 'INFECTED' | 'SKIPPED' | null; extractedChars: number | null;
  note: string | null; createdAt: string; completedAt: string | null; nextAttemptAt: string;
}

// ── Search ────────────────────────────────────────────────────────────
export interface Snippet { text: string; highlights: [number, number][] }
export interface SearchHit {
  id: UUID; title: string; status: DocumentStatus; cabinetId: UUID; cabinetName: string | null;
  folderId: UUID; folderName: string | null; documentTypeId: UUID | null; versionNo: number;
  fileName: string | null; contentType: string | null; updatedAt: string; score: number;
  matchedContent: boolean; snippet: Snippet | null;
}
export interface FacetValue { value: string | null; label: string | null; count: number }
export interface SearchResult { results: Paged<SearchHit>; facets: Record<'cabinet' | 'documentType' | 'status', FacetValue[]> }

// ── Workflows ─────────────────────────────────────────────────────────
export type ApprovalMode = 'ANY' | 'ALL';
export interface StepView {
  order: number; name: string; approvalMode: ApprovalMode; assigneeRole: Role | null; assigneeUserIds: UUID[]; dueDays: number | null;
}
export interface WorkflowDefinitionView {
  id: UUID; name: string; description: string | null; active: boolean; currentVersionNo: number; steps: StepView[];
}
export type ReviewStatus = 'IN_PROGRESS' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type TaskStatus = 'OPEN' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUPERSEDED' | 'CANCELLED';
export interface TaskView {
  id: UUID; instanceId: UUID; documentId: UUID; documentTitle: string | null; stepOrder: number; stepName: string;
  assigneeUserId: UUID | null; assigneeRole: Role | null; status: TaskStatus; decidedBy: UUID | null;
  decidedAt: string | null; comment: string | null; dueAt: string | null; overdue: boolean;
  escalatedAt: string | null; delegatedFrom: UUID | null; createdAt: string;
}
export interface ReviewEvent { action: string; actorId: UUID | null; fromStatus: string | null; toStatus: string | null; comment: string | null; occurredAt: string }
export interface ReviewView {
  id: UUID; documentId: UUID; definitionName: string; definitionVersionNo: number; documentVersionNo: number;
  status: ReviewStatus; currentStepOrder: number; initiatedBy: UUID; startedAt: string; completedAt: string | null;
  tasks: TaskView[]; history: ReviewEvent[];
}
export type Decision = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';

// ── Notifications ─────────────────────────────────────────────────────
export interface NotificationView {
  id: UUID; type: string; title: string; body: string | null; resourceType: string | null;
  resourceId: UUID | null; readAt: string | null; createdAt: string;
}

// ── Retention ─────────────────────────────────────────────────────────
export interface DueDocument {
  documentId: UUID; title: string; policyId: UUID; policyName: string; action: 'ARCHIVE' | 'DESTROY'; dueAt: string; onLegalHold: boolean;
}
