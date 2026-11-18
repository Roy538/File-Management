import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FolderPlus, Library, Search } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { Paged } from '@/lib/api/types';
import { useCan } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { formatRelative, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { FileStatusBadge } from './FileStatusBadge';
import { RegisterFileDialog } from './RecordDialogs';
import { useDepartments } from './queries';
import { fileStatusLabel, whereText, type Dashboard, type FileStatus, type FileSummary } from './types';

const PAGE_SIZE = 25;
const STATUSES: FileStatus[] = ['AVAILABLE', 'DISPATCHED', 'RETURNED', 'MISSING', 'ARCHIVED'];

/** The paper-file register: find a jacket by number or customer, and see where it is right now. */
export function RegistryPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = (params.get('status') as FileStatus | null) ?? null;
  const departmentId = params.get('department') ?? '';
  const page = Number(params.get('page') ?? 0);
  const [input, setInput] = useState(q);
  const [registering, setRegistering] = useState(false);
  const canManage = useCan('records:manage');
  const navigate = useNavigate();
  const departments = useDepartments();

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  const files = useQuery({
    queryKey: ['records', 'files', { q, status, departmentId, page }],
    queryFn: () => api.get<Paged<FileSummary>>('/records/files', { q, status, departmentId, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });
  const counts = dashboard.data?.records?.byStatus;

  const submit = (e: FormEvent) => { e.preventDefault(); set({ q: input.trim() || null }); };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="File register"
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Registry' }, { label: 'File register' }]}
        actions={canManage ? <Button variant="primary" icon={<FolderPlus className="size-4" />} onClick={() => setRegistering(true)}>Register a file</Button> : null}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form onSubmit={submit} role="search" className="flex min-w-64 flex-1 gap-2">
          <label htmlFor="register-search" className="sr-only">Find a file by number or customer</label>
          <Input id="register-search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="File number or customer name" />
          <Button type="submit" icon={<Search className="size-4" />}>Find</Button>
        </form>
        <label htmlFor="register-dept" className="sr-only">Department</label>
        <Select id="register-dept" className="w-48" value={departmentId} onChange={(e) => set({ department: e.target.value || null })}>
          <option value="">All departments</option>
          {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </div>

      {/* Where files are: one filter per status, with live counts, like the drawers of the registry. */}
      <div role="group" aria-label="Filter by where the file is" className="mb-4 flex flex-wrap gap-1.5">
        <StatusChip active={!status} onClick={() => set({ status: null })} label="All files" count={dashboard.data?.records?.totalFiles} />
        {STATUSES.map((s) => (
          <StatusChip key={s} active={status === s} onClick={() => set({ status: s })} label={fileStatusLabel[s]} count={counts?.[s]}
            alert={s === 'MISSING' && (counts?.MISSING ?? 0) > 0} />
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        {files.isLoading ? <SkeletonRows cols={5} /> : files.isError ? <ErrorState error={files.error} onRetry={() => files.refetch()} /> :
          files.data?.content.length === 0 ? (
            <EmptyState icon={<Library className="size-6" />} title={q || status || departmentId ? 'No files match' : 'The register is empty'}
              action={canManage && !q && !status ? <Button variant="primary" onClick={() => setRegistering(true)}>Register a file</Button> : undefined}>
              {q || status || departmentId ? 'Try another number or name, or clear the filters.' : 'Register paper files here to track where each one is.'}
            </EmptyState>
          ) : (
            <>
              <table className="hidden w-full text-left text-[13.5px] md:table">
                <thead className="border-b border-rule bg-paper text-[12.5px] text-muted">
                  <tr>
                    <th scope="col" className="whitespace-nowrap px-4 py-2 font-medium">File</th>
                    <th scope="col" className="w-full px-3 py-2 font-medium">Customer</th>
                    <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Department</th>
                    <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Where</th>
                    <th scope="col" className="whitespace-nowrap px-4 py-2 font-medium">Last change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {files.data?.content.map((f) => (
                    <tr key={f.id} className="cursor-pointer hover:bg-navy-50/50" onClick={() => navigate(`/records/files/${f.id}`)}>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link to={`/records/files/${f.id}`} className="font-mono text-[13px] font-medium text-navy-800 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {f.fileNumber}
                        </Link>
                        {f.volumeNumber > 1 ? <span className="ml-1.5 text-[12px] text-muted">vol. {f.volumeNumber}</span> : null}
                      </td>
                      <td className="max-w-0 truncate px-3 py-2.5 text-ink">{f.customerName}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">{f.departmentName ?? '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <FileStatusBadge status={f.status} />
                          {whereText(f) ? <span className="text-[12.5px] text-muted">{whereText(f)}</span> : null}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted" title={formatDateTime(f.updatedAt)}>{formatRelative(f.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-rule md:hidden">
                {files.data?.content.map((f) => (
                  <li key={f.id}>
                    <Link to={`/records/files/${f.id}`} className="block px-4 py-3">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[13.5px] font-medium text-navy-800">{f.fileNumber}{f.volumeNumber > 1 ? ` · vol. ${f.volumeNumber}` : ''}</span>
                        <FileStatusBadge status={f.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-ink">{f.customerName}</span>
                      <span className="block truncate text-[12.5px] text-muted">{[f.departmentName, whereText(f)].filter(Boolean).join(' · ')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {files.data ? (
                <Pagination page={files.data.page} totalPages={files.data.totalPages} totalElements={files.data.totalElements}
                  size={files.data.size} onPage={(p) => set({ page: String(p) })} />
              ) : null}
            </>
          )}
      </div>

      {registering ? <RegisterFileDialog onClose={(f) => { setRegistering(false); if (f) navigate(`/records/files/${f.id}`); }} /> : null}
    </div>
  );
}

function StatusChip({ active, onClick, label, count, alert }: { active: boolean; onClick: () => void; label: string; count?: number; alert?: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={cn('inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[13px]',
        active ? 'border-navy-800 bg-navy-800 text-white' : 'border-rule-strong bg-surface text-ink hover:border-navy-700/50 hover:bg-navy-50')}>
      {label}
      {count !== undefined ? (
        <span className={cn('tabular-nums text-[12px]', active ? 'text-white/75' : alert ? 'font-semibold text-danger' : 'text-muted')}>{count}</span>
      ) : null}
    </button>
  );
}
