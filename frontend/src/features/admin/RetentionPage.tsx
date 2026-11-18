import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Archive, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import type { CabinetView, DocumentTypeView, DueDocument } from '@/lib/api/types';
import { useCan } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { TabbedPanel } from '@/components/ui/TabbedPanel';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { describePeriod, toPeriod, type PeriodUnit } from './helpers';
import type { DispositionOutcome, DispositionRunView, EvaluationResult, PolicyView } from './types';

type Tab = 'due' | 'runs' | 'policies' | 'assign';
const TABS: { id: Tab; label: string }[] = [
  { id: 'due', label: 'Due soon' },
  { id: 'runs', label: 'Disposal approvals' },
  { id: 'policies', label: 'Policies' },
  { id: 'assign', label: 'Where policies apply' },
];

export function RetentionPage() {
  const [tab, setTab] = useState<Tab>('due');
  const canManage = useCan('retention:manage');
  const qc = useQueryClient();
  const evaluate = useMutation({
    mutationFn: () => api.post<EvaluationResult>('/retention/evaluate'),
    onSuccess: (r) => {
      const parts = [`${r.archived} archived`, `${r.proposedForDestruction} proposed for disposal`];
      if (r.skippedUnderHold) parts.push(`${r.skippedUnderHold} kept because of a legal hold`);
      toast.success(`Policies applied: ${parts.join(', ')}`);
      void qc.invalidateQueries({ queryKey: ['retention'] });
      if (r.proposedForDestruction) setTab('runs');
    },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Retention"
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Retention' }]}
        actions={canManage ? <Button variant="primary" loading={evaluate.isPending} onClick={() => evaluate.mutate()}>Apply policies now</Button> : null}
      >
        <p className="mt-1 max-w-3xl text-[13.5px] text-muted">
          Documents that reach the end of their retention period are archived automatically every day and become read-only.
          Documents due for disposal are never destroyed automatically: they wait here for your approval.
        </p>
      </PageHeader>

      <div role="tablist" aria-label="Retention" className="mb-4 flex flex-wrap gap-1 border-b border-rule">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cn('-mb-px border-b-2 px-3 py-2 text-[13.5px]', tab === t.id ? 'border-navy-800 font-medium text-navy-800' : 'border-transparent text-muted hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'due' ? <DueList /> : tab === 'runs' ? <Runs canManage={canManage} /> : tab === 'policies' ? <Policies canManage={canManage} /> : <Assignments canManage={canManage} />}
      </div>
    </div>
  );
}

function DueList() {
  const [days, setDays] = useState(30);
  const due = useQuery({ queryKey: ['retention', 'due', days], queryFn: () => api.get<DueDocument[]>('/retention/due', { withinDays: days }) });
  return (
    <div className="rounded-lg border border-rule bg-surface">
      <div className="flex items-center gap-2 border-b border-rule px-4 py-2.5">
        <label htmlFor="due-window" className="text-[13px] text-muted">Due within</label>
        <Select id="due-window" className="h-8 w-36" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={0}>Today</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>A year</option>
        </Select>
      </div>
      {due.isLoading ? <SkeletonRows cols={4} /> : due.isError ? <ErrorState error={due.error} onRetry={() => due.refetch()} /> :
        due.data?.length === 0 ? <EmptyState icon={<Archive className="size-6" />} title="Nothing due in this period" /> : (
          <table className="w-full text-left text-[13.5px]">
            <thead className="border-b border-rule bg-paper text-[12.5px] text-muted">
              <tr><th className="px-4 py-2 font-medium">Document</th><th className="px-4 py-2 font-medium">Policy</th><th className="px-4 py-2 font-medium">Outcome</th><th className="px-4 py-2 font-medium">Due</th></tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {due.data?.map((d) => (
                <tr key={`${d.documentId}-${d.policyId}`}>
                  <td className="px-4 py-2.5"><Link to={`/documents/${d.documentId}`} className="doc-title text-navy-800 hover:underline">{d.title}</Link></td>
                  <td className="px-4 py-2.5 text-muted">{d.policyName}</td>
                  <td className="px-4 py-2.5">
                    {d.onLegalHold ? <span className="text-warn">Kept: legal hold</span> : d.action === 'ARCHIVE' ? 'Archive' : <span className="text-danger">Dispose (after approval)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{formatDate(d.dueAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}

const outcomeLabel: Record<DispositionOutcome, string> = {
  PENDING: 'Awaiting approval', DESTROYED: 'Disposed', SKIPPED_HOLD: 'Kept: legal hold',
  SKIPPED_CHANGED: 'Kept: changed since proposal', SKIPPED_EXCLUDED: 'Kept by you',
};
const runStatus = { PROPOSED: 'Awaiting approval', EXECUTED: 'Carried out', CANCELLED: 'Cancelled' } as const;

function Runs({ canManage }: { canManage: boolean }) {
  const runs = useQuery({ queryKey: ['retention', 'runs'], queryFn: () => api.get<DispositionRunView[]>('/retention/runs') });
  const [openId, setOpenId] = useState<string | null>(null);
  if (runs.isLoading) return <SkeletonRows cols={3} />;
  if (runs.isError) return <ErrorState error={runs.error} onRetry={() => runs.refetch()} />;
  if (!runs.data?.length) {
    return <div className="rounded-lg border border-rule bg-surface"><EmptyState title="No disposal proposals">When documents reach a disposal policy’s deadline, they’re proposed here for your approval.</EmptyState></div>;
  }
  return (
    <div className="flex flex-col gap-6">
      <ul className="overflow-hidden rounded-lg border border-rule bg-surface">
        {runs.data.map((r) => (
          <li key={r.id} className="flex items-center gap-4 border-b border-rule px-4 py-3 last:border-b-0">
            <div className="flex-1">
              <p className="font-medium">Proposed {formatDateTime(r.proposedAt)}</p>
              <p className={cn('text-[13px]', r.status === 'PROPOSED' ? 'text-warn' : 'text-muted')}>
                {runStatus[r.status]}{r.decidedAt ? ` on ${formatDateTime(r.decidedAt)}` : ''}
              </p>
            </div>
            <Button size="sm" onClick={() => setOpenId(r.id)}>{r.status === 'PROPOSED' && canManage ? 'Review' : 'View'}</Button>
          </li>
        ))}
      </ul>
      {openId ? <RunDetail id={openId} canManage={canManage} /> : null}
    </div>
  );
}

function RunDetail({ id, canManage }: { id: string; canManage: boolean }) {
  const qc = useQueryClient();
  const run = useQuery({ queryKey: ['retention', 'runs', id], queryFn: () => api.get<DispositionRunView>(`/retention/runs/${id}`) });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<'approve' | 'cancel' | null>(null);
  const [typed, setTyped] = useState('');
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['retention'] });
    setConfirming(null);
    setTyped('');
  };
  const approve = useMutation({
    mutationFn: () => api.post<DispositionRunView>(`/retention/runs/${id}/approve`, { excludeDocumentIds: [...excluded] }),
    onSuccess: (r) => {
      const n = r.items.filter((i) => i.outcome === 'DESTROYED').length;
      toast.success(`Disposed of ${n} document${n === 1 ? '' : 's'}`);
      done();
    },
  });
  const cancel = useMutation({
    mutationFn: () => api.post<DispositionRunView>(`/retention/runs/${id}/cancel`),
    onSuccess: () => { toast.success('Proposal cancelled'); done(); },
  });

  if (run.isLoading) return <SkeletonRows cols={3} />;
  if (run.isError || !run.data) return <ErrorState error={run.error} onRetry={() => run.refetch()} />;
  const r = run.data;
  const pending = r.status === 'PROPOSED';
  const toDestroy = r.items.filter((i) => i.outcome === 'PENDING' && !excluded.has(i.documentId)).length;

  return (
    <TabbedPanel tab={`Proposal of ${formatDate(r.proposedAt)}`} icon={<Archive className="size-4" />}
      actions={pending && canManage ? (
        <>
          <Button size="sm" onClick={() => setConfirming('cancel')}>Cancel proposal</Button>
          <Button size="sm" variant="danger" disabled={toDestroy === 0} onClick={() => setConfirming('approve')}>Approve disposal</Button>
        </>
      ) : null}>
      {pending ? <p className="border-b border-rule px-4 py-2.5 text-[13px] text-muted">Untick any document you want to keep. Each one is checked again for legal holds and policy changes when you approve.</p> : null}
      <table className="w-full text-left text-[13.5px]">
        <thead className="border-b border-rule bg-paper text-[12.5px] text-muted">
          <tr>{pending ? <th className="w-10 px-4 py-2"><span className="sr-only">Dispose</span></th> : null}<th className="px-4 py-2 font-medium">Document</th><th className="px-4 py-2 font-medium">Due</th><th className="px-4 py-2 font-medium">Result</th></tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {r.items.map((i) => (
            <tr key={i.documentId}>
              {pending ? (
                <td className="px-4 py-2.5">
                  <input type="checkbox" className="size-4 accent-danger" aria-label={`Dispose of ${i.title ?? 'document'}`}
                    checked={!excluded.has(i.documentId)} disabled={!canManage}
                    onChange={(e) => setExcluded((s) => { const n = new Set(s); if (e.target.checked) n.delete(i.documentId); else n.add(i.documentId); return n; })} />
                </td>
              ) : null}
              <td className="px-4 py-2.5">{i.title ? <span className="doc-title">{i.title}</span> : <span className="text-muted">Disposed document</span>}</td>
              <td className="px-4 py-2.5 text-muted">{formatDate(i.dueAt)}</td>
              <td className="px-4 py-2.5">{outcomeLabel[i.outcome]}{i.note ? <span className="block text-[12.5px] text-muted">{i.note}</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmDialog open={confirming === 'approve'} onOpenChange={(o) => { if (!o) { setConfirming(null); setTyped(''); } }}
        title={`Dispose of ${toDestroy} document${toDestroy === 1 ? '' : 's'}?`} confirmLabel="Approve disposal" danger
        loading={approve.isPending} disabled={typed.trim() !== String(toDestroy)} onConfirm={() => approve.mutate()}>
        <p>This permanently deletes their files and extracted text. It cannot be undone. A record of each document and its checksums stays in the audit trail.</p>
        <Field label={`Type ${toDestroy} to confirm`} className="mt-4">
          {(a) => <Input {...a} inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={confirming === 'cancel'} onOpenChange={(o) => !o && setConfirming(null)} title="Cancel this proposal?"
        confirmLabel="Cancel proposal" loading={cancel.isPending} onConfirm={() => cancel.mutate()}>
        Nothing is disposed of. Documents still past their deadline will be proposed again the next time policies are applied.
      </ConfirmDialog>
    </TabbedPanel>
  );
}

const policySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(200),
  description: z.string().max(1000),
  amount: z.string().trim().regex(/^\d{1,3}$/, 'Use a whole number from 0 to 999'),
  unit: z.enum(['D', 'M', 'Y']),
  trigger: z.enum(['CREATED', 'LAST_MODIFIED']),
  action: z.enum(['ARCHIVE', 'DESTROY']),
});
type PolicyValues = z.infer<typeof policySchema>;

function Policies({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const policies = useQuery({ queryKey: ['retention', 'policies'], queryFn: () => api.get<PolicyView[]>('/retention/policies') });
  const [creating, setCreating] = useState(false);
  const [retiring, setRetiring] = useState<PolicyView | null>(null);
  const retire = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/retention/policies/${id}`),
    onSuccess: () => { toast.success('Policy turned off'); void qc.invalidateQueries({ queryKey: ['retention'] }); setRetiring(null); },
  });

  return (
    <>
      <div className="rounded-lg border border-rule bg-surface">
        <div className="flex justify-end border-b border-rule px-4 py-2.5">
          {canManage ? <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New policy</Button> : null}
        </div>
        {policies.isLoading ? <SkeletonRows cols={4} /> : policies.isError ? <ErrorState error={policies.error} onRetry={() => policies.refetch()} /> :
          policies.data?.length === 0 ? <EmptyState title="No retention policies yet">A policy says how long documents are kept and what happens afterwards.</EmptyState> : (
            <table className="w-full text-left text-[13.5px]">
              <thead className="border-b border-rule bg-paper text-[12.5px] text-muted">
                <tr><th className="px-4 py-2 font-medium">Policy</th><th className="px-4 py-2 font-medium">Keep for</th><th className="px-4 py-2 font-medium">Then</th><th className="px-4 py-2 font-medium">Status</th><th className="w-12 px-4 py-2"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {policies.data?.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5"><span className="font-medium">{p.name}</span>{p.description ? <span className="block text-[12.5px] text-muted">{p.description}</span> : null}</td>
                    <td className="px-4 py-2.5">{describePeriod(p.retainFor)} after {p.trigger === 'CREATED' ? 'filing' : 'the last change'}</td>
                    <td className="px-4 py-2.5">{p.action === 'ARCHIVE' ? 'Archive' : <span className="text-danger">Dispose (with approval)</span>}</td>
                    <td className="px-4 py-2.5 text-muted">{p.active ? 'In use' : 'Off'}</td>
                    <td className="px-4 py-1.5 text-right">
                      {canManage && p.active ? <Button size="sm" variant="ghost" aria-label={`Turn off ${p.name}`} icon={<Trash2 className="size-4" />} onClick={() => setRetiring(p)} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      {creating ? <PolicyDialog onClose={() => setCreating(false)} /> : null}
      <ConfirmDialog open={!!retiring} onOpenChange={(o) => !o && setRetiring(null)} title={`Turn off “${retiring?.name}”?`}
        confirmLabel="Turn off policy" danger loading={retire.isPending} onConfirm={() => retiring && retire.mutate(retiring.id)}>
        Documents it covers will no longer be archived or proposed for disposal by it. Nothing already archived changes.
      </ConfirmDialog>
    </>
  );
}

function PolicyDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<PolicyValues>({
    resolver: zodResolver(policySchema),
    defaultValues: { name: '', description: '', amount: '7', unit: 'Y', trigger: 'CREATED', action: 'ARCHIVE' },
  });
  const create = useMutation({
    mutationFn: (v: PolicyValues) => api.post<PolicyView>('/retention/policies', {
      name: v.name, description: v.description || null, retainFor: toPeriod(Number(v.amount), v.unit as PeriodUnit), trigger: v.trigger, action: v.action,
    }),
    onSuccess: (p) => { toast.success(`Created ${p.name}`); void qc.invalidateQueries({ queryKey: ['retention'] }); onClose(); },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'POLICY_EXISTS') setError('name', { message: e.message });
      else toast.error(e instanceof ApiError ? e.message : 'The policy could not be created.');
    },
  });
  const action = watch('action');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="New retention policy"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="policy-form" loading={create.isPending}>Create policy</Button></>}>
      <form id="policy-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
        <Field label="Name" error={errors.name?.message} className="sm:col-span-2">{(a) => <Input {...a} {...register('name')} placeholder="Loan files: 7 years" autoFocus />}</Field>
        <Field label="Keep for" error={errors.amount?.message}>{(a) => <Input {...a} inputMode="numeric" {...register('amount')} />}</Field>
        <Field label="Unit">{(a) => <Select {...a} {...register('unit')}><option value="D">Days</option><option value="M">Months</option><option value="Y">Years</option></Select>}</Field>
        <Field label="Counted from">{(a) => <Select {...a} {...register('trigger')}><option value="CREATED">When the document was filed</option><option value="LAST_MODIFIED">Its last change</option></Select>}</Field>
        <Field label="Then">{(a) => <Select {...a} {...register('action')}><option value="ARCHIVE">Archive (read-only)</option><option value="DESTROY">Dispose of it</option></Select>}</Field>
        {action === 'DESTROY' ? <p className="rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn sm:col-span-2">Disposal is never automatic. Due documents are proposed for approval on this page.</p> : null}
        <Field label="Description (optional)" className="sm:col-span-2">{(a) => <Textarea {...a} {...register('description')} />}</Field>
      </form>
    </Dialog>
  );
}

function Assignments({ canManage }: { canManage: boolean }) {
  const policies = useQuery({ queryKey: ['retention', 'policies'], queryFn: () => api.get<PolicyView[]>('/retention/policies') });
  const cabinets = useQuery({ queryKey: ['cabinets'], queryFn: () => api.get<CabinetView[]>('/cabinets') });
  const types = useQuery({ queryKey: ['document-types'], queryFn: () => api.get<DocumentTypeView[]>('/document-types') });
  const active = policies.data?.filter((p) => p.active) ?? [];
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13.5px] text-muted">A document type’s policy wins over its cabinet’s.</p>
      <AssignTable title="Cabinets" path="cabinets" rows={cabinets.data?.map((c) => ({ id: c.id, name: c.name, policyId: c.retentionPolicyId }))} query={cabinets} policies={policies.data ?? []} active={active} canManage={canManage} />
      <AssignTable title="Document types" path="document-types" rows={types.data?.map((t) => ({ id: t.id, name: t.name, policyId: t.retentionPolicyId }))} query={types} policies={policies.data ?? []} active={active} canManage={canManage} />
    </div>
  );
}

type AssignRowData = { id: string; name: string; policyId: string | null };

function AssignTable({ title, path, rows, query, policies, active, canManage }: {
  title: string; path: 'cabinets' | 'document-types'; rows: AssignRowData[] | undefined;
  query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  policies: PolicyView[]; active: PolicyView[]; canManage: boolean;
}) {
  return (
    <section>
      <h2 className="mb-2 text-[15px] font-semibold">{title}</h2>
      <div className="rounded-lg border border-rule bg-surface">
        {query.isLoading ? <SkeletonRows rows={3} cols={2} /> : query.isError ? <ErrorState compact error={query.error} onRetry={() => void query.refetch()} /> :
          !rows?.length ? <EmptyState title={`No ${title.toLowerCase()} yet`} /> : (
            <ul className="divide-y divide-rule">
              {rows.map((r) => <AssignRow key={r.id} row={r} path={path} policies={policies} active={active} canManage={canManage} />)}
            </ul>
          )}
      </div>
    </section>
  );
}

function AssignRow({ row, path, policies, active, canManage }: {
  row: AssignRowData; path: 'cabinets' | 'document-types'; policies: PolicyView[]; active: PolicyView[]; canManage: boolean;
}) {
  const qc = useQueryClient();
  const [choice, setChoice] = useState('');
  const current = policies.find((p) => p.id === row.policyId);
  const assign = useMutation({
    mutationFn: () => api.put<void>(`/retention/${path}/${row.id}/policy`, { policyId: choice === 'none' ? null : choice }),
    onSuccess: () => {
      toast.success(choice === 'none' ? `Removed the policy from ${row.name}` : `Applied the policy to ${row.name}`);
      setChoice('');
      void qc.invalidateQueries({ queryKey: [path === 'cabinets' ? 'cabinets' : 'document-types'] });
    },
  });
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{row.name}</span>
        <span className="block text-[12.5px] text-muted">
          {current ? `${current.name}${current.active ? '' : ' (inactive)'}` : 'No policy'}
        </span>
      </span>
      {canManage ? (
        <>
          <Select aria-label={`Policy for ${row.name}`} className="h-8 w-60" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">Choose a policy…</option>
            {active.filter((p) => p.id !== row.policyId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {row.policyId ? <option value="none">No policy</option> : null}
          </Select>
          <Button size="sm" disabled={!choice} loading={assign.isPending} onClick={() => assign.mutate()}>Apply</Button>
        </>
      ) : null}
    </li>
  );
}
