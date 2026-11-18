import { useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { FolderOpen, Gavel, Plus, Search, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import type { CabinetTree, CabinetView, SearchResult } from '@/lib/api/types';
import { useCan } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows, Spinner } from '@/components/ui/States';
import { TabbedPanel } from '@/components/ui/TabbedPanel';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { HoldView } from './types';

export function LegalHoldsPage() {
  const canManage = useCan('legal_holds:manage');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const holds = useQuery({ queryKey: ['legal-holds'], queryFn: () => api.get<HoldView[]>('/legal-holds') });
  const selected = selectedId ?? holds.data?.[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Legal holds"
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Administration' }, { label: 'Legal holds' }]}
        actions={canManage ? <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Place a hold</Button> : null}
      >
        <p className="mt-1 max-w-3xl text-[13.5px] text-muted">
          While a hold is active, the documents it covers can’t be deleted or disposed of by any retention policy. They can still be read and archived.
        </p>
      </PageHeader>

      {holds.isLoading ? <SkeletonRows cols={3} /> : holds.isError ? <ErrorState error={holds.error} onRetry={() => holds.refetch()} /> :
        holds.data?.length === 0 ? (
          <div className="rounded-lg border border-rule bg-surface">
            <EmptyState icon={<Gavel className="size-6" />} title="No legal holds"
              action={canManage ? <Button variant="primary" onClick={() => setCreating(true)}>Place a hold</Button> : undefined}>
              Place a hold when documents must be preserved for litigation, an investigation or an audit.
            </EmptyState>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <ul className="self-start overflow-hidden rounded-lg border border-rule bg-surface" aria-label="Legal holds">
              {holds.data?.map((h) => (
                <li key={h.id} className="border-b border-rule last:border-b-0">
                  <button onClick={() => setSelectedId(h.id)} aria-current={selected === h.id}
                    className={cn('w-full px-4 py-3 text-left hover:bg-navy-50/60', selected === h.id && 'bg-navy-50')}>
                    <span className="block font-medium text-ink">{h.name}</span>
                    <span className={cn('block text-[12.5px]', h.active ? 'text-warn' : 'text-muted')}>
                      {h.active ? `Active since ${formatDate(h.createdAt)}` : `Released ${formatDate(h.releasedAt)}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {selected ? <HoldDetail id={selected} canManage={canManage} /> : null}
          </div>
        )}

      {creating ? <CreateHoldDialog onClose={(id) => { setCreating(false); if (id) setSelectedId(id); }} /> : null}
    </div>
  );
}

function HoldDetail({ id, canManage }: { id: string; canManage: boolean }) {
  const qc = useQueryClient();
  const hold = useQuery({ queryKey: ['legal-holds', id], queryFn: () => api.get<HoldView>(`/legal-holds/${id}`) });
  const [adding, setAdding] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [removingDoc, setRemovingDoc] = useState<{ id: string; title: string } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['legal-holds'] });
  const remove = useMutation({
    mutationFn: (docId: string) => api.delete<HoldView>(`/legal-holds/${id}/documents/${docId}`),
    onSuccess: () => { toast.success('Removed from the hold'); refresh(); setRemovingDoc(null); },
  });

  if (hold.isLoading) return <SkeletonRows cols={3} />;
  if (hold.isError || !hold.data) return <ErrorState error={hold.error} onRetry={() => hold.refetch()} />;
  const h = hold.data;
  const editable = canManage && h.active;

  return (
    <TabbedPanel tab={h.name} icon={<Gavel className="size-4" />}
      actions={editable ? (
        <>
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add documents</Button>
          <Button size="sm" variant="ghost" onClick={() => setReleasing(true)}>Release hold</Button>
        </>
      ) : null}>
      <dl className="grid gap-x-6 gap-y-2 border-b border-rule px-4 py-3 text-[13.5px] sm:grid-cols-2">
        <div><dt className="text-[12.5px] text-muted">Reason</dt><dd>{h.reason}</dd></div>
        <div><dt className="text-[12.5px] text-muted">Matter reference</dt><dd>{h.matterRef ?? 'None'}</dd></div>
        <div><dt className="text-[12.5px] text-muted">Placed</dt><dd>{formatDateTime(h.createdAt)}</dd></div>
        {h.releasedAt ? <div><dt className="text-[12.5px] text-muted">Released</dt><dd>{formatDateTime(h.releasedAt)}: {h.releaseReason}</dd></div> : null}
      </dl>
      {h.documents.length === 0 ? (
        <EmptyState title="No documents on this hold yet">{editable ? 'Add documents one by one, or everything in a folder.' : undefined}</EmptyState>
      ) : (
        <table className="w-full text-left text-[13.5px]">
          <thead className="border-b border-rule bg-paper text-[12.5px] text-muted">
            <tr><th className="px-4 py-2 font-medium">Document</th><th className="px-4 py-2 font-medium">Added</th>{editable ? <th className="w-12 px-4 py-2"><span className="sr-only">Remove</span></th> : null}</tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {h.documents.map((d) => (
              <tr key={d.documentId}>
                <td className="px-4 py-2.5">
                  {d.title ? <Link to={`/documents/${d.documentId}`} className="doc-title text-navy-800 hover:underline">{d.title}</Link> : <span className="text-muted">Document no longer available</span>}
                </td>
                <td className="px-4 py-2.5 text-muted">{formatDate(d.addedAt)}</td>
                {editable ? (
                  <td className="px-4 py-1.5 text-right">
                    <Button size="sm" variant="ghost" aria-label={`Remove ${d.title ?? 'document'} from the hold`} icon={<X className="size-4" />}
                      onClick={() => setRemovingDoc({ id: d.documentId, title: d.title ?? 'this document' })} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding ? <AddDocumentsDialog holdId={id} onClose={() => setAdding(false)} /> : null}
      {releasing ? <ReleaseDialog hold={h} onClose={() => setReleasing(false)} /> : null}
      <ConfirmDialog open={!!removingDoc} onOpenChange={(o) => !o && setRemovingDoc(null)} title={`Remove “${removingDoc?.title}” from the hold?`}
        confirmLabel="Remove from hold" danger loading={remove.isPending} onConfirm={() => removingDoc && remove.mutate(removingDoc.id)}>
        Unless another hold covers it, it can be deleted or disposed of again under its retention policy.
      </ConfirmDialog>
    </TabbedPanel>
  );
}

const holdSchema = z.object({
  name: z.string().trim().min(1, 'Name the hold').max(200),
  reason: z.string().trim().min(1, 'Say why documents must be preserved').max(1000),
  matterRef: z.string().max(100),
});
type HoldValues = z.infer<typeof holdSchema>;

function CreateHoldDialog({ onClose }: { onClose: (createdId?: string) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<HoldValues>({
    resolver: zodResolver(holdSchema), defaultValues: { name: '', reason: '', matterRef: '' },
  });
  const create = useMutation({
    mutationFn: (v: HoldValues) => api.post<HoldView>('/legal-holds', { ...v, matterRef: v.matterRef || null }),
    onSuccess: (h) => { toast.success(`Placed hold ${h.name}`); void qc.invalidateQueries({ queryKey: ['legal-holds'] }); onClose(h.id); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Place a legal hold" description="You’ll add the documents it covers next."
      footer={<><Button onClick={() => onClose()}>Cancel</Button><Button variant="primary" type="submit" form="hold-form" loading={create.isPending}>Place hold</Button></>}>
      <form id="hold-form" className="flex flex-col gap-4" onSubmit={handleSubmit((v) => create.mutate(v))} noValidate>
        <Field label="Name" error={errors.name?.message}>{(a) => <Input {...a} {...register('name')} placeholder="Smith v. MyCredit" autoFocus />}</Field>
        <Field label="Reason" error={errors.reason?.message}>{(a) => <Textarea {...a} {...register('reason')} />}</Field>
        <Field label="Matter reference (optional)" hint="A case or audit number, if there is one">{(a) => <Input {...a} {...register('matterRef')} />}</Field>
      </form>
    </Dialog>
  );
}

function AddDocumentsDialog({ holdId, onClose }: { holdId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'search' | 'folder'>('search');
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [folderId, setFolderId] = useState('');
  const add = useMutation({
    mutationFn: () => api.post<HoldView>(`/legal-holds/${holdId}/documents`,
      mode === 'search' ? { documentIds: [...picked.keys()] } : { folderId }),
    onSuccess: () => { toast.success('Documents placed on hold'); void qc.invalidateQueries({ queryKey: ['legal-holds'] }); onClose(); },
    onError: (e) => toast.error(e instanceof ApiError && e.code === 'INVALID_REQUEST' ? 'That folder has no documents to hold.' : e instanceof ApiError ? e.message : 'The documents could not be added.'),
  });
  const ready = mode === 'search' ? picked.size > 0 : !!folderId;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add documents to the hold" width="lg"
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!ready} loading={add.isPending} onClick={() => add.mutate()}>
          {mode === 'search' ? `Place ${picked.size || ''} on hold` : 'Place folder on hold'}
        </Button>
      </>}>
      <div role="radiogroup" aria-label="How to choose documents" className="mb-4 flex gap-4 text-[13.5px]">
        <label className="flex items-center gap-1.5"><input type="radio" className="accent-navy-800" checked={mode === 'search'} onChange={() => setMode('search')} /> Find documents</label>
        <label className="flex items-center gap-1.5"><input type="radio" className="accent-navy-800" checked={mode === 'folder'} onChange={() => setMode('folder')} /> Everything in a folder</label>
      </div>
      {mode === 'search' ? <PickBySearch picked={picked} setPicked={setPicked} /> : <PickFolder folderId={folderId} setFolderId={setFolderId} />}
    </Dialog>
  );
}

function PickBySearch({ picked, setPicked }: { picked: Map<string, string>; setPicked: (m: Map<string, string>) => void }) {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const results = useQuery({
    queryKey: ['search', 'hold-picker', q],
    queryFn: () => api.get<SearchResult>('/search', { q, size: 25 }),
    enabled: q.length > 0,
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setQ(input.trim()); };
  const toggle = (id: string, title: string) => {
    const m = new Map(picked);
    if (m.has(id)) m.delete(id); else m.set(id, title);
    setPicked(m);
  };
  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex gap-2" role="search">
        <label htmlFor="hold-search" className="sr-only">Search documents</label>
        <Input id="hold-search" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Words in the title or text" autoFocus />
        <Button type="submit" icon={<Search className="size-4" />}>Search</Button>
      </form>
      {picked.size ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen documents">
          {[...picked].map(([id, title]) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-sm bg-navy-100 px-2 py-0.5 text-[12.5px]">
              {title}
              <button aria-label={`Remove ${title}`} onClick={() => toggle(id, title)} className="rounded hover:bg-navy-50"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="max-h-72 overflow-y-auto rounded-md border border-rule">
        {!q ? <p className="px-3 py-4 text-[13px] text-muted">Search to find documents to hold.</p> :
          results.isLoading ? <div className="p-3"><Spinner /></div> :
          results.isError ? <ErrorState compact error={results.error} onRetry={() => results.refetch()} /> :
          results.data?.results.content.length === 0 ? <p className="px-3 py-4 text-[13px] text-muted">No documents match “{q}”.</p> : (
            <ul className="divide-y divide-rule">
              {results.data?.results.content.map((hit) => (
                <li key={hit.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-navy-50/60">
                    <input type="checkbox" className="size-4 accent-navy-800" checked={picked.has(hit.id)} onChange={() => toggle(hit.id, hit.title)} />
                    <span className="min-w-0">
                      <span className="doc-title block truncate">{hit.title}</span>
                      <span className="block truncate text-[12.5px] text-muted">{[hit.cabinetName, hit.folderName].filter(Boolean).join(' / ')}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  );
}

function PickFolder({ folderId, setFolderId }: { folderId: string; setFolderId: (id: string) => void }) {
  const [cabinetId, setCabinetId] = useState('');
  const cabinets = useQuery({ queryKey: ['cabinets'], queryFn: () => api.get<CabinetView[]>('/cabinets') });
  const tree = useQuery({ queryKey: ['cabinets', cabinetId], queryFn: () => api.get<CabinetTree>(`/cabinets/${cabinetId}`), enabled: !!cabinetId });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Cabinet">
        {(a) => (
          <Select {...a} value={cabinetId} onChange={(e) => { setCabinetId(e.target.value); setFolderId(''); }} disabled={cabinets.isLoading}>
            <option value="">Choose a cabinet…</option>
            {cabinets.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </Field>
      <Field label="Folder" hint="Includes all its subfolders">
        {(a) => (
          <Select {...a} value={folderId} onChange={(e) => setFolderId(e.target.value)} disabled={!cabinetId || tree.isLoading}>
            <option value="">{tree.isLoading ? 'Loading folders…' : 'Choose a folder…'}</option>
            {orderTree(tree.data?.folders ?? []).map((f) => (
              <option key={f.id} value={f.id}>{'  '.repeat(f.level)}{f.name}</option>
            ))}
          </Select>
        )}
      </Field>
      {cabinets.isError ? <ErrorState compact error={cabinets.error} onRetry={() => cabinets.refetch()} /> : null}
      {tree.data && tree.data.folders.length === 0 ? <p className="flex items-center gap-2 text-[13px] text-muted sm:col-span-2"><FolderOpen className="size-4" /> This cabinet has no folders.</p> : null}
    </div>
  );
}

/** Depth-first order with indentation level, so the flat folder list reads as a tree. */
function orderTree(folders: { id: string; parentId: string | null; name: string }[]) {
  const byParent = new Map<string | null, typeof folders>();
  for (const f of folders) byParent.set(f.parentId, [...(byParent.get(f.parentId) ?? []), f]);
  const out: { id: string; name: string; level: number }[] = [];
  const walk = (parent: string | null, level: number) => {
    for (const f of byParent.get(parent) ?? []) { out.push({ id: f.id, name: f.name, level }); walk(f.id, level + 1); }
  };
  walk(null, 0);
  return out;
}

function ReleaseDialog({ hold, onClose }: { hold: HoldView; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const release = useMutation({
    mutationFn: () => api.post<HoldView>(`/legal-holds/${hold.id}/release`, { reason: reason.trim() }),
    onSuccess: () => { toast.success('Hold released'); void qc.invalidateQueries({ queryKey: ['legal-holds'] }); onClose(); },
  });
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} title={`Release “${hold.name}”?`} confirmLabel="Release hold" danger
      loading={release.isPending} disabled={!reason.trim()} onConfirm={() => release.mutate()}>
      <p>Its {hold.documents.length} document{hold.documents.length === 1 ? '' : 's'} can be deleted or disposed of again under their retention policies, unless another hold covers them. This can’t be reopened; you’d place a new hold instead.</p>
      <Field label="Why is it being released?" className="mt-4">
        {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Case settled" />}
      </Field>
    </ConfirmDialog>
  );
}
