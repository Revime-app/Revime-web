import { describe, it, expect } from 'vitest';
import { auditRangeBounds } from '../lib/audit-range';

describe('auditRangeBounds (RU-24, F4 « filtrable par date »)', () => {
  it('runs from Paris midnight to the last millisecond of the chosen last day', () => {
    // 12 and 14 October 2026 are CEST (UTC+2).
    expect(auditRangeBounds('2026-10-12', '2026-10-14')).toEqual({
      startDate: '2026-10-11T22:00:00.000Z',
      endDate: '2026-10-14T21:59:59.999Z',
    });
  });

  it('includes the chosen last day: the end is after that day starts and before the next one', () => {
    const { startDate, endDate } = auditRangeBounds('2026-10-14', '2026-10-14')!;
    expect(new Date(endDate!).getTime()).toBeGreaterThan(new Date(startDate!).getTime());
    expect(new Date(endDate!).getTime() - new Date(startDate!).getTime()).toBe(86_400_000 - 1);
  });

  it('follows the clock change: the day the clocks go back lasts 25 hours', () => {
    // 25 Oct 2026, Paris leaves summer time at 03:00.
    const { startDate, endDate } = auditRangeBounds('2026-10-25', '2026-10-25')!;
    expect(new Date(endDate!).getTime() - new Date(startDate!).getTime()).toBe(25 * 3_600_000 - 1);
  });

  it('accepts one side only', () => {
    expect(auditRangeBounds('2026-10-12', '')).toEqual({ startDate: '2026-10-11T22:00:00.000Z', endDate: undefined });
    expect(auditRangeBounds('', '2026-10-12')).toEqual({ startDate: undefined, endDate: '2026-10-12T21:59:59.999Z' });
  });

  it('refuses an inverted range and a value that is not a day', () => {
    expect(auditRangeBounds('2026-10-14', '2026-10-12')).toBeNull();
    expect(auditRangeBounds('14/10/2026', '')).toBeNull();
  });
});
