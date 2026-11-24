import { describe, expect, it } from 'vitest';
import {
  RECIPIENT_SEARCH_LIMIT,
  RECIPIENT_SEARCH_MIN_CHARS,
  adminBroadcastRecipientSuggestionSchema,
  normaliseRecipientQuery,
} from '../src/index.js';

/** V7 D2 (U5, `DEC7-20`): the single-recipient search's shared vocabulary. */
describe('V7 U5 recipient search, shared', () => {
  it('searches from 2 characters and suggests at most 8 people (Q5)', () => {
    expect(RECIPIENT_SEARCH_MIN_CHARS).toBe(2);
    expect(RECIPIENT_SEARCH_LIMIT).toBe(8);
  });

  it('ignores a leading « @ » and the surrounding blanks', () => {
    expect(normaliseRecipientQuery('  @nes ')).toBe('nes');
    expect(normaliseRecipientQuery('nes@revime.fr')).toBe('nes@revime.fr');
    expect(normaliseRecipientQuery('@')).toBe('');
    expect(normaliseRecipientQuery(undefined)).toBe('');
  });

  it('caps the query at 100 characters, like the global search', () => {
    expect(normaliseRecipientQuery('a'.repeat(150))).toHaveLength(100);
  });

  it('describes a suggestion without any reachability field (Q7)', () => {
    const s = adminBroadcastRecipientSuggestionSchema.parse({
      id: 'LQYUabc123',
      username: 'nes',
      name: 'Nes Dab',
      email: 'nes@example.com',
      role: 'REPAIRER',
      suspended: false,
    });
    expect(Object.keys(s).sort()).toEqual(['email', 'id', 'name', 'role', 'suspended', 'username']);
  });
});
