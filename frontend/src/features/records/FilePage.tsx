import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Archive, ArchiveRestore, ArrowLeftRight, BookOpen, CornerDownLeft, FileQuestion, FolderInput, History, MapPin,
  Pencil, Search, Send,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useCan } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, SkeletonRows } from '@/components/ui/States';
import { TabbedPanel } from '@/components/ui/TabbedPanel';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePeople } from '@/lib/usePeople';
import { daysBetween, formatDateTime, formatDay, todayIso } from '@/lib/format';
import { cn } from '@/lib/cn';
import { FileStatusBadge } from './FileStatusBadge';
import {
  DecideRequestDialog, DispatchDialog, EditFileDialog, RequestFileDialog, ReturnDialog, StatusDialog,
} from './RecordDialogs';
import { useRefreshRegistry } from './queries';
import {
  conditionLabel, movementLabel, requestStatusLabel, whereText,
  type DispatchView, type FileDetail, type MovementAction, type RequestView, type StatusAction,
} from './types';

type Open =
  | { kind: 'dispatch'; request?: RequestView }
  | { kind: 'return' }
  | { kind: 'edit' }
  | { kind: 'request' }
  | { kind: 'status'; action: StatusAction }
  | { kind: 'decide'; request: RequestView; approve: boolean }
  | null;

export function FilePage() {
  const { id = '' } = useParams();
  const [open, setOpen] = useState<Open>(null);
  const detail = useQuery({ queryKey: ['records', 'file', id], queryFn: () => api.get<FileDetail>(`/records/files/${id}`) });
  const loans = useQuery({ queryKey: ['records', 'file', id, 'loans'], queryFn: () => api.get<DispatchView[]>(`/records/files/${id}/dispatches`) });
  const d = detail.data;
  const name = usePeople([
    ...(d?.movements.map((m) => m.performedBy) ?? []),
    ...(d?.activeRequests.map((r) => r.requestedBy) ?? []),
    ...(loans.data?.flatMap((l) => [l.dispatchedBy, l.receivedBy]) ?? []),
  ]);

  if (detail.isLoading) return <div className="mx-auto max-w-6xl"><SkeletonRows cols={3} /></div>;
  if (detail.isError || !d) return <div className="mx-auto max-w-6xl"><ErrorState error={detail.error} onRetry={() => detail.refetch()} /></div>;

  const f = d.file;
  const can = (a: string) => d.allowedActions.includes(a as never);
  const loan = d.openDispatch;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={<span className="flex flex-wrap items-baseline gap-x-3"><span className="font-mono">{f.fileNumber}</span>{f.volumeNumber > 1 ? <span className="text-[18px] text-muted">vol. {f.volumeNumber}</span> : null}</span>}
        crumbs={[{ label: 'Home', to: '/' }, { label: 'File register', to: '/records' }, { label: f.fileNumber }]}
        actions={<FileActions can={can} onOpen={setOpen} />}
      >
        <p className="mt-1 text-[15px] text-ink">{f.customerName}</p>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <WhereNow detail={d} name={name} />

          {d.activeRequests.length ? (
            <TabbedPanel tab="Requests for this file" icon={<FileQuestion className="size-4" />}>
              <ul className="divide-y divide-rule">
                {d.activeRequests.map((r) => (
                  <RequestRow key={r.id} request={r} name={name} fileAvailable={f.status === 'AVAILABLE'} onOpen={setOpen} />
                ))}
              </ul>
            </TabbedPanel>
          ) : null}

          <TabbedPanel tab="Loans" icon={<ArrowLeftRight className="size-4" />}>
            {loans.isLoading ? <SkeletonRows rows={2} cols={4} /> : !loans.data?.length ? (
              <p className="px-4 py-5 text-[13.5px] text-muted">Never lent out.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13.5px]">
                  <thead className="border-b border-rule bg-paper text-[12.5px] text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Lent to</th>
                      <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Out</th>
                      <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">Back</th>
                      <th scope="col" className="px-4 py-2 font-medium">Came back</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {loans.data.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5"><span className="block text-ink">{l.dispatchedTo}</span><span className="block text-[12.5px] text-muted">{l.department}</span></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatDateTime(l.dispatchedAt)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted">{l.returnedAt ? formatDateTime(l.returnedAt) : <span className={l.overdue ? 'font-medium text-danger' : 'text-info'}>{l.overdue ? 'Overdue' : 'Still out'}</span>}</td>
                        <td className="px-4 py-2.5 text-[13px] text-muted">
                          {l.returnedAt ? [
                            l.returnCondition ? conditionLabel[l.returnCondition] : null,
                            l.returnedToCorrectLocation === false ? `put at ${l.returnLocation}` : null,
                            l.returnNotes,
                          ].filter(Boolean).join(' · ') || '—' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabbedPanel>
        </div>

        <aside className="flex flex-col gap-6">
          <TabbedPanel tab="File details" icon={<BookOpen className="size-4" />}>
            <dl className="divide-y divide-rule text-[13.5px]">
              <Fact label="Customer">{f.customerName}</Fact>
              <Fact label="Department">{f.departmentName ?? 'None'}</Fact>
              <Fact label="Opened">{formatDay(f.dateOpened)}</Fact>
              <Fact label="Usual shelf">{f.homeLocation ?? 'Not set'}</Fact>
            </dl>
          </TabbedPanel>
          <History_ fileId={f.id} movements={d.movements} name={name} />
        </aside>
      </div>

      {open?.kind === 'dispatch' ? <DispatchDialog file={f} request={open.request} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'return' ? <ReturnDialog file={f} loan={loan} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'edit' ? <EditFileDialog file={f} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'request' ? <RequestFileDialog file={f} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'status' ? <StatusDialog file={f} action={open.action} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'decide' ? <DecideRequestDialog request={open.request} approve={open.approve} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/** Primary action first (what the file's state calls for), the rest as quieter buttons. */
function FileActions({ can, onOpen }: { can: (a: string) => boolean; onOpen: (o: Open) => void }) {
  const items: Array<{ key: string; label: string; icon: ReactNode; open: Open; primary?: boolean; danger?: boolean }> = [
    { key: 'RETURN', label: 'Take back', icon: <CornerDownLeft className="size-4" />, open: { kind: 'return' }, primary: true },
    { key: 'SHELVE', label: 'Put on shelf', icon: <FolderInput className="size-4" />, open: { kind: 'status', action: 'SHELVE' }, primary: true },
    { key: 'DISPATCH', label: 'Lend out', icon: <Send className="size-4" />, open: { kind: 'dispatch' }, primary: true },
    { key: 'RECOVER', label: 'Mark as found', icon: <Search className="size-4" />, open: { kind: 'status', action: 'RECOVER' }, primary: true },
    { key: 'RESTORE', label: 'Restore', icon: <ArchiveRestore className="size-4" />, open: { kind: 'status', action: 'RESTORE' }, primary: true },
    { key: 'REQUEST', label: 'Ask for this file', icon: <FileQuestion className="size-4" />, open: { kind: 'request' } },
    { key: 'RELOCATE', label: 'Move', icon: <MapPin className="size-4" />, open: { kind: 'status', action: 'RELOCATE' } },
    { key: 'EDIT', label: 'Edit', icon: <Pencil className="size-4" />, open: { kind: 'edit' } },
    { key: 'ARCHIVE', label: 'Archive', icon: <Archive className="size-4" />, open: { kind: 'status', action: 'ARCHIVE' } },
    { key: 'FLAG_MISSING', label: 'Report missing', icon: <FileQuestion className="size-4" />, open: { kind: 'status', action: 'FLAG_MISSING' }, danger: true },
  ];
  const shown = items.filter((i) => can(i.key));
  const primaryKey = shown.find((i) => i.primary)?.key ?? (shown[0]?.key === 'REQUEST' ? 'REQUEST' : undefined);
  return (
    <>
      {shown.map((i) => (
        <Button key={i.key} size="sm" icon={i.icon} onClick={() => onOpen(i.open)}
          variant={i.key === primaryKey ? 'primary' : 'secondary'}
          className={i.danger ? 'text-danger hover:border-danger/50' : undefined}>
          {i.label}
        </Button>
      ))}
    </>
  );
}

/** The one thing staff come here to learn: where the file is right now, and whether it is late. */
function WhereNow({ detail, name }: { detail: FileDetail; name: ReturnType<typeof usePeople> }) {
  const f = detail.file;
  const loan = detail.openDispatch;
  const late = loan?.expectedReturnOn ? daysBetween(loan.expectedReturnOn, todayIso()) : 0;
  return (
    <section aria-label="Where the file is" className={cn('rounded-lg border bg-surface px-5 py-4',
      f.status === 'MISSING' ? 'border-danger/40 bg-danger-bg' : loan?.overdue ? 'border-danger/30' : 'border-rule')}>
      <div className="flex flex-wrap items-center gap-3">
        <FileStatusBadge status={f.status} />
        {whereText(f) ? (
          <span className="inline-flex items-center gap-1.5 text-[14px] text-ink"><MapPin className="size-4 text-muted" aria-hidden />{whereText(f)}</span>
        ) : null}
      </div>
      {loan && f.status === 'DISPATCHED' ? (
        <div className="mt-3 grid gap-x-8 gap-y-2 text-[13.5px] sm:grid-cols-3">
          <div><p className="text-[12.5px] text-muted">With</p><p className="doc-title text-[17px] text-ink">{loan.dispatchedTo}</p><p className="text-muted">{loan.department}</p></div>
          <div><p className="text-[12.5px] text-muted">Since</p><p className="text-ink">{formatDateTime(loan.dispatchedAt)}</p><p className="text-muted">by {name(loan.dispatchedBy) ?? 'registry staff'}</p></div>
          <div>
            <p className="text-[12.5px] text-muted">Due back</p>
            {loan.expectedReturnOn ? (
              <p className={cn('text-ink', loan.overdue && 'font-semibold text-danger')}>
                {formatDay(loan.expectedReturnOn)}{loan.overdue ? `, ${late} ${late === 1 ? 'day' : 'days'} late` : ''}
              </p>
            ) : <p className="text-muted">No date given</p>}
          </div>
          {loan.reason ? <p className="text-muted sm:col-span-3">“{loan.reason}”</p> : null}
        </div>
      ) : f.status === 'MISSING' ? (
        <p className="mt-2 text-[13.5px] text-ink">Nobody knows where this file is. When it turns up, mark it as found.</p>
      ) : f.status === 'RETURNED' ? (
        <p className="mt-2 text-[13.5px] text-muted">Back from loan, waiting to be put on its shelf.</p>
      ) : null}
    </section>
  );
}

function RequestRow({ request: r, name, fileAvailable, onOpen }: {
  request: RequestView; name: ReturnType<typeof usePeople>; fileAvailable: boolean; onOpen: (o: Open) => void;
}) {
  const staff = useCan('records:dispatch');
  const refresh = useRefreshRegistry();
  const [cancelling, setCancelling] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.post<RequestView>(`/records/requests/${r.id}/cancel`),
    onSuccess: () => { toast.success('Request cancelled'); refresh(); setCancelling(false); },
  });
  const who = name(r.requestedBy, { you: 'You' });
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-ink">{who ?? 'Someone'} for {r.department}{r.neededBy ? `, needed by ${formatDay(r.neededBy)}` : ''}</p>
        <p className="text-[12.5px] text-muted">{requestStatusLabel[r.status]}{r.purpose ? ` · ${r.purpose}` : ''}</p>
      </div>
      <div className="flex gap-2">
        {staff && r.status === 'PENDING' && who !== 'You' ? (
          <>
            <Button size="sm" variant="primary" onClick={() => onOpen({ kind: 'decide', request: r, approve: true })}>Approve</Button>
            <Button size="sm" onClick={() => onOpen({ kind: 'decide', request: r, approve: false })}>Reject</Button>
          </>
        ) : null}
        {staff && r.status === 'APPROVED' && fileAvailable ? (
          <Button size="sm" variant="primary" icon={<Send className="size-4" />} onClick={() => onOpen({ kind: 'dispatch', request: r })}>Lend out</Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>Cancel request</Button>
      </div>
      <ConfirmDialog open={cancelling} onOpenChange={setCancelling} title="Cancel this request?" confirmLabel="Cancel request"
        loading={cancel.isPending} onConfirm={() => cancel.mutate()}>
        The registry will no longer send this file for it.
      </ConfirmDialog>
    </li>
  );
}

const MOVEMENT_ICON: Record<MovementAction, ReactNode> = {
  CREATED: <BookOpen className="size-3.5" />,
  DISPATCHED: <Send className="size-3.5" />,
  RETURNED: <CornerDownLeft className="size-3.5" />,
  RELOCATED: <MapPin className="size-3.5" />,
  ARCHIVED: <Archive className="size-3.5" />,
  FLAGGED_MISSING: <FileQuestion className="size-3.5" />,
  RECOVERED: <ArchiveRestore className="size-3.5" />,
  UPDATED: <Pencil className="size-3.5" />,
};

/** The file's history as a ledger, newest first, exactly as recorded (rows are never edited). */
function History_({ fileId, movements, name }: { fileId: string; movements: FileDetail['movements']; name: ReturnType<typeof usePeople> }) {
  const canReport = useCan('reports:read');
  return (
    <TabbedPanel tab="History" icon={<History className="size-4" />}>
      <ol className="relative px-4 py-3">
        {movements.map((m, i) => (
          <li key={m.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < movements.length - 1 ? <span className="absolute left-[11px] top-6 h-[calc(100%-18px)] w-px bg-rule" aria-hidden /> : null}
            <span className={cn('relative grid size-6 shrink-0 place-items-center rounded-full border',
              m.action === 'FLAGGED_MISSING' ? 'border-danger bg-danger-bg text-danger' : 'border-rule-strong bg-paper text-navy-800')} aria-hidden>
              {MOVEMENT_ICON[m.action]}
            </span>
            <div className="min-w-0 text-[13px]">
              <p className="font-medium text-ink">{movementLabel[m.action]}{m.toLocation && m.action !== 'CREATED' ? <span className="font-normal text-muted"> to {m.toLocation}</span> : null}</p>
              {m.notes ? <p className="text-muted">{m.notes}</p> : null}
              <p className="text-[12px] text-subtle">{formatDateTime(m.occurredAt)}{name(m.performedBy) ? ` · ${name(m.performedBy)}` : ''}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="flex flex-wrap justify-between gap-2 border-t border-rule px-4 py-2 text-[12px] text-muted">
        <span>Every change is recorded and can’t be edited.</span>
        {canReport ? <Link to={`/reports?type=movement-history&fileId=${fileId}`} className="text-navy-800 hover:underline">Print or export</Link> : null}
      </p>
    </TabbedPanel>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
