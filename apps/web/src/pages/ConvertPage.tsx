import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiConvert } from '../lib/api-client';
import { Layout } from '../components/Layout';

// ── Types (mirror backend ToolMeta) ─────────────────────────────────────────

interface ToolOption {
  key: string;
  label: string;
  type: 'text' | 'select';
  choices?: string[];
  default?: string;
}
interface ToolMeta {
  key: string;
  name: string;
  description: string;
  accept: string;
  multiple: boolean;
  batch?: boolean;
  out: string;
  engine: 'js' | 'libreoffice' | 'hybrid';
  loOnly?: boolean;
  available?: boolean;
  options?: ToolOption[];
}

interface EngineStatus { libreOffice: boolean; activeEngine: 'js' | 'libreoffice' }

// ── Per-tool presentation (icon + accent colour) ────────────────────────────

const TOOL_STYLE: Record<string, { color: string; glyph: JSX.Element }> = {
  'pdf-to-word':   { color: 'from-blue-500 to-blue-700',      glyph: <>W</> },
  'word-to-pdf':   { color: 'from-red-500 to-red-700',        glyph: <>PDF</> },
  'merge':         { color: 'from-amber-500 to-orange-600',   glyph: <>+</> },
  'split':         { color: 'from-emerald-500 to-emerald-700', glyph: <>✂</> },
  'images-to-pdf': { color: 'from-purple-500 to-purple-700',  glyph: <>🖼</> },
  'rotate':        { color: 'from-cyan-500 to-cyan-700',      glyph: <>⟳</> },
  'page-numbers':  { color: 'from-slate-500 to-slate-700',    glyph: <>#</> },
  'watermark':     { color: 'from-pink-500 to-rose-600',      glyph: <>❖</> },
  'extract-text':  { color: 'from-teal-500 to-teal-700',      glyph: <>T</> },
  'optimize':      { color: 'from-indigo-500 to-indigo-700',  glyph: <>↓</> },
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// ── Tool runner modal ────────────────────────────────────────────────────────

function ToolRunner({ tool, onClose }: { tool: ToolMeta; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<Record<string, string>>(() =>
    Object.fromEntries((tool.options ?? []).map(o => [o.key, o.default ?? (o.type === 'select' ? o.choices?.[0] ?? '' : '')])),
  );
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const addFiles = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    setFiles(prev => (tool.multiple ? [...prev, ...arr] : arr.slice(0, 1)));
  }, [tool.multiple]);

  async function run() {
    if (!files.length) { toast.error('Please choose a file first'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('file', f));
      Object.entries(opts).forEach(([k, v]) => { if (v) fd.append(k, v); });
      const { blob, filename } = await apiConvert(`/api/conversion/${tool.key}`, fd);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${tool.name} complete — downloaded ${filename}`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'Conversion failed');
    } finally {
      setBusy(false);
    }
  }

  const style = TOOL_STYLE[tool.key] ?? { color: 'from-gray-500 to-gray-700', glyph: <>?</> };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${style.color} flex items-center justify-center text-white text-xs font-bold`}>
            {style.glyph}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">{tool.name}</h3>
            <p className="text-xs text-gray-400 truncate">{tool.description}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              drag ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30'
            }`}
          >
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5M7.5 7.5L12 3l4.5 4.5" />
            </svg>
            <p className="text-sm text-gray-500">
              Drop {tool.multiple ? 'files' : 'a file'} here or <span className="text-blue-600 font-medium">browse</span>
            </p>
            <p className="text-[11px] text-gray-400">Accepts {tool.accept}{tool.multiple ? ' · multiple allowed' : ''}</p>
            {tool.batch && (
              <p className="text-[11px] text-blue-600 mt-0.5">Add several files to convert them all at once — you'll get a ZIP.</p>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={tool.accept}
            multiple={tool.multiple}
            className="hidden"
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
          />

          {/* Selected files */}
          {files.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="w-7 h-7 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-bold shrink-0">
                    {(f.name.split('.').pop() ?? '?').slice(0, 4).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{f.name}</p>
                    <p className="text-[10px] text-gray-400">{fmtBytes(f.size)}</p>
                  </div>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 text-lg shrink-0">&times;</button>
                </div>
              ))}
            </div>
          )}

          {/* Options */}
          {(tool.options ?? []).map(o => (
            <div key={o.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{o.label}</label>
              {o.type === 'select' ? (
                <select
                  value={opts[o.key] ?? ''}
                  onChange={e => setOpts(p => ({ ...p, [o.key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(o.choices ?? []).map(c => <option key={c} value={c}>{c}°</option>)}
                </select>
              ) : (
                <input
                  value={opts[o.key] ?? ''}
                  onChange={e => setOpts(p => ({ ...p, [o.key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          ))}

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button
              onClick={run}
              disabled={busy || !files.length}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 rounded-lg"
            >
              {busy
                ? 'Converting…'
                : tool.batch && files.length > 1
                  ? `Convert ${files.length} files → ZIP`
                  : `Convert → .${tool.out}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function ConvertPage() {
  const [active, setActive] = useState<ToolMeta | null>(null);

  const { data: tools, isLoading, isError } = useQuery({
    queryKey: ['conversion-tools'],
    queryFn: () => api.get<ToolMeta[]>('/api/conversion/tools'),
    staleTime: 5 * 60_000,
  });

  const { data: engine } = useQuery({
    queryKey: ['conversion-engine'],
    queryFn: () => api.get<EngineStatus>('/api/conversion/engine'),
    staleTime: 5 * 60_000,
  });

  const grouped = useMemo(() => tools ?? [], [tools]);

  return (
    <Layout>
      <div className="h-full overflow-y-auto bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-b from-white to-gray-50 border-b border-gray-200 px-6 py-6">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              PDF <span className="text-red-600">Tools</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Convert and edit documents right in the browser — everything runs on your own server, no third-party service.
            </p>
            {engine && (
              <div className="mt-3 inline-flex items-center gap-2 text-xs">
                <span className="text-gray-400">Engine:</span>
                {engine.libreOffice ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> LibreOffice (high-fidelity) active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pure-JS engine — install LibreOffice for Office↔PDF fidelity
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-6">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : isError ? (
            <p className="text-sm text-red-500">Could not load tools. Is the API running?</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {grouped.map(tool => {
                const style = TOOL_STYLE[tool.key] ?? { color: 'from-gray-500 to-gray-700', glyph: <>?</> };
                const disabled = tool.available === false;
                return (
                  <button
                    key={tool.key}
                    onClick={() => !disabled && setActive(tool)}
                    disabled={disabled}
                    title={disabled ? 'Requires the LibreOffice engine (not installed on this server)' : undefined}
                    className={`group text-left bg-white border rounded-xl p-4 transition-all relative ${
                      disabled
                        ? 'border-gray-200 opacity-60 cursor-not-allowed'
                        : 'border-gray-200 hover:shadow-lg hover:border-blue-200 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${style.color} flex items-center justify-center text-white text-sm font-bold mb-3 shadow-sm ${disabled ? 'grayscale' : ''}`}>
                      {style.glyph}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
                      {tool.name}
                      {tool.batch && (
                        <span className="text-[9px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">BULK</span>
                      )}
                      {tool.engine === 'libreoffice' && !disabled && (
                        <span className="text-[9px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">LO</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1 leading-snug line-clamp-3">{tool.description}</p>
                    {disabled ? (
                      <span className="inline-block mt-2.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                        Needs LibreOffice
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 mt-2.5 text-[11px] font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        Open
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {active && <ToolRunner tool={active} onClose={() => setActive(null)} />}
    </Layout>
  );
}
