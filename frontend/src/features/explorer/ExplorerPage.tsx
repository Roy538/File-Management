import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, FolderPlus, Lock, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload, User, Users, Bookmark } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { CabinetView, DocumentSummary, FolderNode, Paged, Visibility } from '@/lib/api/types';
import { useCan, useSession } from '@/features/auth/session';
import { PageHeader } from '@/components/ui/PageHeader';
import { TabbedPanel } from '@/components/ui/TabbedPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows, Spinner } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/cn';
import { keys, useCabinets, useCabinetTree } from './queries';
import { FolderTree } from './FolderTree';
import { DocumentTable } from './DocumentTable';
import { CreateCabinetDialog, NameDialog } from './StructureDialogs';
import { useUploadDialog } from './uploadStore';

// Short labels must fit four-across in the cabinet pane; the tooltip carries the full meaning.
const SCOPES: { value: Visibility | null; label: string; hint: string }[] = [
  { value: null, label: 'All', hint: 'Every cabinet you can open' },
  { value: 'DEFAULT', label: 'Everyone', hint: 'Cabinets everyone in your organisation can see' },
  { value: 'PRIVATE', label: 'Private', hint: 'Cabinets shared only with specific people or roles' },
  { value: 'PERSONAL', label: 'Personal', hint: 'Your own cabinets' },
];
const PAGE_SIZE = 25;

type NameAction = { kind: 'folder' | 'subfolder' | 'subdivider' | 'rename'; folder?: FolderNode };

/**
 * PinPoint-style explorer: cabinets → folder tree → documents. Selection lives in the URL
 * (?scope=&cabinet=&folder=&sub=&q=&page=) so links, refresh and the back button all work.
 */
export function ExplorerPage() {
  const [params, setParams] = useSearchParams();
  const scope = (params.get('scope') as Visibility | null) ?? null;
  const cabinetId = params.get('cabinet');
  const folderId = params.get('folder');
  const subId = params.get('sub');
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 0);

  const qc = useQueryClient();
  const role = useSession((s) => s.user?.role);
  const canManageCabinets = useCan('cabinets:manage');
  const openUpload = useUploadDialog((s) => s.show);

  const update = (next: Record<string, string | null>, replace = false) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null || v === '') p.delete(k); else p.set(k, v); }
    setParams(p, { replace });
  };

  const cabinets = useCabinets(scope);
  const tree = useCabinetTree(cabinetId);
  const folder = tree.data?.folders.find((f) => f.id === folderId) ?? null;
  const sub = folder?.subDividers.find((s) => s.id === subId) ?? null;

  const docs = useQuery({
    queryKey: [...keys.documents, { folderId, subId, q, page }],
    queryFn: () => api.get<Paged<DocumentSummary>>('/documents', { folderId, subDividerId: subId, q, page, size: PAGE_SIZE }),
    enabled: !!folderId,
    placeholderData: (prev) => prev,
  });

  // ── Structure mutations ──
  const invalidateTree = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['cabinets'] }),
    cabinetId ? qc.invalidateQueries({ queryKey: keys.cabinet(cabinetId) }) : null,
  ]);
  const createCabinet = useMutation({
    mutationFn: (v: { name: string; description: string; visibility: Visibility }) => api.post<CabinetView>('/cabinets', v),
    onSuccess: async (c) => { await invalidateTree(); toast.success('Cabinet created'); update({ cabinet: c.id, folder: null, sub: null, page: null }); },
    onError: () => {},
  });
  const [nameAction, setNameAction] = useState<NameAction | null>(null);
  const [deleting, setDeleting] = useState<FolderNode | null>(null);
  const [cabinetDialog, setCabinetDialog] = useState(false);

  const submitName = async (name: string) => {
    if (!nameAction || !cabinetId) return;
    const f = nameAction.folder;
    if (nameAction.kind === 'folder' || nameAction.kind === 'subfolder') {
      const created = await api.post<{ id: string }>(`/cabinets/${cabinetId}/folders`, { name, parentId: nameAction.kind === 'subfolder' ? f?.id : undefined });
      await invalidateTree();
      toast.success('Folder created');
      update({ folder: created.id, sub: null, page: null });
    } else if (nameAction.kind === 'subdivider' && f) {
      const created = await api.post<{ id: string }>(`/folders/${f.id}/sub-dividers`, { name });
      await invalidateTree();
      toast.success('Sub-divider created');
      update({ folder: f.id, sub: created.id, page: null });
    } else if (nameAction.kind === 'rename' && f) {
      await api.patch(`/folders/${f.id}`, { name });
      await invalidateTree();
      toast.success('Folder renamed');
    }
  };

  const deleteFolder = useMutation({
    mutationFn: (f: FolderNode) => api.delete(`/folders/${f.id}`),
    onSuccess: async (_d, f) => {
      await invalidateTree();
      toast.success('Folder deleted');
      if (folderId === f.id) update({ folder: f.parentId, sub: null, page: null });
    },
  });

  const [cabinetFilter, setCabinetFilter] = useState('');
  const visibleCabinets = useMemo(() => {
    const needle = cabinetFilter.trim().toLowerCase();
    return (cabinets.data ?? []).filter((c) => !needle || c.name.toLowerCase().includes(needle));
  }, [cabinets.data, cabinetFilter]);

  const cabinet = tree.data?.cabinet;
  const cabinetRights = cabinet?.rights ?? [];
  const folderRights = folder?.rights ?? [];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="File explorer"
        crumbs={[{ label: 'Home', to: '/' }, { label: 'File explorer' }]}
        actions={canManageCabinets ? (
          <Button icon={<Plus className="size-4" />} onClick={() => setCabinetDialog(true)}>New cabinet</Button>
        ) : null}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,320px)_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
        {/* ── Cabinets ── */}
        <section aria-label="Cabinets" className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Which cabinets" className="grid grid-cols-4 rounded-md border border-rule bg-surface p-0.5 text-[12.5px]">
            {SCOPES.map((s) => (
              <button
                key={s.label}
                role="radio"
                aria-checked={scope === s.value}
                title={s.hint}
                onClick={() => update({ scope: s.value, cabinet: null, folder: null, sub: null, page: null })}
                className={cn('min-w-0 truncate rounded px-1 py-1.5', scope === s.value ? 'bg-navy-800 font-medium text-white' : 'text-muted hover:text-ink')}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input aria-label="Filter cabinets" placeholder="Filter cabinets" value={cabinetFilter} onChange={(e) => setCabinetFilter(e.target.value)} className="pl-8" />
          </div>
          <div className="rounded-lg border border-rule bg-surface">
            {cabinets.isLoading ? <SkeletonRows rows={5} cols={1} /> :
              cabinets.isError ? <ErrorState error={cabinets.error} onRetry={() => cabinets.refetch()} compact /> :
              visibleCabinets.length === 0 ? (
                <EmptyState icon={<Archive className="size-6" />} title={cabinetFilter ? 'No cabinets match' : 'No cabinets here yet'}>
                  {cabinetFilter ? 'Try another name.' : canManageCabinets ? 'Create a cabinet to start filing.' : 'Nothing has been shared with you in this view.'}
                </EmptyState>
              ) : (
                <ul className={cn('overflow-y-auto p-1', cabinetId ? 'max-h-[30vh]' : 'max-h-[60vh]')}>
                  {visibleCabinets.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => update({ cabinet: c.id, folder: null, sub: null, page: null, q: null })}
                        aria-current={c.id === cabinetId ? 'true' : undefined}
                        className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13.5px]',
                          c.id === cabinetId ? 'bg-manila-200 font-medium text-ink' : 'text-ink hover:bg-navy-50')}
                      >
                        <VisibilityIcon v={c.visibility} />
                        <span className="truncate">{c.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </section>

        {/* ── Selected cabinet: its folders ── */}
        <div>
          {!cabinetId ? (
            <div className="rounded-lg border border-dashed border-rule-strong bg-surface">
              <EmptyState icon={<Archive className="size-6" />} title="Choose a cabinet">Its folders and sub-dividers open here.</EmptyState>
            </div>
          ) : tree.isLoading ? (
            <div className="rounded-lg border border-rule bg-surface"><SkeletonRows rows={6} cols={1} /></div>
          ) : tree.isError ? (
            <div className="rounded-lg border border-rule bg-surface"><ErrorState error={tree.error} onRetry={() => tree.refetch()} /></div>
          ) : cabinet ? (
            <TabbedPanel
              tab={cabinet.name}
              icon={<VisibilityIcon v={cabinet.visibility} />}
              actions={cabinetRights.includes('manage') ? (
                <Button size="sm" variant="ghost" icon={<FolderPlus className="size-4" />} onClick={() => setNameAction({ kind: 'folder' })}>New folder</Button>
              ) : null}
              bodyClassName="p-1.5 max-h-[64vh] overflow-y-auto"
            >
              {tree.data && tree.data.folders.length > 0 ? (
                <FolderTree
                  key={cabinet.id}
                  folders={tree.data.folders}
                  selectedFolder={folderId}
                  selectedSub={subId}
                  onSelect={(f, s) => update({ folder: f, sub: s, page: null, q: null })}
                />
              ) : (
                <EmptyState title="This cabinet is empty"
                  action={cabinetRights.includes('manage') ? <Button size="sm" onClick={() => setNameAction({ kind: 'folder' })}>Create the first folder</Button> : undefined}>
                  {cabinetRights.includes('manage') ? 'Folders organise documents inside the cabinet.' : 'No folders have been added yet.'}
                </EmptyState>
              )}
            </TabbedPanel>
          ) : null}
        </div>
        </div>

        {/* ── Documents ── */}
        <section aria-label="Documents" className="min-w-0">
          {!folder ? (
            <div className="rounded-lg border border-dashed border-rule-strong bg-surface">
              <EmptyState title={cabinetId ? 'Choose a folder' : 'Documents appear here'}>
                {cabinetId ? 'Select a folder or sub-divider to see its documents.' : 'Pick a cabinet, then a folder.'}
              </EmptyState>
            </div>
          ) : (
            <div className="rounded-lg border border-rule bg-surface">
              <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
                <nav aria-label="Location" className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-muted">{[cabinet?.name, ...ancestors(tree.data?.folders ?? [], folder).map((a) => a.name)].join(' / ')}</p>
                  <h2 className="doc-title flex items-center gap-1.5 truncate text-lg text-ink">
                    {folder.name}
                    {sub ? <><span className="text-subtle">/</span><Bookmark className="size-4 text-muted" aria-hidden />{sub.name}</> : null}
                  </h2>
                </nav>
                {folderRights.includes('upload') ? (
                  <Button variant="primary" size="sm" icon={<Upload className="size-4" />} onClick={() => openUpload({ folderId: folder.id, subDividerId: subId })}>
                    Upload here
                  </Button>
                ) : null}
                {folderRights.includes('manage') ? (
                  <Menu>
                    <MenuTrigger asChild>
                      <Button size="sm" variant="ghost" aria-label="Folder actions" icon={<MoreHorizontal className="size-4" />} />
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem icon={<FolderPlus className="size-4" />} onSelect={() => setNameAction({ kind: 'subfolder', folder })}>New subfolder</MenuItem>
                      <MenuItem icon={<Bookmark className="size-4" />} onSelect={() => setNameAction({ kind: 'subdivider', folder })}>New sub-divider</MenuItem>
                      <MenuItem icon={<Pencil className="size-4" />} onSelect={() => setNameAction({ kind: 'rename', folder })}>Rename folder</MenuItem>
                      <MenuSeparator />
                      <MenuItem danger icon={<Trash2 className="size-4" />} onSelect={() => setDeleting(folder)}>Delete folder</MenuItem>
                    </MenuContent>
                  </Menu>
                ) : null}
              </div>

              <div className="border-b border-rule px-4 py-2.5">
                <div className="relative max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                  <Input
                    aria-label="Filter documents by name"
                    placeholder="Filter by name"
                    defaultValue={q}
                    key={folderId ?? ''}
                    onChange={(e) => update({ q: e.target.value, page: null }, true)}
                    className="pl-8"
                  />
                </div>
              </div>

              {docs.isLoading ? <SkeletonRows rows={6} cols={5} /> :
                docs.isError ? <ErrorState error={docs.error} onRetry={() => docs.refetch()} /> :
                docs.data && docs.data.content.length > 0 ? (
                  <>
                    {docs.isFetching ? <Spinner label="Updating" className="px-4 pt-2" /> : null}
                    <DocumentTable docs={docs.data.content} />
                    <Pagination page={docs.data.page} totalPages={docs.data.totalPages} totalElements={docs.data.totalElements}
                      size={docs.data.size} onPage={(p) => update({ page: String(p) })} />
                  </>
                ) : (
                  <EmptyState
                    title={q ? 'No documents match that name' : 'No documents here yet'}
                    action={!q && folderRights.includes('upload') ? (
                      <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => openUpload({ folderId: folder.id, subDividerId: subId })}>
                        Upload the first document here
                      </Button>
                    ) : undefined}
                  >
                    {q ? 'Clear the filter or try another word. Content search looks inside documents.' : null}
                  </EmptyState>
                )}
            </div>
          )}
        </section>
      </div>

      <CreateCabinetDialog
        open={cabinetDialog}
        onOpenChange={setCabinetDialog}
        canCreateShared={role === 'ADMIN' || role === 'SUPER_ADMIN'}
        onSubmit={(v) => createCabinet.mutateAsync(v)}
      />
      <NameDialog
        open={nameAction !== null}
        onOpenChange={(o) => { if (!o) setNameAction(null); }}
        title={nameAction?.kind === 'rename' ? 'Rename folder' : nameAction?.kind === 'subdivider' ? 'New sub-divider' : 'New folder'}
        description={nameAction?.kind === 'subdivider' ? 'Sub-dividers are tabs inside a folder, like “Payslips” in an employee file.'
          : nameAction?.kind === 'subfolder' ? `Inside ${nameAction.folder?.name}` : undefined}
        label="Name"
        initial={nameAction?.kind === 'rename' ? nameAction.folder?.name : ''}
        submitLabel={nameAction?.kind === 'rename' ? 'Rename folder' : nameAction?.kind === 'subdivider' ? 'Create sub-divider' : 'Create folder'}
        onSubmit={submitName}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
        title="Delete folder"
        confirmLabel="Delete folder"
        danger
        onConfirm={() => (deleting ? deleteFolder.mutateAsync(deleting) : Promise.resolve())}
      >
        Delete <strong>{deleting?.name}</strong>? Only empty folders can be deleted: move or delete its subfolders, sub-dividers and documents first.
      </ConfirmDialog>
    </div>
  );
}

function ancestors(folders: FolderNode[], folder: FolderNode): FolderNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: FolderNode[] = [];
  let cur = folder.parentId ? byId.get(folder.parentId) : undefined;
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

function VisibilityIcon({ v }: { v: Visibility }) {
  const label = v === 'DEFAULT' ? 'Organisation cabinet' : v === 'PRIVATE' ? 'Private cabinet' : 'Personal cabinet';
  const Icon = v === 'DEFAULT' ? Users : v === 'PRIVATE' ? Lock : User;
  return <Icon className="size-4 shrink-0 text-muted" aria-label={label} />;
}
