import { useCallback, useRef, useState } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import { PdfViewer } from './PdfViewer';

export type AnnotationType = 'highlight' | 'redact' | 'text';

export interface Annotation {
  id: string;
  type: AnnotationType;
  page: number;  // 1-indexed
  x: number;     // 0–1 fraction of page width
  y: number;     // 0–1 fraction of page height (top-down)
  width: number;
  height: number;
  text?: string;
}

type DrawMode = 'none' | AnnotationType;

interface DrawState {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface Props {
  url: string;
  onNewVersion: (bytes: Uint8Array) => Promise<void>;
}

async function applyAnnotations(pdfUrl: string, annotations: Annotation[]): Promise<Uint8Array> {
  const res = await fetch(pdfUrl);
  const buf = await res.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buf);
  const pages = pdfDoc.getPages();

  for (const ann of annotations) {
    const page = pages[ann.page - 1];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
    const x = ann.x * pw;
    // pdf-lib uses bottom-up y; our coordinates are top-down
    const y = (1 - ann.y - ann.height) * ph;
    const w = ann.width * pw;
    const h = ann.height * ph;

    if (ann.type === 'redact') {
      page.drawRectangle({ x, y, width: w, height: h, color: rgb(0, 0, 0) });
    } else if (ann.type === 'highlight') {
      page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 0), opacity: 0.35 });
    } else if (ann.type === 'text' && ann.text) {
      page.drawText(ann.text, { x, y: y + h - 12, size: 12, color: rgb(0, 0, 0) });
    }
  }

  return pdfDoc.save();
}

export function PdfAnnotator({ url, onNewVersion }: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [mode, setMode] = useState<DrawMode>('none');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [drawing, setDrawing] = useState<DrawState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingTextPos, setPendingTextPos] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState('');
  const overlayRef = useRef<SVGSVGElement>(null);

  const getSvgFraction = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = overlayRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (mode === 'none') return;
    if (mode === 'text') {
      const pos = getSvgFraction(e);
      setPendingTextPos(pos);
      setTextInput('');
      return;
    }
    const pos = getSvgFraction(e);
    setDrawing({ startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y });
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing) return;
    const pos = getSvgFraction(e);
    setDrawing(d => (d ? { ...d, endX: pos.x, endY: pos.y } : null));
  }

  function handlePointerUp() {
    if (!drawing) return;
    const { startX, startY, endX, endY } = drawing;
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);
    if (w > 0.005 && h > 0.005) {
      setAnnotations(a => [
        ...a,
        { id: crypto.randomUUID(), type: mode as AnnotationType, page: currentPage, x, y, width: w, height: h },
      ]);
    }
    setDrawing(null);
  }

  function addTextAnnotation() {
    if (!pendingTextPos || !textInput.trim()) { setPendingTextPos(null); return; }
    setAnnotations(a => [
      ...a,
      {
        id: crypto.randomUUID(),
        type: 'text',
        page: currentPage,
        x: pendingTextPos.x,
        y: pendingTextPos.y,
        width: 0.25,
        height: 0.04,
        text: textInput.trim(),
      },
    ]);
    setPendingTextPos(null);
    setTextInput('');
  }

  async function handleSave() {
    if (!annotations.length) return;
    setSaving(true);
    try {
      const bytes = await applyAnnotations(url, annotations);
      await onNewVersion(bytes);
      setAnnotations([]);
    } catch (err) {
      console.error('Failed to apply annotations:', err);
      alert('Failed to save annotated PDF. Check the browser console for details.');
    } finally {
      setSaving(false);
    }
  }

  const pageAnnotations = annotations.filter(a => a.page === currentPage);
  const drawPreview = drawing
    ? {
        x: Math.min(drawing.startX, drawing.endX),
        y: Math.min(drawing.startY, drawing.endY),
        w: Math.abs(drawing.endX - drawing.startX),
        h: Math.abs(drawing.endY - drawing.startY),
      }
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 border-b border-gray-200 flex-wrap shrink-0">
        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-2 py-1 text-sm border rounded bg-white disabled:opacity-40 hover:bg-gray-50"
          >
            ‹
          </button>
          <span className="text-sm text-gray-600 w-24 text-center select-none">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-2 py-1 text-sm border rounded bg-white disabled:opacity-40 hover:bg-gray-50"
          >
            ›
          </button>
        </div>

        <div className="w-px h-5 bg-gray-300 shrink-0" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale(s => Math.max(0.5, parseFloat((s - 0.25).toFixed(2))))}
            className="px-2 py-1 text-sm border rounded bg-white hover:bg-gray-50"
          >
            −
          </button>
          <span className="text-sm text-gray-600 w-14 text-center select-none">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale(s => Math.min(3, parseFloat((s + 0.25).toFixed(2))))}
            className="px-2 py-1 text-sm border rounded bg-white hover:bg-gray-50"
          >
            +
          </button>
        </div>

        <div className="w-px h-5 bg-gray-300 shrink-0" />

        {/* Annotation mode buttons */}
        {(['none', 'highlight', 'redact', 'text'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-2.5 py-1 text-xs rounded border font-medium transition-colors ${
              mode === m
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {m === 'none'
              ? 'Select'
              : m === 'highlight'
                ? '✏ Highlight'
                : m === 'redact'
                  ? '⬛ Redact'
                  : '📝 Text'}
          </button>
        ))}

        {annotations.length > 0 && (
          <>
            <div className="w-px h-5 bg-gray-300 shrink-0" />
            <span className="text-xs text-gray-500 select-none">
              {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setAnnotations([])}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Clear all
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300 rounded transition-colors"
            >
              {saving ? 'Saving…' : 'Save as New Version'}
            </button>
          </>
        )}
      </div>

      {/* ── PDF + SVG overlay ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-gray-200 flex justify-center py-6">
        {/* Wrapper: inline-block so it shrink-wraps the rendered page */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <PdfViewer
            url={url}
            pageNumber={currentPage}
            scale={scale}
            onNumPages={setTotalPages}
          />

          {/* SVG overlay — same size as the page div */}
          <svg
            ref={overlayRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              cursor: mode === 'none' ? 'default' : 'crosshair',
              userSelect: 'none',
              touchAction: 'none',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Committed annotations for this page */}
            {pageAnnotations.map(ann =>
              ann.type === 'text' ? (
                <text
                  key={ann.id}
                  x={`${ann.x * 100}%`}
                  y={`${(ann.y + ann.height) * 100}%`}
                  fill="navy"
                  fontSize="12"
                  style={{ pointerEvents: 'none' }}
                >
                  {ann.text}
                </text>
              ) : (
                <rect
                  key={ann.id}
                  x={`${ann.x * 100}%`}
                  y={`${ann.y * 100}%`}
                  width={`${ann.width * 100}%`}
                  height={`${ann.height * 100}%`}
                  fill={ann.type === 'redact' ? 'black' : 'yellow'}
                  opacity={ann.type === 'redact' ? 1 : 0.4}
                  style={{ pointerEvents: 'none' }}
                />
              ),
            )}

            {/* In-progress drawing preview */}
            {drawPreview && (
              <rect
                x={`${drawPreview.x * 100}%`}
                y={`${drawPreview.y * 100}%`}
                width={`${drawPreview.w * 100}%`}
                height={`${drawPreview.h * 100}%`}
                fill={mode === 'redact' ? 'black' : 'yellow'}
                opacity={mode === 'redact' ? 0.5 : 0.3}
                stroke={mode === 'redact' ? '#333' : '#aaa'}
                strokeWidth="1"
                strokeDasharray="4 2"
                style={{ pointerEvents: 'none' }}
              />
            )}
          </svg>
        </div>
      </div>

      {/* ── Text annotation input dialog ──────────────────────────────────────── */}
      {pendingTextPos && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 w-80 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Add Text Annotation</h3>
            <input
              autoFocus
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTextAnnotation(); if (e.key === 'Escape') setPendingTextPos(null); }}
              placeholder="Enter text…"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingTextPos(null)}
                className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addTextAnnotation}
                className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
