import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, upload } from '@/lib/api/client';
import type { DocumentDetail, ReviewView, WorkflowDefinitionView } from '@/lib/api/types';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { formatBytes } from '@/lib/format';

const commentSchema = z.object({ comment: z.string().max(1000, 'Use at most 1000 characters') });

export function NewVersionDialog({ open, onOpenChange, doc, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; doc: DocumentDetail; onDone: () => Promise<unknown>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const form = useForm<z.infer<typeof commentSchema>>({ resolver: zodResolver(commentSchema), defaultValues: { comment: '' } });
  useEffect(() => { if (open) { setFile(null); setFileError(null); setProgress(null); form.reset({ comment: '' }); } }, [open, form]);

  const submit = form.handleSubmit(async ({ comment }) => {
    if (!file) { setFileError('Choose the file for the new version.'); return; }
    const data = new FormData();
    data.append('file', file);
    if (comment.trim()) data.append('comment', comment.trim());
    // Fails with "a newer version was added" instead of silently stacking on someone else's upload.
    data.append('expectedCurrentVersionNo', String(doc.currentVersionNo));
    try {
      setProgress(0);
      await upload<DocumentDetail>(`/documents/${doc.id}/versions`, data, setProgress);
      await onDone();
      toast.success(`Version ${doc.currentVersionNo + 1} uploaded`);
      onOpenChange(false);
    } catch (e) {
      setFileError(e instanceof ApiError ? e.message : 'The upload failed. Try again.');
    } finally {
      setProgress(null);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (progress === null) onOpenChange(o); }} title="Upload new version"
      description={`Version ${doc.currentVersionNo} stays in the history; this becomes version ${doc.currentVersionNo + 1}.`}
      footer={<>
        <Button onClick={() => onOpenChange(false)} disabled={progress !== null}>Cancel</Button>
        <Button variant="primary" type="submit" form="version-form" loading={form.formState.isSubmitting}>Upload new version</Button>
      </>}>
      <form id="version-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field label="File" error={fileError ?? undefined} hint={file ? `${file.name}, ${formatBytes(file.size)}` : 'PDF, Office, images, text or CSV, up to 100 MB'}>
          {(a) => (
            <div className="flex items-center gap-2">
              <Button {...a} onClick={() => input.current?.click()}>{file ? 'Choose another file' : 'Choose file'}</Button>
              <input ref={input} type="file" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); setFileError(null); }} />
            </div>
          )}
        </Field>
        {progress !== null ? (
          <div className="h-1 overflow-hidden rounded bg-navy-100" role="progressbar" aria-label="Upload progress"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full bg-navy-800" style={{ width: `${progress * 100}%` }} />
          </div>
        ) : null}
        <Field label="What changed (optional)" error={form.formState.errors.comment?.message}>
          {(a) => <Textarea {...a} {...form.register('comment')} rows={2} />}
        </Field>
      </form>
    </Dialog>
  );
}

const submitSchema = z.object({
  definitionId: z.string().min(1, 'Choose a workflow'),
  comment: z.string().max(2000, 'Use at most 2000 characters'),
});

export function SubmitReviewDialog({ open, onOpenChange, doc, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; doc: DocumentDetail; onDone: () => Promise<unknown>;
}) {
  const workflows = useQuery({
    queryKey: ['workflows'],
    queryFn: () => api.get<WorkflowDefinitionView[]>('/workflows'),
    enabled: open,
  });
  const active = workflows.data?.filter((w) => w.active) ?? [];
  const form = useForm<z.infer<typeof submitSchema>>({ resolver: zodResolver(submitSchema), defaultValues: { definitionId: '', comment: '' } });
  useEffect(() => { if (open) form.reset({ definitionId: '', comment: '' }); }, [open, form]);
  const chosen = active.find((w) => w.id === form.watch('definitionId'));

  const submit = form.handleSubmit(async (v) => {
    try {
      await api.post<ReviewView>(`/documents/${doc.id}/reviews`, { definitionId: v.definitionId, comment: v.comment.trim() || undefined });
      await onDone();
      toast.success('Submitted for review');
      onOpenChange(false);
    } catch (e) {
      form.setError('definitionId', { message: e instanceof ApiError ? e.message : 'The document could not be submitted. Try again.' });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Submit for review"
      description="While it’s under review the document can’t be edited; reviewers decide on exactly what they see."
      footer={<>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" type="submit" form="submit-review" loading={form.formState.isSubmitting} disabled={!active.length}>Submit for review</Button>
      </>}>
      <form id="submit-review" className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field label="Workflow" error={form.formState.errors.definitionId?.message}
          hint={workflows.isSuccess && !active.length ? 'No workflows have been set up yet. Ask an administrator.' : undefined}>
          {(a) => (
            <Select {...a} {...form.register('definitionId')}>
              <option value="">{workflows.isLoading ? 'Loading…' : 'Choose…'}</option>
              {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          )}
        </Field>
        {chosen ? (
          <ol className="list-decimal space-y-0.5 pl-5 text-[13px] text-muted">
            {chosen.steps.map((s) => <li key={s.order}>{s.name}</li>)}
          </ol>
        ) : null}
        <Field label="Note for reviewers (optional)" error={form.formState.errors.comment?.message}>
          {(a) => <Textarea {...a} {...form.register('comment')} rows={3} />}
        </Field>
      </form>
    </Dialog>
  );
}

/** Optional comment before an action that writes history (restore, resubmit, cancel review). */
export function CommentActionDialog({ open, onOpenChange, title, description, label, actionLabel, danger, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; label: string;
  actionLabel: string; danger?: boolean; onSubmit: (comment: string) => Promise<unknown>;
}) {
  const form = useForm<z.infer<typeof commentSchema>>({ resolver: zodResolver(commentSchema), defaultValues: { comment: '' } });
  useEffect(() => { if (open) form.reset({ comment: '' }); }, [open, form]);
  const submit = form.handleSubmit(async ({ comment }) => {
    try {
      await onSubmit(comment.trim());
      onOpenChange(false);
    } catch (e) {
      form.setError('comment', { message: e instanceof ApiError ? e.message : 'This could not be done. Try again.' });
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} width="sm"
      footer={<>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} type="submit" form="comment-action" loading={form.formState.isSubmitting}>{actionLabel}</Button>
      </>}>
      <form id="comment-action" onSubmit={submit} noValidate>
        <Field label={label} error={form.formState.errors.comment?.message}>
          {(a) => <Input {...a} {...form.register('comment')} />}
        </Field>
      </form>
    </Dialog>
  );
}
