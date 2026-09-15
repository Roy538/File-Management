import { FileStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

const TRANSITIONS: Record<FileStatus, FileStatus[]> = {
  [FileStatus.AVAILABLE]:  [FileStatus.DISPATCHED, FileStatus.ARCHIVED, FileStatus.MISSING],
  [FileStatus.DISPATCHED]: [FileStatus.RETURNED, FileStatus.MISSING],
  [FileStatus.RETURNED]:   [FileStatus.AVAILABLE, FileStatus.ARCHIVED],
  [FileStatus.ARCHIVED]:   [FileStatus.AVAILABLE],
  [FileStatus.MISSING]:    [FileStatus.AVAILABLE, FileStatus.ARCHIVED],
};

export function assertTransition(from: FileStatus, to: FileStatus): void {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestException(
      `Cannot transition file from ${from} to ${to}. Allowed: ${allowed.join(', ') || 'none'}`,
    );
  }
}

export function allowedTransitions(from: FileStatus): FileStatus[] {
  return TRANSITIONS[from] ?? [];
}
