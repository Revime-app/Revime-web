import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { layout } from '@revime/tokens';
import type { TourModeState, TourPageId, TourState } from '@revime/shared';
import { api } from '../lib/api';
import { MaintenanceViewContext } from '../lib/maintenance-view-context';
import { waitForPushPrompt } from '../lib/push';
import { useSessionContext } from '../lib/session';
import {
  declineTour,
  finishRun,
  isFullyVisible,
  markSeen,
  measureSettled,
  mergeTourState,
  onTourBack,
  pickTargetRect,
  replayState,
  scrollDeltaFor,
  targetViewport,
  startRun,
  startTour,
  tourGateOpen,
  tourPageAction,
  tourRunReducer,
  type Rect,
  type TourRun,
  type Viewport,
} from '../lib/tour';
import { TOUR_PAGES, type TourTargetId } from '../lib/tour-copy';
import { readTourCopy, writeTourCopy } from '../lib/tour-storage';
import { TourOverlay, type TourShowing } from './TourOverlay';
import { TourContext, type TourContextValue, type TourPageInfo } from './use-tour';

/**
 * V8 E2: the help bubbles (`DEC8-09`, `DEC8-10`). Sits inside `MaintenanceGate` around the root `Stack`,
 * so its overlay draws over every screen and under the maintenance and re-acceptance screens.
 *
 * Every decision is a pure function in `src/lib/tour.ts`; this file only wires them to React Native:
 *  - state = the account's `me.profile.tour` merged with the device copy (newest per mode); an API older
 *    than E2 (`tour === undefined`) means no tour at all;
 *  - the focused page's action (`tourPageAction`) once the gate is open (`tourGateOpen` + the push prompt
 *    answered, `FND8-027`) and the page says it is ready;
 *  - a run: measure the present targets, scroll a below-the-fold one into view (`scrollDeltaFor`), drop
 *    one still not fully visible, show the bubble; the page is seen only when its run ENDS;
 *  - every change is written to the device copy and `PATCH /users/me/tour`, not awaited;
 *  - the page blurring, the gate closing or the mode changing ends a run without marking it seen.
 */

type Showing = (TourShowing & { scrolled?: boolean }) | null;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
// V8 `ISS8-017`: two readings this far apart must agree before a run starts; at most ~1 s in all.
const SETTLE_INTERVAL_MS = 80;
const SETTLE_MAX_WAITS = 12;
const settleWait = () => new Promise<void>((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));

export function TourProvider({ children }: { children: ReactNode }) {
  const { me } = useSessionContext();
  const router = useRouter();
  const maintenance = useContext(MaintenanceViewContext);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const userId = me?.id ?? null;
  const mode = me?.profile.activeMode ?? 'CLIENT';
  // `undefined` when there is no session or the API predates E2: no tour. Otherwise `TourState | null`.
  const serverTour: TourState | null | undefined = me ? me.profile.tour : undefined;

  const [tour, setTour] = useState<TourState | null | undefined>(undefined);
  const tourRef = useRef(tour);
  tourRef.current = tour;
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    if (userId === null || serverTour === undefined) {
      lastUser.current = userId;
      setTour(undefined);
      return;
    }
    const sameUser = lastUser.current === userId;
    lastUser.current = userId;
    setTour((prev) => {
      const merged = mergeTourState(serverTour ?? null, readTourCopy(userId));
      return sameUser && prev ? mergeTourState(merged, prev) : merged;
    });
  }, [userId, serverTour]);

  const [pushSettled, setPushSettled] = useState(false);
  // Review fix I2: start waiting once a page is focused, i.e. once the tabs shell (which asks for the
  // notification permission) has mounted; a new sign-up reaches `userId` long before that.
  const [anyPageFocused, setAnyPageFocused] = useState(false);
  useEffect(() => {
    if (userId === null || !anyPageFocused) return;
    let live = true;
    void waitForPushPrompt().then(() => live && setPushSettled(true));
    return () => {
      live = false;
    };
  }, [userId, anyPageFocused]);

  const registry = useRef(new Map<TourTargetId, Set<View>>());
  const [focused, setFocused] = useState<TourPageInfo | null>(null);
  const [ready, setReady] = useState<Partial<Record<TourPageId, boolean>>>({});
  const [showing, setShowing] = useState<Showing>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const origin = useRef({ x: 0, y: 0 });
  const overlayRef = useRef<View | null>(null);

  const gateOpen = tourGateOpen(maintenance) && pushSettled;

  const viewport = useCallback(
    (tabBar: boolean): Viewport => ({
      top: insets.top,
      bottom: tabBar ? height - (layout.navHeight + insets.bottom) : height - insets.bottom,
      width,
    }),
    [insets.top, insets.bottom, height, width],
  );

  const persist = useCallback(
    (next: TourModeState) => {
      if (userId === null) return;
      const nextState: TourState = { ...(tourRef.current ?? { CLIENT: null, REPAIRER: null }), [mode]: next };
      tourRef.current = nextState;
      setTour(nextState);
      writeTourCopy(userId, nextState);
      api.patch('/users/me/tour', { mode, state: next }).catch((e: unknown) => {
        console.warn('[tour] save failed, kept on the device:', e);
      });
    },
    [userId, mode],
  );

  /**
   * The registered node for `id` to use, in window coordinates (`pickTargetRect`): one inside the window
   * first, else one above or below it so the run can scroll to it (V8 `ISS8-018`).
   */
  const measure = useCallback(
    async (id: TourTargetId): Promise<Rect | null> => {
      const rects: Rect[] = [];
      for (const node of registry.current.get(id) ?? []) {
        rects.push(
          await new Promise<Rect>((resolve) =>
            node.measureInWindow((x, y, w, h) => resolve({ x, y, width: w, height: h })),
          ),
        );
      }
      return pickTargetRect(rects, { width, height });
    },
    [width, height],
  );

  const end = useCallback(
    (run: TourRun, info: TourPageInfo | null, scrolled: boolean) => {
      // Review fix I3: a step still being measured must not bring a bubble back after the end.
      generation.current += 1;
      const next = finishRun(tourRef.current?.[mode] ?? null, run, new Date());
      if (next) persist(next);
      if (scrolled) info?.scrollRef.current?.scrollTo({ y: 0, animated: true });
      busy.current = false;
      setShowing(null);
    },
    [mode, persist],
  );

  const showStep = useCallback(
    async (run: TourRun, info: TourPageInfo, scrolledBefore: boolean): Promise<void> => {
      const gen = generation.current;
      busy.current = true;
      const vp = viewport(info.tabBar);
      const step = run.steps[run.index]!;
      // Review fix C1: a tab-bar target is checked against the whole window; the bubble still uses `vp`.
      const seen = targetViewport(step.target, vp, height);
      let rect = await measure(step.target);
      let scrolled = scrolledBefore;
      if (rect && !isFullyVisible(rect, seen) && info.scrollRef.current) {
        const y = Math.max(0, info.offset.current + scrollDeltaFor(rect, seen));
        info.scrollRef.current.scrollTo({ y, animated: false });
        info.offset.current = y;
        scrolled = true;
        await nextFrame();
        await nextFrame();
        rect = await measure(step.target);
      }
      if (gen !== generation.current) return;
      if (!rect || !isFullyVisible(rect, seen)) {
        const next = tourRunReducer(run, { type: 'DROP_CURRENT' });
        if (next.done) end(next, info, scrolled);
        else await showStep(next, info, scrolled);
        return;
      }
      busy.current = false;
      setShowing({ kind: 'bubble', run, rect, viewport: vp, scrolled });
    },
    [viewport, measure, end, height],
  );

  const beginRun = useCallback(
    async (info: TourPageInfo) => {
      const steps = TOUR_PAGES[mode][info.page];
      if (!steps) return;
      const gen = generation.current;
      busy.current = true;
      await nextFrame();
      // V8 `ISS8-017`: not before the page's layout has settled (safe-area inset, enter transition).
      const rects = await measureSettled(
        steps.map((s) => s.target),
        measure,
        settleWait,
        SETTLE_MAX_WAITS,
      );
      const present = new Set<TourTargetId>(steps.filter((s) => rects[s.target]).map((s) => s.target));
      if (gen !== generation.current) return;
      const run = startRun(info.page, steps, present);
      if (run === null) {
        persist(markSeen(tourRef.current?.[mode] ?? null, info.page, new Date()));
        busy.current = false;
        return;
      }
      await showStep(run, info, false);
    },
    [mode, measure, persist, showStep],
  );

  // Interrupt: the page left, the gate closed or the mode changed. The run is NOT marked seen.
  const showingPage = showing?.kind === 'bubble' ? showing.run.page : showing?.kind === 'offer' ? 'accueil' : null;
  const showingMode = showing?.kind === 'offer' ? showing.mode : null;
  useEffect(() => {
    const stale =
      showingPage !== null &&
      (!gateOpen || focused?.page !== showingPage || (showingMode !== null && showingMode !== mode));
    if (stale || (!gateOpen && busy.current)) {
      generation.current += 1;
      busy.current = false;
      setShowing(null);
    }
  }, [gateOpen, focused, showingPage, showingMode, mode]);

  // Start the focused page's offer or run.
  useEffect(() => {
    if (showing || busy.current || !focused) return;
    const action = tourPageAction({
      tour: tour === undefined ? undefined : (tour?.[mode] ?? null),
      page: focused.page,
      gateOpen,
      focused: true,
      ready: ready[focused.page] === true,
    });
    if (action === 'OFFER') setShowing({ kind: 'offer', mode });
    else if (action === 'RUN') void beginRun(focused);
  }, [tour, mode, focused, ready, gateOpen, showing, beginRun]);

  const onNext = useCallback(() => {
    if (busy.current) return; // review fix I3: a double tap must not run two steps
    if (showing?.kind !== 'bubble' || !focused) return;
    const next = tourRunReducer(showing.run, { type: 'NEXT' });
    if (next.done) end(next, focused, showing.scrolled === true);
    else void showStep(next, focused, showing.scrolled === true);
  }, [showing, focused, end, showStep]);

  const onSkip = useCallback(() => {
    if (busy.current) return;
    if (showing?.kind !== 'bubble') return;
    end(tourRunReducer(showing.run, { type: 'SKIP' }), focused, showing.scrolled === true);
  }, [showing, focused, end]);

  const onStart = useCallback(() => {
    persist(startTour(tourRef.current?.[mode] ?? null, new Date()));
    setShowing(null);
  }, [persist, mode]);

  const onLater = useCallback(() => {
    persist(declineTour(tourRef.current?.[mode] ?? null, new Date()));
    setShowing(null);
  }, [persist, mode]);

  // Android back: « Passer » on a bubble, « Plus tard » on the offer; never navigates under the scrim.
  useEffect(() => {
    if (!showing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busy.current) return true;
      if (onTourBack(showing.kind === 'offer' ? 'offer' : 'bubble') === 'decline') onLater();
      else onSkip();
      return true;
    });
    return () => sub.remove();
  }, [showing, onLater, onSkip]);

  const replayCurrentMode = useCallback(() => {
    generation.current += 1;
    busy.current = false;
    setShowing(null);
    persist(replayState(tourRef.current ?? null, mode, new Date())[mode]!);
    // Review fix I1: back to the EXISTING tab shell (navigate alone pushes a second one from
    // Paramètres), then to Accueil, where the bubbles start. Same pattern as `sign-out.ts`.
    if (router.canDismiss()) router.dismissAll();
    router.navigate('/(tabs)');
  }, [persist, mode, router]);

  const value = useMemo<TourContextValue>(
    () => ({
      register(id, node) {
        const set = registry.current.get(id) ?? new Set<View>();
        set.add(node);
        registry.current.set(id, set);
      },
      unregister(id, node) {
        registry.current.get(id)?.delete(node);
      },
      focusPage(info) {
        setAnyPageFocused(true);
        setFocused(info);
      },
      blurPage(page) {
        setFocused((f) => (f?.page === page ? null : f));
      },
      setReady(page, isReady) {
        setReady((r) => (r[page] === isReady ? r : { ...r, [page]: isReady }));
      },
      replayCurrentMode,
    }),
    [replayCurrentMode],
  );

  return (
    <TourContext.Provider value={value}>
      <View
        ref={overlayRef}
        style={styles.root}
        onLayout={() =>
          overlayRef.current?.measureInWindow((x, y) => {
            origin.current = { x, y };
          })
        }
      >
        {/* Criterion 10: while the tour shows, TalkBack reads only the overlay. */}
        <View style={styles.root} importantForAccessibility={showing ? 'no-hide-descendants' : 'auto'}>
          {children}
        </View>
        {showing ? (
          <TourOverlay
            showing={showing}
            origin={origin.current}
            windowWidth={width}
            windowHeight={height}
            onNext={onNext}
            onSkip={onSkip}
            onStart={onStart}
            onLater={onLater}
          />
        ) : null}
      </View>
    </TourContext.Provider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
