import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { api } from '@/lib/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { usePeople } from '@/lib/usePeople';
import { daysBetween, formatDateTime, formatDay, todayIso } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { DispatchView } from './types';

/** Every file out of the registry right now, longest-out first; late ones stand out. */
export function LoansPage() {
  const [params, setParams] = useSearchParams();
  const overdueOnly = params.get('overdue') === '1';
  const loans = useQuery({
    queryKey: ['records', 'outstanding', overdueOnly],
    queryFn: () => api.get<DispatchView[]>('/records/dispatches/outstanding', { overdueOnly }),
  });
  const name = usePeople(loans.data?.map((l) => l.dispatchedBy) ?? []);
  const today = todayIso();
  const lateCount = loans.data?.filter((l) => l.overdue).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Files on loan" crumbs={[{ label: 'Home', to: '/' }, { label: 'Registry' }, { label: 'Files on loan' }]}>
        <p className="mt-1 text-[13.5px] text-muted">
          {loans.data ? `${loans.data.length} out${overdueOnly ? ' and late' : lateCount ? `, ${lateCount} late` : ''}. ` : ''}
          Whoever lent a file is reminded each morning while it is late.
        </p>
      </PageHeader>
      <div role="group" aria-label="Which loans" className="mb-3 flex gap-1.5 text-[13px]">
        {[{ v: false, l: 'All loans' }, { v: true, l: 'Late only' }].map((o) => (
          <button key={o.l} aria-pressed={overdueOnly === o.v} onClick={() => setParams(o.v ? { overdue: '1' } : {}, { replace: true })}
            className={cn('rounded-md border px-2.5 py-1', overdueOnly === o.v ? 'border-navy-800 bg-navy-800 text-white' : 'border-rule-strong bg-surface hover:bg-navy-50')}>
            {o.l}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
        {loans.isLoading ? <SkeletonRows cols={5} /> : loans.isError ? <ErrorState error={loans.error} onRetry={() => loans.refetch()} /> :
          loans.data?.length === 0 ? (
            <EmptyState icon={<ArrowLeftRight className="size-6" />} title={overdueOnly ? 'Nothing is late' : 'Every file is in the registry'} />
          ) : (
            <table className="w-full text-left text-[13.5px]">
              <thead className="border-b border-rule bg-paper text-[12.5px] text-muted">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-4 py-2 font-medium">File</th>
                  <th scope="col" className="px-3 py-2 font-medium">With</th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Lent</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2 font-medium">Due back</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {loans.data?.map((l) => {
                  const late = l.expectedReturnOn ? daysBetween(l.expectedReturnOn, today) : 0;
                  return (
                    <tr key={l.id} className={cn('hover:bg-navy-50/50', l.overdue && 'bg-danger-bg/50')}>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Link to={`/records/files/${l.fileId}`} className="font-mono text-[13px] font-medium text-navy-800 hover:underline">{l.fileNumber}</Link>
                        <span className="block max-w-56 truncate text-[12.5px] text-muted">{l.customerName}</span>
                      </td>
                      <td className="px-3 py-2.5"><span className="block text-ink">{l.dispatchedTo}</span><span className="block text-[12.5px] text-muted">{l.department}</span></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatDateTime(l.dispatchedAt)}<span className="block text-[12.5px]">by {name(l.dispatchedBy) ?? 'registry staff'}</span></td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {l.expectedReturnOn ? (
                          <span className={l.overdue ? 'font-semibold text-danger' : 'text-ink'}>
                            {formatDay(l.expectedReturnOn)}
                            {l.overdue ? <span className="block text-[12.5px] font-normal">{late} {late === 1 ? 'day' : 'days'} late</span> : null}
                          </span>
                        ) : <span className="text-muted">No date</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
