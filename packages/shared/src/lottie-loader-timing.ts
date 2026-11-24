export interface LoaderTimingDecision {
  shouldDisplay: boolean;
  remainingMs: number;
}

export function computeLoaderTiming(
  isLoading: boolean,
  hasDisplayed: boolean,
  displayStartTimestamp: number | null,
  now: number,
  delayMs = 300,
  minDurationMs = 1500,
): LoaderTimingDecision {
  if (isLoading) {
    if (hasDisplayed) {
      return { shouldDisplay: true, remainingMs: 0 };
    }
    return { shouldDisplay: false, remainingMs: delayMs };
  }

  if (!hasDisplayed || displayStartTimestamp === null) {
    return { shouldDisplay: false, remainingMs: 0 };
  }

  const displayedTime = Math.max(0, now - displayStartTimestamp);
  const remaining = minDurationMs - displayedTime;

  if (remaining > 0) {
    return { shouldDisplay: true, remainingMs: remaining };
  }

  return { shouldDisplay: false, remainingMs: 0 };
}
