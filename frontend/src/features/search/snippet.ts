import type { Snippet } from '@/lib/api/types';

export interface Segment { text: string; marked: boolean }

/**
 * Splits a snippet into plain and highlighted segments. Ranges are [start, end) offsets into
 * `text`; overlapping or adjacent ranges are merged and out-of-range values clamped, so the
 * output always reproduces `text` exactly. Rendered as text nodes — never as HTML.
 */
export function segments(snippet: Snippet): Segment[] {
  const { text } = snippet;
  const ranges = snippet.highlights
    .map(([s, e]) => [Math.max(0, Math.min(s, text.length)), Math.max(0, Math.min(e, text.length))] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  const out: Segment[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) out.push({ text: text.slice(pos, s), marked: false });
    out.push({ text: text.slice(s, e), marked: true });
    pos = e;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), marked: false });
  return out;
}
