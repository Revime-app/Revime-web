import { describe, expect, it } from 'vitest';
import { AUTHENTICATOR_APPS, formatSecretForEntry } from '../lib/two-factor-guide';

/** « Paramètres › Sécurité »: the 2FA setup guide. */
describe('AUTHENTICATOR_APPS', () => {
  it('suggests Google Authenticator, Microsoft Authenticator and 2FAS, in that order', () => {
    expect(AUTHENTICATOR_APPS.map((a) => a.name)).toEqual([
      'Google Authenticator',
      'Microsoft Authenticator',
      '2FAS',
    ]);
  });

  it('links each app to its official App Store and Google Play pages', () => {
    for (const app of AUTHENTICATOR_APPS) {
      expect(app.ios).toMatch(/^https:\/\/apps\.apple\.com\/app\/[^/]+\/id\d+$/);
      expect(app.android).toMatch(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=[\w.]+$/);
    }
  });
});

describe('formatSecretForEntry', () => {
  it('groups the key in blocks of 4 so it can be typed without losing one’s place', () => {
    expect(formatSecretForEntry('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
  });

  it('keeps a short last block', () => {
    expect(formatSecretForEntry('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
  });

  it('upper-cases and drops existing spaces and padding', () => {
    expect(formatSecretForEntry('jbsw y3dp==')).toBe('JBSW Y3DP');
  });

  it('returns an empty string for an empty key', () => {
    expect(formatSecretForEntry('')).toBe('');
  });
});
