import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiUpload } from '../lib/api-client';
import { useAuth } from '../lib/auth';
import { Layout } from '../components/Layout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { buildTree, FolderNode } from '../components/CabinetTree';

// ── Types ───────────────────────────────────────────────────────────────────

interface CabinetSummary {
  id: string;
  name: string;
  _count: { folders: number };
}
interface AclEntry { id: string }
interface CabinetDetail extends CabinetSummary {
  folders: FolderNode[];
  acls: AclEntry[];
}
interface DocItem {
  id: string;
  title: string;
  status: string;
  documentType: { id: string; name: string } | null;
  updatedAt: string;
  _count: { versions: number };
}
interface DocumentType { id: string; name: string }

type Scope = 'Personal' | 'Private' | 'Default';
type SelKind = 'cabinet' | 'folder' | 'subdiv';
interface Selection { kind: SelKind; id: string; name: string }

// ── Small inline icons ───────────────────────────────────────────────────────

const P = (d: string) => (
  <path strokeLinecap="round" strokeLinejoin="round" d={d} />
);

function CabinetIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
      {P('M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v.5H3.75v-.5z')}
      {P('M3.75 9.75h16.5v3.75H3.75zM3.75 15h16.5v3.75A2.25 2.25 0 0118 21H6a2.25 2.25 0 01-2.25-2.25V15z')}
      {P('M10 11.6h4M10 17h4')}
    </svg>
  );
}
function FolderIcon({ className = 'w-4 h-4', open = false }: { className?: string; open?: boolean }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d={open
        ? 'M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z'
        : 'M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z'} />
    </svg>
  );
}
function DividerIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
      {P('M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5M6 4.5h4v15H6z')}
    </svg>
  );
}
function Chevron({ open, className = 'w-3 h-3' }: { open: boolean; className?: string }) {
  return (
    <svg className={`${className} transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.6} stroke="currentColor">
      {P('M8.25 4.5l7.5 7.5-7.5 7.5')}
    </svg>
  );
}
function SearchIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      {P('M21 21l-5.2-5.2m2.2-5.05a7.25 7.25 0 11-14.5 0 7.25 7.25 0 0114.5 0z')}
    </svg>
  );
}

// ── Document thumbnail (stylised "page") ─────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  DRAFT: 'bg-gray-400',
  CHECKED_OUT: 'bg-amber-500',
  ON_HOLD: 'bg-purple-500',
  FINALIZED: 'bg-green-500',
  ARCHIVED: 'bg-slate-500',
};

function PaperThumb() {
  return (
    <div className="w-[86px] h-[108px] bg-white border border-gray-300 shadow-sm rounded-[3px] mx-auto flex flex-col gap-[5px] px-3 pt-3.5 overflow-hidden">
      <div className="h-1.5 w-2/3 rounded-sm bg-red-500/80" />
      <div className="h-1 w-full rounded-sm bg-gray-200 mt-1" />
      <div className="h-1 w-11/12 rounded-sm bg-gray-200" />
      <div className="h-1 w-full rounded-sm bg-gray-200" />
      <div className="h-1 w-3/4 rounded-sm bg-gray-200" />
      <div className="h-1 w-full rounded-sm bg-gray-200" />
      <div className="h-1 w-5/6 rounded-sm bg-gray-200" />
      <div className="h-1 w-2/3 rounded-sm bg-gray-200" />
    </div>
  );
}

// ── Upload modal ─────────────────────────────────────────────────────────────

function UploadModal({
  target, docTypes, onClose, onUploaded,
}: {
  target: { folderId?: string; subDividerId?: string; label: string };
  docTypes: DocumentType[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [docTypeId, setDocTypeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const pick = useCallback((f: File | null) => {
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }, [title]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title || file.name);
      if (target.folderId) fd.append('folderId', target.folderId);
      if (target.subDividerId) fd.append('subDividerId', target.subDividerId);
      if (docTypeId) fd.append('documentTypeId', docTypeId);
      await apiUpload('/api/documents', fd);
      toast.success('Document uploaded');
      onUploaded();
      onClose();
    } catch {
      toast.error('Upload failed — please try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Upload Document</h3>
            <p className="text-xs text-gray-400 mt-0.5">Into: {target.label}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {file ? (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                {(file.name.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button type="button" onClick={() => setFile(null)} className="text-gray-300 hover:text-gray-500 text-lg">&times;</button>
            </div>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0] ?? null); }}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                drag ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
              }`}
            >
              <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                {P('M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5')}
              </svg>
              <p className="text-sm text-gray-500">Drop a file here or <span className="text-blue-600 font-medium">browse</span></p>
            </div>
          )}
          <input ref={inputRef} type="file" className="hidden" onChange={e => pick(e.target.files?.[0] ?? null)} />

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Document title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {docTypes.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Document type</label>
              <select value={docTypeId} onChange={e => setDocTypeId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— none —</option>
                {docTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" disabled={!file || busy}
              className="px-4 py-2 text-sm text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 rounded-lg font-semibold">
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tree node (folder + its sub-dividers + children) ─────────────────────────

function FolderBranch({
  folder, depth, selection, onSelect,
}: {
  folder: FolderNode;
  depth: number;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = (folder.children?.length ?? 0) > 0 || folder.subDividers.length > 0;
  const active = selection?.kind === 'folder' && selection.id === folder.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-[3px] pr-2 rounded cursor-pointer select-none ${
          active ? 'bg-blue-100 text-blue-800' : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => onSelect({ kind: 'folder', id: folder.id, name: folder.name })}
      >
        <button
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          className="w-3.5 h-3.5 flex items-center justify-center text-gray-400 shrink-0"
        >
          {hasChildren ? <Chevron open={open} /> : <span className="w-3" />}
        </button>
        <FolderIcon className="w-4 h-4 text-amber-500 shrink-0" open={open && hasChildren} />
        <span className="truncate text-[13px]">{folder.name}</span>
        {folder._count.documents > 0 && (
          <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 group-hover:bg-white px-1.5 rounded-full shrink-0">
            {folder._count.documents}
          </span>
        )}
      </div>

      {open && (
        <>
          {folder.subDividers.map(sd => {
            const sActive = selection?.kind === 'subdiv' && selection.id === sd.id;
            return (
              <div
                key={sd.id}
                onClick={() => onSelect({ kind: 'subdiv', id: sd.id, name: sd.name })}
                className={`flex items-center gap-1.5 py-[3px] pr-2 rounded cursor-pointer select-none text-[12.5px] ${
                  sActive ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={{ paddingLeft: `${8 + (depth + 1) * 14 + 6}px` }}
              >
                <DividerIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{sd.name}</span>
              </div>
            );
          })}
          {folder.children?.map(c => (
            <FolderBranch key={c.id} folder={c} depth={depth + 1} selection={selection} onSelect={onSelect} />
          ))}
        </>
      )}
    </div>
  );
}

// ── Cabinet branch ───────────────────────────────────────────────────────────

function CabinetBranch({
  cabinet, expanded, detail, selection, onToggle, onSelect,
}: {
  cabinet: CabinetSummary;
  expanded: boolean;
  detail: CabinetDetail | undefined;
  selection: Selection | null;
  onToggle: () => void;
  onSelect: (s: Selection) => void;
}) {
  const active = selection?.kind === 'cabinet' && selection.id === cabinet.id;
  const roots = useMemo(() => (detail ? buildTree(detail.folders) : []), [detail]);

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-1 pr-2 rounded cursor-pointer select-none ${
          active ? 'bg-blue-100 text-blue-800' : 'text-gray-800 hover:bg-gray-100'
        }`}
        onClick={() => { onToggle(); onSelect({ kind: 'cabinet', id: cabinet.id, name: cabinet.name }); }}
      >
        <span className="w-3.5 h-3.5 flex items-center justify-center text-gray-400 shrink-0">
          <Chevron open={expanded} />
        </span>
        <CabinetIcon className="w-4 h-4 text-blue-800 shrink-0" />
        <span className="truncate text-[13px] font-medium">{cabinet.name}</span>
        <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 group-hover:bg-white px-1.5 rounded-full shrink-0">
          {cabinet._count.folders}
        </span>
      </div>
      {expanded && (
        <div className="ml-1.5 pl-1.5 border-l border-gray-200">
          {!detail ? (
            <p className="px-3 py-1.5 text-[11px] text-gray-400">Loading…</p>
          ) : !roots.length ? (
            <p className="px-3 py-1.5 text-[11px] text-gray-400">No folders</p>
          ) : (
            roots.map(f => (
              <FolderBranch key={f.id} folder={f} depth={0} selection={selection} onSelect={onSelect} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function FileExplorerPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const appliedKeyRef = useRef<string>('');
  const isAdmin = user?.role === 'ADMIN';
  const canEdit = isAdmin || user?.role === 'OFFICER';

  const [scope, setScope] = useState<Scope>('Default');
  const [cabinetFilter, setCabinetFilter] = useState('');
  const [expandedCabinet, setExpandedCabinet] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [docSearch, setDocSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: cabinets } = useQuery({
    queryKey: ['cabinets', scope],
    queryFn: () => api.get<CabinetSummary[]>(`/api/cabinets?scope=${scope.toUpperCase()}`),
    staleTime: 30_000,
  });

  const { data: cabinetDetail } = useQuery({
    queryKey: ['cabinet', expandedCabinet],
    queryFn: () => api.get<CabinetDetail>(`/api/cabinets/${expandedCabinet}`),
    enabled: !!expandedCabinet,
    staleTime: 30_000,
  });

  const { data: docTypes = [] } = useQuery({
    queryKey: ['document-types'],
    queryFn: () => api.get<DocumentType[]>('/api/document-types'),
    staleTime: 60_000,
  });

  const docParam =
    selection?.kind === 'folder' ? `folderId=${selection.id}`
    : selection?.kind === 'subdiv' ? `subDividerId=${selection.id}`
    : null;

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['documents', selection?.kind, selection?.id],
    queryFn: () => api.get<DocItem[]>(`/api/documents?${docParam}`),
    enabled: !!docParam,
    staleTime: 20_000,
  });

  const { data: notifCount } = useQuery({
    queryKey: ['notif-count'],
    queryFn: () => api.get<{ count: number }>('/api/notifications/unread-count'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: wfInstances } = useQuery({
    queryKey: ['wf-instances-badge'],
    queryFn: () => api.get<Array<{ id: string; status: string }>>('/api/workflow-instances'),
    staleTime: 30_000,
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api.delete(`/api/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', selection?.kind, selection?.id] });
      setConfirmDeleteId(null);
      setChecked(new Set());
      toast.success('Document deleted');
    },
    onError: () => { setConfirmDeleteId(null); toast.error('Failed to delete document'); },
  });

  // ── Deep-link (?cabinet=&folder=&subdiv=) — re-applies whenever params change ─
  const deepLinkKey = `${searchParams.get('cabinet') ?? ''}|${searchParams.get('folder') ?? ''}|${searchParams.get('subdiv') ?? ''}`;

  // 1) expand the target cabinet
  useEffect(() => {
    const cab = searchParams.get('cabinet');
    if (cab && appliedKeyRef.current !== deepLinkKey && expandedCabinet !== cab) {
      setExpandedCabinet(cab);
    }
  }, [deepLinkKey, searchParams, expandedCabinet]);

  // 2) apply the selection once the target cabinet's detail has loaded
  useEffect(() => {
    const cab = searchParams.get('cabinet');
    if (!cab || appliedKeyRef.current === deepLinkKey) return;
    if (!cabinetDetail || cabinetDetail.id !== cab) return;
    const folderId = searchParams.get('folder');
    const subdivId = searchParams.get('subdiv');
    if (subdivId) {
      const sd = cabinetDetail.folders.flatMap(f => f.subDividers).find(s => s.id === subdivId);
      if (sd) setSelection({ kind: 'subdiv', id: sd.id, name: sd.name });
    } else if (folderId) {
      const f = cabinetDetail.folders.find(ff => ff.id === folderId);
      if (f) setSelection({ kind: 'folder', id: f.id, name: f.name });
    } else {
      setSelection({ kind: 'cabinet', id: cab, name: cabinetDetail.name });
    }
    setPage(0);
    setChecked(new Set());
    appliedKeyRef.current = deepLinkKey;
  }, [deepLinkKey, cabinetDetail, searchParams]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const wfBadge = (wfInstances ?? []).filter(
    w => !['APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'].includes(w.status),
  ).length;

  const shownCabinets = useMemo(() => {
    const list = cabinets ?? [];
    if (!cabinetFilter.trim()) return list;
    const q = cabinetFilter.toLowerCase();
    return list.filter(c => c.name.toLowerCase().includes(q));
  }, [cabinets, cabinetFilter]);

  // breadcrumb path
  const breadcrumb = useMemo(() => {
    if (!selection) return [] as string[];
    const cabName = cabinets?.find(c => c.id === expandedCabinet)?.name ?? cabinetDetail?.name;
    const parts: string[] = cabName ? [cabName] : [];
    if (selection.kind === 'cabinet') return parts;
    if (!cabinetDetail) return [...parts, selection.name];

    if (selection.kind === 'folder') {
      const chain: string[] = [];
      let cur = cabinetDetail.folders.find(f => f.id === selection.id) ?? null;
      while (cur) {
        chain.unshift(cur.name);
        cur = cur.parentId ? cabinetDetail.folders.find(f => f.id === cur!.parentId) ?? null : null;
      }
      return [...parts, ...chain];
    }
    // subdiv
    const sd = cabinetDetail.folders.flatMap(f => f.subDividers).find(s => s.id === selection.id);
    const parentFolder = sd ? cabinetDetail.folders.find(f => f.id === sd.folderId) : null;
    const chain: string[] = [];
    let cur = parentFolder ?? null;
    while (cur) {
      chain.unshift(cur.name);
      cur = cur.parentId ? cabinetDetail.folders.find(f => f.id === cur!.parentId) ?? null : null;
    }
    return [...parts, ...chain, selection.name];
  }, [selection, cabinets, cabinetDetail, expandedCabinet]);

  const filteredDocs = useMemo(() => {
    const list = documents ?? [];
    if (!appliedSearch.trim()) return list;
    const q = appliedSearch.toLowerCase();
    return list.filter(d => d.title.toLowerCase().includes(q));
  }, [documents, appliedSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageDocs = filteredDocs.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function selectNode(s: Selection) {
    setSelection(s);
    setPage(0);
    setChecked(new Set());
    setAppliedSearch('');
    setDocSearch('');
  }

  function toggleCabinet(id: string) {
    setExpandedCabinet(prev => (prev === id ? null : id));
  }

  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allOnPageChecked = pageDocs.length > 0 && pageDocs.every(d => checked.has(d.id));
  function toggleAllOnPage() {
    setChecked(prev => {
      const next = new Set(prev);
      if (allOnPageChecked) pageDocs.forEach(d => next.delete(d.id));
      else pageDocs.forEach(d => next.add(d.id));
      return next;
    });
  }

  const canUploadHere = canEdit && (selection?.kind === 'folder' || selection?.kind === 'subdiv');
  const uploadTarget =
    selection?.kind === 'folder' ? { folderId: selection.id, label: breadcrumb.join(' / ') }
    : selection?.kind === 'subdiv' ? { subDividerId: selection.id, label: breadcrumb.join(' / ') }
    : { label: '' };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden bg-white">
        {/* ── Top toolbar ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 bg-gradient-to-b from-white to-gray-50 shrink-0">
          <div className="flex items-center gap-1.5 mr-1">
            <div className="w-7 h-7 rounded-md bg-blue-800 flex items-center justify-center">
              <CabinetIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-extrabold tracking-tight text-blue-900 hidden sm:block">
              File<span className="text-red-600">Point</span>
            </span>
          </div>

          <button
            onClick={() => { if (canUploadHere) setShowUpload(true); else toast.info('Select a folder or sub-divider first'); }}
            disabled={!canEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 rounded-md shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor">
              {P('M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5M7.5 7.5L12 3l4.5 4.5')}
            </svg>
            Upload
          </button>

          <form
            onSubmit={e => { e.preventDefault(); setAppliedSearch(docSearch); setPage(0); }}
            className="flex items-center flex-1 max-w-md"
          >
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                <SearchIcon className="w-3.5 h-3.5" />
              </span>
              <input
                value={docSearch}
                onChange={e => setDocSearch(e.target.value)}
                placeholder="Doc Name"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <button type="submit" className="ml-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md shadow-sm">
              Search
            </button>
          </form>

          <div className="flex items-center gap-2 ml-auto">
            {/* Alerts */}
            <button
              onClick={() => toast.info(`${notifCount?.count ?? 0} unread alert(s)`)}
              title="Alerts"
              className="relative flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-100 text-gray-500"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                {P('M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0')}
              </svg>
              <span className={`absolute -top-0.5 -right-0.5 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 ${
                (notifCount?.count ?? 0) > 0 ? 'bg-red-500' : 'bg-gray-400'
              }`}>
                {notifCount?.count ?? 0}
              </span>
            </button>

            {/* Workflow tasks */}
            <button
              onClick={() => navigate('/workflows')}
              title="Workflow Tasks"
              className="relative flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-100 text-gray-500"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                {P('M3 3v18M3 4.5h13.5l-2.25 3.75L16.5 12H3')}
              </svg>
              <span className={`absolute -top-0.5 -right-0.5 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 ${
                wfBadge > 0 ? 'bg-red-500' : 'bg-gray-400'
              }`}>
                {wfBadge}
              </span>
            </button>

            <div className="flex items-center gap-2 pl-2 ml-1 border-l border-gray-200">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-[11px] font-bold">
                {(user?.email ?? 'U').slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-gray-700 hidden md:block truncate max-w-[140px]">{user?.email}</span>
            </div>
          </div>
        </div>

        {/* ── Body: tree | content ────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">
          {/* Tree panel */}
          <aside className="w-72 shrink-0 border-r border-gray-200 flex flex-col bg-gray-50/60">
            {/* Scope tabs */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-b border-gray-200">
              {(['Personal', 'Private', 'Default'] as Scope[]).map(s => (
                <label key={s} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === s}
                    onChange={() => { setScope(s); setSelection(null); setExpandedCabinet(null); }}
                    className="accent-blue-700 w-3.5 h-3.5"
                  />
                  {s}
                </label>
              ))}
            </div>

            {/* Cabinet filter */}
            <div className="px-3 py-2.5 border-b border-gray-200">
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <SearchIcon className="w-3.5 h-3.5" />
                </span>
                <input
                  value={cabinetFilter}
                  onChange={e => setCabinetFilter(e.target.value)}
                  placeholder="Cabinet"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
              {!shownCabinets.length ? (
                <div className="flex flex-col items-center gap-2 py-10 px-4 text-center text-gray-400">
                  <CabinetIcon className="w-8 h-8 text-gray-300" />
                  <p className="text-[11px]">
                    {cabinetFilter
                      ? 'No cabinets match your search.'
                      : scope === 'Personal'
                        ? 'No personal cabinets yet. Create one in Documents and set its visibility to Personal.'
                        : scope === 'Private'
                          ? 'No private cabinets shared with you.'
                          : 'No shared cabinets available.'}
                  </p>
                </div>
              ) : (
                shownCabinets.map(cab => (
                  <CabinetBranch
                    key={cab.id}
                    cabinet={cab}
                    expanded={expandedCabinet === cab.id}
                    detail={expandedCabinet === cab.id ? cabinetDetail : undefined}
                    selection={selection}
                    onToggle={() => toggleCabinet(cab.id)}
                    onSelect={selectNode}
                  />
                ))
              )}
            </div>
          </aside>

          {/* Content panel */}
          <main className="flex-1 flex flex-col min-w-0 bg-white">
            {/* Breadcrumb + page size */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white shrink-0">
              <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1 flex-wrap">
                {breadcrumb.length ? breadcrumb.map((b, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-gray-300">/</span>}
                    <span className={i === breadcrumb.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-500'}>{b}</span>
                  </span>
                )) : (
                  <span className="text-gray-400 text-sm">Select a cabinet, folder or sub-divider to view documents</span>
                )}
              </div>
              {docParam && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-gray-400">{filteredDocs.length} item{filteredDocs.length !== 1 ? 's' : ''}</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
                    className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Selection action bar */}
            {docParam && checked.size > 0 && (
              <div className="flex items-center gap-3 px-5 py-2 bg-blue-50 border-b border-blue-100 text-xs shrink-0">
                <span className="font-semibold text-blue-800">{checked.size} selected</span>
                <button onClick={() => setChecked(new Set())} className="text-blue-600 hover:text-blue-800">Clear</button>
                {isAdmin && checked.size === 1 && (
                  <button
                    onClick={() => setConfirmDeleteId(Array.from(checked)[0])}
                    className="ml-auto text-red-600 hover:text-red-800 font-medium"
                  >
                    Delete selected
                  </button>
                )}
              </div>
            )}

            {/* Documents grid */}
            <div className="flex-1 overflow-y-auto p-5">
              {!docParam ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3">
                  <CabinetIcon className="w-16 h-16" />
                  <p className="text-sm text-gray-400">Nothing selected yet.</p>
                </div>
              ) : docsLoading ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-40 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : !pageDocs.length ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                  <svg className="w-14 h-14 text-gray-200" fill="none" viewBox="0 0 24 24" strokeWidth={1.4} stroke="currentColor">
                    {P('M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z')}
                  </svg>
                  <p className="text-sm">{appliedSearch ? 'No documents match your search.' : 'No documents here yet.'}</p>
                  {canUploadHere && !appliedSearch && (
                    <button onClick={() => setShowUpload(true)} className="text-xs font-semibold text-blue-700 hover:text-blue-900">
                      + Upload the first document
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* select-all row */}
                  <label className="flex items-center gap-2 mb-3 text-xs text-gray-500 cursor-pointer w-fit">
                    <input type="checkbox" checked={allOnPageChecked} onChange={toggleAllOnPage} className="accent-blue-700 w-3.5 h-3.5" />
                    Select all on page
                  </label>

                  <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
                    {pageDocs.map(doc => {
                      const isChecked = checked.has(doc.id);
                      return (
                        <div
                          key={doc.id}
                          className={`group relative bg-gray-50 border rounded-lg p-3 transition-all hover:shadow-md hover:border-blue-300 ${
                            isChecked ? 'border-blue-400 ring-1 ring-blue-200 bg-blue-50/40' : 'border-gray-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheck(doc.id)}
                            className="absolute top-2 left-2 z-10 accent-blue-700 w-3.5 h-3.5"
                          />
                          <span
                            className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${STATUS_DOT[doc.status] ?? 'bg-gray-300'}`}
                            title={doc.status}
                          />
                          <div
                            className="cursor-pointer"
                            onClick={() => navigate(`/documents/${doc.id}/view`)}
                            title="Open document"
                          >
                            <PaperThumb />
                            <p className="mt-2.5 text-[11.5px] text-center text-gray-700 leading-tight line-clamp-2 h-8" title={doc.title}>
                              {doc.title}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Pagination footer */}
            {docParam && filteredDocs.length > pageSize && (
              <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-200 bg-white shrink-0 text-xs text-gray-500">
                <span>
                  {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filteredDocs.length)} of {filteredDocs.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="px-2.5 py-1 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <span className="px-2">Page {safePage + 1} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage >= totalPages - 1}
                    className="px-2.5 py-1 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {showUpload && uploadTarget.label && (
        <UploadModal
          target={uploadTarget}
          docTypes={docTypes}
          onClose={() => setShowUpload(false)}
          onUploaded={() => qc.invalidateQueries({ queryKey: ['documents', selection?.kind, selection?.id] })}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete document?"
        description="This document and all its versions will be permanently removed."
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteId && deleteDoc.mutate(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
        loading={deleteDoc.isPending}
      />
    </Layout>
  );
}
