import { describe, expect, it } from 'vitest';
import { orderIdPrefix } from '../src/index.js';

describe('orderIdPrefix', () => {
  it('returns the lowercase hex prefix of a displayed short reference', () => {
    expect(orderIdPrefix('#86642EF2')).toBe('86642ef2');
    expect(orderIdPrefix('#CMD-A9DB011E')).toBe('a9db011e');
    expect(orderIdPrefix(' cmd-a9db011e ')).toBe('a9db011e');
  });

  it('accepts exactly six hex characters and refuses fewer', () => {
    expect(orderIdPrefix('a9db01')).toBe('a9db01');
    expect(orderIdPrefix('a9db0')).toBeNull();
  });

  it('refuses a term that is not hex, so a name never becomes an id search', () => {
    expect(orderIdPrefix('Martin')).toBeNull();
    expect(orderIdPrefix('a9db011g')).toBeNull();
    expect(orderIdPrefix('')).toBeNull();
  });

  it('refuses a hyphenated full id: it is matched whole, not as a prefix', () => {
    expect(orderIdPrefix('86642ef2-1111-2222-3333-444444444444')).toBeNull();
  });
});
