import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, Bookmark } from 'lucide-react';
import type { FolderNode } from '@/lib/api/types';
import { cn } from '@/lib/cn';

/**
 * Cabinet contents as a tree: folders nest, sub-dividers are the tabs inside a folder (leaves).
 * Native buttons inside nested lists, so Tab/Enter/Space work without custom key handling.
 */
export function FolderTree({ folders, selectedFolder, selectedSub, onSelect }: {
  folders: FolderNode[];
  selectedFolder: string | null;
  selectedSub: string | null;
  onSelect: (folderId: string, subDividerId: string | null) => void;
}) {
  const children = useMemo(() => {
    const map = new Map<string | null, FolderNode[]>();
    for (const f of folders) map.set(f.parentId, [...(map.get(f.parentId) ?? []), f]);
    return map;
  }, [folders]);

  // Expand the path to the selected folder by default, so deep links show where you are.
  const initiallyOpen = useMemo(() => {
    const open = new Set<string>();
    const byId = new Map(folders.map((f) => [f.id, f]));
    let cur = selectedFolder ? byId.get(selectedFolder) : undefined;
    while (cur) {
      open.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return open;
  }, [folders, selectedFolder]);
  const [open, setOpen] = useState<Set<string>>(initiallyOpen);
  useEffect(() => setOpen((s) => new Set([...s, ...initiallyOpen])), [initiallyOpen]);
  const toggle = (id: string) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const render = (parent: string | null, level: number) => {
    const list = children.get(parent);
    if (!list?.length) return null;
    return (
      <ul role={level === 0 ? 'tree' : 'group'} aria-label={level === 0 ? 'Folders' : undefined}>
        {list.map((f) => {
          const hasKids = !!children.get(f.id)?.length || f.subDividers.length > 0;
          const isOpen = open.has(f.id);
          const active = selectedFolder === f.id && !selectedSub;
          return (
            <li key={f.id} role="treeitem" aria-expanded={hasKids ? isOpen : undefined} aria-selected={active}>
              <div className={cn('group flex items-center rounded-md', active ? 'bg-manila-200' : 'hover:bg-navy-50')}
                style={{ paddingLeft: level * 14 }}>
                <button
                  type="button"
                  className={cn('grid size-6 shrink-0 place-items-center rounded text-subtle hover:text-ink', !hasKids && 'invisible')}
                  onClick={() => { toggle(f.id); }}
                  aria-label={isOpen ? `Collapse ${f.name}` : `Expand ${f.name}`}
                  tabIndex={hasKids ? 0 : -1}
                >
                  <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
                </button>
                <button
                  type="button"
                  className={cn('flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 text-left text-[13.5px]', active ? 'font-medium text-ink' : 'text-ink')}
                  onClick={() => { onSelect(f.id, null); if (hasKids && !isOpen) toggle(f.id); }}
                >
                  {isOpen ? <FolderOpen className="size-4 shrink-0 text-manila-700" aria-hidden /> : <Folder className="size-4 shrink-0 text-manila-700" aria-hidden />}
                  <span className="truncate">{f.name}</span>
                </button>
              </div>
              {isOpen ? (
                <>
                  {render(f.id, level + 1)}
                  {f.subDividers.length ? (
                    <ul role="group">
                      {f.subDividers.map((s) => {
                        const subActive = selectedSub === s.id;
                        return (
                          <li key={s.id} role="treeitem" aria-selected={subActive}>
                            <button
                              type="button"
                              className={cn('flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[13px]',
                                subActive ? 'bg-manila-200 font-medium text-ink' : 'text-muted hover:bg-navy-50 hover:text-ink')}
                              style={{ paddingLeft: (level + 1) * 14 + 24 }}
                              onClick={() => onSelect(f.id, s.id)}
                            >
                              <Bookmark className="size-3.5 shrink-0" aria-hidden />
                              <span className="truncate">{s.name}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  return <div className="py-1">{render(null, 0)}</div>;
}
