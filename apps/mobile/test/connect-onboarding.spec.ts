import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import * as WebBrowser from 'expo-web-browser';
import { WebBrowserResultType } from 'expo-web-browser';
import { openStripeHandoff } from '../src/lib/stripe-handoff';
import { ConnectOnboardingSheet } from '../src/components/ConnectOnboardingSheet';

vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: vi.fn(),
  WebBrowserResultType: {
    CANCEL: 'cancel',
    DISMISS: 'dismiss',
    OPENED: 'opened',
    LOCKED: 'locked',
  },
}));

vi.mock('@stripe/stripe-react-native', () => ({
  ConnectComponentsProvider: ({ children }: any) => children,
  ConnectAccountOnboarding: (props: any) => React.createElement('ConnectAccountOnboarding', props),
}));

describe('openStripeHandoff', () => {
  const router = {
    push: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes standard revime:// scheme redirect to router path', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({
      type: 'success',
      url: 'revime://connect/retour',
    });

    await openStripeHandoff('https://connect.stripe.com/setup/s/123', router);

    expect(router.push).toHaveBeenCalledWith('/connect/retour');
  });

  it('normalizes multi-slash revime:/// deep link scheme redirect without leaving double slash', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({
      type: 'success',
      url: 'revime:///connect/retour',
    });

    await openStripeHandoff('https://connect.stripe.com/setup/s/123', router);

    expect(router.push).toHaveBeenCalledWith('/connect/retour');
  });

  it('preserves query parameters on redirect', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({
      type: 'success',
      url: 'revime://connect/retour?status=complete',
    });

    await openStripeHandoff('https://connect.stripe.com/setup/s/123', router);

    expect(router.push).toHaveBeenCalledWith('/connect/retour?status=complete');
  });

  it.each([
    ['cancels', WebBrowserResultType.CANCEL],
    ['dismisses', WebBrowserResultType.DISMISS],
  ])('does not route when user %s the auth session', async (_label, type) => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({ type } as any);

    await openStripeHandoff('https://connect.stripe.com/setup/s/123', router);

    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('ConnectOnboardingSheet', () => {
  const dummyInstance = {} as any;
  // The other callbacks are required props; these cases do not exercise them.
  const unused = { onRetry: vi.fn(), onDismiss: vi.fn(), onPageDidLoad: vi.fn() };

  it('renders null when not visible', () => {
    const tree = ConnectOnboardingSheet({
      visible: false,
      connectInstance: dummyInstance,
      onExit: vi.fn(),
      onLoadError: vi.fn(),
      ...unused,
    });
    expect(tree).toBeNull();
  });

  it('renders null when connectInstance is null', () => {
    const tree = ConnectOnboardingSheet({
      visible: true,
      connectInstance: null,
      onExit: vi.fn(),
      onLoadError: vi.fn(),
      ...unused,
    });
    expect(tree).toBeNull();
  });

  it('renders ConnectAccountOnboarding and passes onExit and onLoadError callbacks', () => {
    const onExit = vi.fn();
    const onLoadError = vi.fn();

    const tree = ConnectOnboardingSheet({
      visible: true,
      connectInstance: dummyInstance,
      onExit,
      onLoadError,
      ...unused,
    });

    expect(tree).not.toBeNull();
    const child = tree?.props?.children;
    expect(child).toBeDefined();
    expect(child?.props?.onExit).toBe(onExit);
    expect(child?.props?.onLoadError).toBe(onLoadError);
  });
});
