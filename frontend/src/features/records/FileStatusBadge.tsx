import { cn } from '@/lib/cn';
import { fileStatusLabel, type FileStatus } from './types';

const tone: Record<FileStatus, string> = {
  AVAILABLE: 'bg-ok-bg text-ok border-ok/25',
  DISPATCHED: 'bg-info-bg text-info border-info/25',
  RETURNED: 'bg-warn-bg text-warn border-warn/25',
  ARCHIVED: 'bg-manila-100 text-manila-700 border-manila-300',
  MISSING: 'bg-danger text-white border-danger',
};

export function FileStatusBadge({ status, className }: { status: FileStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-px text-[12px] font-medium', tone[status], className)}>
      {fileStatusLabel[status]}
    </span>
  );
}
