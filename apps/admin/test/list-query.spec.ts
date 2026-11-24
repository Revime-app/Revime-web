import { describe, it, expect } from 'vitest';
import { buildListQuery, eurosBoundToCents, createLatestGuard, parseAmountBound } from '../lib/list-query';

describe('buildListQuery', () => {
  it('returns an empty string for no params', () => {
    expect(buildListQuery({})).toBe('');
  });

  it('drops empty strings, null and undefined', () => {
    expect(
      buildListQuery({ a: '', b: null, c: undefined, d: 'kept' })
    ).toBe('?d=kept');
  });

  it('encodes special characters in keys and values', () => {
    // CF4-20 (spec §3): carrier and commande filters carry accents, spaces and a
    // leading `#` - buildListQuery must percent-encode them, not just concatenate.
    expect(buildListQuery({ carrier: 'Chronopost Relais' })).toBe(
      '?carrier=Chronopost+Relais'
    );
    expect(buildListQuery({ commande: '#CMD-1A' })).toBe('?commande=%23CMD-1A');
  });

  it('produces a stable key order regardless of insertion order', () => {
    const a = buildListQuery({ z: '1', a: '2', m: '3' });
    const b = buildListQuery({ m: '3', z: '1', a: '2' });
    expect(a).toBe(b);
    expect(a).toBe('?a=2&m=3&z=1');
  });

  it('drops false and 0 only when null/undefined/empty-string, keeps other falsy-looking values', () => {
    expect(buildListQuery({ page: 0, active: false })).toBe('?active=false&page=0');
  });
});

describe('eurosBoundToCents', () => {
  it('parses a comma amount to cents', () => {
    expect(eurosBoundToCents('12,5')).toBe(1250);
  });

  it('returns null for an empty string', () => {
    expect(eurosBoundToCents('')).toBeNull();
  });

  it('returns null for a non-numeric string', () => {
    expect(eurosBoundToCents('abc')).toBeNull();
  });
});

describe('parseAmountBound', () => {
  // CF4-F final review, Important #1: RefundsList's min/max euro inputs must
  // be validated before any request - an empty input clears the filter, a
  // non-empty unparseable one is an error, never a silently-dropped filter.
  it('an empty string is a cleared filter, not an error', () => {
    expect(parseAmountBound('')).toEqual({ ok: true, cents: null });
  });

  it('a blank (whitespace-only) string is also a cleared filter', () => {
    expect(parseAmountBound('   ')).toEqual({ ok: true, cents: null });
  });

  it('a valid amount parses to cents', () => {
    expect(parseAmountBound('12,50')).toEqual({ ok: true, cents: 1250 });
  });

  it('a whole-euro amount parses to cents', () => {
    expect(parseAmountBound('80')).toEqual({ ok: true, cents: 8000 });
  });

  it('an unparseable amount is an error, cents omitted', () => {
    expect(parseAmountBound('abc')).toEqual({ ok: false, error: 'Montant invalide.' });
  });
});

describe('createLatestGuard', () => {
  // CF4-F Task 6, Fix round 1 (review Important finding): a slower earlier
  // fetch resolving after a newer one must not be allowed to apply its result.
  it('reports only the most recently issued number as latest', () => {
    const guard = createLatestGuard();
    const first = guard.next();
    const second = guard.next();
    expect(guard.isLatest(first)).toBe(false);
    expect(guard.isLatest(second)).toBe(true);
  });

  it('the very first issued number is latest until superseded', () => {
    const guard = createLatestGuard();
    const first = guard.next();
    expect(guard.isLatest(first)).toBe(true);
  });

  it('handles three or more in-flight requests, only the last resolved-order winner counts by number, not resolution order', () => {
    const guard = createLatestGuard();
    const a = guard.next();
    const b = guard.next();
    const c = guard.next();
    // Simulate resolution arriving out of order: b resolves last in wall-clock
    // time but a and c were issued before/after it - only c (the highest issued
    // number) should ever be "latest".
    expect(guard.isLatest(a)).toBe(false);
    expect(guard.isLatest(c)).toBe(true);
    expect(guard.isLatest(b)).toBe(false);
  });

  it('two independent guards do not interfere with each other', () => {
    const guardA = createLatestGuard();
    const guardB = createLatestGuard();
    const a1 = guardA.next();
    guardB.next();
    const b2 = guardB.next();
    expect(guardA.isLatest(a1)).toBe(true);
    expect(guardB.isLatest(b2)).toBe(true);
  });
});
