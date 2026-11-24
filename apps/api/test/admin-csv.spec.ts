import { describe, expect, it } from 'vitest';
import { escapeCsvValue } from '../src/admin/admin-csv.js';
import { escapeCsvValue as reExported } from '../src/admin/admin-exports.service.js';

describe('escapeCsvValue (F5 and F6 share it)', () => {
  it.each(['=SUM(A1)', '+33612345678', '-5', '@cmd', '\tcmd', '\rcmd'])('neutralises a cell that starts with %j', (v) => {
    expect(escapeCsvValue(v).replace(/^"|"$/g, '')).toMatch(/^'/);
  });

  it('quotes cells holding a comma, a quote or a line break, and doubles the quotes', () => {
    expect(escapeCsvValue('a,b')).toBe('"a,b"');
    expect(escapeCsvValue('dit "oui"')).toBe('"dit ""oui"""');
    expect(escapeCsvValue('l1\nl2')).toBe('"l1\nl2"');
  });

  it('writes null and undefined as an empty cell', () => {
    expect(escapeCsvValue(null)).toBe('');
    expect(escapeCsvValue(undefined)).toBe('');
  });

  it('is the same function the exports service re-exports, so the two CSVs cannot drift', () => {
    expect(reExported).toBe(escapeCsvValue);
  });
});
