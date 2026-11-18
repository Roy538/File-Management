import { describe, expect, it } from 'vitest';
import { segments } from './snippet';

const join = (s: { text: string }[]) => s.map((x) => x.text).join('');

describe('segments', () => {
  it('marks ranges and keeps the full text', () => {
    const text = 'Confidential employment agreement';
    const out = segments({ text, highlights: [[13, 23]] });
    expect(out).toEqual([
      { text: 'Confidential ', marked: false },
      { text: 'employment', marked: true },
      { text: ' agreement', marked: false },
    ]);
    expect(join(out)).toBe(text);
  });

  it('handles ranges at the start and end of the text', () => {
    const out = segments({ text: 'abc def', highlights: [[0, 3], [4, 7]] });
    expect(out).toEqual([
      { text: 'abc', marked: true },
      { text: ' ', marked: false },
      { text: 'def', marked: true },
    ]);
  });

  it('merges overlapping and adjacent ranges', () => {
    expect(segments({ text: 'abcdefgh', highlights: [[2, 5], [4, 6], [6, 7]] })).toEqual([
      { text: 'ab', marked: false },
      { text: 'cdefg', marked: true },
      { text: 'h', marked: false },
    ]);
  });

  it('respects the leading ellipsis offset the server applies', () => {
    // Server shifts highlights by one when it prefixes "…".
    const out = segments({ text: '…the loan agreement…', highlights: [[5, 9]] });
    expect(out.find((s) => s.marked)?.text).toBe('loan');
    expect(join(out)).toBe('…the loan agreement…');
  });

  it('ignores empty and out-of-range highlights', () => {
    const out = segments({ text: 'short', highlights: [[3, 3], [4, 99], [-5, 1]] });
    expect(out).toEqual([
      { text: 's', marked: true },
      { text: 'hor', marked: false },
      { text: 't', marked: true },
    ]);
  });
});
