import { describePeriod, keyFromLabel, toPeriod } from './helpers';

describe('retention periods', () => {
  it('builds ISO-8601 periods', () => {
    expect(toPeriod(90, 'D')).toBe('P90D');
    expect(toPeriod(18, 'M')).toBe('P18M');
    expect(toPeriod(7, 'Y')).toBe('P7Y');
    expect(() => toPeriod(-1, 'D')).toThrow();
    expect(() => toPeriod(1.5, 'Y')).toThrow();
  });

  it('describes periods in words', () => {
    expect(describePeriod('P7Y')).toBe('7 years');
    expect(describePeriod('P1Y6M')).toBe('1 year 6 months');
    expect(describePeriod('P1D')).toBe('1 day');
    expect(describePeriod('P0D')).toBe('no waiting period');
    expect(describePeriod('garbage')).toBe('garbage');
  });
});

describe('keyFromLabel', () => {
  it('produces lower_snake_case keys starting with a letter', () => {
    expect(keyFromLabel('Employee no.')).toBe('employee_no');
    expect(keyFromLabel('  Start Date ')).toBe('start_date');
    expect(keyFromLabel('2nd Reviewer')).toBe('nd_reviewer');
    expect(keyFromLabel('Café número')).toBe('cafe_numero');
    expect(keyFromLabel('x'.repeat(80))).toHaveLength(64);
  });
});
