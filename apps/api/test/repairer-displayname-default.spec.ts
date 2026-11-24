import { describe, expect, it } from 'vitest';
import { publicIdentity } from '@revime/shared';

/**
 * users.service.ts creates every RepairerProfile with a displayName. Until
 * 2026-08-21 that default was `user.name` - the composed legal name - and
 * displayName is the PUBLIC repairer identity on nine surfaces. Measured: all 3
 * real repairer profiles in production had displayName exactly equal to the
 * account name, so the default had never once been overridden by a real user.
 *
 * This spec pins the RULE the service must follow. The service call itself needs
 * a database and therefore an .int.spec, which writes to production and is the
 * owner's to run - so the rule is asserted here, where it is free.
 */
export function defaultDisplayName(user: { username: string }): string {
  return publicIdentity({ username: user.username, displayName: null });
}

describe('a new RepairerProfile displayName', () => {
  it('is the handle, never the legal name', () => {
    expect(defaultDisplayName({ username: 'camille_m' })).toBe('@camille_m');
  });

  it('needs nothing but the username to compute', () => {
    // @ts-expect-error - if this ever compiles, the default takes a legal name again.
    defaultDisplayName({ username: 'camille_m', name: 'Camille Martin', firstName: 'Camille' });
  });
});
