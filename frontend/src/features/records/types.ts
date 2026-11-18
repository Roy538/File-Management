/** Registry contracts, mirroring backend records/dto/RecordsDtos.java and dashboard/dto/DashboardDtos.java. */

export type FileStatus = 'AVAILABLE' | 'DISPATCHED' | 'RETURNED' | 'ARCHIVED' | 'MISSING';
export type ReturnCondition = 'GOOD' | 'WORN' | 'DAMAGED' | 'INCOMPLETE';
export type MovementAction = 'CREATED' | 'DISPATCHED' | 'RETURNED' | 'RELOCATED' | 'ARCHIVED' | 'FLAGGED_MISSING' | 'RECOVERED' | 'UPDATED';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'FULFILLED';
export type StatusAction = 'SHELVE' | 'RELOCATE' | 'ARCHIVE' | 'FLAG_MISSING' | 'RECOVER' | 'RESTORE';
/** What the caller may do now (backend RegistryService.allowedActions). */
export type FileAction = StatusAction | 'DISPATCH' | 'RETURN' | 'EDIT' | 'REQUEST';

export interface FileSummary {
  id: string;
  fileNumber: string;
  volumeNumber: number;
  customerName: string;
  departmentId: string | null;
  departmentName: string | null;
  dateOpened: string;
  status: FileStatus;
  currentLocation: string | null;
  homeLocation: string | null;
  updatedAt: string;
}

export interface MovementView {
  id: string;
  action: MovementAction;
  performedBy: string | null;
  department: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  notes: string | null;
  occurredAt: string;
}

export interface DispatchView {
  id: string;
  fileId: string;
  fileNumber: string | null;
  customerName: string | null;
  dispatchedTo: string;
  department: string;
  reason: string | null;
  dispatchedBy: string;
  authorisedBy: string | null;
  dispatchedAt: string;
  expectedReturnOn: string | null;
  overdue: boolean;
  requestId: string | null;
  returnedAt: string | null;
  receivedBy: string | null;
  returnedByName: string | null;
  returnCondition: ReturnCondition | null;
  returnedToCorrectLocation: boolean | null;
  returnLocation: string | null;
  returnNotes: string | null;
}

export interface RequestView {
  id: string;
  fileId: string;
  fileNumber: string | null;
  customerName: string | null;
  fileStatus: FileStatus | null;
  requestedBy: string;
  department: string;
  purpose: string | null;
  neededBy: string | null;
  status: RequestStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  dispatchId: string | null;
  createdAt: string;
}

export interface FileDetail {
  file: FileSummary;
  openDispatch: DispatchView | null;
  movements: MovementView[];
  activeRequests: RequestView[];
  allowedActions: FileAction[];
}

export interface DepartmentView { id: string; code: string; name: string; active: boolean }

export interface Dashboard {
  documents: { visible: number; byStatus: Record<string, number> } | null;
  records: {
    totalFiles: number;
    byStatus: Record<FileStatus, number>;
    outOnLoan: number;
    overdue: number;
    dispatchedToday: number;
    returnedToday: number;
    pendingRequests: number;
  } | null;
  openTasks: number | null;
  unreadNotifications: number;
}

/** Where the file is, in words: "with Credit" while lent, "last seen …" when missing. */
export function whereText(f: Pick<FileSummary, 'status' | 'currentLocation'>): string | null {
  if (!f.currentLocation) return null;
  if (f.status === 'DISPATCHED') return `with ${f.currentLocation}`;
  if (f.status === 'MISSING') return `last seen at ${f.currentLocation}`;
  return f.currentLocation;
}

export const fileStatusLabel: Record<FileStatus, string> = {
  AVAILABLE: 'In registry',
  DISPATCHED: 'On loan',
  RETURNED: 'Returned, to shelve',
  ARCHIVED: 'Archived',
  MISSING: 'Missing',
};

export const requestStatusLabel: Record<RequestStatus, string> = {
  PENDING: 'Waiting for decision',
  APPROVED: 'Approved, not yet sent',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  FULFILLED: 'Sent',
};

export const movementLabel: Record<MovementAction, string> = {
  CREATED: 'Registered',
  DISPATCHED: 'Lent out',
  RETURNED: 'Returned',
  RELOCATED: 'Moved',
  ARCHIVED: 'Archived',
  FLAGGED_MISSING: 'Reported missing',
  RECOVERED: 'Back in the registry',
  UPDATED: 'Details changed',
};

export const conditionLabel: Record<ReturnCondition, string> = {
  GOOD: 'Good',
  WORN: 'Worn',
  DAMAGED: 'Damaged',
  INCOMPLETE: 'Pages missing',
};
