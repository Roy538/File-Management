import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { Button } from './Button';
import { cn } from '@/lib/cn';

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-muted', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="text-[13px]">{label}…</span>
    </span>
  );
}

/** Placeholder rows shaped like the table they stand in for. */
export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden className="divide-y divide-rule">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="h-3 rounded bg-navy-100/70 animate-pulse" style={{ width: c === 0 ? '34%' : `${12 + ((r + c) % 3) * 6}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-subtle">{icon}</div> : null}
      <p className="doc-title text-base text-ink">{title}</p>
      {children ? <p className="mt-1 max-w-sm text-[13px] text-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Explains what failed, offers a retry, and shows the correlation ID support needs. */
export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const e = error instanceof ApiError ? error : null;
  const message = e?.isNotFound
    ? "This item doesn't exist or you don't have access to it."
    : e?.message ?? 'Something went wrong while loading this.';
  return (
    <div role="alert" className={cn('flex flex-col items-center text-center', compact ? 'py-6' : 'py-14 px-6')}>
      <AlertTriangle className="mb-2 size-5 text-danger" aria-hidden />
      <p className="text-sm text-ink">{message}</p>
      {e?.correlationId ? <p className="mt-1 text-[12px] text-subtle">Reference {e.correlationId}</p> : null}
      {onRetry && !e?.isNotFound ? <Button className="mt-3" size="sm" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}
