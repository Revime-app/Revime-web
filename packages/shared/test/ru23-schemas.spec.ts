import { describe, expect, it } from 'vitest';
import {
  ADMIN_STATS_CUSTOM_MAX_DAYS,
  adminReorderCategoriesSchema,
  adminStatsQuerySchema,
  adminTipInputSchema,
  adminTipUpdateSchema,
  httpsUrlOrNull,
} from '../src/index.js';

const TIP = { text: 'Sauvegardez avant de réparer.', category: 'ALL' as const };

describe('P23: a tip URL is an https URL or nothing', () => {
  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://revime.fr/a', 'revime.fr/guide', 'ftp://x.fr/a', 'https://'])(
    'refuses %s on create and on update',
    (url) => {
      expect(adminTipInputSchema.safeParse({ ...TIP, linkUrl: url }).success).toBe(false);
      expect(adminTipInputSchema.safeParse({ ...TIP, imageUrl: url }).success).toBe(false);
      expect(adminTipUpdateSchema.safeParse({ linkUrl: url }).success).toBe(false);
    },
  );

  it('refuses an address longer than 2048 characters', () => {
    const long = `https://revime.fr/${'a'.repeat(2100)}`;
    expect(adminTipInputSchema.safeParse({ ...TIP, linkUrl: long }).success).toBe(false);
  });

  it('accepts an https URL, trimmed', () => {
    const parsed = adminTipInputSchema.parse({ ...TIP, linkUrl: '  https://revime.fr/guides/batterie ', imageUrl: 'https://img.revime.fr/a.jpg' });
    expect(parsed.linkUrl).toBe('https://revime.fr/guides/batterie');
    expect(parsed.imageUrl).toBe('https://img.revime.fr/a.jpg');
  });

  it('reads a blank field as « none »', () => {
    const parsed = adminTipInputSchema.parse({ ...TIP, linkUrl: '   ', imageUrl: '' });
    expect(parsed.linkUrl).toBeNull();
    expect(parsed.imageUrl).toBeNull();
  });

  it('httpsUrlOrNull normalises the good and drops the rest', () => {
    expect(httpsUrlOrNull('https://revime.fr')).toBe('https://revime.fr/');
    expect(httpsUrlOrNull('javascript:alert(1)')).toBeNull();
    expect(httpsUrlOrNull(null)).toBeNull();
    expect(httpsUrlOrNull(undefined)).toBeNull();
    expect(httpsUrlOrNull('')).toBeNull();
    expect(httpsUrlOrNull(`https://revime.fr/${'a'.repeat(2100)}`)).toBeNull();
  });
});

describe('P22: reorder takes one list of distinct category ids', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  it('accepts distinct uuids', () => {
    expect(adminReorderCategoriesSchema.safeParse({ categoryIds: [id(1), id(2)] }).success).toBe(true);
  });

  it.each([
    ['empty', []],
    ['not a uuid', ['abc']],
    ['a duplicate', [id(1), id(1)]],
    ['more than 200', Array.from({ length: 201 }, (_, i) => id(i + 1))],
  ])('refuses %s', (_label, categoryIds) => {
    expect(adminReorderCategoriesSchema.safeParse({ categoryIds }).success).toBe(false);
  });
});

describe('P24: a custom stats period is two valid, ordered days at most three years apart', () => {
  const ok = (q: Record<string, unknown>) => adminStatsQuerySchema.safeParse(q).success;

  it('accepts two ordered days, and one single day', () => {
    expect(ok({ period: 'custom', from: '2026-05-01', to: '2026-05-15' })).toBe(true);
    expect(ok({ period: 'custom', from: '2026-05-01', to: '2026-05-01' })).toBe(true);
  });

  it('needs both dates for a custom period, but not for the others', () => {
    expect(ok({ period: 'custom' })).toBe(false);
    expect(ok({ period: 'custom', from: '2026-05-01' })).toBe(false);
    expect(ok({ period: '30d' })).toBe(true);
  });

  it.each(['2026-5-1', '2026-05-01T00:00:00Z', 'hier', '2026-02-31', '9999-12-31x'])('refuses the date %s', (v) => {
    expect(ok({ period: 'custom', from: v, to: '2026-06-01' })).toBe(false);
  });

  it('refuses from after to', () => {
    expect(ok({ period: 'custom', from: '2026-05-16', to: '2026-05-15' })).toBe(false);
  });

  it('caps the span (it bounds the bucket loop)', () => {
    expect(ADMIN_STATS_CUSTOM_MAX_DAYS).toBe(1096);
    expect(ok({ period: 'custom', from: '2023-01-01', to: '2025-12-31' })).toBe(true); // 1096 days
    expect(ok({ period: 'custom', from: '2023-01-01', to: '2026-01-01' })).toBe(false); // 1097 days
    expect(ok({ period: 'custom', from: '0001-01-01', to: '9999-12-31' })).toBe(false);
  });
});
