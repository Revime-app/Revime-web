/**
 * The SEO foundations of revime.fr (phase 1 of the plan d'action, 24/11/2026). These tests pin
 * the rules the skills set, so a later change cannot quietly break indexing.
 */
import { describe, it, expect } from 'vitest';
import robots, { PRIVATE_PATHS } from '../app/robots';
import sitemap from '../app/sitemap';
import { buildMetadata, privatePageMetadata, TITLE_MAX } from '../lib/seo';
import { absoluteUrl, SITE_URL } from '../lib/site';
import { HTML_LIMITED_BOTS, AI_CRAWLERS } from '../lib/bots';
import { SEO_CATEGORIES, CATEGORIES_TO_CREATE, findBySeoSlug, findByInternalSlug } from '../lib/categories';
import { organizationJsonLd, breadcrumbJsonLd } from '../lib/jsonld';
import { PUBLIC_DOCUMENTS } from '../lib/documents';

describe('absoluteUrl', () => {
  it('builds absolute URLs on the canonical origin', () => {
    expect(absoluteUrl('/')).toBe(SITE_URL);
    expect(absoluteUrl('/cgu')).toBe(`${SITE_URL}/cgu`);
  });
  it('refuses a relative path', () => {
    expect(() => absoluteUrl('cgu')).toThrow();
  });
});

describe('buildMetadata', () => {
  it('always sets an absolute canonical and matching Open Graph URL', () => {
    const m = buildMetadata({ title: 'Test', path: '/cgu' });
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/cgu`);
    expect((m.openGraph as { url?: string }).url).toBe(`${SITE_URL}/cgu`);
  });
  it('keeps noindex pages followable', () => {
    expect(privatePageMetadata('Compte', '/compte').robots).toEqual({ index: false, follow: true });
    expect(buildMetadata({ title: 'x', path: '/' }).robots).toEqual({ index: true, follow: true });
  });
});

describe('robots.txt', () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  it('lets every crawler in, AI crawlers included (decision 24/11/2026)', () => {
    expect(rules).toHaveLength(1);
    expect(rules[0].userAgent).toBe('*');
    expect(rules[0].allow).toBe('/');
  });
  it('closes the API and every private area', () => {
    for (const p of ['/api/', '/compte', '/messages', '/paiement', '/pro/', '/parametres']) {
      expect(PRIVATE_PATHS).toContain(p);
    }
  });
  it('never blocks a public page or assets', () => {
    for (const p of PRIVATE_PATHS) {
      expect(p.startsWith('/reparation')).toBe(false);
      expect(p.startsWith('/reparateur')).toBe(false);
      expect(p.startsWith('/_next')).toBe(false);
    }
  });
  it('points to the sitemap', () => {
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe('sitemap.xml', () => {
  const entries = sitemap();
  it('lists only pages that exist today', () => {
    const urls = entries.map((e) => e.url);
    expect(urls).toEqual([
      SITE_URL,
      ...['/comment-ca-marche', '/protection-revime', '/devenir-reparateur', '/qui-sommes-nous', '/aide', '/reparateurs', '/demandes'].map((p) => `${SITE_URL}${p}`),
      ...PUBLIC_DOCUMENTS.map((d) => `${SITE_URL}/${d.slug}`),
      `${SITE_URL}/suppression-compte`,
    ]);
  });
  it('never uses fields Google ignores, nor a fake "now" lastmod', () => {
    for (const e of entries) {
      expect(e.changeFrequency).toBeUndefined();
      expect(e.priority).toBeUndefined();
      expect(e.lastModified).toBeUndefined();
    }
  });
});

describe('metadata for crawlers that do not run JavaScript', () => {
  it('keeps the Next.js default bots', () => {
    for (const ua of ['Bingbot/2.0', 'Twitterbot/1.0', 'facebookexternalhit/1.1', 'Google-InspectionTool']) {
      expect(HTML_LIMITED_BOTS.test(ua), ua).toBe(true);
    }
  });
  it('adds the AI crawlers', () => {
    for (const bot of AI_CRAWLERS) expect(HTML_LIMITED_BOTS.test(`Mozilla/5.0 (compatible; ${bot}/1.0)`), bot).toBe(true);
  });
  it('does not treat a normal browser as a bot', () => {
    expect(HTML_LIMITED_BOTS.test('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')).toBe(false);
  });
});

describe('category URL words', () => {
  const URL_SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  it('uses clean, unique URL segments', () => {
    const all = [...SEO_CATEGORIES.map((c) => c.seoSlug), ...CATEGORIES_TO_CREATE.map((c) => c.seoSlug)];
    for (const s of all) expect(s, s).toMatch(URL_SEGMENT);
    expect(new Set(all).size).toBe(all.length);
  });
  it('maps each catalogue category at most once', () => {
    const internal = SEO_CATEGORIES.map((c) => c.internalSlug);
    expect(new Set(internal).size).toBe(internal.length);
  });
  it('uses the searched word, not the internal one, where they differ', () => {
    expect(findByInternalSlug('smartphone')?.seoSlug).toBe('telephone');
    expect(findBySeoSlug('velo')?.internalSlug).toBe('velos');
  });
  it('keeps titles short enough once the brand is appended', () => {
    for (const c of SEO_CATEGORIES) {
      const h1 = `${c.titleWord ?? 'Réparation'} ${c.object}`;
      expect(`${h1} | REVIME`.length, h1).toBeLessThanOrEqual(TITLE_MAX);
    }
  });
});

describe('JSON-LD', () => {
  it('never puts a rating on REVIME itself (self-serving reviews are not shown by Google)', () => {
    const org = organizationJsonLd();
    expect(org).not.toHaveProperty('aggregateRating');
    expect(org).not.toHaveProperty('review');
  });
  it('builds breadcrumbs with absolute URLs in order', () => {
    const b = breadcrumbJsonLd([
      { name: 'Accueil', path: '/' },
      { name: 'Réparation', path: '/reparation' },
    ]) as { itemListElement: { position: number; item: string }[] };
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(b.itemListElement[1].item).toBe(`${SITE_URL}/reparation`);
  });
});

describe('the signed-in area stays out of search engines', () => {
  it('blocks every signed-in path in robots.txt', () => {
    for (const path of ['/publier', '/mes-demandes', '/messages', '/profil', '/connexion']) {
      expect(PRIVATE_PATHS).toContain(path);
    }
  });

  it('leaves the pages a visitor browses open to search engines', () => {
    for (const path of ['/reparateurs', '/demandes']) {
      expect(PRIVATE_PATHS.some((p) => path.startsWith(p.replace(/\/$/, '')))).toBe(false);
    }
  });
});
