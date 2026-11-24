import { parseEuros } from './refund-form';

/**
 * CF4-F (Task 6, spec §3). Pure helper - no React - shared by every admin list
 * page's `load()`: turns a filter-state object into the querystring the
 * `/api/proxy/admin/...` list routes expect.
 *
 * Drops `''`, `null` and `undefined` values rather than sending them - an
 * operator clearing a filter input removes the param entirely, matching the
 * `optionalTrimmedString`/`isoDateString` server schemas (admin-lists.schemas.ts)
 * that already treat `''` as "no filter". Keys are sorted before encoding so the
 * resulting string is stable regardless of the object's own key order, which
 * keeps `load()`'s `useCallback` deps and any test assertion deterministic.
 */
export function buildListQuery(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const search = new URLSearchParams();

  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }

  const qs = search.toString();
  return qs === '' ? '' : `?${qs}`;
}

/**
 * Wraps `parseEuros` (refund-form.ts) for the shipments/refunds list filter
 * inputs (e.g. a future min/max amount filter) - same French-comma parsing, same
 * `null` on empty/invalid input, kept here so list pages import money parsing
 * from the list-query module rather than reaching into refund-form directly.
 */
export function eurosBoundToCents(input: string): number | null {
  return parseEuros(input);
}

export type AmountBoundResult =
  | { ok: true; cents: number | null }
  | { ok: false; error: string };

/**
 * CF4-F final review, Important #1. `RefundsList`'s min/max euro inputs are
 * submit-only (spec: validated before any request, invalid bound -> inline
 * error, no request) - this is the pure decision behind that validation, split
 * out of the component so it is testable without mounting one. An empty input
 * is a cleared filter (`cents: null`), not an error; anything non-empty that
 * `eurosBoundToCents` cannot parse is an error, never silently dropped.
 */
export function parseAmountBound(input: string): AmountBoundResult {
  if (input.trim() === '') {
    return { ok: true, cents: null };
  }
  const cents = eurosBoundToCents(input);
  if (cents === null) {
    return { ok: false, error: 'Montant invalide.' };
  }
  return { ok: true, cents };
}

/**
 * CF4-F Task 6, Fix round 1 (review Important finding: /colis' `runSearch` and
 * ShipmentsList's `load()` had no defense against a stale response overwriting
 * a newer one). A tiny sequence guard: call `next()` when a request starts and
 * keep the number it returns; when that request resolves, only apply its result
 * if `isLatest(n)` is still true. Kept here (not inline `useRef` code in each
 * component) so both call sites - and this test file - share one implementation
 * instead of two hand-rolled counters that could drift apart.
 *
 * A plain incrementing counter rather than `AbortController`: the two call sites
 * that need this (page.tsx's `runSearch`, ShipmentsList's `load()`) already
 * branch on `response.ok` and parse JSON on both paths, so an aborted `fetch`
 * would still need the same "was this superseded" check after the throw to
 * decide whether to surface the error - the counter check does that in one
 * place without adding an AbortError code path to ignore.
 */
export function createLatestGuard(): { next(): number; isLatest(n: number): boolean } {
  let current = 0;
  return {
    next(): number {
      current += 1;
      return current;
    },
    isLatest(n: number): boolean {
      return n === current;
    },
  };
}
