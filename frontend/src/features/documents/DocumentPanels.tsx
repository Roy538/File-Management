import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Download, History, RotateCcw } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import type { DocumentDetail, DownloadLink, ProcessingJobView, ReviewView, VersionView } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows, Spinner } from '@/components/ui/States';
import { ProcessingLabel } from '@/components/ui/StatusBadge';
import { formatBytes, formatDateTime, fileKind, humanize } from '@/lib/format';
import { useCan, useSession } from '@/features/auth/session';
import { useDocumentTypes } from '@/features/explorer/queries';
import { compactMetadata, MetadataFields, validateMetadata, type MetadataValues } from '@/features/explorer/MetadataFields';
import { downloadVersion, explainContentError } from './documentApi';
import { CommentActionDialog } from './DocumentDialogs';

const editable = (d: DocumentDetail) => d.rights.includes('edit') && d.status !== 'ARCHIVED' && d.status !== 'UNDER_REVIEW';

// ── Preview ───────────────────────────────────────────────────────────────

export function PreviewPanel({ doc }: { doc: DocumentDetail }) {
  const current = doc.versions.find((v) => v.versionNo === doc.currentVersionNo);
  const kind = fileKind(current?.contentType);
  const previewable = kind === 'pdf' || kind === 'image';
  const ready = current?.processingStatus === 'AVAILABLE';
  // Each link is recorded as a preview in the audit trail and lives 5 minutes, so fetch only when shown.
  const link = useQuery({
    queryKey: ['document', doc.id, 'preview', doc.currentVersionNo],
    queryFn: () => api.get<DownloadLink>(`/documents/${doc.id}/content-url`, { version: doc.currentVersionNo, inline: true }),
    enabled: previewable && ready && doc.rights.includes('download'),
    staleTime: 4 * 60_000,
    gcTime: 4 * 60_000,
  });

  if (!current) return null;
  if (!doc.rights.includes('download')) return <EmptyState title="Preview isn’t available to you">You can see this document’s details but not open its file.</EmptyState>;
  if (!ready) {
    return (
      <EmptyState title={current.processingStatus === 'STORED' || current.processingStatus === 'PROCESSING' ? 'Checking the file' : 'This version is blocked'}>
        <span className="flex flex-col items-center gap-2">
          <ProcessingLabel status={current.processingStatus} />
          {current.processingStatus === 'QUARANTINED' ? 'It failed the virus scan and can’t be opened.'
            : current.processingStatus === 'FAILED' ? 'It couldn’t be scanned, so it is blocked until an administrator reprocesses it.'
            : 'Every upload is virus-scanned first; this usually takes a few seconds.'}
        </span>
      </EmptyState>
    );
  }
  if (!previewable) {
    return (
      <EmptyState title="No preview for this file type" action={<Button icon={<Download className="size-4" />} onClick={() => downloadVersion(doc.id)}>Download</Button>}>
        Download it to open it in the application it was made with.
      </EmptyState>
    );
  }
  if (link.isLoading) return <div className="grid h-96 place-items-center"><Spinner label="Opening preview" /></div>;
  if (link.isError) return <p role="alert" className="px-6 py-10 text-center text-sm text-danger">{explainContentError(link.error)}</p>;
  if (!link.data) return null;
  return kind === 'pdf' ? (
    <iframe title={`Preview of ${doc.title}`} src={link.data.url} className="h-[75vh] w-full rounded-b-lg bg-paper" />
  ) : (
    <div className="flex justify-center bg-paper p-4"><img src={link.data.url} alt={`Preview of ${doc.title}`} className="max-h-[75vh] max-w-full object-contain" /></div>
  );
}

// ── Details & metadata ────────────────────────────────────────────────────

const titleSchema = z.object({ title: z.string().trim().min(1, 'Enter a title').max(300, 'Use at most 300 characters') });

export function DetailsPanel({ doc, onSaved }: { doc: DocumentDetail; onSaved: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const types = useDocumentTypes();
  const typeName = types.data?.find((t) => t.id === doc.documentTypeId)?.name;

  if (editing) return <DetailsForm doc={doc} onDone={async (saved) => { if (saved) await onSaved(); setEditing(false); }} />;
  return (
    <div className="p-5">
      <dl className="grid gap-x-8 gap-y-3 text-[13.5px] sm:grid-cols-[180px_1fr]">
        <dt className="text-muted">Document type</dt><dd>{doc.documentTypeId ? typeName ?? '…' : 'Unclassified'}</dd>
        {doc.metadata.map((m) => (
          <div key={m.key} className="contents">
            <dt className="text-muted">{m.label}</dt>
            <dd>{m.value === null ? <span className="text-subtle">Not recorded</span> : m.dataType === 'BOOLEAN' ? (m.value === 'true' ? 'Yes' : 'No') : m.value}</dd>
          </div>
        ))}
        <dt className="text-muted">Current version</dt><dd>v{doc.currentVersionNo}</dd>
        <dt className="text-muted">Created</dt><dd>{formatDateTime(doc.createdAt)}</dd>
        <dt className="text-muted">Last changed</dt><dd>{formatDateTime(doc.updatedAt)}</dd>
        {doc.archivedAt ? <><dt className="text-muted">Archived</dt><dd>{formatDateTime(doc.archivedAt)}</dd></> : null}
      </dl>
      {editable(doc) ? <Button className="mt-5" onClick={() => setEditing(true)}>Edit details</Button> : null}
    </div>
  );
}

function DetailsForm({ doc, onDone }: { doc: DocumentDetail; onDone: (saved: boolean) => void }) {
  const types = useDocumentTypes();
  const [typeId, setTypeId] = useState(doc.documentTypeId ?? '');
  const [metadata, setMetadata] = useState<MetadataValues>(() =>
    Object.fromEntries(doc.metadata.filter((m) => m.value !== null).map((m) => [m.key, m.value as string])));
  const [metaErrors, setMetaErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const form = useForm<z.infer<typeof titleSchema>>({ resolver: zodResolver(titleSchema), defaultValues: { title: doc.title } });
  const type = types.data?.find((t) => t.id === typeId);

  const save = form.handleSubmit(async ({ title }) => {
    const errors = type ? validateMetadata(type.fields, metadata) : {};
    setMetaErrors(errors);
    if (Object.keys(errors).length) return;
    try {
      await api.put(`/documents/${doc.id}`, {
        title, documentTypeId: typeId || null, metadata: typeId ? compactMetadata(metadata) : {}, entityVersion: doc.entityVersion,
      });
      toast.success('Details saved');
      onDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONCURRENT_MODIFICATION') setConflict(true);
      else if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setMetaErrors(e.fieldErrors);
      else form.setError('title', { message: e instanceof ApiError ? e.message : 'The details could not be saved. Try again.' });
    }
  });

  return (
    <form className="flex flex-col gap-4 p-5" onSubmit={save} noValidate>
      {conflict ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[13px] text-warn">
          Someone else changed this document while you were editing. Reload to see their changes, then edit again.
          <Button size="sm" onClick={() => onDone(true)}>Reload</Button>
        </div>
      ) : null}
      <Field label="Title" error={form.formState.errors.title?.message}>
        {(a) => <Input {...a} {...form.register('title')} />}
      </Field>
      <Field label="Document type">
        {(a) => (
          <Select {...a} value={typeId} onChange={(e) => { setTypeId(e.target.value); setMetaErrors({}); }}>
            <option value="">Unclassified</option>
            {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        )}
      </Field>
      {type ? <MetadataFields fields={type.fields} values={metadata} errors={metaErrors} onChange={(k, v) => setMetadata((m) => ({ ...m, [k]: v }))} /> : null}
      <div className="flex gap-2">
        <Button variant="primary" type="submit" loading={form.formState.isSubmitting}>Save details</Button>
        <Button onClick={() => onDone(false)}>Cancel</Button>
      </div>
    </form>
  );
}

// ── Versions ──────────────────────────────────────────────────────────────

export function VersionsPanel({ doc, onChanged }: { doc: DocumentDetail; onChanged: () => Promise<unknown> }) {
  const me = useSession((s) => s.user?.id);
  const [restoring, setRestoring] = useState<VersionView | null>(null);
  const canDownload = doc.rights.includes('download');
  return (
    <>
      <table className="w-full text-left text-[13.5px]">
        <thead className="border-b border-rule text-[12.5px] text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Version</th>
            <th scope="col" className="px-3 py-2 font-medium">File</th>
            <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Note</th>
            <th scope="col" className="px-3 py-2 font-medium">Added</th>
            <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {doc.versions.map((v) => (
            <tr key={v.versionNo}>
              <td className="px-4 py-2.5 align-top">
                <span className="font-medium tabular-nums">v{v.versionNo}</span>
                {v.versionNo === doc.currentVersionNo ? <span className="ml-2 text-[12px] text-ok">Current</span> : null}
              </td>
              <td className="max-w-56 px-3 py-2.5 align-top">
                <p className="truncate">{v.fileName}</p>
                <p className="text-[12px] text-muted">{formatBytes(v.sizeBytes)}</p>
                {v.processingStatus !== 'AVAILABLE' ? <ProcessingLabel status={v.processingStatus} /> : null}
              </td>
              <td className="hidden px-3 py-2.5 align-top text-muted md:table-cell">
                {v.restoredFromNo ? `Restored from v${v.restoredFromNo}. ` : ''}{v.comment ?? ''}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-muted">
                {formatDateTime(v.createdAt)}
                {v.createdBy === me ? <span className="block text-[12px]">by you</span> : null}
              </td>
              <td className="px-4 py-2.5 text-right align-top">
                <div className="flex justify-end gap-1">
                  {canDownload && v.processingStatus === 'AVAILABLE' ? (
                    <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadVersion(doc.id, v.versionNo)}
                      aria-label={`Download version ${v.versionNo}`} />
                  ) : null}
                  {editable(doc) && v.versionNo !== doc.currentVersionNo && v.processingStatus === 'AVAILABLE' ? (
                    <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setRestoring(v)}>Restore</Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <CommentActionDialog
        open={restoring !== null}
        onOpenChange={(o) => { if (!o) setRestoring(null); }}
        title={`Restore version ${restoring?.versionNo}`}
        description={`A copy of version ${restoring?.versionNo} becomes version ${doc.currentVersionNo + 1}. Nothing in the history is overwritten.`}
        label="Reason (optional)"
        actionLabel="Restore version"
        onSubmit={async (comment) => {
          await api.post(`/documents/${doc.id}/versions/${restoring!.versionNo}/restore`, { comment: comment || undefined });
          await onChanged();
          toast.success('Version restored');
        }}
      />
    </>
  );
}

// ── Reviews ───────────────────────────────────────────────────────────────

const actionText: Record<string, string> = {
  SUBMITTED: 'Submitted for review',
  RESUBMITTED: 'Resubmitted with a new version',
  STEP_OPENED: 'Review step started',
  STEP_COMPLETED: 'Review step completed',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CHANGES_REQUESTED: 'Changes requested',
  COMPLETED: 'Review completed: approved',
  CANCELLED: 'Review cancelled',
  DELEGATED: 'Review task handed to a colleague',
  ESCALATED: 'Overdue, escalated to administrators',
};
const reviewStatus: Record<ReviewView['status'], string> = {
  IN_PROGRESS: 'In progress', CHANGES_REQUESTED: 'Changes requested', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled',
};

export function ReviewsPanel({ doc, onChanged }: { doc: DocumentDetail; onChanged: () => Promise<unknown> }) {
  const user = useSession((s) => s.user);
  const canManageWorkflows = useCan('workflows:manage');
  const reviews = useQuery({ queryKey: ['document', doc.id, 'reviews', doc.status], queryFn: () => api.get<ReviewView[]>(`/documents/${doc.id}/reviews`) });
  const [action, setAction] = useState<{ kind: 'resubmit' | 'cancel'; review: ReviewView } | null>(null);
  const refresh = async () => { await Promise.all([reviews.refetch(), onChanged()]); };

  if (reviews.isLoading) return <SkeletonRows rows={3} cols={3} />;
  if (reviews.isError) return <ErrorState error={reviews.error} onRetry={() => reviews.refetch()} compact />;
  if (!reviews.data?.length) return <EmptyState icon={<History className="size-6" />} title="Not reviewed yet">When this document is submitted for review, each decision is recorded here.</EmptyState>;

  const actor = (id: string | null) => (id === null ? 'automatically' : id === user?.id ? 'by you' : null);

  return (
    <div className="divide-y divide-rule">
      {reviews.data.map((r) => {
        const open = r.status === 'IN_PROGRESS' || r.status === 'CHANGES_REQUESTED';
        const mine = r.initiatedBy === user?.id;
        const openTasks = r.tasks.filter((t) => t.status === 'OPEN');
        const needsNewVersion = doc.currentVersionNo <= r.documentVersionNo;
        const myTask = openTasks.some((t) => !mine && (t.assigneeUserId === user?.id || (t.assigneeRole !== null && t.assigneeRole === user?.role)));
        return (
          <section key={r.id} className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="doc-title text-base">{r.definitionName} <span className="text-[13px] font-normal text-muted">(design v{r.definitionVersionNo}, document v{r.documentVersionNo})</span></h3>
              <span className="text-[13px] font-medium">{reviewStatus[r.status]}</span>
            </div>

            {openTasks.length ? (
              <ul className="mt-3 space-y-1 text-[13px]">
                {openTasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{t.stepName}:</span>
                    <span className="text-muted">
                      waiting for {t.assigneeUserId === user?.id ? 'you' : t.assigneeRole ? `any ${humanize(t.assigneeRole).toLowerCase()}` : 'a named reviewer'}
                      {t.dueAt ? `, due ${formatDateTime(t.dueAt)}` : ''}
                    </span>
                    {t.overdue ? <span className="text-danger">Overdue</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <ol className="mt-4 border-l-2 border-rule pl-4">
              {r.history.map((e, i) => (
                <li key={i} className="relative pb-3 last:pb-0">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-navy-700" aria-hidden />
                  <p className="text-[13.5px]">{actionText[e.action] ?? humanize(e.action)} {actor(e.actorId) ? <span className="text-muted">{actor(e.actorId)}</span> : null}</p>
                  {e.comment && e.action !== 'STEP_OPENED' && e.action !== 'STEP_COMPLETED' ? (
                    <p className="mt-0.5 text-[13px] text-muted">“{e.comment}”</p>
                  ) : e.comment ? <p className="mt-0.5 text-[13px] text-muted">{e.comment}</p> : null}
                  <p className="text-[12px] text-subtle">{formatDateTime(e.occurredAt)}</p>
                </li>
              ))}
            </ol>

            {open ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {myTask ? <Link to="/tasks" className="text-[13px] font-medium text-navy-800 underline">Decide in My reviews</Link> : null}
                {r.status === 'CHANGES_REQUESTED' && (mine || doc.rights.includes('edit')) ? (
                  <>
                    <Button size="sm" variant="primary" disabled={needsNewVersion} onClick={() => setAction({ kind: 'resubmit', review: r })}>Resubmit for review</Button>
                    {needsNewVersion ? <span className="text-[12.5px] text-muted">Upload a new version with the requested changes first.</span> : null}
                  </>
                ) : null}
                {mine || canManageWorkflows ? (
                  <Button size="sm" onClick={() => setAction({ kind: 'cancel', review: r })}>Cancel review</Button>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
      <CommentActionDialog
        open={action !== null}
        onOpenChange={(o) => { if (!o) setAction(null); }}
        title={action?.kind === 'resubmit' ? 'Resubmit for review' : 'Cancel review'}
        description={action?.kind === 'resubmit'
          ? `The review starts again from the first step, on version ${doc.currentVersionNo}.`
          : 'The document returns to draft and open review tasks are withdrawn.'}
        label={action?.kind === 'resubmit' ? 'What you changed (optional)' : 'Reason (optional)'}
        actionLabel={action?.kind === 'resubmit' ? 'Resubmit for review' : 'Cancel review'}
        danger={action?.kind === 'cancel'}
        onSubmit={async (comment) => {
          if (!action) return;
          await api.post(`/reviews/${action.review.id}/${action.kind}`, { comment: comment || undefined });
          await refresh();
          toast.success(action.kind === 'resubmit' ? 'Resubmitted for review' : 'Review cancelled');
        }}
      />
    </div>
  );
}

// ── Processing ────────────────────────────────────────────────────────────

const scanText = { CLEAN: 'No threats found', INFECTED: 'Malware found', SKIPPED: 'Not scanned (scanner not configured)' } as const;
const jobText = { PENDING: 'Queued', RUNNING: 'Running', DONE: 'Finished', DEAD: 'Gave up after retries' } as const;

export function ProcessingPanel({ doc }: { doc: DocumentDetail }) {
  const jobs = useQuery({
    // Keyed on the document's state so it refreshes whenever the document does (e.g. after a scan).
    queryKey: ['document', doc.id, 'processing', doc.updatedAt, doc.versions[0]?.processingStatus],
    queryFn: () => api.get<ProcessingJobView[]>(`/documents/${doc.id}/processing`),
  });
  if (jobs.isLoading) return <SkeletonRows rows={3} cols={4} />;
  if (jobs.isError) return <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} compact />;
  if (!jobs.data?.length) return <EmptyState title="No processing recorded">Files are scanned and indexed after upload.</EmptyState>;
  return (
    <table className="w-full text-left text-[13.5px]">
      <thead className="border-b border-rule text-[12.5px] text-muted">
        <tr>
          <th scope="col" className="px-4 py-2 font-medium">Version</th>
          <th scope="col" className="px-3 py-2 font-medium">Virus scan</th>
          <th scope="col" className="px-3 py-2 font-medium">Search text</th>
          <th scope="col" className="px-3 py-2 font-medium">Status</th>
          <th scope="col" className="hidden px-4 py-2 font-medium md:table-cell">Note</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule">
        {jobs.data.map((j) => (
          <tr key={j.versionNo}>
            <td className="px-4 py-2.5 tabular-nums">v{j.versionNo}</td>
            <td className={j.scanResult === 'INFECTED' ? 'px-3 py-2.5 text-danger' : 'px-3 py-2.5'}>{j.scanResult ? scanText[j.scanResult] : '—'}</td>
            <td className="px-3 py-2.5 text-muted">{j.extractedChars ? `${j.extractedChars.toLocaleString()} characters indexed` : j.jobStatus === 'DONE' ? 'No text found' : '—'}</td>
            <td className="px-3 py-2.5">
              {jobText[j.jobStatus]}{j.attempts > 1 ? <span className="text-muted"> ({j.attempts} attempts)</span> : null}
              <span className="block"><ProcessingLabel status={j.versionStatus} /></span>
            </td>
            <td className="hidden px-4 py-2.5 text-muted md:table-cell">{j.note ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
