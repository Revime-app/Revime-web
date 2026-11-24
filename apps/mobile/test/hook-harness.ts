import React from 'react';

/**
 * Minimal stand-in for React's hook dispatcher so a hook can be called outside a component.
 * State and refs persist in maps keyed by call order; call the returned `reset` before each
 * re-"render" so the hook sees the same slots again, exactly like a real re-render.
 *
 * Effects run synchronously, once per distinct `deps` (compared with Object.is, like React), and
 * the previous cleanup runs first, so a hook that arms a timer in an effect can be driven with
 * fake timers. An effect without a deps array runs on every call, as in React.
 * `reset.unmount()` runs every pending effect cleanup, as React does when the component leaves.
 * `connect-onboarding-timeout.spec.tsx` carries its own older copy of this, without effects.
 */
export function createHookHarness() {
  const stateMap = new Map<number, any>();
  let stateIndex = 0;
  const refMap = new Map<number, any>();
  let refIndex = 0;
  const effectMap = new Map<number, { deps: unknown[] | undefined; cleanup: void | (() => void) }>();
  let effectIndex = 0;

  const clientInternals =
    (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
    (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_OR_YOU_WILL_BE_FIRED;

  if (clientInternals) {
    clientInternals.H = {
      useState: (initial: any) => {
        const idx = stateIndex++;
        if (!stateMap.has(idx)) {
          stateMap.set(idx, typeof initial === 'function' ? initial() : initial);
        }
        const setState = (next: any) => {
          const val = typeof next === 'function' ? next(stateMap.get(idx)) : next;
          stateMap.set(idx, val);
        };
        return [stateMap.get(idx), setState];
      },
      useRef: (initial: any) => {
        const idx = refIndex++;
        if (!refMap.has(idx)) {
          refMap.set(idx, { current: initial });
        }
        return refMap.get(idx);
      },
      useContext: (ctx: any) =>
        ctx?._currentValue ?? {
          palette: { ink: '#101828', paper: '#FFFFFF', line: '#E4E7EC', muted: '#667085' },
          spacing: { md: 16 },
        },
      useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
        const idx = effectIndex++;
        const previous = effectMap.get(idx);
        const unchanged =
          previous !== undefined &&
          deps !== undefined &&
          previous.deps !== undefined &&
          deps.length === previous.deps.length &&
          deps.every((d, i) => Object.is(d, previous.deps![i]));
        if (unchanged) return;
        if (previous && typeof previous.cleanup === 'function') previous.cleanup();
        effectMap.set(idx, { deps, cleanup: effect() });
      },
      useCallback: (fn: any) => fn,
      useMemo: (fn: any) => fn(),
    };
  }

  const reset = () => {
    stateIndex = 0;
    refIndex = 0;
    effectIndex = 0;
  };
  reset.unmount = () => {
    for (const { cleanup } of effectMap.values()) {
      if (typeof cleanup === 'function') cleanup();
    }
    effectMap.clear();
  };
  return reset;
}
