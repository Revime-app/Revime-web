import { describe, expect, it } from 'vitest';
import type { TourModeState, TourState } from '@revime/shared';
import type { TourStep } from '../src/lib/tour-copy';
import {
  bubblePlacement,
  counterLabel,
  declineTour,
  finishRun,
  isFullyVisible,
  markSeen,
  mergeTourState,
  resetTour,
  scrollDeltaFor,
  startRun,
  startTour,
  tourPageAction,
  tourRunReducer,
  TOUR_FIXED_TARGETS,
  targetViewport,
} from '../src/lib/tour';

/** V8 E2: the decisions behind the help bubbles (`DEC8-09`, `DEC8-10`), all pure. */

const NOW = new Date('2026-11-17T22:00:00.000Z');
const st = (over: Partial<TourModeState> = {}): TourModeState => ({ offer: 'STARTED', seen: [], updatedAt: '2026-11-17T20:00:00.000Z', ...over });
const open = { gateOpen: true, focused: true, ready: true };

describe('tourPageAction', () => {
  it('undefined tour means no tour (an API older than E2)', () => {
    expect(tourPageAction({ tour: undefined, page: 'accueil', ...open })).toBe('NONE');
  });

  it('offers the tour on Accueil when it was never offered', () => {
    expect(tourPageAction({ tour: null, page: 'accueil', ...open })).toBe('OFFER');
    expect(tourPageAction({ tour: st({ offer: null }), page: 'accueil', ...open })).toBe('OFFER');
  });

  it('waits for Accueil before anything else when never offered', () => {
    expect(tourPageAction({ tour: null, page: 'messages', ...open })).toBe('NONE');
  });

  it('shows nothing after « Plus tard »', () => {
    expect(tourPageAction({ tour: st({ offer: 'DECLINED' }), page: 'accueil', ...open })).toBe('NONE');
    expect(tourPageAction({ tour: st({ offer: 'DECLINED' }), page: 'profil', ...open })).toBe('NONE');
  });

  it('runs a started page once, the first time', () => {
    expect(tourPageAction({ tour: st(), page: 'profil', ...open })).toBe('RUN');
    expect(tourPageAction({ tour: st({ seen: ['profil'] }), page: 'profil', ...open })).toBe('NONE');
  });

  it('does nothing while the gate is closed, the page is blurred or not ready', () => {
    for (const flags of [{ ...open, gateOpen: false }, { ...open, focused: false }, { ...open, ready: false }]) {
      expect(tourPageAction({ tour: null, page: 'accueil', ...flags })).toBe('NONE');
      expect(tourPageAction({ tour: st(), page: 'profil', ...flags })).toBe('NONE');
    }
  });
});

describe('state transitions', () => {
  it('start, decline and seen stamp the time', () => {
    expect(startTour(null, NOW)).toEqual({ offer: 'STARTED', seen: [], updatedAt: NOW.toISOString() });
    expect(declineTour(null, NOW)).toEqual({ offer: 'DECLINED', seen: [], updatedAt: NOW.toISOString() });
    expect(markSeen(st({ seen: ['accueil'] }), 'profil', NOW)).toEqual({ offer: 'STARTED', seen: ['accueil', 'profil'], updatedAt: NOW.toISOString() });
  });

  it('marking a page twice keeps one entry', () => {
    expect(markSeen(st({ seen: ['profil'] }), 'profil', NOW).seen).toEqual(['profil']);
  });

  it('« Revoir la visite » restarts with nothing seen and no offer (DEC8-09 (5))', () => {
    expect(resetTour(st({ offer: 'DECLINED', seen: ['accueil', 'profil'] }), NOW)).toEqual({ offer: 'STARTED', seen: [], updatedAt: NOW.toISOString() });
  });
});

describe('mergeTourState', () => {
  it('keeps the newer side per mode', () => {
    const server: TourState = { CLIENT: st({ seen: ['accueil'], updatedAt: '2026-11-17T21:00:00.000Z' }), REPAIRER: null };
    const device: TourState = { CLIENT: st({ seen: [], updatedAt: '2026-11-17T19:00:00.000Z' }), REPAIRER: st({ seen: ['profil'] }) };
    expect(mergeTourState(server, device)).toEqual({ CLIENT: server.CLIENT, REPAIRER: device.REPAIRER });
  });

  it('a reset is not undone by an older device copy', () => {
    const reset = st({ seen: [], updatedAt: '2026-11-17T22:00:00.000Z' });
    const stale = st({ seen: ['accueil', 'profil'], updatedAt: '2026-11-17T20:00:00.000Z' });
    expect(mergeTourState({ CLIENT: reset, REPAIRER: null }, { CLIENT: stale, REPAIRER: null })?.CLIENT).toEqual(reset);
  });

  it('null on both sides stays null', () => {
    expect(mergeTourState(null, null)).toBeNull();
  });
});

const steps: TourStep[] = [
  { target: 'journeyCard', title: 'A', body: 'a' },
  { target: 'nearbyRow', title: 'B', body: 'b' },
  { target: 'fabDemandes', title: 'C', body: 'c' },
  { target: 'bell', title: 'D', body: 'd' },
];

describe('the run through a page', () => {
  it('absent targets are skipped and the counter counts what is shown', () => {
    const run = startRun('accueil', steps, new Set(['nearbyRow', 'fabDemandes', 'bell']))!;
    expect(run.steps.map((s) => s.target)).toEqual(['nearbyRow', 'fabDemandes', 'bell']);
    expect(counterLabel(run)).toBe('1 / 3');
  });

  it('no present target gives no run', () => {
    expect(startRun('accueil', steps, new Set())).toBeNull();
  });

  it('NEXT walks to the end and the last NEXT ends the run', () => {
    let run = startRun('accueil', steps, new Set(steps.map((s) => s.target)))!;
    run = tourRunReducer(run, { type: 'NEXT' });
    expect(counterLabel(run)).toBe('2 / 4');
    run = tourRunReducer(tourRunReducer(run, { type: 'NEXT' }), { type: 'NEXT' });
    expect(run.done).toBe(false);
    expect(counterLabel(run)).toBe('4 / 4');
    expect(tourRunReducer(run, { type: 'NEXT' }).done).toBe(true);
  });

  it('SKIP (« Passer ») ends the page at once', () => {
    const run = startRun('accueil', steps, new Set(steps.map((s) => s.target)))!;
    expect(tourRunReducer(run, { type: 'SKIP' }).done).toBe(true);
  });

  it('DROP_CURRENT removes a step still off-screen after the scroll and renumbers', () => {
    let run = startRun('accueil', steps, new Set(steps.map((s) => s.target)))!;
    run = tourRunReducer(run, { type: 'NEXT' });
    expect(counterLabel(run)).toBe('2 / 4');
    run = tourRunReducer(run, { type: 'DROP_CURRENT' });
    expect(counterLabel(run)).toBe('2 / 3');
    expect(run.steps[run.index]!.target).toBe('fabDemandes');
  });

  it('dropping the last step ends the run', () => {
    let run = startRun('accueil', steps.slice(0, 1), new Set(['journeyCard']))!;
    run = tourRunReducer(run, { type: 'DROP_CURRENT' });
    expect(run.done).toBe(true);
  });

  it('a run interrupted is not seen', () => {
    const run = startRun('profil', steps, new Set(steps.map((s) => s.target)))!;
    expect(finishRun(st(), run, NOW)).toEqual(st());
  });

  it('a finished run marks its page seen', () => {
    const run = tourRunReducer(startRun('profil', steps, new Set(steps.map((s) => s.target)))!, { type: 'SKIP' });
    expect(finishRun(st(), run, NOW)?.seen).toEqual(['profil']);
  });
});

describe('geometry', () => {
  const vp = { top: 20, bottom: 587, width: 375 };

  it('isFullyVisible needs the whole rect inside the viewport', () => {
    expect(isFullyVisible({ x: 16, y: 100, width: 343, height: 100 }, vp)).toBe(true);
    expect(isFullyVisible({ x: 16, y: 520, width: 343, height: 100 }, vp)).toBe(false);
    expect(isFullyVisible({ x: 16, y: 10, width: 343, height: 100 }, vp)).toBe(false);
  });

  it('scrollDeltaFor is 0 when visible, positive to scroll down, negative to scroll up', () => {
    expect(scrollDeltaFor({ x: 0, y: 100, width: 10, height: 100 }, vp)).toBe(0);
    expect(scrollDeltaFor({ x: 0, y: 650, width: 10, height: 100 }, vp)).toBe(650 + 100 - 587 + 16);
    expect(scrollDeltaFor({ x: 0, y: -200, width: 10, height: 100 }, vp)).toBe(-200 - 20 - 16);
  });

  it('scrollDeltaFor top-aligns a target taller than the viewport', () => {
    expect(scrollDeltaFor({ x: 0, y: 700, width: 10, height: 900 }, vp)).toBe(700 - 20 - 16);
  });

  it('places the bubble below a target near the top', () => {
    const p = bubblePlacement({ x: 16, y: 100, width: 343, height: 182 }, 190, vp);
    expect(p.side).toBe('below');
    expect(p.top).toBe(100 + 182 + 12);
  });

  it('flips above when the bubble would run under the tab bar (the SE banner case)', () => {
    const p = bubblePlacement({ x: 16, y: 290, width: 343, height: 182 }, 190, vp);
    expect(p.side).toBe('above');
    expect(p.top).toBe(290 - 12 - 190);
  });

  it('with room on neither side, takes the roomier side and stays inside the viewport', () => {
    const p = bubblePlacement({ x: 16, y: 150, width: 343, height: 300 }, 190, vp);
    expect(p.side).toBe('below');
    expect(p.top + 190).toBeLessThanOrEqual(587);
  });

  it('places the bubble above a target near the tab bar', () => {
    const p = bubblePlacement({ x: 300, y: 520, width: 60, height: 60 }, 190, vp);
    expect(p.side).toBe('above');
    expect(p.top).toBe(520 - 12 - 190);
  });

  it('keeps the arrow inside the bubble', () => {
    const left = bubblePlacement({ x: 0, y: 100, width: 10, height: 10 }, 190, vp);
    const right = bubblePlacement({ x: 370, y: 100, width: 5, height: 10 }, 190, vp);
    expect(left.arrowX).toBeGreaterThanOrEqual(24);
    expect(right.arrowX).toBeLessThanOrEqual(Math.min(375 - 48, 340) - 24);
  });
});

describe('review fix C1: targets inside the floating tab bar', () => {
  const vp = { top: 20, bottom: 587, width: 375 };
  const tabProfil = { x: 300, y: 600, width: 60, height: 52 };

  it('names the two tab-bar targets', () => {
    expect([...TOUR_FIXED_TARGETS].sort()).toEqual(['fabDemandes', 'tabProfil']);
  });

  it('measures a tab-bar target against the whole window, so it is visible and never scrolled to', () => {
    const own = targetViewport('tabProfil', vp, 667);
    expect(own).toEqual({ top: 20, bottom: 667, width: 375 });
    expect(isFullyVisible(tabProfil, own)).toBe(true);
    expect(scrollDeltaFor(tabProfil, own)).toBe(0);
  });

  it('keeps the page viewport for every other target', () => {
    expect(targetViewport('nearbyRow', vp, 667)).toBe(vp);
  });

  it('places the bubble above a tab-bar target, inside the page viewport', () => {
    const p = bubblePlacement(tabProfil, 172, vp);
    expect(p.side).toBe('above');
    expect(p.top).toBe(600 - 12 - 172);
  });
});
