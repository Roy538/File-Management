import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, upload } from '@/lib/api/client';
import type { UploadResult } from '@/lib/api/types';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { FileIcon } from '@/components/ui/FileIcon';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useUploadDialog } from './uploadStore';
import { keys, orderFolders, useCabinets, useCabinetTree, useDocumentTypes } from './queries';
import { compactMetadata, MetadataFields, validateMetadata, type MetadataValues } from './MetadataFields';

/** Mirrors the server's allowlist (FileInspector) so obvious mistakes are caught before uploading. */
const ALLOWED = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'txt', 'csv'];
const MAX_BYTES = 100 * 1024 * 1024;

interface Item {
  key: string;
  file: File;
  state: 'ready' | 'invalid' | 'uploading' | 'done' | 'failed';
  progress: number;
  message?: string;
  result?: UploadResult;
}

function precheck(file: File): string | undefined {
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!ALLOWED.includes(ext)) return `This file type isn’t accepted. Use ${ALLOWED.join(', ')}.`;
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_BYTES) return 'This file is larger than 100 MB.';
  return undefined;
}

export function UploadDialog() {
  const { open, folderId: presetFolder, subDividerId: presetSub, hide } = useUploadDialog();
  const location = useLocation();
  const qc = useQueryClient();

  const [cabinetId, setCabinetId] = useState('');
  const [folderId, setFolderId] = useState('');
  const [subId, setSubId] = useState('');
  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState('');
  const [metadata, setMetadata] = useState<MetadataValues>({});
  const [metaErrors, setMetaErrors] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Each opening starts fresh, prefilled with where the user was (the explorer keeps ?cabinet= in the URL).
  useEffect(() => {
    if (!open) return;
    const urlCabinet = new URLSearchParams(location.search).get('cabinet') ?? '';
    const known = presetFolder && urlCabinet;
    setCabinetId(known ? urlCabinet : '');
    setFolderId(known ? presetFolder : '');
    setSubId(known ? presetSub ?? '' : '');
    setTitle(''); setTypeId(''); setMetadata({}); setMetaErrors({}); setItems([]); setTargetError(null);
  }, [open]); // reset only when the dialog opens

  const cabinets = useCabinets(null);
  const tree = useCabinetTree(cabinetId || null);
  const types = useDocumentTypes(open);
  const uploadable = useMemo(() => orderFolders(tree.data?.folders ?? []).filter((f) => f.rights.includes('upload')), [tree.data]);
  const folder = tree.data?.folders.find((f) => f.id === folderId);
  const type = types.data?.find((t) => t.id === typeId);

  const addFiles = (files: FileList | File[]) => {
    const next = Array.from(files).map((file): Item => {
      const problem = precheck(file);
      return { key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, state: problem ? 'invalid' : 'ready', progress: 0, message: problem };
    });
    setItems((cur) => [...cur.filter((i) => i.state !== 'done'), ...next]);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!running && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };
  const patchItem = (key: string, patch: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const ready = items.filter((i) => i.state === 'ready' || i.state === 'failed');
  const done = items.filter((i) => i.state === 'done');

  const start = async () => {
    if (!folderId) { setTargetError('Choose the folder to file into.'); return; }
    setTargetError(null);
    const errors = type ? validateMetadata(type.fields, metadata) : {};
    setMetaErrors(errors);
    if (Object.keys(errors).length) return;

    setRunning(true);
    let succeeded = 0;
    for (const item of ready) {
      patchItem(item.key, { state: 'uploading', progress: 0, message: undefined });
      const form = new FormData();
      form.append('file', item.file);
      form.append('folderId', folderId);
      if (subId) form.append('subDividerId', subId);
      if (ready.length === 1 && items.length === 1 && title.trim()) form.append('title', title.trim());
      if (typeId) {
        form.append('documentTypeId', typeId);
        const values = compactMetadata(metadata);
        if (Object.keys(values).length) form.append('metadata', new Blob([JSON.stringify(values)], { type: 'application/json' }));
      }
      try {
        const result = await upload<UploadResult>('/documents', form, (p) => patchItem(item.key, { progress: p }));
        patchItem(item.key, { state: 'done', progress: 1, result });
        succeeded++;
      } catch (e) {
        const msg = e instanceof ApiError
          ? (Object.keys(e.fieldErrors).length ? `${e.message}: ${Object.values(e.fieldErrors).join('; ')}` : e.message)
          : 'The upload failed. Try again.';
        patchItem(item.key, { state: 'failed', message: msg });
      }
    }
    setRunning(false);
    if (succeeded) {
      await qc.invalidateQueries({ queryKey: keys.documents });
      toast.success(succeeded === 1 ? 'Document uploaded' : `${succeeded} documents uploaded`);
    }
  };

  const close = (o: boolean) => { if (!o && !running) hide(); };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Upload documents"
      description="Each file is checked and virus-scanned before anyone can open it."
      width="lg"
      footer={
        <>
          <Button onClick={() => hide()} disabled={running}>{done.length && !ready.length ? 'Close' : 'Cancel'}</Button>
          <Button variant="primary" loading={running} disabled={!ready.length} onClick={start}>
            {ready.length > 1 ? `Upload ${ready.length} files` : 'Upload'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Cabinet">
            {(a) => (
              <Select {...a} value={cabinetId} disabled={running}
                onChange={(e) => { setCabinetId(e.target.value); setFolderId(''); setSubId(''); }}>
                <option value="">Choose…</option>
                {cabinets.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Folder" error={targetError ?? undefined}
            hint={cabinetId && tree.data && !uploadable.length ? 'You can’t upload into any folder of this cabinet.' : undefined}>
            {(a) => (
              <Select {...a} value={folderId} disabled={!cabinetId || running} onChange={(e) => { setFolderId(e.target.value); setSubId(''); }}>
                <option value="">{tree.isLoading ? 'Loading…' : 'Choose…'}</option>
                {uploadable.map((f) => <option key={f.id} value={f.id}>{'  '.repeat(f.depth - 1)}{f.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Sub-divider (optional)">
            {(a) => (
              <Select {...a} value={subId} disabled={!folder?.subDividers.length || running} onChange={(e) => setSubId(e.target.value)}>
                <option value="">None</option>
                {folder?.subDividers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </Field>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn('flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-7 text-center',
            dragging ? 'border-navy-700 bg-navy-50' : 'border-rule-strong bg-paper')}
        >
          <FileUp className="mb-2 size-6 text-muted" aria-hidden />
          <p className="text-[13.5px] text-ink">Drop files here, or</p>
          <Button className="mt-2" size="sm" onClick={() => fileInput.current?.click()} disabled={running}>Choose files</Button>
          <input ref={fileInput} type="file" multiple hidden accept={ALLOWED.map((e) => `.${e}`).join(',')}
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          <p className="mt-2 text-[12px] text-muted">PDF, Office, images, text or CSV, up to 100 MB each</p>
        </div>

        {items.length ? (
          <ul className="divide-y divide-rule rounded-md border border-rule">
            {items.map((i) => <UploadRow key={i.key} item={i} onRemove={running ? undefined : () => setItems((c) => c.filter((x) => x.key !== i.key))} onOpen={hide} />)}
          </ul>
        ) : null}

        {items.length <= 1 ? (
          <Field label="Title (optional)" hint="Defaults to the file name.">
            {(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} disabled={running} maxLength={300} />}
          </Field>
        ) : null}

        <Field label="Document type (optional)" hint={types.data?.length ? 'The type decides which details are recorded.' : undefined}>
          {(a) => (
            <Select {...a} value={typeId} disabled={running} onChange={(e) => { setTypeId(e.target.value); setMetadata({}); setMetaErrors({}); }}>
              <option value="">Unclassified</option>
              {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}
        </Field>
        {type ? (
          <MetadataFields fields={type.fields} values={metadata} errors={metaErrors}
            onChange={(k, v) => setMetadata((m) => ({ ...m, [k]: v }))} />
        ) : null}
      </div>
    </Dialog>
  );
}

function UploadRow({ item, onRemove, onOpen }: { item: Item; onRemove?: () => void; onOpen: () => void }) {
  const dups = item.result?.possibleDuplicates ?? [];
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <FileIcon contentType={item.file.type} />
        <span className="min-w-0 flex-1 truncate text-[13.5px]">{item.file.name}</span>
        <span className="text-[12px] tabular-nums text-muted">{formatBytes(item.file.size)}</span>
        {item.state === 'done' ? <CheckCircle2 className="size-4 text-ok" aria-label="Uploaded" /> : null}
        {item.state === 'invalid' || item.state === 'failed' ? <AlertTriangle className="size-4 text-danger" aria-hidden /> : null}
        {onRemove && item.state !== 'done' ? (
          <button className="rounded p-0.5 text-muted hover:text-ink" onClick={onRemove} aria-label={`Remove ${item.file.name}`}><X className="size-4" /></button>
        ) : null}
      </div>
      {item.state === 'uploading' ? (
        <div className="mt-1.5 h-1 overflow-hidden rounded bg-navy-100" role="progressbar" aria-label={`Uploading ${item.file.name}`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}>
          <div className="h-full bg-navy-800 transition-[width]" style={{ width: `${item.progress * 100}%` }} />
        </div>
      ) : null}
      {item.message ? <p className="mt-1 text-[12.5px] text-danger">{item.message}</p> : null}
      {item.result ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px]">
          <Link to={`/documents/${item.result.document.id}`} onClick={onOpen} className="font-medium text-navy-800 underline">Open document</Link>
          {dups.length ? (
            <span className="text-warn">
              Identical content is already filed in {dups.length === 1 ? 'another document' : `${dups.length} documents`}:{' '}
              {dups.map((id, n) => (
                <Link key={id} to={`/documents/${id}`} onClick={onOpen} className="underline">{n === 0 ? 'view' : `view ${n + 1}`}</Link>
              )).reduce<ReactNode[]>((acc, el, n) => (n ? [...acc, ', ', el] : [el]), [])}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
