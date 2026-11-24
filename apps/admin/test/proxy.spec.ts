import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildUpstreamUrl } from '../lib/proxy';

describe('buildUpstreamUrl', () => {
  const originalEnv = process.env.API_URL;

  beforeEach(() => {
    process.env.API_URL = 'https://repareme-api.onrender.com';
  });

  afterEach(() => {
    process.env.API_URL = originalEnv;
  });

  it('builds correct URL for API proxy route (role gate)', () => {
    const result = buildUpstreamUrl('/api/proxy/admin/ping', '/api/proxy', '/api/v1', '');
    expect(result).toBe('https://repareme-api.onrender.com/api/v1/admin/ping');
  });

  it('builds correct URL for auth proxy route', () => {
    const result = buildUpstreamUrl('/api/auth/sign-in/email', '/api/auth', '/api/auth', '');
    expect(result).toBe('https://repareme-api.onrender.com/api/auth/sign-in/email');
  });

  it('preserves query string', () => {
    const result = buildUpstreamUrl('/api/proxy/users', '/api/proxy', '/api/v1', '?limit=10&offset=20');
    expect(result).toBe('https://repareme-api.onrender.com/api/v1/users?limit=10&offset=20');
  });

  it('preserves complex query strings', () => {
    const result = buildUpstreamUrl(
      '/api/auth/callback/google',
      '/api/auth',
      '/api/auth',
      '?code=abc123&state=xyz789'
    );
    expect(result).toBe(
      'https://repareme-api.onrender.com/api/auth/callback/google?code=abc123&state=xyz789'
    );
  });

  it('does not mangle paths that merely contain the prefix', () => {
    // If the path is /api/proxy/api/something, the prefix appears twice
    // We should only strip the LEADING /api/proxy, not any occurrence later
    const result = buildUpstreamUrl('/api/proxy/api/nested', '/api/proxy', '/api/v1', '');
    expect(result).toBe('https://repareme-api.onrender.com/api/v1/api/nested');
  });

  it('handles root proxy path', () => {
    const result = buildUpstreamUrl('/api/proxy/', '/api/proxy', '/api/v1', '');
    expect(result).toBe('https://repareme-api.onrender.com/api/v1/');
  });

  it('handles paths with special characters', () => {
    const result = buildUpstreamUrl(
      '/api/proxy/users/test@example.com',
      '/api/proxy',
      '/api/v1',
      ''
    );
    expect(result).toBe('https://repareme-api.onrender.com/api/v1/users/test@example.com');
  });

  it('throws error when API_URL is not configured', () => {
    delete process.env.API_URL;
    expect(() => {
      buildUpstreamUrl('/api/proxy/admin/ping', '/api/proxy', '/api/v1', '');
    }).toThrow('API_URL not configured');
  });
});
