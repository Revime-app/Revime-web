import { describe, it, expect } from 'vitest';
import { normaliseOrderSearch } from '@revime/shared';
import { resolveRefundCommandeId } from '../lib/refund-form';

describe('Bug B15: Short reference normalisation and admin search URLs', () => {
  it('normalises short references with # prefix', () => {
    expect(normaliseOrderSearch('#86642ef2')).toBe('86642ef2');
    expect(normaliseOrderSearch('#86642EF2')).toBe('86642ef2');
  });

  it('normalises order numbers with #CMD- prefix', () => {
    expect(normaliseOrderSearch('#CMD-A9DB011E')).toBe('a9db011e');
    expect(normaliseOrderSearch('CMD-A9DB011E')).toBe('a9db011e');
    expect(normaliseOrderSearch('#cmd-a9db011e')).toBe('a9db011e');
    expect(normaliseOrderSearch('cmd-a9db011e')).toBe('a9db011e');
  });

  it('normalises order references with Cmd # prefix', () => {
    expect(normaliseOrderSearch('Cmd #86642ef2')).toBe('86642ef2');
    expect(normaliseOrderSearch('CMD #86642ef2')).toBe('86642ef2');
  });

  it('preserves full UUID without prefix', () => {
    expect(normaliseOrderSearch('86642ef2-1111-2222-3333-444444444444')).toBe('86642ef2-1111-2222-3333-444444444444');
    expect(normaliseOrderSearch('#86642ef2-1111-2222-3333-444444444444')).toBe('86642ef2-1111-2222-3333-444444444444');
  });

  it('resolveRefundCommandeId extracts commande from params', () => {
    const params = new URLSearchParams('commande=%23CMD-A9DB011E');
    expect(resolveRefundCommandeId(params)).toBe('#CMD-A9DB011E');
    const normalized = normaliseOrderSearch(resolveRefundCommandeId(params));
    expect(normalized).toBe('a9db011e');
  });

  it('handles null, undefined and non-string inputs safely', () => {
    expect(normaliseOrderSearch(null as any)).toBe('');
    expect(normaliseOrderSearch(undefined as any)).toBe('');
    expect(normaliseOrderSearch(12345 as any)).toBe('');
  });
});
