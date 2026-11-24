import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { ApiError } from './api';

/**
 * `S1`: a 429 is never retried. The server is already telling us to slow down, and the default
 * retry (one more attempt) only adds to the load that caused it. Every other failure keeps the one
 * retry it always had. Only `ApiError` carries the status; anything else is a network failure.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status === 429) && failureCount < 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}

/**
 * React Native has no window focus event, so TanStack Query's refetch-on-focus
 * has to be driven from AppState. This is what makes a client see offers that
 * arrived while the app was backgrounded.
 *
 * `CF-44` (2026-09-07): push notifications now exist, so this is the FALLBACK discovery
 * mechanism rather than the only one - a push that fails, or a device that declined the
 * permission, still learns of new activity here on the next foreground. The 2026-08-20
 * notifications design asked that the previous wording (« the only discovery mechanism until
 * push notifications land ») not be edited until push shipped; it has.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => sub.remove();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
