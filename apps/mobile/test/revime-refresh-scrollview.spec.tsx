import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/components/lottie/RevimeLottie', () => ({
  RevimeLottie: (props: any) => React.createElement('RevimeLottie', props),
}));

import { RevimeRefreshScrollView } from '../src/components/RevimeRefreshScrollView';
import { createHookHarness } from './hook-harness';

/** forwardRef components are objects; React calls `render`. Do the same, with a fresh dispatcher. */
function mount(onRefresh?: () => Promise<unknown>) {
  const reset = createHookHarness();
  return () => {
    reset();
    const tree = (RevimeRefreshScrollView as any).render({ onRefresh, children: null }, null);
    let scroll: any;
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n.props?.refreshControl !== undefined) scroll = n;
      walk(n.props?.children);
    };
    walk(tree);
    return scroll?.props.refreshControl;
  };
}

describe('RevimeRefreshScrollView owns its pull-to-refresh state (CF6-08)', () => {
  it('has no refreshControl at all when there is nothing to refresh', () => {
    expect(mount(undefined)()).toBeUndefined();
  });

  it('starts not refreshing, so a background refetch can never show the spinner', () => {
    expect(mount(async () => {})().props.refreshing).toBe(false);
  });

  it('shows the spinner only from the user\'s pull until the promise settles', async () => {
    let done!: () => void;
    const render = mount(() => new Promise<void>((r) => (done = r)));

    const pulled = render().props.onRefresh();
    expect(render().props.refreshing).toBe(true);

    done();
    await pulled;
    expect(render().props.refreshing).toBe(false);
  });

  it('stops the spinner when the refetch rejects, so it cannot spin forever', async () => {
    const render = mount(() => Promise.reject(new Error('offline')));

    await render().props.onRefresh();

    expect(render().props.refreshing).toBe(false);
  });
});
