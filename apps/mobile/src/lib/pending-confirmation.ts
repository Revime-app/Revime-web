import { useCallback, useEffect, useState } from 'react';

/** How often the confirmation screen re-reads an order that is still PENDING_PAYMENT. */
export const PENDING_POLL_INTERVAL_MS = 2_000;

/**
 * CF6-05. How long the confirmation screen keeps polling before it stops and says so.
 *
 * The API reconciles a paid order within one poll (CF6-04), so a healthy payment settles in a few
 * seconds. Without a ceiling, a payment that does not settle (Stripe slow, reconciliation failing,
 * a PaymentIntent that is not actually paid) leaves the client watching « quelques secondes » and
 * a screen that re-reads the server every 2 s for as long as he stays on it.
 */
export const PENDING_POLL_CEILING_MS = 60_000;

/**
 * `refetchInterval` for the order behind the confirmation screen. A pure function of the order
 * status and whether the ceiling has passed, so it needs no query state and cannot disagree with
 * the screen about whether polling is still on.
 */
export function pendingRefetchInterval(status: string | undefined, expired: boolean): number | false {
  return status === 'PENDING_PAYMENT' && !expired ? PENDING_POLL_INTERVAL_MS : false;
}

/**
 * `expired` turns true once `pending` has stayed true for PENDING_POLL_CEILING_MS. It goes back to
 * false, and the countdown is cancelled, as soon as `pending` does, so an order that settles in
 * time never shows the « ça prend plus de temps » state. `restart()` re-arms a full window, which
 * is what the « Actualiser » button does after an expiry.
 */
export function usePendingCeiling(pending: boolean): { expired: boolean; restart: () => void } {
  const [expired, setExpired] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!pending) {
      setExpired(false);
      return;
    }
    const timer = setTimeout(() => setExpired(true), PENDING_POLL_CEILING_MS);
    return () => clearTimeout(timer);
  }, [pending, attempt]);

  const restart = useCallback(() => {
    setExpired(false);
    setAttempt((n) => n + 1);
  }, []);

  return { expired, restart };
}
