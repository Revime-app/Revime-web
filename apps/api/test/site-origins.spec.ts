import { describe, expect, it } from 'vitest';
import { siteOrigins } from '../src/auth/site-origins.js';

describe('siteOrigins', () => {
  it('defaults to revime.fr with and without www', () => {
    expect(siteOrigins(undefined)).toEqual(['https://revime.fr', 'https://www.revime.fr']);
    expect(siteOrigins('  ')).toEqual(['https://revime.fr', 'https://www.revime.fr']);
  });

  it('reads a comma-separated list, trimmed, without trailing slashes or duplicates', () => {
    expect(siteOrigins(' https://revime.fr/ , https://revime-web.vercel.app,https://revime.fr')).toEqual([
      'https://revime.fr',
      'https://revime-web.vercel.app',
    ]);
  });
});
