import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';

export interface Crumb { label: string; to?: string }

export function PageHeader({ title, crumbs, actions, children }: {
  title: ReactNode; crumbs?: Crumb[]; actions?: ReactNode; children?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {crumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight className="size-3.5 text-subtle" aria-hidden /> : null}
                {c.to ? <Link to={c.to} className="hover:text-navy-800 hover:underline">{c.label}</Link> : <span aria-current="page">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="doc-title text-[26px] leading-tight text-ink">{title}</h1>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
