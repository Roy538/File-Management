import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A container labelled by a manila folder tab — the app's one signature device. Use it only for
 * things that really are containers (launcher groups, a cabinet, a folder), never as decoration.
 */
export function TabbedPanel({ tab, icon, actions, children, className, bodyClassName }: {
  tab: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn('flex flex-col', className)}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="file-tab">{icon}{tab}</h2>
        {actions ? <div className="mb-1.5 flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn('rounded-b-lg rounded-tr-lg border border-rule border-t-[3px] border-t-manila-300 bg-surface', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
