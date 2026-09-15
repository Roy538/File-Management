import { BadRequestException } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';

const TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  DRAFT:       [DocumentStatus.CHECKED_IN],
  CHECKED_IN:  [DocumentStatus.CHECKED_OUT, DocumentStatus.ON_HOLD, DocumentStatus.FINALIZED, DocumentStatus.ARCHIVED],
  CHECKED_OUT: [DocumentStatus.CHECKED_IN, DocumentStatus.ARCHIVED],
  ON_HOLD:     [DocumentStatus.CHECKED_IN, DocumentStatus.ARCHIVED],
  FINALIZED:   [DocumentStatus.ARCHIVED],
  ARCHIVED:    [],
};

export function assertDocTransition(from: DocumentStatus, to: DocumentStatus): void {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestException(
      `Cannot transition from ${from} to ${to}. Allowed: ${allowed.join(', ') || 'none'}`,
    );
  }
}

export function allowedDocTransitions(from: DocumentStatus): DocumentStatus[] {
  return TRANSITIONS[from] ?? [];
}
