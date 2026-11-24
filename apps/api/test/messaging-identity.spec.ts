import { describe, expect, it } from 'vitest';
import { avatarInitials, messagingIdentity } from '@revime/shared';

/**
 * CF4-50. The Messages list and the chat header showed « @mlk », and every row's avatar was a
 * pink « @ »: `counterpartName` came from `publicIdentity` (`displayName ?? '@' + username`) and
 * the avatar's initials took the first character of each word - the « @ ».
 */
describe('messagingIdentity (CF4-50)', () => {
  it('renders a client by his handle WITHOUT the @', () => {
    expect(messagingIdentity({ username: 'mlk', displayName: null })).toBe('mlk');
  });

  it('keeps a réparateur trade name as-is', () => {
    expect(messagingIdentity({ username: 'mlk', displayName: 'Atelier Martin' })).toBe('Atelier Martin');
  });

  it('rejects a legal-name field at compile time, like publicIdentity', () => {
    // @ts-expect-error - `name` is not a parameter (CF-05).
    messagingIdentity({ username: 'mlk', displayName: null, name: 'Camille Martin' });
    expect(messagingIdentity({ username: 'mlk', displayName: null })).toBe('mlk');
  });

  it('renders a deleted user (CF5-23) as Utilisateur supprimé', () => {
    expect(messagingIdentity({ username: 'supprime_qwl4hd7hereusjmah', displayName: null }))
      .toBe('Utilisateur supprimé');
    expect(messagingIdentity({ username: 'supprime_qwl4hd7hereusjmah', displayName: 'Utilisateur supprimé' }))
      .toBe('Utilisateur supprimé');
  });
});

describe('avatarInitials (CF4-50)', () => {
  it('uses the first LETTER of a handle, never the @', () => {
    expect(avatarInitials('@mlk')).toBe('M');
    expect(avatarInitials('mlk')).toBe('M');
  });

  it('takes up to two words', () => {
    expect(avatarInitials('Atelier Martin Réparation')).toBe('AM');
  });

  it('skips punctuation inside a handle and keeps accented letters', () => {
    expect(avatarInitials('_élodie')).toBe('É');
    expect(avatarInitials('@thomas_perrin')).toBe('T');
  });

  it('falls back to « ? » when there is no letter or digit at all', () => {
    expect(avatarInitials('')).toBe('?');
    expect(avatarInitials('@ _')).toBe('?');
  });
});
