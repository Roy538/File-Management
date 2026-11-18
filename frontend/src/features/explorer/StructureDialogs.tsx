import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/lib/api/client';
import type { Visibility } from '@/lib/api/types';

const nameSchema = z.object({ name: z.string().trim().min(1, 'Enter a name').max(200, 'Use at most 200 characters') });

/** One dialog for every "give it a name" action: new folder, new sub-divider, rename. */
export function NameDialog({ open, onOpenChange, title, description, label, submitLabel, initial = '', onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  submitLabel: string;
  initial?: string;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const form = useForm<z.infer<typeof nameSchema>>({ resolver: zodResolver(nameSchema), defaultValues: { name: initial } });
  useEffect(() => { if (open) form.reset({ name: initial }); }, [open, initial, form]);

  const submit = form.handleSubmit(async ({ name }) => {
    try {
      await onSubmit(name);
      onOpenChange(false);
    } catch (e) {
      form.setError('name', { message: e instanceof ApiError ? e.message : 'This could not be saved. Try again.' });
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      width="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="name-dialog" loading={form.formState.isSubmitting}>{submitLabel}</Button>
        </>
      }
    >
      <form id="name-dialog" onSubmit={submit} noValidate>
        <Field label={label} error={form.formState.errors.name?.message}>
          {(a) => <Input {...a} {...form.register('name')} autoFocus />}
        </Field>
      </form>
    </Dialog>
  );
}

const cabinetSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(200, 'Use at most 200 characters'),
  description: z.string().max(1000, 'Use at most 1000 characters'),
  visibility: z.enum(['DEFAULT', 'PRIVATE', 'PERSONAL']),
});
type CabinetValues = z.infer<typeof cabinetSchema>;

const visibilityHelp: Record<Visibility, string> = {
  DEFAULT: 'Everyone in your organisation, with rights according to their role.',
  PRIVATE: 'Only you, plus people you share it with.',
  PERSONAL: 'Only you (and administrators, for records oversight).',
};

export function CreateCabinetDialog({ open, onOpenChange, canCreateShared, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Organisation-wide (DEFAULT) cabinets are for administrators only. */
  canCreateShared: boolean;
  onSubmit: (v: CabinetValues) => Promise<unknown>;
}) {
  const fallback: Visibility = canCreateShared ? 'DEFAULT' : 'PRIVATE';
  const form = useForm<CabinetValues>({
    resolver: zodResolver(cabinetSchema),
    defaultValues: { name: '', description: '', visibility: fallback },
  });
  useEffect(() => { if (open) form.reset({ name: '', description: '', visibility: fallback }); }, [open, fallback, form]);
  const visibility = form.watch('visibility');

  const submit = form.handleSubmit(async (v) => {
    try {
      await onSubmit(v);
      onOpenChange(false);
    } catch (e) {
      form.setError('name', { message: e instanceof ApiError ? e.message : 'The cabinet could not be created. Try again.' });
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New cabinet"
      description="Cabinets hold folders; who can see a cabinet depends on its visibility."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="cabinet-dialog" loading={form.formState.isSubmitting}>Create cabinet</Button>
        </>
      }
    >
      <form id="cabinet-dialog" className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field label="Name" error={form.formState.errors.name?.message}>
          {(a) => <Input {...a} {...form.register('name')} autoFocus />}
        </Field>
        <Field label="Description (optional)" error={form.formState.errors.description?.message}>
          {(a) => <Textarea {...a} {...form.register('description')} rows={2} />}
        </Field>
        <Field label="Who can see it" hint={visibilityHelp[visibility]}>
          {(a) => (
            <Select {...a} {...form.register('visibility')}>
              {canCreateShared ? <option value="DEFAULT">Whole organisation</option> : null}
              <option value="PRIVATE">Private</option>
              <option value="PERSONAL">Personal</option>
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
