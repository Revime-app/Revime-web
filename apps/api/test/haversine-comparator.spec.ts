import { describe, expect, it } from 'vitest';
import { byDistanceKm } from '../src/geo/haversine.js';

/**
 * `CF-34`. The directory's distance sort and the demande feed's share this comparator, so it
 * is pinned HERE by calling it directly rather than through either caller's sorted result.
 *
 * 🛑 That is not belt-and-braces. `repairers.service.ts` records that an integration test
 * PASSED with an infinite sentinel because V8's insertion sort leaves a short array alone when
 * a comparator returns NaN - so a green sorted-result assertion is not evidence about the
 * comparator.
 */
describe('byDistanceKm', () => {
  it('orders two located rows nearest first', () => {
    expect(byDistanceKm(3.2, 12.4)).toBeLessThan(0);
    expect(byDistanceKm(12.4, 3.2)).toBeGreaterThan(0);
  });

  it('treats two unlocated rows as equal', () => {
    expect(byDistanceKm(null, null)).toBe(0);
  });

  it('sorts an unlocated row AFTER a located one, whichever side it arrives on', () => {
    expect(byDistanceKm(null, 12.4)).toBe(1);
    expect(byDistanceKm(12.4, null)).toBe(-1);
  });

  it('returns 0 for two equal distances, so the caller order survives', () => {
    expect(byDistanceKm(4.4, 4.4)).toBe(0);
  });

  // The property the sentinel-based `rank` needs a separate finiteness assertion for. This
  // comparator branches instead of subtracting, so NaN is unreachable - assert that.
  it('never returns NaN, for any combination including the rating sentinel', () => {
    const values = [null, 0, 3.2, Number.MAX_SAFE_INTEGER];
    for (const a of values) {
      for (const b of values) {
        expect(Number.isNaN(byDistanceKm(a, b))).toBe(false);
      }
    }
  });

  it('drives a real Array.prototype.sort with nulls last', () => {
    expect([null, 12.4, null, 3.2].sort(byDistanceKm)).toEqual([3.2, 12.4, null, null]);
  });
});
