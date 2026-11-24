import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/theme', async () => {
  const tokens = await vi.importActual<typeof import('@revime/tokens')>('@revime/tokens');
  return { useTheme: () => ({ palette: tokens.palette, radii: tokens.radii, spacing: tokens.spacing }) };
});

vi.mock('../src/components/lottie/RevimeLottie', () => ({
  RevimeLottie: (props: any) => React.createElement('RevimeLottie', props),
}));

import {
  RevimeStartupSplash,
  STARTUP_SPLASH_INTRO_MS,
  STARTUP_SPLASH_MAX_MS,
  __resetStartupSplashForTest,
} from '../src/components/lottie/RevimeStartupSplash';
import { RevimeLoader } from '../src/components/lottie/RevimeLoader';
import { BlockingOverlay } from '../src/components/BlockingOverlay';
import { createHookHarness } from './hook-harness';

/** The lottie child of the splash, or undefined when the splash renders nothing. */
function lottieOf(tree: any): any {
  if (!tree || typeof tree !== 'object') return undefined;
  const kids = [tree.props?.children].flat();
  return kids.find((k: any) => k?.type === 'RevimeLottie' || k?.type?.name === 'RevimeLottie');
}

function mountSplash(initialReady: boolean) {
  const reset = createHookHarness();
  let ready = initialReady;
  const render = () => {
    reset();
    return RevimeStartupSplash({ isAppReady: ready }) as any;
  };
  return Object.assign(render, { setReady: (v: boolean) => (ready = v) });
}

describe('CF6-08: the intro plays on a cold launch only', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetStartupSplashForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the intro animation, played once', () => {
    const lottie = lottieOf(mountSplash(false)());
    expect(lottie.props.variant).toBe('intro');
    expect(lottie.props.loop).toBe(false);
  });

  it('fades out and never comes back when the app is ready as the intro ends', () => {
    const render = mountSplash(true);
    render();
    vi.advanceTimersByTime(STARTUP_SPLASH_INTRO_MS);

    expect(render()).toBeNull();
    // A brand-new mount (a remount, a mode switch, a re-render of the layout) stays hidden.
    expect(mountSplash(true)()).toBeNull();
  });

  it('hands over to the continuous fill loop at frame 60 when the app is still starting', () => {
    const render = mountSplash(false);
    render();
    vi.advanceTimersByTime(STARTUP_SPLASH_INTRO_MS);

    const lottie = lottieOf(render());
    expect(lottie.props.variant).toBe('fill');
    expect(lottie.props.loop).toBe(true);
    expect(lottie.props.startFrame).toBe(60);
  });

  it('fades out as soon as the app becomes ready during the fill loop', () => {
    const render = mountSplash(false);
    render();
    vi.advanceTimersByTime(STARTUP_SPLASH_INTRO_MS);
    render();

    render.setReady(true);
    render();

    expect(render()).toBeNull();
  });

  it('does not hold the interface forever: after the ceiling it fades even if the app never became ready', () => {
    const render = mountSplash(false);
    render();

    vi.advanceTimersByTime(STARTUP_SPLASH_MAX_MS - 1);
    expect(render()).not.toBeNull();

    vi.advanceTimersByTime(1);
    render();
    expect(render()).toBeNull();
  });

  it('keeps calling the same hooks after it has completed (no early return before them)', () => {
    const render = mountSplash(true);
    render();
    vi.advanceTimersByTime(STARTUP_SPLASH_INTRO_MS);
    // Rendering again after completion must not throw "rendered fewer hooks than expected".
    expect(() => {
      render();
      render();
    }).not.toThrow();
  });

  it('the test reset puts the next mount back on a cold launch', () => {
    const first = mountSplash(true);
    first();
    vi.advanceTimersByTime(STARTUP_SPLASH_INTRO_MS);
    first();
    expect(mountSplash(true)()).toBeNull();

    __resetStartupSplashForTest();

    expect(lottieOf(mountSplash(true)())?.props.variant).toBe('intro');
  });
});

describe('CF6-08: every other loading uses the continuous fill loader', () => {
  it('RevimeLoader loops the variant it is given, without stopping', () => {
    const tree = RevimeLoader({ variant: 'fill' }) as any;
    const lottie = [tree.props.children].flat().find((k: any) => k?.type?.name === 'RevimeLottie' || k?.type === 'RevimeLottie');
    expect(lottie.props.variant).toBe('fill');
    expect(lottie.props.loop).toBe(true);
  });

  it('BlockingOverlay uses the fill animation', () => {
    const tree = BlockingOverlay({ visible: true, label: 'Chargement' } as any) as any;
    let variant: string | undefined;
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n.props?.variant) variant = n.props.variant;
      walk(n.props?.children);
    };
    walk(tree);
    expect(variant).toBe('fill');
  });
});
