import { useState } from 'react';

export interface SubDividerNode {
  id: string;
  name: string;
  folderId: string;
}

export interface FolderNode {
  id: string;
  name: string;
  cabinetId: string;
  parentId: string | null;
  subDividers: SubDividerNode[];
  _count: { documents: number };
  children?: FolderNode[];
}

export type NodeType = 'folder' | 'subdiv';
export interface SelectedNode { id: string; type: NodeType }

// ── Drag bus ────────────────────────────────────────────────────────────────
// HTML5 dnd can't read dataTransfer during `dragover`, so we hold the payload
// in a module-level singleton for the duration of the drag.

export interface DragNode {
  kind: 'folder' | 'subdiv';
  id: string;
  name: string;
  cabinetId?: string;
  parentId?: string | null;
  folderId?: string;
}
let _drag: DragNode | null = null;
export const dragBus = {
  set: (d: DragNode | null) => { _drag = d; },
  get: () => _drag,
};

export type MoveFolderFn = (folderId: string, targetParentId: string | null, targetCabinetId: string) => void;
export type MoveSubDividerFn = (subDividerId: string, targetFolderId: string) => void;

// ── Icons ─────────────────────────────────────────────────────────────────────

function FolderIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-amber-300 shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  );
}

function DividerIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
      fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

// ── FolderItem ────────────────────────────────────────────────────────────────

interface FolderItemProps {
  folder: FolderNode;
  depth: number;
  selected: SelectedNode | null;
  onSelect: (node: SelectedNode) => void;
  onCreateChild: (parentFolderId: string) => void;
  onCreateSubDivider: (folderId: string) => void;
  canEdit: boolean;
  onMoveFolder: MoveFolderFn;
  onMoveSubDivider: MoveSubDividerFn;
}

function FolderItem({ folder, depth, selected, onSelect, onCreateChild, onCreateSubDivider, canEdit, onMoveFolder, onMoveSubDivider }: FolderItemProps) {
  const [expanded, setExpanded] = useState(true);
  const [dropActive, setDropActive] = useState(false);
  const isSelected = selected?.id === folder.id && selected?.type === 'folder';
  const hasChildren = (folder.children?.length ?? 0) > 0 || folder.subDividers.length > 0;

  // A drag payload is a valid drop onto this folder when it isn't the folder
  // itself and isn't already this folder's direct child / member.
  function isValidDrop(d: DragNode | null): boolean {
    if (!canEdit || !d) return false;
    if (d.kind === 'folder') return d.id !== folder.id;
    return d.folderId !== folder.id;
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDropActive(false);
    const d = dragBus.get();
    if (!isValidDrop(d)) return;
    if (d!.kind === 'folder') onMoveFolder(d!.id, folder.id, folder.cabinetId);
    else onMoveSubDivider(d!.id, folder.id);
    dragBus.set(null);
  }

  return (
    <div>
      <div
        draggable={canEdit}
        onDragStart={e => {
          e.stopPropagation();
          dragBus.set({ kind: 'folder', id: folder.id, name: folder.name, cabinetId: folder.cabinetId, parentId: folder.parentId });
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', folder.name);
        }}
        onDragEnd={() => { dragBus.set(null); setDropActive(false); }}
        onDragOver={e => { if (isValidDrop(dragBus.get())) { e.preventDefault(); e.stopPropagation(); setDropActive(true); } }}
        onDragLeave={() => setDropActive(false)}
        onDrop={handleDrop}
        className={`group flex items-center gap-1.5 py-1.5 pr-2 rounded-lg cursor-pointer text-sm select-none transition-colors ${
          dropActive
            ? 'ring-2 ring-indigo-400 bg-indigo-50'
            : isSelected
              ? 'bg-indigo-50 text-indigo-700 font-medium'
              : 'text-gray-700 hover:bg-gray-100'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          className="w-3.5 h-3.5 flex items-center justify-center shrink-0"
        >
          {hasChildren ? <ChevronIcon open={expanded} /> : <span className="w-3.5" />}
        </button>
        <FolderIcon open={expanded && hasChildren} />
        <span
          className="flex-1 truncate text-xs"
          onClick={() => onSelect({ id: folder.id, type: 'folder' })}
          title={canEdit ? `${folder.name} — drag to move` : folder.name}
        >
          {folder.name}
        </span>
        {folder._count.documents > 0 && (
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 rounded-full shrink-0">
            {folder._count.documents}
          </span>
        )}
        {canEdit && (
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <button
              onClick={e => { e.stopPropagation(); onCreateChild(folder.id); }}
              title="New subfolder"
              className="p-0.5 text-gray-400 hover:text-indigo-600 rounded"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <>
          {folder.subDividers.map(sd => (
            <div
              key={sd.id}
              draggable={canEdit}
              onDragStart={e => {
                e.stopPropagation();
                dragBus.set({ kind: 'subdiv', id: sd.id, name: sd.name, folderId: folder.id });
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', sd.name);
              }}
              onDragEnd={() => dragBus.set(null)}
              onClick={() => onSelect({ id: sd.id, type: 'subdiv' })}
              className={`flex items-center gap-1.5 py-1.5 pr-2 rounded-lg cursor-pointer text-xs select-none transition-colors ${
                selected?.id === sd.id && selected?.type === 'subdiv'
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
              style={{ paddingLeft: `${8 + (depth + 1) * 16 + 4}px` }}
              title={canEdit ? `${sd.name} — drag into another folder` : sd.name}
            >
              <span className="w-3" />
              <DividerIcon />
              <span className="truncate">{sd.name}</span>
            </div>
          ))}

          {folder.children?.map(child => (
            <FolderItem
              key={child.id}
              folder={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onCreateSubDivider={onCreateSubDivider}
              canEdit={canEdit}
              onMoveFolder={onMoveFolder}
              onMoveSubDivider={onMoveSubDivider}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ── CabinetTree ───────────────────────────────────────────────────────────────

interface CabinetTreeProps {
  folders: FolderNode[];
  selected: SelectedNode | null;
  onSelect: (node: SelectedNode) => void;
  onCreateRootFolder: () => void;
  onCreateChildFolder: (parentId: string) => void;
  onCreateSubDivider: (folderId: string) => void;
  canEdit: boolean;
  onMoveFolder?: MoveFolderFn;
  onMoveSubDivider?: MoveSubDividerFn;
}

const noop = () => {};

export function buildTree(flat: FolderNode[], parentId: string | null = null): FolderNode[] {
  return flat
    .filter(f => f.parentId === parentId)
    .map(f => ({ ...f, children: buildTree(flat, f.id) }));
}

export function CabinetTree({
  folders,
  selected,
  onSelect,
  onCreateRootFolder,
  onCreateChildFolder,
  onCreateSubDivider,
  canEdit,
  onMoveFolder = noop,
  onMoveSubDivider = noop,
}: CabinetTreeProps) {
  const rootFolders = buildTree(folders);

  if (!rootFolders.length && !canEdit) {
    return <p className="px-4 py-4 text-xs text-gray-400">No folders yet.</p>;
  }

  return (
    <div className="py-1 space-y-0.5">
      {rootFolders.map(f => (
        <FolderItem
          key={f.id}
          folder={f}
          depth={0}
          selected={selected}
          onSelect={onSelect}
          onCreateChild={onCreateChildFolder}
          onCreateSubDivider={onCreateSubDivider}
          canEdit={canEdit}
          onMoveFolder={onMoveFolder}
          onMoveSubDivider={onMoveSubDivider}
        />
      ))}
      {canEdit && (
        <button
          onClick={onCreateRootFolder}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 w-full mt-1 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New folder
        </button>
      )}
    </div>
  );
}
