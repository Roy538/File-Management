import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

// ── Types (mirror backend search response) ──────────────────────────────────

type HitType = 'cabinet' | 'folder' | 'subdivider' | 'document';
interface SearchHit {
  type: HitType;
  id: string;
  name: string;
  cabinetId: string;
  cabinetName: string;
  folderId?: string;
  subDividerId?: string;
  documentId?: string;
  path: string;
  meta?: string;
}
interface SearchResponse {
  query: string;
  cabinets: SearchHit[];
  folders: SearchHit[];
  subDividers: SearchHit[];
  documents: SearchHit[];
}

// ── Icons ───────────────────────────────────────────────────────────────────

const P = (d: string) => <path strokeLinecap="round" strokeLinejoin="round" d={d} />;

function HitIcon({ type }: { type: HitType }) {
  const cls = 'w-4 h-4 shrink-0';
  if (type === 'cabinet') return (
    <svg className={`${cls} text-blue-700`} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
      {P('M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v.5H3.75v-.5z')}
      {P('M3.75 9.75h16.5v3.75H3.75zM3.75 15h16.5v3.75A2.25 2.25 0 0118 21H6a2.25 2.25 0 01-2.25-2.25V15z')}
    </svg>
  );
  if (type === 'folder') return (
    <svg className={`${cls} text-amber-500`} fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
  );
  if (type === 'subdivider') return (
    <svg className={`${cls} text-slate-500`} fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
      {P('M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5M6 4.5h4v15H6z')}
    </svg>
  );
  return (
    <svg className={`${cls} text-red-500`} viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
    </svg>
  );
}

const GROUP_LABEL: Record<HitType, string> = {
  cabinet: 'Cabinets', folder: 'Folders', subdivider: 'Sub-dividers', document: 'Documents',
};

// ── Component ────────────────────────────────────────────────────────────────

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  // debounce the input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 220);
    return () => clearTimeout(t);
  }, [q]);

  // focus + reset when opened
  useEffect(() => {
    if (open) { setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
    else { setQ(''); setDebounced(''); }
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => api.get<SearchResponse>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 15_000,
  });

  // flatten in display order for keyboard navigation
  const flat = useMemo(() => {
    if (!data) return [] as SearchHit[];
    return [...data.cabinets, ...data.folders, ...data.subDividers, ...data.documents];
  }, [data]);

  useEffect(() => { setActive(0); }, [flat]);

  if (!open) return null;

  function go(hit: SearchHit) {
    onClose();
    if (hit.type === 'document') { navigate(`/documents/${hit.documentId}/view`); return; }
    const params = new URLSearchParams({ cabinet: hit.cabinetId });
    if (hit.folderId) params.set('folder', hit.folderId);
    if (hit.subDividerId) params.set('subdiv', hit.subDividerId);
    navigate(`/explorer?${params.toString()}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active]); }
  }

  const groups: HitType[] = ['cabinet', 'folder', 'subdivider', 'document'];
  const groupData: Record<HitType, SearchHit[]> = {
    cabinet: data?.cabinets ?? [], folder: data?.folders ?? [],
    subdivider: data?.subDividers ?? [], document: data?.documents ?? [],
  };
  const total = flat.length;
  const showEmpty = debounced.trim().length >= 2 && !isFetching && total === 0;
  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center pt-[10vh] px-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden" onKeyDown={onKeyDown}>
        {/* Input */}
        <div className="flex items-center gap-2 px-4 border-b border-gray-100">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            {P('M21 21l-5.2-5.2m2.2-5.05a7.25 7.25 0 11-14.5 0 7.25 7.25 0 0114.5 0z')}
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search cabinets, folders and documents…"
            className="flex-1 py-3.5 text-sm outline-none placeholder:text-gray-400"
          />
          {isFetching && <span className="text-[11px] text-gray-400">Searching…</span>}
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto">
          {debounced.trim().length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Type at least 2 characters to search.</p>
          ) : showEmpty ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No matches for “{debounced}”.</p>
          ) : (
            groups.map(g => {
              const hits = groupData[g];
              if (!hits.length) return null;
              return (
                <div key={g} className="py-1">
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {GROUP_LABEL[g]} ({hits.length})
                  </p>
                  {hits.map(hit => {
                    runningIndex += 1;
                    const idx = runningIndex;
                    const isActive = idx === active;
                    return (
                      <button
                        key={`${hit.type}-${hit.id}`}
                        onClick={() => go(hit)}
                        onMouseEnter={() => setActive(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        <HitIcon type={hit.type} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900 truncate">{hit.name}</p>
                          <p className="text-[11px] text-gray-400 truncate">
                            {hit.path}{hit.meta ? ` · ${hit.meta}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] text-gray-300 shrink-0">{hit.type === 'document' ? 'Open' : 'Browse'}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400">
            <span>{total} result{total !== 1 ? 's' : ''}</span>
            <span className="flex items-center gap-2">
              <kbd className="border border-gray-200 rounded px-1">↑</kbd>
              <kbd className="border border-gray-200 rounded px-1">↓</kbd>
              to navigate
              <kbd className="border border-gray-200 rounded px-1">↵</kbd>
              to open
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
