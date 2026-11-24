import { describe, expect, it } from 'vitest';
import { buildLitigesQueryString } from '../app/litiges/page';

describe('RU-16 UI8: the disputes queue asks the server for the order', () => {
  it('sends the sort column and direction with the page', () => {
    const qs = new URLSearchParams(buildLitigesQueryString({ page: 2, pageSize: 10, sort: 'totalCents', dir: 'asc' }));
    expect(qs.get('sort')).toBe('totalCents');
    expect(qs.get('dir')).toBe('asc');
    expect(qs.get('page')).toBe('2');
  });

  it('sends nothing for the default order', () => {
    const qs = new URLSearchParams(buildLitigesQueryString({ page: 1, pageSize: 25 }));
    expect(qs.has('sort')).toBe(false);
    expect(qs.has('dir')).toBe(false);
  });
});
