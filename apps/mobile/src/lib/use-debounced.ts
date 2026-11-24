import { useEffect, useState } from 'react';

/**
 * Delays a fast-changing value so a search field does not turn every keystroke
 * into a request. 300ms is the default because the API runs on a free Render
 * instance that cold-starts.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
