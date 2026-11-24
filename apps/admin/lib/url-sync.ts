/**
 * URL Query parameter synchronization for Revime Admin lists (UI8).
 * Preserves filters, search, page, pageSize, and sort in the URL via replaceState
 * with `history.replaceState`, which Next.js integrates with the router (`useSearchParams` follows it).
 * The URL is only WRITTEN here: each list reads it back once on mount.
 */

export function syncUrlParams(
  updates: Record<string, string | number | boolean | null | undefined>,
  defaults: Record<string, string | number | boolean | null | undefined> = {}
): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const searchParams = url.searchParams;

  for (const [key, value] of Object.entries(updates)) {
    const defaultValue = defaults[key];

    if (
      value === null ||
      value === undefined ||
      value === '' ||
      value === defaultValue
    ) {
      searchParams.delete(key);
    } else {
      searchParams.set(key, String(value));
    }
  }

  const newSearch = searchParams.toString();
  const newPath = url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash;

  if (window.location.pathname + window.location.search + window.location.hash !== newPath) {
    window.history.replaceState(null, '', newPath);
  }
}
