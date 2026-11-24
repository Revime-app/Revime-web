import { newerTourMode, type TourModeState, type TourPageId, type TourState } from '@revime/shared';
import type { MaintenanceView } from './maintenance';
import type { TourStep, TourTargetId } from './tour-copy';

/**
 * V8 E2: every decision behind the help bubbles, pure so it is tested without a device
 * (`DEC8-09`, `DEC8-10`, `FND8-026`, `FND8-027`). `TourProvider` only wires these to React Native.
 */

// ── What a page does ──────────────────────────────────────────────────────────────────────────

export type TourPageAction = 'OFFER' | 'RUN' | 'NONE';

/**
 * `tour === undefined` is an API older than E2: no tour at all (never an offer on every launch).
 * The offer appears only on Accueil (`DEC8-09` (3), (6)); other pages wait until it is answered.
 * Nothing happens while the gate is closed (maintenance, CGU, push prompt), the page is blurred, or
 * its content has not loaded (criterion 9).
 */
export function tourPageAction(input: {
  tour: TourModeState | null | undefined;
  page: TourPageId;
  gateOpen: boolean;
  focused: boolean;
  ready: boolean;
}): TourPageAction {
  const { tour, page } = input;
  if (!input.gateOpen || !input.focused || !input.ready || tour === undefined) return 'NONE';
  const offer = tour?.offer ?? null;
  if (offer === null) return page === 'accueil' ? 'OFFER' : 'NONE';
  if (offer === 'DECLINED') return 'NONE';
  return tour!.seen.includes(page) ? 'NONE' : 'RUN';
}

/**
 * `FND8-027` (1): the tour waits for the first platform status read and draws nothing under the
 * maintenance or CGU re-acceptance screen (criterion 9). The staff banner does not block it.
 */
export function tourGateOpen(v: { view: MaintenanceView; statusKnown: boolean }): boolean {
  return v.statusKnown && (v.view === 'none' || v.view === 'banner');
}

/** Android's back button while the tour is up: « Passer » on a bubble, « Plus tard » on the offer. */
export function onTourBack(showing: 'offer' | 'bubble'): 'decline' | 'skip' {
  return showing === 'offer' ? 'decline' : 'skip';
}

// ── State transitions (one mode) ──────────────────────────────────────────────────────────────

export function startTour(state: TourModeState | null, now: Date): TourModeState {
  return { offer: 'STARTED', seen: state?.seen ?? [], updatedAt: now.toISOString() };
}

export function declineTour(state: TourModeState | null, now: Date): TourModeState {
  return { offer: 'DECLINED', seen: state?.seen ?? [], updatedAt: now.toISOString() };
}

export function markSeen(state: TourModeState | null, page: TourPageId, now: Date): TourModeState {
  const seen = state?.seen ?? [];
  return {
    offer: state?.offer ?? 'STARTED',
    seen: seen.includes(page) ? seen : [...seen, page],
    updatedAt: now.toISOString(),
  };
}

/** « Revoir la visite » (`DEC8-09` (5)): straight back to the bubbles, nothing seen, no offer. */
export function resetTour(_state: TourModeState | null, now: Date): TourModeState {
  return { offer: 'STARTED', seen: [], updatedAt: now.toISOString() };
}

/** « Revoir la visite » on the whole state: resets `mode` only (`Q8-02`), the other mode untouched. */
export function replayState(state: TourState | null, mode: 'CLIENT' | 'REPAIRER', now: Date): TourState {
  const base = state ?? { CLIENT: null, REPAIRER: null };
  return { ...base, [mode]: resetTour(base[mode], now) };
}

/** The account's state against the device copy, the newer write winning per mode. */
export function mergeTourState(server: TourState | null, device: TourState | null): TourState | null {
  if (server === null && device === null) return null;
  return {
    CLIENT: newerTourMode(server?.CLIENT ?? null, device?.CLIENT ?? null),
    REPAIRER: newerTourMode(server?.REPAIRER ?? null, device?.REPAIRER ?? null),
  };
}

// ── The run through one page's bubbles ───────────────────────────────────────────────────────

export type TourRun = { page: TourPageId; steps: readonly TourStep[]; index: number; done: boolean };
export type TourRunAction = { type: 'NEXT' } | { type: 'SKIP' } | { type: 'DROP_CURRENT' };

/** Only the steps whose target is mounted and on screen; `null` when none is (the page still counts as seen). */
export function startRun(page: TourPageId, steps: readonly TourStep[], present: ReadonlySet<TourTargetId>): TourRun | null {
  const shown = steps.filter((s) => present.has(s.target));
  return shown.length === 0 ? null : { page, steps: shown, index: 0, done: false };
}

export function tourRunReducer(run: TourRun, action: TourRunAction): TourRun {
  if (run.done) return run;
  switch (action.type) {
    case 'SKIP':
      return { ...run, done: true };
    case 'NEXT':
      return run.index + 1 >= run.steps.length ? { ...run, done: true } : { ...run, index: run.index + 1 };
    case 'DROP_CURRENT': {
      const steps = run.steps.filter((_, i) => i !== run.index);
      return run.index >= steps.length ? { ...run, steps, done: true } : { ...run, steps };
    }
  }
}

/** « 1 / 4 », the client's counter (criterion 4). */
export function counterLabel(run: TourRun): string {
  return `${run.index + 1} / ${run.steps.length}`;
}

/** A page counts as seen only when its run ENDED (last « Compris » or « Passer »), never when interrupted. */
export function finishRun(state: TourModeState | null, run: TourRun, now: Date): TourModeState | null {
  return run.done ? markSeen(state, run.page, now) : state;
}

// ── Geometry (window coordinates, points) ─────────────────────────────────────────────────────

export type Rect = { x: number; y: number; width: number; height: number };
/** The part of the window a target may occupy: under the status bar, above the tab bar (`FND8-026`). */
export type Viewport = { top: number; bottom: number; width: number };

export const BUBBLE_GAP = 12;
export const ARROW_INSET = 24;

/** `min(windowWidth − 48, 340)`: 327pt on a 375pt iPhone SE, the width the copy was measured for. */
export function bubbleWidth(windowWidth: number): number {
  return Math.min(windowWidth - 48, 340);
}

/**
 * Review fix C1: the two targets that live IN the floating tab bar (« Votre espace », « Toutes les
 * demandes »). Against the page viewport, whose bottom is the tab bar's top, they would never be « fully
 * visible »: scrolled to for nothing, then dropped. They are fixed on screen, so they are measured against
 * the whole window; the bubble is still placed inside the page viewport, above the bar.
 */
export const TOUR_FIXED_TARGETS: ReadonlySet<TourTargetId> = new Set<TourTargetId>(['tabProfil', 'fabDemandes']);

export function targetViewport(target: TourTargetId, viewport: Viewport, windowHeight: number): Viewport {
  return TOUR_FIXED_TARGETS.has(target) ? { ...viewport, bottom: windowHeight } : viewport;
}

/**
 * V8 `ISS8-018`: which of a target's registered nodes to use. A node must be laid out (non-zero size)
 * and overlap the window horizontally: a hidden tab's copy of a shared target (two `bell`s) fails that.
 * One inside the window wins; otherwise one above or below it is kept, so the run can scroll to it
 * (`DEC8-10` (2)) instead of dropping it, which is what hid Tableau de bord's « Demandes de devis ».
 */
export function pickTargetRect(rects: readonly Rect[], win: { width: number; height: number }): Rect | null {
  const usable = rects.filter((r) => r.width > 0 && r.height > 0 && r.x < win.width && r.x + r.width > 0);
  return usable.find((r) => r.y < win.height && r.y + r.height > 0) ?? usable[0] ?? null;
}

/** V8 `ISS8-017`: two readings of a page's targets describe the same layout (each within `tolerance`). */
export function sameLayout(
  a: Readonly<Record<string, Rect | null>>,
  b: Readonly<Record<string, Rect | null>>,
  tolerance = 1,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const p = a[k] ?? null;
    const q = b[k] ?? null;
    if (p === null || q === null) {
      if (p !== q) return false;
      continue;
    }
    if (
      Math.abs(p.x - q.x) > tolerance ||
      Math.abs(p.y - q.y) > tolerance ||
      Math.abs(p.width - q.width) > tolerance ||
      Math.abs(p.height - q.height) > tolerance
    ) {
      return false;
    }
  }
  return true;
}

/**
 * V8 `ISS8-017`: measure a page's targets until two readings agree, at most `maxWaits` waits apart.
 * A freshly mounted `SafeAreaView` (react-native-safe-area-context 5.8, New Architecture) lays out once
 * without its inset and adds it in a second commit; a screen's enter transition also moves it. Measuring
 * one frame after « ready » could land in between: spotlights 47 to 64 px high, title targets above the
 * viewport and dropped. A page that never settles gets its last reading.
 */
export async function measureSettled<K extends string>(
  keys: readonly K[],
  measureOne: (key: K) => Promise<Rect | null>,
  wait: () => Promise<void>,
  maxWaits: number,
): Promise<Record<K, Rect | null>> {
  const readAll = async () => {
    const out = {} as Record<K, Rect | null>;
    for (const k of keys) out[k] = await measureOne(k);
    return out;
  };
  let last = await readAll();
  for (let i = 0; i < maxWaits; i += 1) {
    await wait();
    const next = await readAll();
    if (sameLayout(last, next)) return next;
    last = next;
  }
  return last;
}

export function isFullyVisible(rect: Rect, viewport: Viewport): boolean {
  return rect.y >= viewport.top && rect.y + rect.height <= viewport.bottom;
}

/**
 * How far to scroll (positive = down) so the target sits fully in the viewport with `margin` to spare
 * (`DEC8-10` (2)); a target taller than the viewport is top-aligned.
 */
export function scrollDeltaFor(rect: Rect, viewport: Viewport, margin = 16): number {
  if (isFullyVisible(rect, viewport)) return 0;
  const room = viewport.bottom - viewport.top - 2 * margin;
  if (rect.height > room || rect.y < viewport.top) return rect.y - viewport.top - margin;
  return rect.y + rect.height - viewport.bottom + margin;
}

/**
 * Below the target when the bubble fits there, else above; with room on neither side, the roomier
 * side, clamped inside the viewport. The bubble is centred on the screen; the arrow points at the
 * target's centre, kept `ARROW_INSET` inside the bubble's corners.
 */
export function bubblePlacement(
  rect: Rect,
  bubbleHeight: number,
  viewport: Viewport,
): { side: 'below' | 'above'; top: number; arrowX: number } {
  const width = bubbleWidth(viewport.width);
  const left = (viewport.width - width) / 2;
  const centre = rect.x + rect.width / 2 - left;
  const arrowX = Math.min(Math.max(centre, ARROW_INSET), width - ARROW_INSET);

  const belowTop = rect.y + rect.height + BUBBLE_GAP;
  const aboveTop = rect.y - BUBBLE_GAP - bubbleHeight;
  if (belowTop + bubbleHeight <= viewport.bottom) return { side: 'below', top: belowTop, arrowX };
  if (aboveTop >= viewport.top) return { side: 'above', top: aboveTop, arrowX };

  const roomBelow = viewport.bottom - (rect.y + rect.height);
  const roomAbove = rect.y - viewport.top;
  const clamp = (t: number) => Math.min(Math.max(t, viewport.top), viewport.bottom - bubbleHeight);
  return roomBelow >= roomAbove
    ? { side: 'below', top: clamp(belowTop), arrowX }
    : { side: 'above', top: clamp(aboveTop), arrowX };
}
