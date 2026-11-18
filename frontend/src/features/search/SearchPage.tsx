import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, X, FileSearch } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { DocumentStatus, FacetValue, SearchHit, SearchResult } from '@/lib/api/types';
import { formatDate, statusLabel } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FileIcon } from '@/components/ui/FileIcon';
import { segments } from './snippet';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 25;
const FILTERS = ['cabinetId', 'documentTypeId', 'status', 'updatedFrom', 'updatedTo'] as const;
type FilterKey = (typeof FILTERS)[number];

/** Content search. Every filter lives in the URL so results can be bookmarked and shared. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 0);
  const [draft, setDraft] = useState(q);

  // Keep the box in step when the top-bar search changes ?q=.
  useEffect(() => setDraft(q), [q]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounced typing; Enter searches immediately.
  useEffect(() => {
    if (draft.trim() === q) return;
    const t = setTimeout(() => update({ q: draft.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update({ q: draft.trim() || null });
  };

  const query = {
    q, page, size: PAGE_SIZE,
    ...Object.fromEntries(FILTERS.map((f) => [f, params.get(f)])),
  };
  const result = useQuery({
    queryKey: ['search', query],
    queryFn: ({ signal }) => api.get<SearchResult>('/search', query, signal),
    placeholderData: keepPreviousData,
  });

  const active = FILTERS.filter((f) => params.get(f));
  const facets = result.data?.facets;
  const labelFor = (key: FilterKey, value: string): string => {
    if (key === 'status') return statusLabel[value as DocumentStatus] ?? value;
    if (key === 'updatedFrom') return `Updated from ${formatDate(value)}`;
    if (key === 'updatedTo') return `Updated until ${formatDate(value)}`;
    const list = key === 'cabinetId' ? facets?.cabinet : facets?.documentType;
    return list?.find((f) => f.value === value)?.label ?? 'Selected filter';
  };
  const browsing = !q && active.length === 0;
  const total = result.data?.results.totalElements ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Content search" crumbs={[{ label: 'Home', to: '/' }, { label: 'Content search' }]} />

      <form onSubmit={submit} role="search" className="mb-5">
        <label htmlFor="search-q" className="sr-only">Search documents</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            id="search-q"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Words in the title or inside the document"
            className="h-12 w-full rounded-lg border border-rule-strong bg-surface pl-11 pr-4 text-[15px] text-ink placeholder:text-subtle focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-700/20"
          />
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside aria-label="Filters" className="flex flex-col gap-5">
          <FacetGroup title="Cabinet" values={facets?.cabinet} selected={params.get('cabinetId')}
            onSelect={(v) => update({ cabinetId: v })} />
          <FacetGroup title="Document type" values={facets?.documentType} selected={params.get('documentTypeId')}
            onSelect={(v) => update({ documentTypeId: v })} />
          <FacetGroup title="Status" values={facets?.status?.map((f) => ({ ...f, label: f.value ? statusLabel[f.value as DocumentStatus] ?? f.label : f.label }))}
            selected={params.get('status')} onSelect={(v) => update({ status: v })} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-semibold text-ink">Last updated</legend>
            <Field label="From">
              {(a) => <Input {...a} type="date" value={params.get('updatedFrom') ?? ''} onChange={(e) => update({ updatedFrom: e.target.value || null })} />}
            </Field>
            <Field label="Until">
              {(a) => <Input {...a} type="date" value={params.get('updatedTo') ?? ''} onChange={(e) => update({ updatedTo: e.target.value || null })} />}
            </Field>
          </fieldset>
        </aside>

        <section aria-labelledby="results-heading" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="results-heading" className="text-[13.5px] text-muted" aria-live="polite">
              {result.isLoading ? 'Searching…'
                : browsing ? 'Recently updated documents'
                : `${total} ${total === 1 ? 'document' : 'documents'} found`}
            </h2>
            {active.map((key) => (
              <button
                key={key}
                onClick={() => update({ [key]: null })}
                className="inline-flex items-center gap-1 rounded-full border border-rule-strong bg-surface px-2.5 py-0.5 text-[12.5px] text-ink hover:border-navy-700/50"
                aria-label={`Remove filter: ${labelFor(key, params.get(key)!)}`}
              >
                {labelFor(key, params.get(key)!)} <X className="size-3.5" aria-hidden />
              </button>
            ))}
            {active.length > 1 ? (
              <Button size="sm" variant="ghost" onClick={() => update(Object.fromEntries(FILTERS.map((f) => [f, null])))}>Clear all</Button>
            ) : null}
          </div>

          <div className="rounded-lg border border-rule bg-surface">
            {result.isLoading ? <SkeletonRows rows={8} cols={3} />
              : result.isError ? <ErrorState error={result.error} onRetry={() => void result.refetch()} />
              : total === 0 ? (
                <EmptyState icon={<FileSearch className="size-8" />} title={browsing ? 'No documents yet' : 'No documents match'}>
                  {browsing ? 'Documents you can open will appear here once they are uploaded.'
                    : 'Try fewer or different words, or remove a filter. Text inside newly uploaded files becomes searchable once they have been scanned.'}
                </EmptyState>
              ) : (
                <>
                  <ul className={cn('divide-y divide-rule', result.isFetching && 'opacity-60')}>
                    {result.data!.results.content.map((hit) => <ResultRow key={hit.id} hit={hit} />)}
                  </ul>
                  <Pagination page={page} size={PAGE_SIZE} totalElements={total}
                    totalPages={result.data!.results.totalPages} onPage={(p) => update({ page: String(p) })} />
                </>
              )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ResultRow({ hit }: { hit: SearchHit }) {
  return (
    <li className="flex gap-3 px-4 py-3.5">
      <FileIcon contentType={hit.contentType} className="mt-1" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link to={`/documents/${hit.id}`} className="doc-title text-[15.5px] text-ink hover:text-navy-800 hover:underline">{hit.title}</Link>
          <StatusBadge status={hit.status} />
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {[hit.cabinetName, hit.folderName].filter(Boolean).join(' / ')}
          <span className="mx-1.5 text-subtle" aria-hidden>|</span>
          Updated {formatDate(hit.updatedAt)}
          {hit.matchedContent ? <><span className="mx-1.5 text-subtle" aria-hidden>|</span>Matched in content</> : null}
        </p>
        {hit.snippet ? (
          <p className="mt-1.5 max-w-[78ch] text-[13.5px] leading-relaxed text-ink/85">
            {segments(hit.snippet).map((s, i) => s.marked
              ? <mark key={i} className="rounded-sm bg-manila-100 px-0.5 text-ink">{s.text}</mark>
              : <span key={i}>{s.text}</span>)}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function FacetGroup({ title, values, selected, onSelect }: {
  title: string; values: FacetValue[] | undefined; selected: string | null; onSelect: (value: string | null) => void;
}) {
  if (!values?.length) return null;
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-semibold text-ink">{title}</legend>
      <ul className="flex flex-col">
        {values.map((f) => {
          const isSelected = f.value !== null && f.value === selected;
          return (
            <li key={f.value ?? 'none'}>
              <button
                disabled={f.value === null}
                onClick={() => onSelect(isSelected ? null : f.value)}
                aria-pressed={isSelected}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[13px]',
                  isSelected ? 'bg-navy-100 font-medium text-navy-800' : 'text-ink hover:bg-navy-50',
                  'disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent',
                )}
              >
                <span className="truncate">{f.label ?? 'Unnamed'}</span>
                <span className="tabular-nums text-muted">{f.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
