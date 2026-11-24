import { parisDayStart } from '@revime/shared';

/** `YYYY-MM-DD` of the day after `ymd`, by calendar arithmetic (no DST involved). */
function nextYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * « Du 12 au 14 octobre » as the journal's instant bounds: from 00:00 Paris on the first day to
 * the last millisecond of the second, so the chosen LAST day is included (the page used to send
 * only presets, and a date-only upper bound elsewhere dropped the day it named). Either side may
 * be empty. Returns null for a value that is not a calendar day or for an inverted range.
 */
export function auditRangeBounds(
  from: string,
  to: string,
): { startDate?: string; endDate?: string } | null {
  if ((from && !YMD.test(from)) || (to && !YMD.test(to))) return null;
  if (from && to && from > to) return null;
  return {
    startDate: from ? parisDayStart(from).toISOString() : undefined,
    endDate: to ? new Date(parisDayStart(nextYmd(to)).getTime() - 1).toISOString() : undefined,
  };
}
