import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api/client';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { todayIso } from '@/lib/format';
import { useDepartments, useRefreshRegistry } from './queries';
import {
  conditionLabel, type DispatchView, type FileSummary, type RequestView, type ReturnCondition, type StatusAction,
} from './types';

/** Server field errors land on the matching inputs; anything else becomes a toast. */
function reportError(e: unknown, setError: (field: never, error: { message: string }) => void) {
  if (e instanceof ApiError && Object.keys(e.fieldErrors).length) {
    for (const [k, m] of Object.entries(e.fieldErrors)) setError(k as never, { message: m });
  } else {
    toast.error(e instanceof ApiError ? e.message : 'The change could not be saved.');
  }
}

const optional = (s: string) => (s.trim() ? s.trim() : null);

// ── Register / edit a file ─────────────────────────────────────────────────

const fileSchema = z.object({
  fileNumber: z.string().trim().min(1, 'Give the number written on the jacket').max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9/._-]*$/, 'Use letters, digits and / . _ - only'),
  volumeNumber: z.coerce.number<string>().int().min(1, 'Volumes start at 1').max(999),
  customerName: z.string().trim().min(1, 'Whose file is it?').max(200),
  departmentId: z.string(),
  dateOpened: z.string().min(1, 'When was it opened?').refine((d) => d <= todayIso(), 'Can’t be in the future'),
  homeLocation: z.string().max(200),
});
type FileValues = z.input<typeof fileSchema>;

export function RegisterFileDialog({ onClose }: { onClose: (created?: FileSummary) => void }) {
  const refresh = useRefreshRegistry();
  const departments = useDepartments();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<FileValues, unknown, z.output<typeof fileSchema>>({
    resolver: zodResolver(fileSchema),
    defaultValues: { fileNumber: '', volumeNumber: '1', customerName: '', departmentId: '', dateOpened: todayIso(), homeLocation: '' },
  });
  const save = useMutation({
    mutationFn: (v: z.output<typeof fileSchema>) => api.post<FileSummary>('/records/files', {
      ...v, departmentId: v.departmentId || null, homeLocation: optional(v.homeLocation),
    }),
    onSuccess: (f) => { toast.success(`Registered ${f.fileNumber}`); refresh(); onClose(f); },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'FILE_NUMBER_TAKEN') setError('fileNumber', { message: e.message });
      else reportError(e, setError as never);
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Register a file" description="Add a paper file jacket to the register."
      footer={<><Button onClick={() => onClose()}>Cancel</Button><Button variant="primary" type="submit" form="file-form" loading={save.isPending}>Register file</Button></>}>
      <form id="file-form" className="grid gap-4 sm:grid-cols-[1fr_7rem]" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="File number" error={errors.fileNumber?.message}>{(a) => <Input {...a} {...register('fileNumber')} placeholder="LN/2026/0142" autoFocus />}</Field>
        <Field label="Volume" error={errors.volumeNumber?.message}>{(a) => <Input {...a} {...register('volumeNumber')} type="number" min={1} />}</Field>
        <Field label="Customer" className="sm:col-span-2" error={errors.customerName?.message}>{(a) => <Input {...a} {...register('customerName')} />}</Field>
        <Field label="Department" className="sm:col-span-2" hint={departments.data?.length === 0 ? 'No departments yet; an administrator can add them.' : undefined}>
          {(a) => (
            <Select {...a} {...register('departmentId')}>
              <option value="">No department</option>
              {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Opened on" error={errors.dateOpened?.message}>{(a) => <Input {...a} {...register('dateOpened')} type="date" max={todayIso()} />}</Field>
        <Field label="Shelf" className="sm:col-span-2" hint="Where the file lives in the registry" error={errors.homeLocation?.message}>
          {(a) => <Input {...a} {...register('homeLocation')} placeholder="Cabinet 4, drawer 2" />}
        </Field>
      </form>
    </Dialog>
  );
}

const editSchema = z.object({
  customerName: z.string().trim().min(1, 'Whose file is it?').max(200),
  departmentId: z.string(),
  homeLocation: z.string().max(200),
});
type EditValues = z.infer<typeof editSchema>;

export function EditFileDialog({ file, onClose }: { file: FileSummary; onClose: () => void }) {
  const refresh = useRefreshRegistry();
  const departments = useDepartments();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { customerName: file.customerName, departmentId: file.departmentId ?? '', homeLocation: file.homeLocation ?? '' },
  });
  const save = useMutation({
    mutationFn: (v: EditValues) => api.patch<FileSummary>(`/records/files/${file.id}`, {
      customerName: v.customerName, departmentId: v.departmentId || null, homeLocation: optional(v.homeLocation),
    }),
    onSuccess: () => { toast.success('Saved'); refresh(); onClose(); },
    onError: (e) => reportError(e, setError as never),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Edit ${file.fileNumber}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="edit-file-form" loading={save.isPending}>Save changes</Button></>}>
      <form id="edit-file-form" className="flex flex-col gap-4" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="Customer" error={errors.customerName?.message}>{(a) => <Input {...a} {...register('customerName')} autoFocus />}</Field>
        <Field label="Department">
          {(a) => (
            <Select {...a} {...register('departmentId')}>
              <option value="">No department</option>
              {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Shelf" hint="Where the file lives in the registry">{(a) => <Input {...a} {...register('homeLocation')} />}</Field>
      </form>
    </Dialog>
  );
}

// ── Lend out ───────────────────────────────────────────────────────────────

const dispatchSchema = z.object({
  dispatchedTo: z.string().trim().min(1, 'Who is taking the file?').max(200),
  department: z.string().trim().min(1, 'Which department?').max(200),
  reason: z.string().max(1000),
  expectedReturnOn: z.string().refine((d) => !d || d >= todayIso(), 'Can’t be in the past'),
});
type DispatchValues = z.infer<typeof dispatchSchema>;

/** Optionally against an approved request, which pre-fills the department and links the loan to it. */
export function DispatchDialog({ file, request, onClose }: { file: FileSummary; request?: RequestView; onClose: () => void }) {
  const refresh = useRefreshRegistry();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<DispatchValues>({
    resolver: zodResolver(dispatchSchema),
    defaultValues: { dispatchedTo: '', department: request?.department ?? '', reason: request?.purpose ?? '', expectedReturnOn: request?.neededBy ?? '' },
  });
  const save = useMutation({
    mutationFn: (v: DispatchValues) => api.post<DispatchView>(`/records/files/${file.id}/dispatch`, {
      ...v, reason: optional(v.reason), expectedReturnOn: v.expectedReturnOn || null, requestId: request?.id ?? null,
    }),
    onSuccess: (d) => { toast.success(`${file.fileNumber} lent to ${d.dispatchedTo}`); refresh(); onClose(); },
    onError: (e) => reportError(e, setError as never),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Lend out ${file.fileNumber}`}
      description={request ? `Against the approved request from ${request.department}.` : 'Record who is taking the file and when it should come back.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="dispatch-form" loading={save.isPending}>Lend out</Button></>}>
      <form id="dispatch-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="Taken by" error={errors.dispatchedTo?.message}>{(a) => <Input {...a} {...register('dispatchedTo')} autoFocus placeholder="Full name" />}</Field>
        <Field label="Department" error={errors.department?.message}>{(a) => <Input {...a} {...register('department')} />}</Field>
        <Field label="Reason (optional)" className="sm:col-span-2">{(a) => <Textarea {...a} {...register('reason')} />}</Field>
        <Field label="Due back" hint="You’ll be reminded each morning once it is late" error={errors.expectedReturnOn?.message}>
          {(a) => <Input {...a} {...register('expectedReturnOn')} type="date" min={todayIso()} />}
        </Field>
      </form>
    </Dialog>
  );
}

// ── Take back ──────────────────────────────────────────────────────────────

const returnSchema = z.object({
  returnedByName: z.string().trim().min(1, 'Who brought it back?').max(200),
  condition: z.enum(['GOOD', 'WORN', 'DAMAGED', 'INCOMPLETE']),
  placement: z.enum(['right', 'wrong']),
  location: z.string().max(200),
  notes: z.string().max(1000),
}).refine((v) => v.placement === 'right' || v.location.trim().length > 0, { path: ['location'], message: 'Say where it was actually put' });
type ReturnValues = z.infer<typeof returnSchema>;

export function ReturnDialog({ file, loan, onClose }: { file: FileSummary; loan: DispatchView | null; onClose: () => void }) {
  const refresh = useRefreshRegistry();
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<ReturnValues>({
    resolver: zodResolver(returnSchema),
    defaultValues: { returnedByName: loan?.dispatchedTo ?? '', condition: 'GOOD', placement: 'right', location: '', notes: '' },
  });
  const wrongPlace = watch('placement') === 'wrong';
  const save = useMutation({
    mutationFn: (v: ReturnValues) => api.post<DispatchView>(`/records/files/${file.id}/return`, {
      returnedByName: v.returnedByName, condition: v.condition, returnedToCorrectLocation: v.placement === 'right',
      location: optional(v.location), notes: optional(v.notes),
    }),
    onSuccess: () => { toast.success(`${file.fileNumber} is back`); refresh(); onClose(); },
    onError: (e) => reportError(e, setError as never),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Take back ${file.fileNumber}`}
      description={loan ? `Lent to ${loan.dispatchedTo} (${loan.department}).` : undefined}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="return-form" loading={save.isPending}>Record return</Button></>}>
      <form id="return-form" className="flex flex-col gap-4" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="Brought back by" error={errors.returnedByName?.message}>{(a) => <Input {...a} {...register('returnedByName')} autoFocus />}</Field>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink">Condition</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px]">
            {(Object.keys(conditionLabel) as ReturnCondition[]).map((c) => (
              <label key={c} className="flex items-center gap-1.5"><input type="radio" value={c} className="accent-navy-800" {...register('condition')} />{conditionLabel[c]}</label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink">Where was it put?</legend>
          <div className="flex flex-col gap-1.5 text-[13.5px]">
            <label className="flex items-center gap-1.5"><input type="radio" value="right" className="accent-navy-800" {...register('placement')} />
              Its usual place{file.homeLocation ? ` (${file.homeLocation})` : ''}</label>
            <label className="flex items-center gap-1.5"><input type="radio" value="wrong" className="accent-navy-800" {...register('placement')} />
              Somewhere else; administrators will be told</label>
          </div>
        </fieldset>
        {wrongPlace ? (
          <Field label="Actually put at" error={errors.location?.message}>{(a) => <Input {...a} {...register('location')} />}</Field>
        ) : null}
        <Field label="Notes (optional)">{(a) => <Textarea {...a} {...register('notes')} />}</Field>
      </form>
    </Dialog>
  );
}

// ── Other status changes ───────────────────────────────────────────────────

const STATUS_COPY: Record<StatusAction, { title: string; verb: string; done: string; location: 'none' | 'optional' | 'required'; note: string; danger?: boolean }> = {
  SHELVE: { title: 'Put back on the shelf', verb: 'Shelve', done: 'Back on the shelf', location: 'optional', note: 'Leave the shelf empty to use its usual place.' },
  RELOCATE: { title: 'Move to another shelf', verb: 'Move file', done: 'Moved', location: 'required', note: 'The move is recorded in the file’s history.' },
  ARCHIVE: { title: 'Archive this file', verb: 'Archive', done: 'Archived', location: 'optional', note: 'Archived files can’t be lent or requested. Only an administrator can bring one back.' },
  FLAG_MISSING: { title: 'Report this file missing', verb: 'Report missing', done: 'Reported missing', location: 'none', note: 'Administrators are told straight away. Say what was found, or not found, when it was looked for.', danger: true },
  RECOVER: { title: 'The file has been found', verb: 'Mark as found', done: 'Back in the registry', location: 'optional', note: 'If it was out on loan, the loan is closed.' },
  RESTORE: { title: 'Restore from the archive', verb: 'Restore', done: 'Restored', location: 'optional', note: 'The file becomes available to lend again.' },
};

export function StatusDialog({ file, action, onClose }: { file: FileSummary; action: StatusAction; onClose: () => void }) {
  const copy = STATUS_COPY[action];
  const refresh = useRefreshRegistry();
  const schema = z.object({
    location: copy.location === 'required' ? z.string().trim().min(1, 'Give the new shelf').max(200) : z.string().max(200),
    notes: action === 'FLAG_MISSING' ? z.string().trim().min(1, 'Say what happened').max(1000) : z.string().max(1000),
  });
  type Values = z.infer<typeof schema>;
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { location: '', notes: '' } });
  const save = useMutation({
    mutationFn: (v: Values) => api.post<FileSummary>(`/records/files/${file.id}/status`, { action, location: optional(v.location), notes: optional(v.notes) }),
    onSuccess: () => { toast.success(`${file.fileNumber}: ${copy.done.toLowerCase()}`); refresh(); onClose(); },
    onError: (e) => reportError(e, setError as never),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={copy.title} description={copy.note}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={copy.danger ? 'danger' : 'primary'} type="submit" form="status-form" loading={save.isPending}>{copy.verb}</Button></>}>
      <form id="status-form" className="flex flex-col gap-4" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        {copy.location !== 'none' ? (
          <Field label={copy.location === 'required' ? 'New shelf' : 'Shelf (optional)'} error={errors.location?.message}>
            {(a) => <Input {...a} {...register('location')} placeholder={file.homeLocation ?? ''} autoFocus />}
          </Field>
        ) : null}
        <Field label={action === 'FLAG_MISSING' ? 'What happened' : 'Notes (optional)'} error={errors.notes?.message}>
          {(a) => <Textarea {...a} {...register('notes')} autoFocus={copy.location === 'none'} />}
        </Field>
      </form>
    </Dialog>
  );
}

// ── Ask for a file ─────────────────────────────────────────────────────────

const requestSchema = z.object({
  department: z.string().trim().min(1, 'Which department needs it?').max(200),
  purpose: z.string().max(1000),
  neededBy: z.string().refine((d) => !d || d >= todayIso(), 'Can’t be in the past'),
});
type RequestValues = z.infer<typeof requestSchema>;

export function RequestFileDialog({ file, onClose }: { file: FileSummary; onClose: () => void }) {
  const refresh = useRefreshRegistry();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<RequestValues>({
    resolver: zodResolver(requestSchema), defaultValues: { department: '', purpose: '', neededBy: '' },
  });
  const save = useMutation({
    mutationFn: (v: RequestValues) => api.post<RequestView>('/records/requests', {
      fileId: file.id, department: v.department, purpose: optional(v.purpose), neededBy: v.neededBy || null,
    }),
    onSuccess: () => { toast.success('Request sent to the registry'); refresh(); onClose(); },
    onError: (e) => reportError(e, setError as never),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Ask for ${file.fileNumber}`}
      description={file.status === 'DISPATCHED' ? 'This file is out on loan right now. The registry will see your request and send it when it’s back.' : 'The registry decides and sends the file to you.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="request-form" loading={save.isPending}>Send request</Button></>}>
      <form id="request-form" className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label="For department" error={errors.department?.message}>{(a) => <Input {...a} {...register('department')} autoFocus />}</Field>
        <Field label="Needed by (optional)" error={errors.neededBy?.message}>{(a) => <Input {...a} {...register('neededBy')} type="date" min={todayIso()} />}</Field>
        <Field label="What it’s for (optional)" className="sm:col-span-2">{(a) => <Textarea {...a} {...register('purpose')} />}</Field>
      </form>
    </Dialog>
  );
}

/** Reject needs a reason (the requester sees it); approving may carry a note. */
export function DecideRequestDialog({ request, approve, onClose }: { request: RequestView; approve: boolean; onClose: () => void }) {
  const refresh = useRefreshRegistry();
  const schema = z.object({ notes: approve ? z.string().max(1000) : z.string().trim().min(1, 'Tell them why').max(1000) });
  type Values = z.infer<typeof schema>;
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { notes: '' } });
  const save = useMutation({
    mutationFn: (v: Values) => api.post<RequestView>(`/records/requests/${request.id}/${approve ? 'approve' : 'reject'}`, { notes: optional(v.notes) }),
    onSuccess: () => { toast.success(approve ? 'Request approved' : 'Request rejected'); refresh(); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${approve ? 'Approve' : 'Reject'} the request for ${request.fileNumber}`}
      description={`From ${request.department}. The requester is told either way.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={approve ? 'primary' : 'danger'} type="submit" form="decide-form" loading={save.isPending}>{approve ? 'Approve' : 'Reject'}</Button></>}>
      <form id="decide-form" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <Field label={approve ? 'Note for the requester (optional)' : 'Reason'} error={errors.notes?.message}>{(a) => <Textarea {...a} {...register('notes')} autoFocus />}</Field>
      </form>
    </Dialog>
  );
}
