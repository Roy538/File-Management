import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../lib/api-client';
import { useAuth } from '../lib/auth';
import { Layout } from '../components/Layout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CabinetTree, FolderNode, SelectedNode, buildTree, dragBus } from '../components/CabinetTree';
import { DocumentList } from '../components/DocumentList';

// ── Types ──────────────────────────────────────────────────────────────────

interface RetentionPolicy { id: string; name: string; retentionDays: number; action: string }
interface DocumentType { id: string; name: string; description: string | null; _count: { documents: number } }
interface AclEntry {
  id: string;
  permission: 'NONE' | 'READ' | 'WRITE' | 'ADMIN';
  role: string | null;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}
type Visibility = 'PERSONAL' | 'PRIVATE' | 'DEFAULT';
interface CabinetSummary {
  id: string;
  name: string;
  visibility: Visibility;
  owner: { id: string; firstName: string; lastName: string } | null;
  retentionPolicy: { id: string; name: string } | null;
  _count: { folders: number };
}
interface CabinetDetail extends CabinetSummary {
  folders: FolderNode[];
  acls: AclEntry[];
}

const VISIBILITY_META: Record<Visibility, { label: string; badge: string; hint: string }> = {
  DEFAULT:  { label: 'Default',  badge: 'bg-blue-100 text-blue-700',    hint: 'Shared across the whole business unit' },
  PRIVATE:  { label: 'Private',  badge: 'bg-amber-100 text-amber-700',  hint: 'Owned by you; shared only with users/roles you grant access' },
  PERSONAL: { label: 'Personal', badge: 'bg-purple-100 text-purple-700', hint: 'Visible only to you' },
};

interface TemplateFolder { name: string; subDividers?: string[]; children?: TemplateFolder[] }
interface CabinetTemplate { key: string; name: string; description: string; folders: TemplateFolder[] }

// ── Inline modal/form helpers ─────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function NameForm({ label, initial, onSubmit, onCancel }: {
  label: string; initial?: string;
  onSubmit: (name: string) => void; onCancel: () => void;
}) {
  const [value, setValue] = useState(initial ?? '');
  return (
    <form onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button type="submit" disabled={!value.trim()} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg font-semibold">Save</button>
      </div>
    </form>
  );
}

function countTemplate(folders: TemplateFolder[]): { folders: number; subs: number } {
  let f = 0, s = 0;
  const walk = (list: TemplateFolder[]) => {
    for (const x of list) {
      f += 1;
      s += x.subDividers?.length ?? 0;
      if (x.children?.length) walk(x.children);
    }
  };
  walk(folders);
  return { folders: f, subs: s };
}

function TemplatePreview({ folders, depth = 0 }: { folders: TemplateFolder[]; depth?: number }) {
  return (
    <>
      {folders.map((f, i) => (
        <div key={`${depth}-${i}`}>
          <div className="flex items-center gap-1.5 text-xs text-gray-700 py-0.5" style={{ paddingLeft: depth * 14 }}>
            <span>📁</span><span className="truncate">{f.name}</span>
          </div>
          {f.subDividers?.map((sd, j) => (
            <div key={j} className="flex items-center gap-1.5 text-[11px] text-gray-500 py-0.5" style={{ paddingLeft: (depth + 1) * 14 + 8 }}>
              <span>📑</span><span className="truncate">{sd}</span>
            </div>
          ))}
          {f.children?.length ? <TemplatePreview folders={f.children} depth={depth + 1} /> : null}
        </div>
      ))}
    </>
  );
}

function CabinetCreateForm({ templates, pending, onSubmit, onCancel }: {
  templates: CabinetTemplate[];
  pending: boolean;
  onSubmit: (v: { name: string; visibility: Visibility; templateKey: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('DEFAULT');
  const [templateKey, setTemplateKey] = useState('');
  const selected = templates.find(t => t.key === templateKey) ?? null;
  const counts = selected ? countTemplate(selected.folders) : null;

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (name.trim()) onSubmit({ name: name.trim(), visibility, templateKey }); }}
      className="space-y-4"
    >
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Cabinet name</label>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Start from a template</label>
        <select
          value={templateKey}
          onChange={e => setTemplateKey(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Blank — no folders</option>
          {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
        {selected && (
          <div className="mt-2 border border-gray-200 rounded-lg bg-gray-50 p-3">
            <p className="text-[11px] text-gray-500 mb-2">
              {selected.description} <span className="text-gray-400">· {counts!.folders} folders, {counts!.subs} sub-dividers</span>
            </p>
            <div className="max-h-44 overflow-y-auto">
              <TemplatePreview folders={selected.folders} />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Visibility</label>
        <div className="space-y-1.5">
          {(['DEFAULT', 'PRIVATE', 'PERSONAL'] as Visibility[]).map(v => (
            <label
              key={v}
              className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                visibility === v ? 'border-blue-400 bg-blue-50/60' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio" name="visibility" value={v}
                checked={visibility === v} onChange={() => setVisibility(v)}
                className="mt-0.5 accent-blue-600"
              />
              <div className="min-w-0">
                <span className={`inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded ${VISIBILITY_META[v].badge}`}>
                  {VISIBILITY_META[v].label}
                </span>
                <p className="text-[11px] text-gray-500 mt-1">{VISIBILITY_META[v].hint}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button type="submit" disabled={!name.trim() || pending} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg font-semibold">
          {pending ? 'Creating…' : selected ? 'Create from template' : 'Create'}
        </button>
      </div>
    </form>
  );
}

function CabinetEditForm({ initialName, initialRetentionId, policies, pending, onSubmit, onCancel }: {
  initialName: string;
  initialRetentionId: string;
  policies: RetentionPolicy[];
  pending: boolean;
  onSubmit: (v: { name: string; retentionPolicyId: string | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [retentionPolicyId, setRetentionPolicyId] = useState(initialRetentionId);
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (name.trim()) onSubmit({ name: name.trim(), retentionPolicyId: retentionPolicyId || null }); }}
      className="space-y-4"
    >
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Cabinet name</label>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Retention policy</label>
        <select
          value={retentionPolicyId}
          onChange={e => setRetentionPolicyId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— none —</option>
          {policies.map(p => <option key={p.id} value={p.id}>{p.name} ({p.retentionDays}d → {p.action})</option>)}
        </select>
        <p className="text-[11px] text-gray-400 mt-1">Controls how long documents are kept before the retention job acts.</p>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
        <button type="submit" disabled={!name.trim() || pending} className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg font-semibold">
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ── Permission badge ───────────────────────────────────────────────────────

const PERM_COLOR: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700',
  WRITE: 'bg-orange-100 text-orange-700',
  READ:  'bg-green-100 text-green-700',
  NONE:  'bg-gray-100 text-gray-500',
};

// ── Main page ─────────────────────────────────────────────────────────────

export function CabinetsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canEdit = isAdmin || user?.role === 'OFFICER';
  const qc = useQueryClient();

  // Selection state
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  // Modal state
  type ModalState =
    | { kind: 'cabinet-create' }
    | { kind: 'cabinet-edit'; id: string; name: string; retentionPolicyId: string }
    | { kind: 'folder-create'; cabinetId: string; parentId?: string }
    | { kind: 'folder-edit'; id: string; name: string }
    | { kind: 'subdiv-create'; folderId: string }
    | { kind: 'subdiv-edit'; id: string; name: string }
    | { kind: 'doctype-create' }
    | { kind: 'doctype-edit'; id: string; name: string; description: string }
    | { kind: 'acl-add'; targetType: 'cabinet' | 'folder'; targetId: string }
    | null;
  const [modal, setModal] = useState<ModalState>(null);

  // Confirmation dialog (replaces native confirm())
  const [confirmState, setConfirmState] = useState<
    { title: string; description?: string; confirmLabel?: string; onConfirm: () => void } | null
  >(null);

  // Drag-over highlight for cabinet rows (drop a folder → move to that cabinet's root)
  const [dragOverCabinetId, setDragOverCabinetId] = useState<string | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: cabinets } = useQuery({
    queryKey: ['cabinets'],
    queryFn: () => api.get<CabinetSummary[]>('/api/cabinets'),
    staleTime: 30_000,
  });

  const { data: cabinet, refetch: refetchCabinet } = useQuery({
    queryKey: ['cabinet', selectedCabinetId],
    queryFn: () => api.get<CabinetDetail>(`/api/cabinets/${selectedCabinetId}`),
    enabled: !!selectedCabinetId,
    staleTime: 30_000,
  });

  const { data: docTypes, refetch: refetchDocTypes } = useQuery({
    queryKey: ['document-types'],
    queryFn: () => api.get<DocumentType[]>('/api/document-types'),
    staleTime: 60_000,
  });

  const { data: retentionPolicies } = useQuery({
    queryKey: ['retention-policies'],
    queryFn: () => api.get<RetentionPolicy[]>('/api/retention-policies'),
    staleTime: 60_000,
  });

  const { data: templates } = useQuery({
    queryKey: ['cabinet-templates'],
    queryFn: () => api.get<CabinetTemplate[]>('/api/cabinet-templates'),
    staleTime: 5 * 60_000,
    enabled: isAdmin,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['cabinets'] });
    if (selectedCabinetId) qc.invalidateQueries({ queryKey: ['cabinet', selectedCabinetId] });
  }

  // ── Optimistic-update cache helpers ─────────────────────────────────────────
  const cabKey = ['cabinet', selectedCabinetId] as const;

  async function snapCabinet() {
    await qc.cancelQueries({ queryKey: cabKey });
    return qc.getQueryData<CabinetDetail>(cabKey);
  }
  function setCabinet(updater: (c: CabinetDetail) => CabinetDetail) {
    qc.setQueryData<CabinetDetail>(cabKey, prev => (prev ? updater(prev) : prev));
  }
  function rollbackCabinet(prev: CabinetDetail | undefined) {
    if (prev) qc.setQueryData(cabKey, prev);
  }
  async function snapList() {
    await qc.cancelQueries({ queryKey: ['cabinets'] });
    return qc.getQueryData<CabinetSummary[]>(['cabinets']);
  }
  function setList(updater: (l: CabinetSummary[]) => CabinetSummary[]) {
    qc.setQueryData<CabinetSummary[]>(['cabinets'], prev => (prev ? updater(prev) : prev));
  }
  /** All descendant folder ids of rootId within a flat folder list. */
  function descendantIds(folders: FolderNode[], rootId: string): Set<string> {
    const set = new Set<string>();
    let frontier = [rootId];
    while (frontier.length) {
      const next: string[] = [];
      for (const f of folders) {
        if (f.parentId && frontier.includes(f.parentId) && !set.has(f.id)) { set.add(f.id); next.push(f.id); }
      }
      frontier = next;
    }
    return set;
  }
  const showMoveError = (err: any, fb: string) =>
    toast.error(Array.isArray(err?.message) ? err.message.join(', ') : (err?.message ?? fb));

  const fail = (msg: string) => () => toast.error(msg);

  const createCabinet = useMutation({
    mutationFn: ({ name, visibility }: { name: string; visibility: Visibility }) =>
      api.post('/api/cabinets', { name, visibility }),
    onSuccess: () => { invalidate(); setModal(null); toast.success('Cabinet created'); },
    onError: fail('Could not create cabinet'),
  });

  const createFromTemplate = useMutation({
    mutationFn: ({ name, visibility, templateKey }: { name: string; visibility: Visibility; templateKey: string }) =>
      api.post('/api/cabinets/from-template', { name, visibility, templateKey }),
    onSuccess: () => { invalidate(); setModal(null); toast.success('Cabinet created from template'); },
    onError: fail('Could not create cabinet from template'),
  });

  const updateCabinet = useMutation({
    mutationFn: ({ id, name, retentionPolicyId }: { id: string; name: string; retentionPolicyId?: string | null }) =>
      api.patch(`/api/cabinets/${id}`, { name, retentionPolicyId }),
    onMutate: async ({ id, name }) => {
      const prevList = await snapList();
      const prevCabinet = await snapCabinet();
      setList(l => l.map(c => (c.id === id ? { ...c, name } : c)));
      setCabinet(c => (c.id === id ? { ...c, name } : c));
      return { prevList, prevCabinet };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevList) qc.setQueryData(['cabinets'], ctx.prevList);
      rollbackCabinet(ctx?.prevCabinet);
      toast.error('Could not update cabinet');
    },
    onSuccess: () => { setModal(null); toast.success('Cabinet updated'); },
    onSettled: () => invalidate(),
  });

  const deleteCabinet = useMutation({
    mutationFn: (id: string) => api.delete(`/api/cabinets/${id}`),
    onMutate: async (id) => {
      const prevList = await snapList();
      setList(l => l.filter(c => c.id !== id));
      return { prevList };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevList) qc.setQueryData(['cabinets'], ctx.prevList);
      toast.error('Could not delete cabinet');
    },
    onSuccess: () => { setSelectedCabinetId(null); setSelectedNode(null); toast.success('Cabinet deleted'); },
    onSettled: () => invalidate(),
  });

  const createFolder = useMutation({
    mutationFn: ({ cabinetId, name, parentId }: { cabinetId: string; name: string; parentId?: string }) =>
      parentId
        ? api.post(`/api/folders/${parentId}/children`, { name })
        : api.post(`/api/cabinets/${cabinetId}/folders`, { name }),
    onSuccess: () => { invalidate(); setModal(null); toast.success('Folder created'); },
    onError: fail('Could not create folder'),
  });

  const renameFolder = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/api/folders/${id}`, { name }),
    onMutate: async ({ id, name }) => {
      const prevCabinet = await snapCabinet();
      setCabinet(c => ({ ...c, folders: c.folders.map(f => (f.id === id ? { ...f, name } : f)) }));
      return { prevCabinet };
    },
    onError: (_e, _v, ctx) => { rollbackCabinet(ctx?.prevCabinet); toast.error('Could not rename folder'); },
    onSuccess: () => { setModal(null); toast.success('Folder renamed'); },
    onSettled: () => invalidate(),
  });

  const deleteFolder = useMutation({
    mutationFn: (id: string) => api.delete(`/api/folders/${id}`),
    onMutate: async (id) => {
      const prevCabinet = await snapCabinet();
      setCabinet(c => {
        const desc = descendantIds(c.folders, id);
        return { ...c, folders: c.folders.filter(f => f.id !== id && !desc.has(f.id)) };
      });
      return { prevCabinet };
    },
    onError: (_e, _v, ctx) => { rollbackCabinet(ctx?.prevCabinet); toast.error('Could not delete folder'); },
    onSuccess: () => { setSelectedNode(null); toast.success('Folder deleted'); },
    onSettled: () => invalidate(),
  });

  const moveFolder = useMutation({
    mutationFn: ({ id, parentId, cabinetId }: { id: string; parentId: string | null; cabinetId: string }) =>
      api.patch(`/api/folders/${id}/move`, { parentId, cabinetId }),
    onMutate: async ({ id, parentId, cabinetId }) => {
      const prevCabinet = await snapCabinet();
      setCabinet(c => {
        if (cabinetId === c.id) {
          // same-cabinet re-parent → just repoint parentId (buildTree re-nests)
          return { ...c, folders: c.folders.map(f => (f.id === id ? { ...f, parentId } : f)) };
        }
        // cross-cabinet → drop the folder + its descendants from this (source) cabinet
        const desc = descendantIds(c.folders, id);
        return { ...c, folders: c.folders.filter(f => f.id !== id && !desc.has(f.id)) };
      });
      return { prevCabinet };
    },
    onError: (err, _v, ctx) => { rollbackCabinet(ctx?.prevCabinet); showMoveError(err, 'Could not move folder'); },
    onSuccess: () => toast.success('Folder moved'),
    onSettled: () => { qc.invalidateQueries({ queryKey: ['cabinets'] }); qc.invalidateQueries({ queryKey: ['cabinet'] }); },
  });

  const moveSubDivider = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string }) =>
      api.patch(`/api/sub-dividers/${id}/move`, { folderId }),
    onMutate: async ({ id, folderId }) => {
      const prevCabinet = await snapCabinet();
      setCabinet(c => {
        let moved: FolderNode['subDividers'][number] | null = null;
        const stripped = c.folders.map(f => {
          const found = f.subDividers.find(sd => sd.id === id);
          if (found) { moved = found; return { ...f, subDividers: f.subDividers.filter(sd => sd.id !== id) }; }
          return f;
        });
        if (!moved) return c;
        return {
          ...c,
          folders: stripped.map(f => (f.id === folderId ? { ...f, subDividers: [...f.subDividers, { ...moved!, folderId }] } : f)),
        };
      });
      return { prevCabinet };
    },
    onError: (err, _v, ctx) => { rollbackCabinet(ctx?.prevCabinet); showMoveError(err, 'Could not move sub-divider'); },
    onSuccess: () => toast.success('Sub-divider moved'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['cabinet'] }),
  });

  const createSubDivider = useMutation({
    mutationFn: ({ folderId, name }: { folderId: string; name: string }) =>
      api.post(`/api/folders/${folderId}/sub-dividers`, { name }),
    onSuccess: () => { invalidate(); setModal(null); toast.success('Sub-divider created'); },
    onError: fail('Could not create sub-divider'),
  });

  const renameSubDivider = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/api/sub-dividers/${id}`, { name }),
    onMutate: async ({ id, name }) => {
      const prevCabinet = await snapCabinet();
      setCabinet(c => ({
        ...c,
        folders: c.folders.map(f => ({ ...f, subDividers: f.subDividers.map(sd => (sd.id === id ? { ...sd, name } : sd)) })),
      }));
      return { prevCabinet };
    },
    onError: (_e, _v, ctx) => { rollbackCabinet(ctx?.prevCabinet); toast.error('Could not rename sub-divider'); },
    onSuccess: () => { setModal(null); toast.success('Sub-divider renamed'); },
    onSettled: () => invalidate(),
  });

  const deleteSubDivider = useMutation({
    mutationFn: (id: string) => api.delete(`/api/sub-dividers/${id}`),
    onMutate: async (id) => {
      const prevCabinet = await snapCabinet();
      setCabinet(c => ({
        ...c,
        folders: c.folders.map(f => ({ ...f, subDividers: f.subDividers.filter(sd => sd.id !== id) })),
      }));
      return { prevCabinet };
    },
    onError: (_e, _v, ctx) => { rollbackCabinet(ctx?.prevCabinet); toast.error('Could not delete sub-divider'); },
    onSuccess: () => { setSelectedNode(null); toast.success('Sub-divider deleted'); },
    onSettled: () => invalidate(),
  });

  const createDocType = useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      api.post('/api/document-types', { name, description }),
    onSuccess: () => { refetchDocTypes(); setModal(null); toast.success('Document type created'); },
    onError: fail('Could not create document type'),
  });

  const updateDocType = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/api/document-types/${id}`, { name }),
    onSuccess: () => { refetchDocTypes(); setModal(null); toast.success('Document type updated'); },
    onError: fail('Could not update document type'),
  });

  const deleteDocType = useMutation({
    mutationFn: (id: string) => api.delete(`/api/document-types/${id}`),
    onSuccess: () => { refetchDocTypes(); toast.success('Document type deleted'); },
    onError: fail('Could not delete document type'),
  });

  const addAcl = useMutation({
    mutationFn: ({ targetType, targetId, permission, role }: {
      targetType: 'cabinet' | 'folder'; targetId: string;
      permission: string; role?: string;
    }) => api.post(`/api/${targetType}s/${targetId}/acls`, { permission, role: role || undefined }),
    onSuccess: () => { invalidate(); setModal(null); toast.success('Access rule added'); },
    onError: fail('Could not add access rule'),
  });

  const removeAcl = useMutation({
    mutationFn: ({ targetType, targetId, aclId }: { targetType: 'cabinet' | 'folder'; targetId: string; aclId: string }) =>
      api.delete(`/api/${targetType}s/${targetId}/acls/${aclId}`),
    onSuccess: () => { invalidate(); toast.success('Access rule removed'); },
    onError: fail('Could not remove access rule'),
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  const selectedFolder = selectedNode?.type === 'folder'
    ? cabinet?.folders.find(f => f.id === selectedNode.id)
    : null;

  const selectedSubDivider = selectedNode?.type === 'subdiv'
    ? cabinet?.folders.flatMap(f => f.subDividers).find(sd => sd.id === selectedNode.id)
    : null;

  // ── Right panel content ───────────────────────────────────────────────────

  function RightPanel() {
    if (!selectedCabinetId || !cabinet) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
          <span className="text-4xl">🗄️</span>
          <p>Select a cabinet to browse its folder tree</p>
        </div>
      );
    }

    if (!selectedNode) {
      // Cabinet detail
      return (
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                <h2 className="text-xl font-bold text-gray-900">{cabinet.name}</h2>
                <span
                  className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${VISIBILITY_META[cabinet.visibility].badge}`}
                  title={VISIBILITY_META[cabinet.visibility].hint}
                >
                  {VISIBILITY_META[cabinet.visibility].label}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {cabinet._count.folders} top-level folder{cabinet._count.folders !== 1 ? 's' : ''}
                {cabinet.owner && ` · Owner: ${cabinet.owner.firstName} ${cabinet.owner.lastName}`}
                {cabinet.retentionPolicy && ` · Retention: ${cabinet.retentionPolicy.name}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/explorer?cabinet=${cabinet.id}`}
                className="px-3 py-1.5 text-xs border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Open in Explorer
              </Link>
              {isAdmin && (
                <>
                  <button
                    onClick={() => setModal({ kind: 'cabinet-edit', id: cabinet.id, name: cabinet.name, retentionPolicyId: cabinet.retentionPolicy?.id ?? '' })}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmState({
                      title: 'Delete cabinet?',
                      description: `"${cabinet.name}" and its folders will be removed. Documents inside are retained but no longer reachable here.`,
                      onConfirm: () => deleteCabinet.mutate(cabinet.id),
                    })}
                    className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ACLs */}
          {isAdmin && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Access Control</h3>
                <button
                  onClick={() => setModal({ kind: 'acl-add', targetType: 'cabinet', targetId: cabinet.id })}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  + Add ACL
                </button>
              </div>
              {!cabinet.acls.length ? (
                <p className="text-xs text-gray-400">No explicit ACLs — default role permissions apply.</p>
              ) : (
                <div className="space-y-1">
                  {cabinet.acls.map(acl => (
                    <div key={acl.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${PERM_COLOR[acl.permission]}`}>{acl.permission}</span>
                        <span className="text-gray-600">
                          {acl.user ? `${acl.user.firstName} ${acl.user.lastName}` : acl.role ?? '—'}
                        </span>
                      </div>
                      <button
                        onClick={() => removeAcl.mutate({ targetType: 'cabinet', targetId: cabinet.id, aclId: acl.id })}
                        className="text-gray-300 hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    if (selectedFolder) {
      const treeWithChildren = buildTree(cabinet.folders);
      const withChildren = treeWithChildren.find(f => f.id === selectedFolder.id)
        ?? { ...selectedFolder, children: [] };

      return (
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <h2 className="text-xl font-bold text-gray-900">{selectedFolder.name}</h2>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {selectedFolder._count.documents} doc{selectedFolder._count.documents !== 1 ? 's' : ''}
                {' · '}
                {selectedFolder.subDividers.length} sub-divider{selectedFolder.subDividers.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/explorer?cabinet=${cabinet.id}&folder=${selectedFolder.id}`}
                className="px-3 py-1.5 text-xs border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Open in Explorer
              </Link>
              {canEdit && (
                <button
                  onClick={() => setModal({ kind: 'folder-edit', id: selectedFolder.id, name: selectedFolder.name })}
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Rename
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setConfirmState({
                    title: 'Delete folder?',
                    description: `"${selectedFolder.name}", its sub-dividers and sub-folders will be removed.`,
                    onConfirm: () => deleteFolder.mutate(selectedFolder.id),
                  })}
                  className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Sub-dividers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sub-Dividers</h3>
              {canEdit && (
                <button
                  onClick={() => setModal({ kind: 'subdiv-create', folderId: selectedFolder.id })}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  + Add
                </button>
              )}
            </div>
            {!selectedFolder.subDividers.length ? (
              <p className="text-xs text-gray-400">No sub-dividers.</p>
            ) : (
              <div className="space-y-1">
                {selectedFolder.subDividers.map(sd => (
                  <div key={sd.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span>📑</span> {sd.name}
                    </span>
                    {canEdit && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => setModal({ kind: 'subdiv-edit', id: sd.id, name: sd.name })}
                          className="text-xs text-gray-400 hover:text-gray-700"
                        >
                          Rename
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => setConfirmState({
                              title: 'Delete sub-divider?',
                              description: `"${sd.name}" will be removed.`,
                              onConfirm: () => deleteSubDivider.mutate(sd.id),
                            })}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Direct children */}
          {(withChildren.children?.length ?? 0) > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sub-folders</h3>
              <div className="space-y-1">
                {withChildren.children!.map(child => (
                  <div
                    key={child.id}
                    className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-100"
                    onClick={() => setSelectedNode({ id: child.id, type: 'folder' })}
                  >
                    <span>📁</span> {child.name}
                    <span className="ml-auto text-xs text-gray-400">{child._count.documents} docs</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DocumentList folderId={selectedFolder.id} />
        </div>
      );
    }

    if (selectedSubDivider) {
      const parentFolder = cabinet.folders.find(f => f.id === selectedSubDivider.folderId);
      return (
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400 mb-1">
                {cabinet.name} › {parentFolder?.name ?? '…'}
              </p>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
                <h2 className="text-xl font-bold text-gray-900">{selectedSubDivider.name}</h2>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/explorer?cabinet=${cabinet.id}&subdiv=${selectedSubDivider.id}`}
                className="px-3 py-1.5 text-xs border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Open in Explorer
              </Link>
              {canEdit && (
                <button
                  onClick={() => setModal({ kind: 'subdiv-edit', id: selectedSubDivider.id, name: selectedSubDivider.name })}
                  className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Rename
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setConfirmState({
                    title: 'Delete sub-divider?',
                    description: `"${selectedSubDivider.name}" will be removed.`,
                    onConfirm: () => deleteSubDivider.mutate(selectedSubDivider.id),
                  })}
                  className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
          <DocumentList subDividerId={selectedSubDivider.id} />
        </div>
      );
    }

    return null;
  }

  // ── Modal renderer ────────────────────────────────────────────────────────

  function renderModal() {
    if (!modal) return null;

    if (modal.kind === 'cabinet-create') {
      return (
        <Modal title="New Cabinet" onClose={() => setModal(null)}>
          <CabinetCreateForm
            templates={templates ?? []}
            pending={createCabinet.isPending || createFromTemplate.isPending}
            onSubmit={({ name, visibility, templateKey }) =>
              templateKey
                ? createFromTemplate.mutate({ name, visibility, templateKey })
                : createCabinet.mutate({ name, visibility })
            }
            onCancel={() => setModal(null)}
          />
        </Modal>
      );
    }

    if (modal.kind === 'cabinet-edit') {
      return (
        <Modal title="Edit Cabinet" onClose={() => setModal(null)}>
          <CabinetEditForm
            initialName={modal.name}
            initialRetentionId={modal.retentionPolicyId}
            policies={retentionPolicies ?? []}
            pending={updateCabinet.isPending}
            onSubmit={({ name, retentionPolicyId }) => updateCabinet.mutate({ id: modal.id, name, retentionPolicyId })}
            onCancel={() => setModal(null)}
          />
        </Modal>
      );
    }

    if (modal.kind === 'folder-create') {
      return (
        <Modal title="New Folder" onClose={() => setModal(null)}>
          <NameForm
            label="Folder name"
            onSubmit={name => createFolder.mutate({ cabinetId: modal.cabinetId, name, parentId: modal.parentId })}
            onCancel={() => setModal(null)}
          />
        </Modal>
      );
    }

    if (modal.kind === 'folder-edit') {
      return (
        <Modal title="Rename Folder" onClose={() => setModal(null)}>
          <NameForm
            label="Folder name" initial={modal.name}
            onSubmit={name => renameFolder.mutate({ id: modal.id, name })}
            onCancel={() => setModal(null)}
          />
        </Modal>
      );
    }

    if (modal.kind === 'subdiv-create') {
      return (
        <Modal title="New Sub-Divider" onClose={() => setModal(null)}>
          <NameForm
            label="Sub-divider name"
            onSubmit={name => createSubDivider.mutate({ folderId: modal.folderId, name })}
            onCancel={() => setModal(null)}
          />
        </Modal>
      );
    }

    if (modal.kind === 'subdiv-edit') {
      return (
        <Modal title="Rename Sub-Divider" onClose={() => setModal(null)}>
          <NameForm
            label="Sub-divider name" initial={modal.name}
            onSubmit={name => renameSubDivider.mutate({ id: modal.id, name })}
            onCancel={() => setModal(null)}
          />
        </Modal>
      );
    }

    if (modal.kind === 'doctype-create') {
      return (
        <Modal title="New Document Type" onClose={() => setModal(null)}>
          <NameForm
            label="Document type name"
            onSubmit={name => createDocType.mutate({ name })}
            onCancel={() => setModal(null)}
          />
        </Modal>
      );
    }

    if (modal.kind === 'doctype-edit') {
      return (
        <Modal title="Rename Document Type" onClose={() => setModal(null)}>
          <NameForm
            label="Document type name" initial={modal.name}
            onSubmit={name => updateDocType.mutate({ id: modal.id, name })}
            onCancel={() => setModal(null)}
          />
        </Modal>
      );
    }

    if (modal.kind === 'acl-add') {
      const roles = ['ADMIN', 'OFFICER', 'DEPT_USER'];
      const perms = ['READ', 'WRITE', 'ADMIN', 'NONE'];
      let selectedRole = '';
      let selectedPerm = 'READ';
      return (
        <Modal title={`Add ACL — ${modal.targetType}`} onClose={() => setModal(null)}>
          <form
            onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              addAcl.mutate({
                targetType: modal.targetType,
                targetId: modal.targetId,
                permission: fd.get('permission') as string,
                role: fd.get('role') as string || undefined,
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select name="role" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">— select role —</option>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Permission</label>
              <select name="permission" defaultValue="READ" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {perms.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold">Add</button>
            </div>
          </form>
        </Modal>
      );
    }

    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="flex h-full overflow-hidden">
        {/* Left panel */}
        <aside className="w-72 border-r border-gray-200 flex flex-col bg-white shrink-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Cabinets</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => setModal({ kind: 'cabinet-create' })}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!cabinets?.length ? (
              <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
                <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                <p className="text-xs text-gray-400">
                  {isAdmin ? 'No cabinets yet. Create one to get started.' : 'No cabinets available.'}
                </p>
              </div>
            ) : (
              <div className="py-2 space-y-0.5 px-2">
                {cabinets.map(cab => (
                  <div key={cab.id}>
                    {/* Cabinet row */}
                    <button
                      onClick={() => {
                        setSelectedCabinetId(cab.id === selectedCabinetId ? null : cab.id);
                        setSelectedNode(null);
                      }}
                      onDragOver={e => {
                        const d = dragBus.get();
                        if (canEdit && d?.kind === 'folder' && (d.cabinetId !== cab.id || d.parentId != null)) {
                          e.preventDefault();
                          setDragOverCabinetId(cab.id);
                        }
                      }}
                      onDragLeave={() => setDragOverCabinetId(prev => (prev === cab.id ? null : prev))}
                      onDrop={e => {
                        e.preventDefault();
                        const d = dragBus.get();
                        setDragOverCabinetId(null);
                        if (canEdit && d?.kind === 'folder' && (d.cabinetId !== cab.id || d.parentId != null)) {
                          moveFolder.mutate({ id: d.id, parentId: null, cabinetId: cab.id });
                          dragBus.set(null);
                        }
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                        dragOverCabinetId === cab.id
                          ? 'ring-2 ring-indigo-400 bg-indigo-50'
                          : selectedCabinetId === cab.id
                            ? 'bg-indigo-50 text-indigo-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <svg className={`w-4 h-4 shrink-0 ${selectedCabinetId === cab.id ? 'text-indigo-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                      <span className="flex-1 truncate text-xs font-medium">{cab.name}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">{cab._count.folders}</span>
                    </button>

                    {/* Folder tree under selected cabinet */}
                    {selectedCabinetId === cab.id && cabinet && (
                      <div className="ml-3 pl-2 border-l border-indigo-100 mt-0.5">
                        <CabinetTree
                          folders={cabinet.folders}
                          selected={selectedNode}
                          onSelect={setSelectedNode}
                          onCreateRootFolder={() => setModal({ kind: 'folder-create', cabinetId: cab.id })}
                          onCreateChildFolder={parentId => setModal({ kind: 'folder-create', cabinetId: cab.id, parentId })}
                          onCreateSubDivider={folderId => setModal({ kind: 'subdiv-create', folderId })}
                          canEdit={canEdit}
                          onMoveFolder={(id, parentId, cabinetId) => moveFolder.mutate({ id, parentId, cabinetId })}
                          onMoveSubDivider={(id, folderId) => moveSubDivider.mutate({ id, folderId })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Document Types section */}
          <div className="border-t border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                </svg>
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Document Types</span>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setModal({ kind: 'doctype-create' })}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  + New
                </button>
              )}
            </div>
            <div className="max-h-36 overflow-y-auto pb-2 px-2 space-y-0.5">
              {!docTypes?.length ? (
                <p className="px-2 pb-2 text-xs text-gray-400">None yet.</p>
              ) : (
                docTypes.map(dt => (
                  <div key={dt.id} className="group flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-white hover:shadow-sm transition-all">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="truncate">{dt.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-gray-400">{dt._count.documents}</span>
                      {isAdmin && (
                        <button
                          onClick={() => setModal({ kind: 'doctype-edit', id: dt.id, name: dt.name, description: dt.description ?? '' })}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-indigo-600 transition-opacity"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Right panel */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <RightPanel />
        </main>
      </div>

      {renderModal()}

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ''}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel ?? 'Delete'}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </Layout>
  );
}
