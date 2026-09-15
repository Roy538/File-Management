// ── Enums ────────────────────────────────────────────────────────────────────

export enum Role {
  ADMIN = 'ADMIN',
  OFFICER = 'OFFICER',
  DEPT_USER = 'DEPT_USER',
}

export enum FileStatus {
  AVAILABLE = 'AVAILABLE',
  DISPATCHED = 'DISPATCHED',
  RETURNED = 'RETURNED',
  ARCHIVED = 'ARCHIVED',
  MISSING = 'MISSING',
}

export enum FileMovementAction {
  CREATED = 'CREATED',
  DISPATCHED = 'DISPATCHED',
  RETURNED = 'RETURNED',
  RELOCATED = 'RELOCATED',
  ARCHIVED = 'ARCHIVED',
  FLAGGED_MISSING = 'FLAGGED_MISSING',
  RECOVERED = 'RECOVERED',
}

export enum DocumentStatus {
  DRAFT = 'DRAFT',
  CHECKED_IN = 'CHECKED_IN',
  CHECKED_OUT = 'CHECKED_OUT',
  ON_HOLD = 'ON_HOLD',
  FINALIZED = 'FINALIZED',
  ARCHIVED = 'ARCHIVED',
}

export enum RetentionAction {
  DELETE = 'DELETE',
  ARCHIVE = 'ARCHIVE',
  NOTIFY = 'NOTIFY',
}

export enum ESignatureStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export enum WorkflowStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

// ── Common ────────────────────────────────────────────────────────────────────

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error: string;
}

// ── Auth DTOs ─────────────────────────────────────────────────────────────────

export interface LoginDto {
  businessUnitId: string;
  branchId: string;
  email: string;
  password: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    branchId: string;
    businessUnitId: string;
  };
}

// ── Entity DTOs (will grow through phases) ────────────────────────────────────

export interface BusinessUnitDto {
  id: string;
  name: string;
}

export interface BranchDto {
  id: string;
  businessUnitId: string;
  name: string;
  address?: string;
}

export interface FileDto {
  id: string;
  fileNumber: string;
  customerName: string;
  businessUnitId: string;
  branchId: string;
  dateCreated: string;
  status: FileStatus;
  currentLocation: string;
  volumeNumber: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchDto {
  id: string;
  fileId: string;
  dispatchDate: string;
  collectedBy: string;
  department: string;
  purpose: string;
  expectedReturnDate: string;
  authorizedBy: string;
  processedByUserId: string;
}

export interface CreateDispatchDto {
  fileId: string;
  collectedBy: string;
  department: string;
  purpose: string;
  expectedReturnDate: string;
  authorizedBy: string;
}

export interface CreateReturnDto {
  dispatchId: string;
  returnedBy: string;
  receivedBy: string;
  condition: string;
  correctLocation: boolean;
  actualLocation?: string;
  remarks?: string;
}

export interface FileMovementDto {
  id: string;
  fileId: string;
  action: FileMovementAction;
  actorUserId: string;
  department?: string;
  timestamp: string;
  remarks?: string;
}

export interface NotificationDto {
  id: string;
  type: string;
  fileId?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface DashboardStatsDto {
  total: number;
  available: number;
  dispatched: number;
  overdue: number;
  missing: number;
  returnedToday: number;
  dispatchedToday: number;
}
