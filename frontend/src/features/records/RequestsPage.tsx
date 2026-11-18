import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileQuestion } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { Paged } from '@/lib/api/types';
import { useCan } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePeople } from '@/lib/usePeople';
import { formatDay, formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';
import { FileStatusBadge } from './FileStatusBadge';
import { DecideRequestDialog } from './RecordDialogs';
import { useRefreshRegistry } from './queries';
import { requestStatusLabel, type RequestStatus, type RequestView } from './types';

const TABS: Array<{ key: string; label: string }> = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'FULFILLED', label: 'Sent' },
  { key: 'all', label: 'All' },
];

/** Registry staff decide every request here; everyone else sees and cancels their own. */
export function RequestsPage() {
  const staff = useCan('records:dispatch');
  const [params, setParams] = useSearchParams();
  const tab = params.get('status') ?? (staff ? 'PENDING' : 'all');
  const status = tab === 'all' ? null : (tab as RequestStatus);
  const page = Number(params.get('page') ?? 0);
  const [deciding, setDeciding] = useState<{ request: RequestView; approve: boolean } | null>(null);
  const [cancelling, setCancelling] = useState<RequestView | null>(null);
  const refresh = useRefreshRegistry();

  const requests = useQuery({
    queryKey: ['records', 'requests', { status, page }],
    queryFn: () => api.get<Paged<RequestView>>('/records/requests', { status, page, size: 25 }),
    placeholderData: keepPreviousData,
  });
  const name = usePeople(requests.data?.content.map((r) => r.requestedBy) ?? []);
  const cancel = useMutation({
    mutationFn: (id: string) => api.post<RequestView>(`/records/requests/${id}/cancel`),
    onSuccess: () => { toast.success('Request cancelled'); refresh(); setCancelling(null); },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={staff ? 'File requests' : 'My file requests'} crumbs={[{ label: 'Home', to: '/' }, { label: 'Registry' }, { label: 'Requests' }]}>
        <p className="mt-1 text-[13.5px] text-muted">
          {staff ? 'Approve or reject requests, then lend the file from its page.' : 'To ask for a file, open it in the file register.'}
        </p>
      </PageHeader>
      <div role="tablist" aria-label="Request status" className="mb-3 flex gap-1 border-b border-rule">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setParams({ status: t.key }, { replace: true })}
            className={cn('-mb-px border-b-2 px-3 py-2 text-[13.5px]', tab === t.key ? 'border-navy-800 font-medium text-navy-800' : 'border-transparent text-muted hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
        {requests.isLoading ? <SkeletonRows cols={4} /> : requests.isError ? <ErrorState error={requests.error} onRetry={() => requests.refetch()} /> :
          requests.data?.content.length === 0 ? (
            <EmptyState icon={<FileQuestion className="size-6" />} title={status === 'PENDING' ? 'Nothing waiting for a decision' : 'No requests here'}>
              {staff ? undefined : <>Find the file in the <Link to="/records" className="text-navy-800 underline">file register</Link> and choose “Ask for this file”.</>}
            </EmptyState>
          ) : (
            <>
              <table className="w-full text-left text-[13.5px]">
                <thead className="border-b border-rule bg-paper text-[12.5px] text-muted">
                  <tr>
                    <th scope="col" className="whitespace-nowrap px-4 py-2 font-medium">File</th>
                    <th scope="col" className="px-3 py-2 font-medium">Asked by</th>
                    <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Needed by</th>
                    <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {requests.data?.content.map((r) => {
                    const who = name(r.requestedBy, { you: 'You' });
                    const mine = who === 'You';
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <Link to={`/records/files/${r.fileId}`} className="font-mono text-[13px] font-medium text-navy-800 hover:underline">{r.fileNumber}</Link>
                          <span className="block max-w-52 truncate text-[12.5px] text-muted">{r.customerName}</span>
                          {r.fileStatus ? <FileStatusBadge status={r.fileStatus} className="mt-1" /> : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="block text-ink">{who ?? 'Someone'}, {r.department}</span>
                          {r.purpose ? <span className="block text-[12.5px] text-muted">{r.purpose}</span> : null}
                          <span className="block text-[12px] text-subtle">{formatRelative(r.createdAt)}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatDay(r.neededBy)}</td>
                        <td className="px-3 py-2.5">
                          <span className="block whitespace-nowrap text-ink">{requestStatusLabel[r.status]}</span>
                          {r.decisionNotes ? <span className="block text-[12.5px] text-muted">“{r.decisionNotes}”</span> : null}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-2">
                            {staff && r.status === 'PENDING' && !mine ? (
                              <>
                                <Button size="sm" variant="primary" onClick={() => setDeciding({ request: r, approve: true })}>Approve</Button>
                                <Button size="sm" onClick={() => setDeciding({ request: r, approve: false })}>Reject</Button>
                              </>
                            ) : null}
                            {staff && r.status === 'APPROVED' ? (
                              <Link to={`/records/files/${r.fileId}`} className="inline-flex h-8 items-center whitespace-nowrap rounded-md bg-navy-800 px-3 text-[13px] font-medium text-white hover:bg-navy-700">Lend out</Link>
                            ) : null}
                            {(r.status === 'PENDING' || r.status === 'APPROVED') && (mine || staff) ? (
                              <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}>Cancel</Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {requests.data ? (
                <Pagination page={requests.data.page} totalPages={requests.data.totalPages} totalElements={requests.data.totalElements}
                  size={requests.data.size} onPage={(p) => setParams({ status: tab, page: String(p) }, { replace: true })} />
              ) : null}
            </>
          )}
      </div>
      {deciding ? <DecideRequestDialog request={deciding.request} approve={deciding.approve} onClose={() => setDeciding(null)} /> : null}
      <ConfirmDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)} title={`Cancel the request for ${cancelling?.fileNumber}?`}
        confirmLabel="Cancel request" loading={cancel.isPending} onConfirm={() => cancelling && cancel.mutate(cancelling.id)}>
        The registry will no longer send the file for it.
      </ConfirmDialog>
    </div>
  );
}
