import { describe, expect, it } from 'vitest';
import { buildSocialProviders, splitAppleName, splitGoogleName } from '../src/auth/social-providers.js';

describe('buildSocialProviders', () => {
  it('registers nothing when no credentials are present', () => {
    expect(buildSocialProviders({})).toEqual({});
  });

  it('registers google only when BOTH id and secret are present', () => {
    // An id without a secret must fail CLOSED. The old ternary registered the
    // provider and asserted the secret with `!`, so the failure moved to the
    // token exchange, where it reads as a Google outage rather than as config.
    expect(buildSocialProviders({ GOOGLE_CLIENT_ID: 'id' })).toEqual({});
    expect(buildSocialProviders({ GOOGLE_CLIENT_SECRET: 'secret' })).toEqual({});

    const providers = buildSocialProviders({
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
    });
    expect(Object.keys(providers)).toEqual(['google']);
    expect(providers.google).toMatchObject({ clientId: 'id', clientSecret: 'secret' });
  });

  it('treats an empty or whitespace credential as absent', () => {
    // apps/api/.env ships these keys present-but-empty, so truthiness alone is
    // not enough: `GOOGLE_CLIENT_ID=` must not register a provider.
    expect(buildSocialProviders({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' })).toEqual({});
    expect(buildSocialProviders({ GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: ' ' })).toEqual({});
    expect(buildSocialProviders({ APPLE_CLIENT_ID: '   ' })).toEqual({});
  });

  it('registers apple on the bundle id alone, with NO client secret', () => {
    // The ID-token path verifies against Apple's public JWKS, so no secret is
    // needed. Omitting it also makes the redirect flow throw
    // CLIENT_ID_AND_SECRET_REQUIRED, which is deliberate: one Apple path only.
    const providers = buildSocialProviders({ APPLE_CLIENT_ID: 'fr.revime.demo' });
    expect(Object.keys(providers)).toEqual(['apple']);
    expect(providers.apple).toMatchObject({
      clientId: 'fr.revime.demo',
      appBundleIdentifier: 'fr.revime.demo',
    });
    expect(providers.apple).not.toHaveProperty('clientSecret');
  });

  it('registers both when both are configured', () => {
    const providers = buildSocialProviders({
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      APPLE_CLIENT_ID: 'fr.revime.demo',
    });
    expect(Object.keys(providers).sort()).toEqual(['apple', 'google']);
  });
});

// CF4-04 task 10.4 — preservation table (3.11): an unconfigured provider is never registered.
describe('buildSocialProviders registration table (CF4-04)', () => {
  const cases: Array<[string, Record<string, string | undefined>, string[]]> = [
    ['all absent', {}, []],
    ['all explicitly undefined', { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, APPLE_CLIENT_ID: undefined }, []],
    ['apple blank', { APPLE_CLIENT_ID: '' }, []],
    ['apple whitespace/tab/newline', { APPLE_CLIENT_ID: ' \t\n ' }, []],
    ['google id set, secret blank', { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: '' }, []],
    ['google id set, secret whitespace', { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: '   ' }, []],
    ['google id whitespace, secret set', { GOOGLE_CLIENT_ID: ' ', GOOGLE_CLIENT_SECRET: 'secret' }, []],
    ['apple set only', { APPLE_CLIENT_ID: 'fr.revime.demo' }, ['apple']],
    ['apple set, google half-configured', { APPLE_CLIENT_ID: 'fr.revime.demo', GOOGLE_CLIENT_ID: 'id' }, ['apple']],
    ['google complete, apple blank', { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', APPLE_CLIENT_ID: ' ' }, ['google']],
    ['both complete', { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', APPLE_CLIENT_ID: 'fr.revime.demo' }, ['apple', 'google']],
  ];

  it.each(cases)('%s', (_label, env, expected) => {
    expect(Object.keys(buildSocialProviders(env)).sort()).toEqual(expected);
  });

  it('trims surrounding whitespace before registering (a pasted Render value)', () => {
    const providers = buildSocialProviders({
      APPLE_CLIENT_ID: '  fr.revime.demo\n',
      GOOGLE_CLIENT_ID: ' id ',
      GOOGLE_CLIENT_SECRET: ' secret ',
    });
    // The audience check compares `aud` to appBundleIdentifier exactly, so an
    // untrimmed value would reject every Apple token (H4b).
    expect(providers.apple).toMatchObject({ clientId: 'fr.revime.demo', appBundleIdentifier: 'fr.revime.demo' });
    expect(providers.google).toMatchObject({ clientId: 'id', clientSecret: 'secret' });
  });

  it('reads process.env the way auth.ts calls it, and leaves it untouched', () => {
    const keys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'APPLE_CLIENT_ID'] as const;
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      for (const k of keys) delete process.env[k];
      expect(buildSocialProviders(process.env)).toEqual({});

      process.env.APPLE_CLIENT_ID = 'fr.revime.demo';
      expect(Object.keys(buildSocialProviders(process.env))).toEqual(['apple']);
      expect(process.env.APPLE_CLIENT_ID).toBe('fr.revime.demo');
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});

describe('splitGoogleName', () => {
  it('maps given_name and family_name to the two columns', () => {
    expect(splitGoogleName({ given_name: 'Camille', family_name: 'Martin' }))
      .toEqual({ firstName: 'Camille', lastName: 'Martin' });
  });

  it('omits a field rather than writing an empty string', () => {
    // `{}` and `{ firstName: '' }` are NOT the same: an empty string in a
    // nullable column makes « has no first name » have two representations,
    // and Accueil's `me?.firstName?.trim()` guard would then render « BONJOUR ».
    expect(splitGoogleName({ given_name: 'Camille' })).toEqual({ firstName: 'Camille' });
    expect(splitGoogleName({ family_name: 'Martin' })).toEqual({ lastName: 'Martin' });
    expect(splitGoogleName({})).toEqual({});
    expect(splitGoogleName({ given_name: '   ', family_name: '' })).toEqual({});
  });

  it('trims, because a provider value is not sanitised', () => {
    expect(splitGoogleName({ given_name: ' Camille ' })).toEqual({ firstName: 'Camille' });
  });
});

describe('splitAppleName', () => {
  it('reads the ID token name payload', () => {
    expect(splitAppleName({ user: { name: { firstName: 'Camille', lastName: 'Martin' } } }))
      .toEqual({ firstName: 'Camille', lastName: 'Martin' });
  });

  it('returns {} when Apple supplies nothing, which is the COMMON case', () => {
    // Apple sends the name only on the FIRST authorization for an Apple ID, and
    // the user can decline the scope outright. Both columns then stay null,
    // which every consumer already handles.
    expect(splitAppleName({})).toEqual({});
    expect(splitAppleName({ user: {} })).toEqual({});
    expect(splitAppleName({ user: { name: {} } })).toEqual({});
    expect(splitAppleName({ user: { name: { firstName: '', lastName: '  ' } } })).toEqual({});
  });

  it('handles a partial name', () => {
    expect(splitAppleName({ user: { name: { firstName: 'Camille' } } }))
      .toEqual({ firstName: 'Camille' });
  });
});

describe('buildSocialProviders name mapping', () => {
  it('attaches mapProfileToUser to each registered provider', () => {
    const providers = buildSocialProviders({
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      APPLE_CLIENT_ID: 'fr.revime.demo',
    }) as Record<string, { mapProfileToUser?: unknown }>;
    expect(typeof providers.google?.mapProfileToUser).toBe('function');
    expect(typeof providers.apple?.mapProfileToUser).toBe('function');
  });
});
