import { describe, expect, it } from 'vitest';
import { publicIdentity } from '@revime/shared';

describe('publicIdentity', () => {
  it('renders a client as their handle, prefixed', () => {
    expect(publicIdentity({ username: 'camille_m', displayName: null })).toBe('@camille_m');
  });

  it('renders a réparateur as their chosen trade name', () => {
    expect(publicIdentity({ username: 'camille_m', displayName: 'Atelier Martin' }))
      .toBe('Atelier Martin');
  });

  it('prefers the trade name even when it happens to equal the handle form', () => {
    expect(publicIdentity({ username: 'camille_m', displayName: '@camille_m' }))
      .toBe('@camille_m');
  });

  it('never doubles the @ prefix', () => {
    expect(publicIdentity({ username: 'camille_m', displayName: null })).not.toContain('@@');
  });

  /**
   * The real guarantee this helper gives is STRUCTURAL, so the test for it must be
   * a COMPILE-TIME one. `User.name`, `firstName` and `lastName` are not
   * parameters, so a caller physically cannot pass a legal name through - and
   * `@ts-expect-error` fails the build if that ever stops being true, because an
   * unused expect-error is itself an error.
   *
   * The positive control below it is not decoration: an `@ts-expect-error` whose
   * line stops erroring for an unrelated reason would silently pass, so the same
   * test pins that the legitimate shape still compiles and still returns.
   */
  it('rejects a legal-name field at compile time, and accepts the legitimate shape', () => {
    // @ts-expect-error - `name` is not a parameter, and that IS the feature.
    publicIdentity({ username: 'camille_m', displayName: null, name: 'Camille Martin' });

    // Positive control: the real shape compiles and returns.
    expect(publicIdentity({ username: 'camille_m', displayName: null })).toBe('@camille_m');
  });

  it('renders a deleted user (CF5-23) as Utilisateur supprimé without @, for both client and repairer', () => {
    // Deleted client (no displayName, tombstone username)
    expect(publicIdentity({ username: 'supprime_qwl4hd7hereusjmah', displayName: null }))
      .toBe('Utilisateur supprimé');
    // Deleted repairer (displayName replaced by DELETED_USER_NAME)
    expect(publicIdentity({ username: 'supprime_qwl4hd7hereusjmah', displayName: 'Utilisateur supprimé' }))
      .toBe('Utilisateur supprimé');
    // Direct DELETED_USER_NAME as username
    expect(publicIdentity({ username: 'Utilisateur supprimé', displayName: null }))
      .toBe('Utilisateur supprimé');
  });
});

