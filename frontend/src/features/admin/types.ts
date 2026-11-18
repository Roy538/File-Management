/** Admin-only API contracts, mirroring backend DTO records (retention/dto/RetentionDtos.java, identity/controller/UserController.java). */
import type { UUID } from '@/lib/api/types';

export interface CatalogEntry { name: string; code: string }

export type PolicyTrigger = 'CREATED' | 'LAST_MODIFIED';
export type PolicyAction = 'ARCHIVE' | 'DESTROY';

export interface PolicyView {
  id: UUID; name: string; description: string | null; retainFor: string;
  trigger: PolicyTrigger; action: PolicyAction; active: boolean;
}

export interface EvaluationResult {
  archived: number; proposedForDestruction: number; skippedUnderHold: number; proposedRunId: UUID | null;
}

export type DispositionOutcome = 'PENDING' | 'DESTROYED' | 'SKIPPED_HOLD' | 'SKIPPED_CHANGED' | 'SKIPPED_EXCLUDED';

export interface DispositionItemView {
  documentId: UUID; title: string | null; policyId: UUID; dueAt: string; outcome: DispositionOutcome; note: string | null;
}

export interface DispositionRunView {
  id: UUID; status: 'PROPOSED' | 'EXECUTED' | 'CANCELLED'; proposedAt: string; decidedBy: UUID | null;
  decidedAt: string | null; executedAt: string | null; items: DispositionItemView[];
}

export interface HeldDocumentView { documentId: UUID; title: string | null; addedBy: UUID; addedAt: string }

export interface HoldView {
  id: UUID; name: string; reason: string; matterRef: string | null; active: boolean; createdBy: UUID;
  createdAt: string; releasedAt: string | null; releaseReason: string | null; documents: HeldDocumentView[];
}
