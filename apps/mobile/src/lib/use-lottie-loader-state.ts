import { useState, useEffect, useRef } from 'react';
import { computeLoaderTiming } from '@revime/shared';

export type UseLottieLoaderStateOptions = {
  delayMs?: number;
  minDurationMs?: number;
};

export function useLottieLoaderState(
  isLoading: boolean,
  options?: UseLottieLoaderStateOptions
): boolean {
  const delayMs = options?.delayMs ?? 300;
  const minDurationMs = options?.minDurationMs ?? 1500;

  const [shouldDisplay, setShouldDisplay] = useState(false);
  const displayStartRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const now = Date.now();

    if (isLoading) {
      if (!shouldDisplay) {
        timeoutRef.current = setTimeout(() => {
          displayStartRef.current = Date.now();
          setShouldDisplay(true);
        }, delayMs);
      }
    } else {
      if (shouldDisplay) {
        const decision = computeLoaderTiming(
          false,
          true,
          displayStartRef.current,
          now,
          delayMs,
          minDurationMs
        );

        if (decision.remainingMs > 0) {
          timeoutRef.current = setTimeout(() => {
            displayStartRef.current = null;
            setShouldDisplay(false);
          }, decision.remainingMs);
        } else {
          displayStartRef.current = null;
          setShouldDisplay(false);
        }
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isLoading, shouldDisplay, delayMs, minDurationMs]);

  return shouldDisplay;
}
