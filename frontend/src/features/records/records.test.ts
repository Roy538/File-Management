import { describe, expect, it } from 'vitest';
import { daysBetween, formatDay, todayIso } from '@/lib/format';
import { fileStatusLabel, movementLabel } from './types';

describe('registry dates', () => {
  it('shows an API calendar date without shifting it across time zones', () => {
    expect(formatDay('2026-03-01')).toBe('1 Mar 2026');
    expect(formatDay(null)).toBe('—');
  });

  it('counts whole days late, across month ends', () => {
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
    expect(daysBetween('2026-03-02', '2026-03-02')).toBe(0);
    expect(daysBetween('2026-03-05', '2026-03-02')).toBe(-3);
  });

  it('formats today for date inputs in local time', () => {
    expect(todayIso(new Date(2026, 0, 9, 23, 30))).toBe('2026-01-09');
  });
});

describe('registry wording', () => {
  it('names every status and movement in plain language', () => {
    for (const label of [...Object.values(fileStatusLabel), ...Object.values(movementLabel)]) {
      expect(label).not.toMatch(/_|^[A-Z]+$/);
    }
  });
});
