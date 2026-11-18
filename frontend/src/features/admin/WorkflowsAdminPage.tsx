import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import type { Paged, Role, UserView, WorkflowDefinitionView } from '@/lib/api/types';
import { useCan } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { TabbedPanel } from '@/components/ui/TabbedPanel';
import { roleLabel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const ROLES: Role[] = ['ADMIN', 'OFFICER', 'DEPT_USER'];

function useUsers() {
  // ponytail: first 100 users; a typeahead endpoint is needed once organisations exceed that.
  return useQuery({ queryKey: ['users', 'all'], queryFn: () => api.get<Paged<UserView>>('/users', { page: 0, size: 100 }) });
}

export function WorkflowsAdminPage() {
  const canManage = useCan('workflows:manage');
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkflowDefinitionView | 'new' | null>(null);
  const [retiring, setRetiring] = useState<WorkflowDefinitionView | null>(null);
  const defs = useQuery({ queryKey: ['workflows'], queryFn: () => api.get<WorkflowDefinitionView[]>('/workflows') });
  const users = useUsers();
  const nameOf = (id: string) => {
    const u = users.data?.content.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}` : 'Unknown user';
  };
  const selected = defs.data?.find((d) => d.id === selectedId) ?? defs.data?.[0] ?? null;

  const retire = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/workflows/${id}`),
    onSuccess: () => {
      toast.success('Workflow retired');
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      setRetiring(null);
    },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Workflow designs"
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Workflows' }, { label: 'Workflow designs' }]}
        actions={canManage ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>New workflow</Button> : null}
      >
        <p className="mt-1 max-w-2xl text-[13.5px] text-muted">The review steps a document goes through before it’s approved. Nobody can approve a document they submitted.</p>
      </PageHeader>

      {defs.isLoading ? <SkeletonRows cols={3} /> : defs.isError ? <ErrorState error={defs.error} onRetry={() => defs.refetch()} /> :
        defs.data?.length === 0 ? (
          <div className="rounded-lg border border-rule bg-surface">
            <EmptyState icon={<Workflow className="size-6" />} title="No workflows yet"
              action={canManage ? <Button variant="primary" onClick={() => setEditing('new')}>New workflow</Button> : undefined}>
              Design the review steps documents go through, such as a department check followed by a manager’s sign-off.
            </EmptyState>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <ul className="overflow-hidden rounded-lg border border-rule bg-surface" aria-label="Workflows">
              {defs.data?.map((d) => (
                <li key={d.id} className="border-b border-rule last:border-b-0">
                  <button onClick={() => setSelectedId(d.id)} aria-current={selected?.id === d.id}
                    className={cn('w-full px-4 py-3 text-left hover:bg-navy-50/60', selected?.id === d.id && 'bg-navy-50')}>
                    <span className="block font-medium text-ink">{d.name}</span>
                    <span className="block text-[12.5px] text-muted">
                      {d.steps.length} step{d.steps.length === 1 ? '' : 's'}, version {d.currentVersionNo}{d.active ? '' : ', retired'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {selected ? (
              <TabbedPanel tab={selected.name} icon={<Workflow className="size-4" />}
                actions={canManage && selected.active ? (
                  <>
                    <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(selected)}>Edit steps</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setRetiring(selected)}>Retire</Button>
                  </>
                ) : null}>
                <div className="px-5 py-4">
                  {selected.description ? <p className="mb-4 text-[13.5px] text-muted">{selected.description}</p> : null}
                  {!selected.active ? <p className="mb-4 text-[13px] text-warn">Retired: no new documents can be submitted to it.</p> : null}
                  <ol className="relative flex flex-col gap-4">
                    {selected.steps.map((s) => (
                      <li key={s.order} className="flex gap-3">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy-800 text-[12.5px] font-semibold text-white" aria-hidden>{s.order}</span>
                        <div>
                          <p className="font-medium text-ink">{s.name}</p>
                          <p className="text-[13px] text-muted">
                            {s.assigneeRole
                              ? `Anyone who is ${roleLabel(s.assigneeRole, true)} decides`
                              : `${s.approvalMode === 'ALL' ? 'All of' : 'Any one of'} ${s.assigneeUserIds.map(nameOf).join(', ')}`}
                            {s.dueDays !== null ? `, due within ${s.dueDays} day${s.dueDays === 1 ? '' : 's'}` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </TabbedPanel>
            ) : null}
          </div>
        )}

      {editing ? <WorkflowEditor initial={editing === 'new' ? null : editing} users={users.data?.content ?? []} onClose={(id) => { setEditing(null); if (id) setSelectedId(id); }} /> : null}
      <ConfirmDialog open={!!retiring} onOpenChange={(o) => !o && setRetiring(null)} title={`Retire “${retiring?.name}”?`}
        confirmLabel="Retire workflow" danger loading={retire.isPending} onConfirm={() => retiring && retire.mutate(retiring.id)}>
        No new documents can be submitted to it. Reviews already in progress continue to the end.
      </ConfirmDialog>
    </div>
  );
}

const stepSchema = z.object({
  name: z.string().trim().min(1, 'Name the step').max(200),
  assignBy: z.enum(['role', 'people']),
  assigneeRole: z.enum(['ADMIN', 'OFFICER', 'DEPT_USER']),
  assigneeUserIds: z.array(z.string()),
  approvalMode: z.enum(['ANY', 'ALL']),
  dueDays: z.string().regex(/^\d{0,3}$/, 'Whole days only'),
}).refine((s) => s.assignBy === 'role' || s.assigneeUserIds.length > 0, { path: ['assigneeUserIds'], message: 'Choose at least one person' });

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(200),
  description: z.string().max(1000),
  steps: z.array(stepSchema).min(1, 'Add at least one step').max(20, 'At most 20 steps'),
});
type Values = z.infer<typeof schema>;

function toForm(d: WorkflowDefinitionView | null): Values {
  if (!d) return { name: '', description: '', steps: [blankStep()] };
  return {
    name: d.name,
    description: d.description ?? '',
    steps: d.steps.map((s) => ({
      name: s.name,
      assignBy: s.assigneeRole ? 'role' : 'people',
      assigneeRole: s.assigneeRole && s.assigneeRole !== 'SUPER_ADMIN' ? s.assigneeRole : 'OFFICER',
      assigneeUserIds: s.assigneeUserIds,
      approvalMode: s.approvalMode,
      dueDays: s.dueDays === null ? '' : String(s.dueDays),
    })),
  };
}

function blankStep(): Values['steps'][number] {
  return { name: '', assignBy: 'role', assigneeRole: 'OFFICER', assigneeUserIds: [], approvalMode: 'ANY', dueDays: '' };
}

function WorkflowEditor({ initial, users, onClose }: { initial: WorkflowDefinitionView | null; users: UserView[]; onClose: (savedId?: string) => void }) {
  const qc = useQueryClient();
  const { register, control, handleSubmit, watch, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema), defaultValues: toForm(initial),
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'steps' });
  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = {
        name: v.name, description: v.description || null,
        steps: v.steps.map((s) => ({
          name: s.name,
          approvalMode: s.assignBy === 'role' ? 'ANY' : s.approvalMode,
          assigneeRole: s.assignBy === 'role' ? s.assigneeRole : null,
          assigneeUserIds: s.assignBy === 'people' ? s.assigneeUserIds : null,
          dueDays: s.dueDays === '' ? null : Number(s.dueDays),
        })),
      };
      return initial ? api.put<WorkflowDefinitionView>(`/workflows/${initial.id}`, body) : api.post<WorkflowDefinitionView>('/workflows', body);
    },
    onSuccess: (d) => {
      toast.success(initial ? 'Steps saved as a new version' : `Created ${d.name}`);
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      onClose(d.id);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'WORKFLOW_EXISTS') setError('name', { message: e.message });
      else toast.error(e instanceof ApiError ? e.message : 'The workflow could not be saved.');
    },
  });
  const active = users.filter((u) => u.active);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} width="lg"
      title={initial ? `Edit ${initial.name}` : 'New workflow'}
      description={initial ? 'Saving creates version ' + (initial.currentVersionNo + 1) + '. Reviews already running keep the version they started with.' : undefined}
      footer={<>
        <Button onClick={() => onClose()}>Cancel</Button>
        <Button variant="primary" type="submit" form="wf-editor" loading={save.isPending}>{initial ? 'Save new version' : 'Create workflow'}</Button>
      </>}>
      <form id="wf-editor" className="flex flex-col gap-4" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="Name" error={errors.name?.message}>{(a) => <Input {...a} {...register('name')} autoFocus />}</Field>
        <Field label="Description (optional)">{(a) => <Textarea {...a} {...register('description')} />}</Field>
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">Steps, in order</legend>
          {errors.steps?.message || errors.steps?.root?.message ? <p className="mb-2 text-[12.5px] text-danger">{errors.steps?.message ?? errors.steps?.root?.message}</p> : null}
          <ol className="flex flex-col gap-3">
            {fields.map((f, i) => {
              const assignBy = watch(`steps.${i}.assignBy`);
              const fe = errors.steps?.[i];
              return (
                <li key={f.id} className="rounded-md border border-rule p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-navy-800 text-[12px] font-semibold text-white" aria-hidden>{i + 1}</span>
                    <span className="sr-only">Step {i + 1}</span>
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Move step ${i + 1} up`} disabled={i === 0} icon={<ArrowUp className="size-4" />} onClick={() => move(i, i - 1)} />
                      <Button size="sm" variant="ghost" aria-label={`Move step ${i + 1} down`} disabled={i === fields.length - 1} icon={<ArrowDown className="size-4" />} onClick={() => move(i, i + 1)} />
                      <Button size="sm" variant="ghost" aria-label={`Remove step ${i + 1}`} disabled={fields.length === 1} icon={<Trash2 className="size-4" />} onClick={() => remove(i)} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                    <Field label="Step name" error={fe?.name?.message}>{(a) => <Input {...a} {...register(`steps.${i}.name`)} placeholder="Department review" />}</Field>
                    <Field label="Due within (days)" hint="Optional" error={fe?.dueDays?.message}>{(a) => <Input {...a} inputMode="numeric" {...register(`steps.${i}.dueDays`)} />}</Field>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-[13.5px]" role="radiogroup" aria-label={`Who decides step ${i + 1}`}>
                    <label className="flex items-center gap-1.5"><input type="radio" value="role" className="accent-navy-800" {...register(`steps.${i}.assignBy`)} /> Anyone with a role</label>
                    <label className="flex items-center gap-1.5"><input type="radio" value="people" className="accent-navy-800" {...register(`steps.${i}.assignBy`)} /> Named people</label>
                  </div>
                  {assignBy === 'role' ? (
                    <Field label="Role" className="mt-3 max-w-xs">
                      {(a) => <Select {...a} {...register(`steps.${i}.assigneeRole`)}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</Select>}
                    </Field>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem]">
                      <Controller control={control} name={`steps.${i}.assigneeUserIds`} render={({ field }) => (
                        <fieldset>
                          <legend className="mb-1 text-[13px] font-medium">People</legend>
                          <div className="max-h-40 overflow-y-auto rounded-md border border-rule p-2">
                            {active.length === 0 ? <p className="text-[13px] text-muted">No active users found.</p> : active.map((u) => (
                              <label key={u.id} className="flex items-center gap-2 py-0.5 text-[13.5px]">
                                <input type="checkbox" className="size-4 accent-navy-800" checked={field.value.includes(u.id)}
                                  onChange={(e) => field.onChange(e.target.checked ? [...field.value, u.id] : field.value.filter((x) => x !== u.id))} />
                                {u.firstName} {u.lastName} <span className="text-muted">({roleLabel(u.role, true)})</span>
                              </label>
                            ))}
                          </div>
                          {fe?.assigneeUserIds?.message ? <p className="mt-1 text-[12.5px] text-danger">{fe.assigneeUserIds.message}</p> : null}
                        </fieldset>
                      )} />
                      <Field label="Approval needed from">
                        {(a) => <Select {...a} {...register(`steps.${i}.approvalMode`)}><option value="ANY">Any one of them</option><option value="ALL">All of them</option></Select>}
                      </Field>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <Button className="mt-3" size="sm" icon={<Plus className="size-4" />} onClick={() => append(blankStep())} disabled={fields.length >= 20}>Add a step</Button>
        </fieldset>
      </form>
    </Dialog>
  );
}
