import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useCan } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { useDepartments } from '@/features/records/queries';
import type { DepartmentView } from '@/features/records/types';

/** Departments / branches: who owns a paper file, and how registry reports are grouped. */
export function DepartmentsPage() {
  const canManage = useCan('settings:manage');
  const [adding, setAdding] = useState(false);
  const departments = useDepartments();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Departments" crumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Departments' }]}
        actions={canManage ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add department</Button> : null}>
        <p className="mt-1 text-[13.5px] text-muted">Each paper file can belong to a department; registry reports are grouped by them.</p>
      </PageHeader>
      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        {departments.isLoading ? <SkeletonRows cols={2} /> : departments.isError ? <ErrorState error={departments.error} onRetry={() => departments.refetch()} /> :
          departments.data?.length === 0 ? (
            <EmptyState icon={<Building2 className="size-6" />} title="No departments yet"
              action={canManage ? <Button variant="primary" onClick={() => setAdding(true)}>Add department</Button> : undefined}>
              Add the branches or departments that own files, such as Credit or Legal.
            </EmptyState>
          ) : (
            <table className="w-full text-left text-[13.5px]">
              <thead className="border-b border-rule bg-paper text-[12.5px] text-muted">
                <tr><th scope="col" className="px-4 py-2 font-medium">Name</th><th scope="col" className="px-4 py-2 font-medium">Code</th></tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {departments.data?.map((d) => (
                  <tr key={d.id}><td className="px-4 py-2.5 text-ink">{d.name}</td><td className="px-4 py-2.5 font-mono text-[13px] text-muted">{d.code}</td></tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      {adding ? <AddDepartmentDialog onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

const schema = z.object({
  name: z.string().trim().min(1, 'Name the department').max(200),
  code: z.string().trim().min(1, 'Give a short code').max(32).regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, _ and - only'),
});
type Values = z.infer<typeof schema>;

function AddDepartmentDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', code: '' } });
  const save = useMutation({
    mutationFn: (v: Values) => api.post<DepartmentView>('/departments', v),
    onSuccess: (d) => { toast.success(`Added ${d.name}`); void qc.invalidateQueries({ queryKey: ['departments'] }); onClose(); },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'DEPARTMENT_CODE_TAKEN') setError('code', { message: e.message });
      else toast.error(e instanceof ApiError ? e.message : 'The department could not be added.');
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add a department"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="dept-form" loading={save.isPending}>Add department</Button></>}>
      <form id="dept-form" className="grid gap-4 sm:grid-cols-[1fr_9rem]" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="Name" error={errors.name?.message}>{(a) => <Input {...a} {...register('name')} autoFocus placeholder="Credit" />}</Field>
        <Field label="Code" error={errors.code?.message}>{(a) => <Input {...a} {...register('code')} placeholder="CRD" />}</Field>
      </form>
    </Dialog>
  );
}
