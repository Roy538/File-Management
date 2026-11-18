import type { DocumentStatus, ProcessingStatus } from '@/lib/api/types';
import { statusLabel } from '@/lib/format';
import { cn } from '@/lib/cn';

const tone: Record<DocumentStatus, string> = {
  DRAFT: 'bg-paper text-muted border-rule-strong',
  ACTIVE: 'bg-info-bg text-info border-info/25',
  UNDER_REVIEW: 'bg-warn-bg text-warn border-warn/25',
  APPROVED: 'bg-ok-bg text-ok border-ok/25',
  PUBLISHED: 'bg-ok text-white border-ok',
  ARCHIVED: 'bg-manila-100 text-manila-700 border-manila-300',
};

export function StatusBadge({ status, className }: { status: DocumentStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-sm border px-1.5 py-px text-[12px] font-medium', tone[status], className)}>
      {statusLabel[status]}
    </span>
  );
}

const processingTone: Record<ProcessingStatus, [string, string]> = {
  STORED: ['Waiting for scan', 'text-muted'],
  PROCESSING: ['Scanning', 'text-info'],
  AVAILABLE: ['Ready', 'text-ok'],
  FAILED: ['Scan failed', 'text-danger'],
  QUARANTINED: ['Quarantined', 'text-danger'],
};

/** A dot + label for version processing (only shown when it matters: not yet ready, or a problem). */
export function ProcessingLabel({ status }: { status: ProcessingStatus }) {
  const [label, color] = processingTone[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px]', color)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
