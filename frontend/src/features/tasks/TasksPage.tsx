import { useState } from 'react';
import { usePeople } from '@/lib/usePeople';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertTriangle, ClipboardCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import type { Decision, Paged, ReviewView, TaskView, UserView } from '@/lib/api/types';
import { formatDate, formatDateTime, humanize, roleLabel } from '@/lib/format';
import { useCan, useSession } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows, Spinner } from '@/components/ui/States';
import { cn } from '@/lib/cn';

/** Open review tasks assigned to me, directly or through my role. */
export function TasksPage() {
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => api.get<TaskView[]>('/tasks') });
  const nameOf = usePeople((tasks.data ?? []).map((t) => t.delegatedFrom));
  const canDelegate = useCan('users:read');
  const [deciding, setDeciding] = useState<TaskView | null>(null);
  const [delegating, setDelegating] = useState<TaskView | null>(null);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="My reviews" crumbs={[{ label: 'Home', to: '/' }, { label: 'My reviews' }]} />
      <div className="rounded-lg border border-rule bg-surface">
        {tasks.isLoading ? <SkeletonRows rows={5} cols={4} />
          : tasks.isError ? <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
          : !tasks.data?.length ? (
            <EmptyState icon={<ClipboardCheck className="size-8" />} title="Nothing is waiting for your review">
              When someone submits a document for a step you’re part of, it will appear here.
            </EmptyState>
          ) : (
            <table className="w-full text-left text-[13.5px]">
              <caption className="sr-only">Documents waiting for your decision</caption>
              <thead className="border-b border-rule text-[12.5px] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Document</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Step</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {tasks.data.map((t) => (
                  <tr key={t.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link to={`/documents/${t.documentId}`} className="doc-title text-[15px] text-ink hover:text-navy-800 hover:underline">
                        {t.documentTitle ?? 'Untitled document'}
                      </Link>
                      {t.delegatedFrom ? <p className="text-[12.5px] text-muted">Delegated to you{nameOf(t.delegatedFrom) ? ` by ${nameOf(t.delegatedFrom)}` : ''}</p> : null}
                      {!t.assigneeUserId && t.assigneeRole ? <p className="text-[12.5px] text-muted">For anyone with the {roleLabel(t.assigneeRole, true)} role</p> : null}
                    </td>
                    <td className="px-4 py-3 text-ink">{t.stepName}</td>
                    <td className="px-4 py-3">
                      {t.dueAt ? (
                        <span className={cn('inline-flex flex-col', t.overdue && 'text-danger')}>
                          <span>{formatDate(t.dueAt)}</span>
                          {t.overdue ? <span className="inline-flex items-center gap-1 text-[12.5px] font-medium"><AlertTriangle className="size-3.5" aria-hidden />Overdue{t.escalatedAt ? ', escalated' : ''}</span> : null}
                        </span>
                      ) : <span className="text-muted">No deadline</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canDelegate ? <Button size="sm" variant="ghost" onClick={() => setDelegating(t)}>Delegate</Button> : null}
                        <Button size="sm" variant="primary" onClick={() => setDeciding(t)}>Decide</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      {deciding ? <DecisionDialog task={deciding} onClose={() => setDeciding(null)} /> : null}
      {delegating ? <DelegateDialog task={delegating} onClose={() => setDelegating(null)} /> : null}
    </div>
  );
}

const DECISIONS: { value: Decision; label: string; help: string; done: string }[] = [
  { value: 'APPROVE', label: 'Approve', help: 'The document moves to the next step, or is approved if this is the last one.', done: 'Approved' },
  { value: 'REQUEST_CHANGES', label: 'Request changes', help: 'The author uploads a revised version and resubmits.', done: 'Changes requested' },
  { value: 'REJECT', label: 'Reject', help: 'The review ends and the document returns to draft.', done: 'Rejected' },
];

const decisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES']),
  comment: z.string().max(2000),
}).refine((v) => v.decision === 'APPROVE' || v.comment.trim().length > 0, {
  path: ['comment'], message: 'Explain what needs to change, so the author can act on it',
});
type DecisionValues = z.infer<typeof decisionSchema>;

/** Turns API refusals into what the reviewer can do about them. */
function explain(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.isForbidden && /submitted/i.test(e.message)) return 'You submitted this document, so someone else has to review it.';
    if (e.isForbidden) return 'This review is no longer assigned to you.';
    if (e.isConflict) return 'Someone has already decided this step. Refresh to see where the review stands.';
    return e.message;
  }
  return 'Your decision could not be saved. Try again.';
}

function DecisionDialog({ task, onClose }: { task: TaskView; onClose: () => void }) {
  const qc = useQueryClient();
  const review = useQuery({ queryKey: ['review', task.instanceId], queryFn: () => api.get<ReviewView>(`/reviews/${task.instanceId}`) });
  const { register, handleSubmit, control, formState: { errors } } = useForm<DecisionValues>({
    resolver: zodResolver(decisionSchema), defaultValues: { decision: 'APPROVE', comment: '' },
  });
  const choice = useWatch({ control, name: 'decision' });
  const meta = DECISIONS.find((d) => d.value === choice)!;
  const decide = useMutation({
    mutationFn: (v: DecisionValues) => api.post<ReviewView>(`/tasks/${task.id}/decision`, { decision: v.decision, comment: v.comment.trim() || null }),
    onSuccess: () => {
      toast.success(meta.done);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['document', task.documentId] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      onClose();
    },
    onError: () => {},
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Review: ${task.documentTitle ?? 'document'}`}
      description={`${task.stepName}${task.dueAt ? `, due ${formatDate(task.dueAt)}` : ''}`}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={choice === 'REJECT' ? 'danger' : 'primary'} loading={decide.isPending} onClick={handleSubmit((v) => decide.mutate(v))}>
          {meta.label}
        </Button>
      </>}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((v) => decide.mutate(v))}>
        <p className="text-[13.5px]">
          <Link to={`/documents/${task.documentId}`} className="font-medium text-navy-800 underline" onClick={onClose}>Open the document</Link>
          <span className="text-muted"> to read it before deciding.</span>
        </p>

        <div>
          <p className="mb-1.5 text-[13px] font-medium">History</p>
          {review.isLoading ? <Spinner /> : review.isError ? <ErrorState compact error={review.error} />
            : (
              <ol className="max-h-36 space-y-1 overflow-y-auto border-l-2 border-rule pl-3 text-[12.5px] text-muted">
                {review.data!.history.filter((h) => h.action !== 'STEP_OPENED').map((h, i) => (
                  <li key={i}>
                    <span className="text-ink">{humanize(h.action)}</span> {formatDateTime(h.occurredAt)}
                    {h.comment ? <span className="block text-ink/80">“{h.comment}”</span> : null}
                  </li>
                ))}
              </ol>
            )}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">Your decision</legend>
          <div className="flex flex-col gap-1.5">
            {DECISIONS.map((d) => (
              <label key={d.value} className={cn('flex cursor-pointer gap-2.5 rounded-md border px-3 py-2',
                choice === d.value ? 'border-navy-700 bg-navy-50' : 'border-rule hover:bg-navy-50/50')}>
                <input type="radio" value={d.value} {...register('decision')} className="mt-1 accent-navy-800" />
                <span>
                  <span className="block text-sm font-medium">{d.label}</span>
                  <span className="block text-[12.5px] text-muted">{d.help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label={choice === 'APPROVE' ? 'Comment (optional)' : 'Reason'} error={errors.comment?.message}>
          {(a) => <Textarea {...a} {...register('comment')} rows={3} />}
        </Field>

        {decide.isError ? <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-[13px] text-danger">{explain(decide.error)}</p> : null}
      </form>
    </Dialog>
  );
}

const delegateSchema = z.object({
  toUserId: z.string().min(1, 'Choose who should review instead'),
  comment: z.string().max(2000),
});
type DelegateValues = z.infer<typeof delegateSchema>;

function DelegateDialog({ task, onClose }: { task: TaskView; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useSession((s) => s.user?.id);
  const users = useQuery({ queryKey: ['users', 'all-active'], queryFn: () => api.get<Paged<UserView>>('/users', { page: 0, size: 100 }) });
  const { register, handleSubmit, formState: { errors } } = useForm<DelegateValues>({
    resolver: zodResolver(delegateSchema), defaultValues: { toUserId: '', comment: '' },
  });
  const delegate = useMutation({
    mutationFn: (v: DelegateValues) => api.post(`/tasks/${task.id}/delegate`, { toUserId: v.toUserId, comment: v.comment.trim() || null }),
    onSuccess: () => {
      toast.success('Delegated');
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
    onError: () => {},
  });
  const candidates = users.data?.content.filter((u) => u.active && u.id !== me) ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Delegate this review"
      description={`${task.documentTitle ?? 'Document'}, ${task.stepName}`}
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={delegate.isPending} onClick={handleSubmit((v) => delegate.mutate(v))}>Delegate</Button>
      </>}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((v) => delegate.mutate(v))}>
        <Field label="Delegate to" hint="They need access to the document to review it." error={errors.toUserId?.message}>
          {(a) => (
            <Select {...a} {...register('toUserId')} disabled={users.isLoading}>
              <option value="">{users.isLoading ? 'Loading people…' : 'Choose a colleague'}</option>
              {candidates.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
            </Select>
          )}
        </Field>
        <Field label="Note (optional)">{(a) => <Textarea {...a} {...register('comment')} rows={2} />}</Field>
        {delegate.isError ? <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-[13px] text-danger">{explain(delegate.error)}</p> : null}
      </form>
    </Dialog>
  );
}
