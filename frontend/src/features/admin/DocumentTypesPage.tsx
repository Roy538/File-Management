import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Tags, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import type { DataType, DocumentTypeView } from '@/lib/api/types';
import { useCan } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/States';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { keyFromLabel } from './helpers';

const DATA_TYPES: { value: DataType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
  { value: 'BOOLEAN', label: 'Yes / no' },
  { value: 'ENUM', label: 'Choice from a list' },
];
const typeLabel = (t: DataType) => DATA_TYPES.find((d) => d.value === t)?.label ?? t;

export function DocumentTypesPage() {
  const canManage = useCan('document_types:manage');
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<DocumentTypeView | null>(null);
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ['document-types'], queryFn: () => api.get<DocumentTypeView[]>('/document-types') });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/document-types/${id}`),
    onSuccess: () => {
      toast.success('Document type removed');
      void qc.invalidateQueries({ queryKey: ['document-types'] });
      setRemoving(null);
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Document types"
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Document types' }]}
        actions={canManage ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New document type</Button> : null}
      >
        <p className="mt-1 max-w-2xl text-[13.5px] text-muted">A type says what kind of document something is and which details people record when filing it.</p>
      </PageHeader>

      <div className="rounded-lg border border-rule bg-surface">
        {types.isLoading ? <SkeletonRows cols={3} /> : types.isError ? <ErrorState error={types.error} onRetry={() => types.refetch()} /> :
          types.data?.length === 0 ? (
            <EmptyState icon={<Tags className="size-6" />} title="No document types yet"
              action={canManage ? <Button variant="primary" onClick={() => setCreating(true)}>New document type</Button> : undefined}>
              Create types such as “Offer letter” or “Loan agreement” so documents can be classified and searched by their details.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-rule">
              {types.data?.map((t) => (
                <li key={t.id} className="flex flex-wrap items-start gap-4 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="doc-title text-[16px] text-ink">{t.name}</p>
                    {t.description ? <p className="text-[13px] text-muted">{t.description}</p> : null}
                    {t.fields.length ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {t.fields.map((f) => (
                          <li key={f.id} className="rounded-sm border border-rule bg-paper px-2 py-0.5 text-[12.5px] text-ink">
                            {f.label} <span className="text-muted">({typeLabel(f.dataType).toLowerCase()}{f.required ? ', required' : ''})</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-1 text-[12.5px] text-subtle">No details recorded</p>}
                  </div>
                  {canManage ? (
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setRemoving(t)}>Remove</Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
      </div>

      <CreateTypeDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Remove “${removing?.name}”?`}
        confirmLabel="Remove document type" danger loading={deactivate.isPending} onConfirm={() => removing && deactivate.mutate(removing.id)}>
        New documents can no longer be given this type. Documents that already have it keep it and their recorded details.
      </ConfirmDialog>
    </div>
  );
}

const fieldSchema = z.object({
  label: z.string().trim().min(1, 'Enter a label').max(200),
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'Lowercase letters, digits and _ only, starting with a letter'),
  dataType: z.enum(['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'ENUM']),
  required: z.boolean(),
  allowedValuesText: z.string(),
}).refine((f) => f.dataType !== 'ENUM' || splitValues(f.allowedValuesText).length > 0, {
  path: ['allowedValuesText'], message: 'List at least one choice, one per line',
});

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(200),
  description: z.string().max(1000),
  fields: z.array(fieldSchema).refine((fs) => new Set(fs.map((f) => f.key)).size === fs.length, 'Two details have the same key'),
});
type Values = z.infer<typeof schema>;

function splitValues(text: string): string[] {
  return text.split('\n').map((v) => v.trim()).filter(Boolean);
}

function CreateTypeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { register, control, handleSubmit, watch, setValue, getFieldState, reset, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', fields: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'fields' });

  const create = useMutation({
    mutationFn: (v: Values) => api.post<DocumentTypeView>('/document-types', {
      name: v.name, description: v.description || null,
      fields: v.fields.map((f) => ({
        key: f.key, label: f.label, dataType: f.dataType, required: f.required,
        allowedValues: f.dataType === 'ENUM' ? splitValues(f.allowedValuesText) : null,
      })),
    }),
    onSuccess: (t) => {
      toast.success(`Created ${t.name}`);
      void qc.invalidateQueries({ queryKey: ['document-types'] });
      reset();
      onOpenChange(false);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'DOCUMENT_TYPE_EXISTS') setError('name', { message: e.message });
      else toast.error(e instanceof ApiError ? e.message : 'The document type could not be created.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New document type" width="lg"
      footer={<>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" type="submit" form="create-type" loading={create.isPending}>Create document type</Button>
      </>}>
      <form id="create-type" className="flex flex-col gap-4" onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
        <Field label="Name" error={errors.name?.message}>{(a) => <Input {...a} {...register('name')} placeholder="Offer letter" autoFocus />}</Field>
        <Field label="Description (optional)">{(a) => <Textarea {...a} {...register('description')} />}</Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[13px] font-medium">Details to record</legend>
          {errors.fields?.root?.message || errors.fields?.message ? (
            <p className="text-[12.5px] text-danger">{errors.fields?.root?.message ?? errors.fields?.message}</p>
          ) : null}
          {fields.length === 0 ? <p className="text-[13px] text-muted">None yet. Add details such as an employee number or start date.</p> : null}
          {fields.map((f, i) => {
            const dataType = watch(`fields.${i}.dataType`);
            const fe = errors.fields?.[i];
            return (
              <div key={f.id} className="grid gap-3 rounded-md border border-rule p-3 sm:grid-cols-[1fr_1fr_10rem_auto]">
                <Field label="Label" error={fe?.label?.message}>
                  {(a) => (
                    <Input {...a} {...register(`fields.${i}.label`, {
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        // Suggest the key until the person edits it themselves.
                        if (!getFieldState(`fields.${i}.key`).isDirty) setValue(`fields.${i}.key`, keyFromLabel(e.target.value));
                      },
                    })} />
                  )}
                </Field>
                <Field label="Key" hint="Used in search and exports" error={fe?.key?.message}>
                  {(a) => <Input {...a} {...register(`fields.${i}.key`)} />}
                </Field>
                <Field label="Kind">
                  {(a) => <Select {...a} {...register(`fields.${i}.dataType`)}>{DATA_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</Select>}
                </Field>
                <div className="flex items-end gap-2 pb-1.5">
                  <label className="flex items-center gap-1.5 text-[13px]">
                    <input type="checkbox" className="size-4 accent-navy-800" {...register(`fields.${i}.required`)} /> Required
                  </label>
                  <Button size="sm" variant="ghost" aria-label={`Remove detail ${i + 1}`} icon={<Trash2 className="size-4" />} onClick={() => remove(i)} />
                </div>
                {dataType === 'ENUM' ? (
                  <Field label="Choices, one per line" error={fe?.allowedValuesText?.message} className="sm:col-span-4">
                    {(a) => <Textarea {...a} {...register(`fields.${i}.allowedValuesText`)} />}
                  </Field>
                ) : null}
              </div>
            );
          })}
          <div>
            <Button size="sm" icon={<Plus className="size-4" />}
              onClick={() => append({ label: '', key: '', dataType: 'TEXT', required: false, allowedValuesText: '' })}>
              Add a detail
            </Button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
