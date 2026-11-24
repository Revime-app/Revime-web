import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureSettled, pickTargetRect, sameLayout, type Rect } from '../src/lib/tour';

/**
 * V8 `ISS8-017` and `ISS8-018`, found on the emulator with APK `50dbdfa8` (2026-11-18).
 *
 * ISS8-017: on a page's first open the bubbles were measured one frame after the page said « ready »,
 * before a freshly mounted `SafeAreaView` had applied its top inset (react-native-safe-area-context
 * pushes it in a second commit under the New Architecture): the spotlight sat 47 to 64 px high and a
 * title target, measured above the viewport, was dropped. The run now waits until two readings agree.
 *
 * ISS8-018: a target wholly below the window was treated as absent, so it was never scrolled to
 * (`DEC8-10` (2)); Tableau de bord's « Demandes de devis » never showed.
 */

const WIN = { width: 1080, height: 2400 };
const r = (x: number, y: number, width = 300, height = 100): Rect => ({ x, y, width, height });

describe('pickTargetRect (ISS8-018)', () => {
  it('keeps a node wholly below the window, so the run can scroll to it', () => {
    expect(pickTargetRect([r(42, 2600)], WIN)).toEqual(r(42, 2600));
  });

  it('prefers a node inside the window over a copy below it', () => {
    expect(pickTargetRect([r(42, 2600), r(42, 500)], WIN)).toEqual(r(42, 500));
  });

  it('ignores a node that is not laid out (zero size)', () => {
    expect(pickTargetRect([r(42, 500, 0, 0)], WIN)).toBeNull();
  });

  it('ignores a copy that sits horizontally outside the window (a hidden tab)', () => {
    expect(pickTargetRect([r(-1080, 500), r(1200, 500)], WIN)).toBeNull();
  });
});

describe('sameLayout (ISS8-017)', () => {
  it('treats readings within a pixel as the same layout', () => {
    expect(sameLayout({ a: r(42, 286) }, { a: r(42.4, 286.6) })).toBe(true);
  });

  it('sees the safe-area inset arriving (63 px) as a change', () => {
    expect(sameLayout({ a: r(42, 223) }, { a: r(42, 286) })).toBe(false);
  });

  it('sees a target appearing or disappearing as a change', () => {
    expect(sameLayout({ a: null }, { a: r(42, 286) })).toBe(false);
    expect(sameLayout({ a: r(42, 286) }, { a: null })).toBe(false);
  });
});

describe('measureSettled (ISS8-017)', () => {
  it('waits for the inset to arrive and returns the settled rects, not the first reading', async () => {
    const readings = [
      { title: null, filters: r(42, 223) }, // first frame: no inset yet, the title above the viewport
      { title: r(47, 105), filters: r(42, 286) }, // inset applied
      { title: r(47, 105), filters: r(42, 286) }, // settled
    ];
    let round = 0;
    let waits = 0;
    const out = await measureSettled(
      ['title', 'filters'] as const,
      async (k) => readings[Math.min(round, readings.length - 1)]![k],
      async () => {
        waits += 1;
        round += 1;
      },
      10,
    );
    expect(out).toEqual({ title: r(47, 105), filters: r(42, 286) });
    expect(waits).toBe(2);
  });

  it('needs two agreeing readings even when the first is already right', async () => {
    let waits = 0;
    const out = await measureSettled(['a'] as const, async () => r(1, 2), async () => void (waits += 1), 10);
    expect(out).toEqual({ a: r(1, 2) });
    expect(waits).toBe(1);
  });

  it('gives up after the cap and returns the last reading (a page that keeps moving)', async () => {
    let y = 0;
    let waits = 0;
    const out = await measureSettled(['a'] as const, async () => r(0, (y += 10)), async () => void (waits += 1), 4);
    expect(waits).toBe(4);
    expect(out.a?.y).toBe(50);
  });
});

describe('TourProvider wiring', () => {
  const provider = readFileSync(resolve(__dirname, '../src/tour/TourProvider.tsx'), 'utf8');

  it('measures a run only once the layout has settled (ISS8-017)', () => {
    expect(provider).toMatch(/measureSettled\(/);
  });

  it('chooses among a target\'s nodes with pickTargetRect, keeping one below the fold (ISS8-018)', () => {
    expect(provider).toMatch(/pickTargetRect\(/);
    expect(provider).not.toMatch(/rect\.y < height && rect\.y \+ rect\.height > 0/);
  });
});
