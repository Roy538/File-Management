import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileSpreadsheet, FileText, FileDown, BarChart3 } from 'lucide-react';
import { api, ApiError, download } from '@/lib/api/client';
import type { Paged } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { formatDateTime, todayIso } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { FileSummary } from '@/features/records/types';

/** Mirrors backend reports/dto/ReportDtos.ReportTable: every cell is already display text. */
interface ReportTable {
  type: string;
  title: string;
  subtitle: string;
  columns: Array<{ name: string; numeric: boolean }>;
  rows: string[][];
  totals: string[] | null;
  generatedAt: string;
  generatedBy: string;
}

type Input_ = 'date' | 'month' | 'file';
const REPORTS: Array<{ type: string; title: string; about: string; input?: Input_ }> = [
  { type: 'outstanding', title: 'Files out on loan', about: 'Everything not in the registry right now, with days out and what is late.' },
  { type: 'daily-dispatches', title: 'Dispatches for the day', about: 'Every file lent out on one day.', input: 'date' },
  { type: 'daily-returns', title: 'Returns for the day', about: 'Every file brought back on one day, its condition and where it was put.', input: 'date' },
  { type: 'missing', title: 'Missing files', about: 'Files reported missing, when, and where they were last seen.' },
  { type: 'by-department', title: 'Files by department', about: 'How many files each department owns, by where they are.' },
  { type: 'monthly', title: 'Monthly summary', about: 'Files lent and returned on each day of a month.', input: 'month' },
  { type: 'movement-history', title: 'One file’s history', about: 'Every movement of a single file, optionally between two dates.', input: 'file' },
];

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? 'outstanding';
  const report = REPORTS.find((r) => r.type === type) ?? REPORTS[0]!;
  const query = paramsFor(report.input, params);
  const ready = report.input !== 'file' || !!params.get('fileId');

  const table = useQuery({
    queryKey: ['reports', type, query],
    queryFn: () => api.get<ReportTable>(`/reports/${type}`, query),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
  const [exporting, setExporting] = useState<string | null>(null);

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true });
  };
  const exportAs = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      const name = await download(`/reports/${type}/export`, { ...query, format });
      toast.success(`Downloaded ${name}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'The report could not be downloaded.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Registry reports" crumbs={[{ label: 'Home', to: '/' }, { label: 'Registry' }, { label: 'Reports' }]} />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Reports" className="self-start overflow-hidden rounded-lg border border-rule bg-surface">
          <ul>
            {REPORTS.map((r) => (
              <li key={r.type} className="border-b border-rule last:border-b-0">
                <button onClick={() => setParams({ type: r.type }, { replace: true })} aria-current={r.type === type}
                  className={cn('w-full px-4 py-2.5 text-left text-[13.5px] hover:bg-navy-50/60', r.type === type ? 'bg-navy-50 font-medium text-navy-800' : 'text-ink')}>
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              {report.input === 'date' ? (
                <Field label="Day">{(a) => <Input {...a} type="date" className="w-44" max={todayIso()} value={params.get('date') ?? todayIso()} onChange={(e) => set({ date: e.target.value })} />}</Field>
              ) : null}
              {report.input === 'month' ? (
                <Field label="Month">{(a) => <Input {...a} type="month" className="w-44" max={todayIso().slice(0, 7)} value={params.get('month') ?? todayIso().slice(0, 7)} onChange={(e) => set({ month: e.target.value })} />}</Field>
              ) : null}
              {report.input === 'file' ? <FilePicker fileId={params.get('fileId')} onPick={(id) => set({ fileId: id })} /> : null}
              {report.input === 'file' ? (
                <>
                  <Field label="From (optional)">{(a) => <Input {...a} type="date" className="w-40" value={params.get('from') ?? ''} onChange={(e) => set({ from: e.target.value || null })} />}</Field>
                  <Field label="To (optional)">{(a) => <Input {...a} type="date" className="w-40" value={params.get('to') ?? ''} onChange={(e) => set({ to: e.target.value || null })} />}</Field>
                </>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={!ready || !table.data} loading={exporting === 'csv'} icon={<FileText className="size-4" />} onClick={() => void exportAs('csv')}>CSV</Button>
              <Button size="sm" disabled={!ready || !table.data} loading={exporting === 'xlsx'} icon={<FileSpreadsheet className="size-4" />} onClick={() => void exportAs('xlsx')}>Excel</Button>
              <Button size="sm" variant="primary" disabled={!ready || !table.data} loading={exporting === 'pdf'} icon={<FileDown className="size-4" />} onClick={() => void exportAs('pdf')}>PDF</Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-rule bg-surface">
            <header className="border-b border-rule px-4 py-3">
              <h2 className="doc-title text-[19px] text-ink">{report.title}</h2>
              <p className="text-[13px] text-muted">{table.data && ready ? table.data.subtitle : report.about}</p>
            </header>
            {!ready ? (
              <EmptyState icon={<BarChart3 className="size-6" />} title="Choose a file">Find it by number or customer above.</EmptyState>
            ) : table.isLoading ? <SkeletonRows cols={5} /> : table.isError ? <ErrorState error={table.error} onRetry={() => table.refetch()} /> :
              table.data ? <ReportGrid table={table.data} /> : null}
          </div>
          {table.data && ready ? (
            <p className="mt-2 text-[12px] text-subtle">Generated {formatDateTime(table.data.generatedAt)}. Downloads are recorded in the audit trail.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ReportGrid({ table }: { table: ReportTable }) {
  if (table.rows.length === 0) return <EmptyState title="Nothing to report">There are no entries for this selection.</EmptyState>;
  const align = (i: number) => (table.columns[i]?.numeric ? 'text-right tabular-nums' : 'text-left');
  return (
    <div className="max-h-[65vh] overflow-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 border-b border-rule bg-paper text-[12.5px] text-muted">
          <tr>{table.columns.map((c, i) => <th key={c.name} scope="col" className={cn('whitespace-nowrap px-3 py-2 font-medium first:pl-4 last:pr-4', align(i))}>{c.name}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {table.rows.map((row, r) => (
            <tr key={r} className={cn(row.includes('Overdue') && 'bg-danger-bg/50')}>
              {row.map((cell, i) => <td key={i} className={cn('px-3 py-2 first:pl-4 last:pr-4', align(i), i === 0 && 'whitespace-nowrap font-medium text-ink')}>{cell || '—'}</td>)}
            </tr>
          ))}
        </tbody>
        {table.totals ? (
          <tfoot className="sticky bottom-0 border-t-2 border-rule-strong bg-paper font-semibold">
            <tr>{table.totals.map((cell, i) => <td key={i} className={cn('px-3 py-2 first:pl-4 last:pr-4', align(i))}>{cell}</td>)}</tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** Find a file by number or customer for the history report. */
function FilePicker({ fileId, onPick }: { fileId: string | null; onPick: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const matches = useQuery({
    queryKey: ['records', 'files', 'picker', q],
    queryFn: () => api.get<Paged<FileSummary>>('/records/files', { q, size: 10 }),
    enabled: q.trim().length >= 2,
  });
  const chosen = useQuery({
    queryKey: ['records', 'file', fileId, 'summary'],
    queryFn: () => api.get<{ file: FileSummary }>(`/records/files/${fileId}`),
    enabled: !!fileId,
  });
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Find a file">{(a) => <Input {...a} className="w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number or customer" />}</Field>
      <Field label="File">
        {(a) => (
          <Select {...a} className="w-64" value={fileId ?? ''} onChange={(e) => onPick(e.target.value || null)}>
            <option value="">{q.trim().length >= 2 ? (matches.data?.content.length ? 'Choose…' : 'No matches') : 'Type to search'}</option>
            {chosen.data && !matches.data?.content.some((f) => f.id === fileId) ? (
              <option value={chosen.data.file.id}>{chosen.data.file.fileNumber}, {chosen.data.file.customerName}</option>
            ) : null}
            {matches.data?.content.map((f) => <option key={f.id} value={f.id}>{f.fileNumber}{f.volumeNumber > 1 ? ` vol. ${f.volumeNumber}` : ''}, {f.customerName}</option>)}
          </Select>
        )}
      </Field>
    </div>
  );
}

function paramsFor(input: Input_ | undefined, p: URLSearchParams): Record<string, string | null> {
  if (input === 'date') return { date: p.get('date') ?? todayIso() };
  if (input === 'month') {
    const [year, month] = (p.get('month') ?? todayIso().slice(0, 7)).split('-');
    return { year: year ?? null, month: month ? String(Number(month)) : null };
  }
  if (input === 'file') return { fileId: p.get('fileId'), from: p.get('from'), to: p.get('to') };
  return {};
}
