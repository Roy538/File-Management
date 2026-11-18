export type PeriodUnit = 'D' | 'M' | 'Y';

/** 90 + 'D' → "P90D" (ISO-8601 period, what the backend's java.time.Period parses). */
export function toPeriod(amount: number, unit: PeriodUnit): string {
  if (!Number.isInteger(amount) || amount < 0) throw new Error('Period must be a whole number of 0 or more');
  return `P${amount}${unit}`;
}

/** "P7Y" → "7 years", "P1Y6M" → "1 year 6 months", "P0D" → "no waiting period". */
export function describePeriod(iso: string): string {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(iso);
  if (!m) return iso;
  const parts: string[] = [];
  const add = (n: string | undefined, word: string) => {
    const v = Number(n ?? 0);
    if (v) parts.push(`${v} ${word}${v === 1 ? '' : 's'}`);
  };
  add(m[1], 'year'); add(m[2], 'month'); add(m[3], 'week'); add(m[4], 'day');
  return parts.length ? parts.join(' ') : 'no waiting period';
}

/** "Employee no." → "employee_no": the lower_snake_case key the backend requires (starts with a letter, ≤ 64). */
export function keyFromLabel(label: string): string {
  const key = label
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '');
  return key.slice(0, 64);
}
