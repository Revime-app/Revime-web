import { describe, expect, it } from 'vitest';
import { LEGACY_API_HOSTS, resolveAuthBaseURL } from '../src/auth/base-url.js';

describe('resolveAuthBaseURL (CF6-09)', () => {
  it('leaves an unset BETTER_AUTH_URL unset, as before', () => {
    expect(resolveAuthBaseURL(undefined)).toBeUndefined();
    expect(resolveAuthBaseURL('')).toBeUndefined();
  });

  it('keeps a plain string for local development over http', () => {
    expect(resolveAuthBaseURL('http://localhost:3002')).toBe('http://localhost:3002');
  });

  it('serves BOTH the brand host and the legacy Render host in production, falling back to the brand host', () => {
    const resolved = resolveAuthBaseURL('https://api.revime.fr');

    expect(resolved).toEqual({
      allowedHosts: ['api.revime.fr', ...LEGACY_API_HOSTS],
      protocol: 'https',
      fallback: 'https://api.revime.fr',
    });
    expect(LEGACY_API_HOSTS).toContain('repareme-api.onrender.com');
  });

  it('does not list a host twice when the primary URL already is a legacy host', () => {
    const resolved = resolveAuthBaseURL('https://repareme-api.onrender.com');

    expect(resolved).toMatchObject({
      allowedHosts: ['repareme-api.onrender.com'],
      fallback: 'https://repareme-api.onrender.com',
    });
  });

  it('ignores a trailing slash and a path when reading the host', () => {
    const resolved = resolveAuthBaseURL('https://api.revime.fr/api/auth/');
    expect(resolved).toMatchObject({ allowedHosts: ['api.revime.fr', ...LEGACY_API_HOSTS] });
  });

  it('passes a value that is not a URL straight through, so Better Auth reports the misconfiguration itself', () => {
    expect(resolveAuthBaseURL('not a url')).toBe('not a url');
  });
});
