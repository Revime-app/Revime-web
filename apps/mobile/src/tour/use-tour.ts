import { createContext, useCallback, useContext, useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { TourPageId } from '@revime/shared';
import type { TourTargetId } from '../lib/tour-copy';

/**
 * V8 E2: how pages talk to `TourProvider`. A page calls `useTourPage(page, ready)` once and spreads the
 * returned `scrollProps` on its scroll view (needed where a target can sit below the fold, `DEC8-10` (2));
 * each spotlighted element spreads `useTourTarget(id)` on its outer view. Outside a `TourProvider` (specs,
 * screens rendered alone) every call is a no-op.
 */

export type TourPageInfo = {
  page: TourPageId;
  /** True on the five tab screens, whose bottom 78pt + inset is the floating tab bar. */
  tabBar: boolean;
  scrollRef: RefObject<ScrollView | null>;
  offset: MutableRefObject<number>;
};

export type TourContextValue = {
  register(id: TourTargetId, node: View): void;
  unregister(id: TourTargetId, node: View): void;
  focusPage(info: TourPageInfo): void;
  blurPage(page: TourPageId): void;
  setReady(page: TourPageId, ready: boolean): void;
  replayCurrentMode(): void;
};

const noop = () => {};
export const TourContext = createContext<TourContextValue>({
  register: noop,
  unregister: noop,
  focusPage: noop,
  blurPage: noop,
  setReady: noop,
  replayCurrentMode: noop,
});

const TAB_PAGES: ReadonlySet<TourPageId> = new Set<TourPageId>(['accueil', 'publier', 'demandes', 'recherche', 'messages', 'profil']);

/**
 * Registers the element while it is mounted. Tab screens stay mounted, so one id can have two live
 * nodes (two `bell`s); the provider measures them all and keeps the one actually on screen.
 */
export function useTourTarget(id: TourTargetId | null): { ref: (node: View | null) => void; collapsable: false } {
  const ctx = useContext(TourContext);
  const current = useRef<View | null>(null);
  const ref = useCallback(
    (node: View | null) => {
      if (id === null) return; // a list item with no bubble (ShortcutGrid)
      if (current.current) ctx.unregister(id, current.current);
      current.current = node;
      if (node) ctx.register(id, node);
    },
    [ctx, id],
  );
  return { ref, collapsable: false };
}

export function useTourPage(
  page: TourPageId,
  ready: boolean,
  opts?: { tabBar?: boolean },
): {
  scrollProps: {
    ref: RefObject<ScrollView | null>;
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: 16;
  };
} {
  const ctx = useContext(TourContext);
  const scrollRef = useRef<ScrollView | null>(null);
  const offset = useRef(0);
  const tabBar = opts?.tabBar ?? TAB_PAGES.has(page);

  useFocusEffect(
    useCallback(() => {
      ctx.focusPage({ page, tabBar, scrollRef, offset });
      return () => ctx.blurPage(page);
    }, [ctx, page, tabBar]),
  );
  useEffect(() => {
    ctx.setReady(page, ready);
  }, [ctx, page, ready]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);
  return { scrollProps: { ref: scrollRef, onScroll, scrollEventThrottle: 16 } };
}

/** For « Revoir la visite » (Task 7). */
export function useTourActions(): { replayCurrentMode(): void } {
  const ctx = useContext(TourContext);
  return { replayCurrentMode: ctx.replayCurrentMode };
}
