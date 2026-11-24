/**
 * The public site served on revime.fr (REVIME_APP_PUBLICATION_PREPARATION.md PUB-28, PUB-29, QP-08).
 *
 * Both stores need a public privacy-policy URL, Google needs a public account-deletion page, and
 * three existing references already point at revime.fr (the mentions légales' « www.revime.fr », the
 * Google OAuth consent screen's home and `/cgu` links). These tests pin what that site must be.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LEGAL_DOCUMENTS } from '../../mobile/src/lib/legal';
import { PUBLIC_DOCUMENTS, findDocument } from '../lib/documents';
import LegalDocumentPage, { generateStaticParams, dynamicParams } from '../app/[slug]/page';
import AccountDeletionPage from '../app/suppression-compte/page';
import HomePage from '../app/page';

/** Rendered markup reduced to the text a reader sees, whitespace collapsed. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;| /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

async function renderDocument(slug: string): Promise<string> {
  const element = await LegalDocumentPage({ params: Promise.resolve({ slug }) });
  return renderToStaticMarkup(element);
}

describe('the documents the site publishes', () => {
  it('publishes every legal document the app shows, under the same slug', () => {
    expect(PUBLIC_DOCUMENTS.map((d) => d.slug)).toEqual(LEGAL_DOCUMENTS.map((d) => d.slug));
  });

  it('serves the three URLs the stores and Google already expect', () => {
    for (const slug of ['cgu', 'confidentialite', 'mentions-legales']) {
      expect(findDocument(slug), slug).toBeDefined();
    }
  });

  it('pre-renders one page per document and refuses any other slug', () => {
    expect(generateStaticParams()).toEqual(LEGAL_DOCUMENTS.map((d) => ({ slug: d.slug })));
    expect(dynamicParams).toBe(false);
  });
});

describe('a legal document page', () => {
  it.each(LEGAL_DOCUMENTS.map((d) => [d.slug]))(
    '%s renders the title, the date line and every heading and paragraph of the app text',
    async (slug) => {
      const doc = LEGAL_DOCUMENTS.find((d) => d.slug === slug)!.getDocument();
      const text = visibleText(await renderDocument(slug));
      expect(text).toContain(norm(doc.title));
      expect(text).toContain(norm(doc.updated));
      for (const section of doc.sections) {
        expect(text).toContain(norm(section.heading));
        for (const paragraph of section.body) {
          // A « • » bullet becomes a list item, so the marker itself is not in the text.
          expect(text).toContain(norm(paragraph.replace(/^•\s*/, '')));
        }
      }
    },
  );
});

describe('the account deletion page (Google Play account-deletion requirement)', () => {
  const html = renderToStaticMarkup(<AccountDeletionPage />);
  const text = visibleText(html);

  it('names the app and the developer', () => {
    expect(text).toContain('Revime');
    expect(text).toContain('Malek KLIMANE');
  });

  it('explains the in-app route and a way to ask without the app', () => {
    expect(text).toContain('Paramètres');
    expect(text).toContain('Supprimer mon compte');
    expect(html).toContain('href="mailto:support@revime.fr');
  });

  it('links to the privacy policy for the full list', () => {
    expect(html).toContain('href="/confidentialite"');
  });

  /**
   * Drift guard: these facts are also stated on the app's own deletion screen. If either side
   * changes its wording, this fails and both are brought back in line.
   */
  const SHARED_FACTS = [
    'Votre compte sera fermé et vous ne pourrez plus vous connecter.',
    'nom, prénom, pseudo, adresse e-mail, numéro de téléphone, photo de profil, bannière, code postal et coordonnées géographiques',
    'Vos demandes de réparation et leurs photos.',
    'Vos conversations et les messages échangés.',
    'Utilisateur supprimé',
    'support.stripe.com',
  ];
  const appScreen = readFileSync(
    join(__dirname, '../../mobile/app/parametres/supprimer.tsx'),
    'utf8',
  )
    .replace(/&apos;/g, "'")
    // JSX wraps long text across source lines; the screen renders it as one run.
    .replace(/\s+/g, ' ');

  it.each(SHARED_FACTS.map((f) => [f]))('states « %s » as the app does', (fact) => {
    expect(appScreen).toContain(fact);
    expect(text).toContain(fact);
  });
});

describe('the home page', () => {
  const html = renderToStaticMarkup(<HomePage />);

  it('links to every document and to the deletion page', () => {
    for (const d of LEGAL_DOCUMENTS) {
      expect(html, d.slug).toContain(`href="/${d.slug}"`);
    }
    expect(html).toContain('href="/suppression-compte"');
  });

  it('gives the support address', () => {
    expect(html).toContain('href="mailto:support@revime.fr"');
  });
});

describe('what the site does not serve', () => {
  /*
   * 24/11/2026: the site is becoming REVIME's web application (plan d'action SEO et site). It now
   * serves robots.txt and sitemap.xml and proxies /api/* to the API (next.config.ts), and will gain
   * the public SEO pages and the signed-in area phase by phase. Each new top-level route is added
   * to this list on purpose, so nothing appears by accident. The admin stays a separate app.
   */
  it('has only the routes added on purpose, and never the admin', () => {
    const entries = readdirSync(join(__dirname, '../app')).sort();
    expect(entries).toEqual(
      [
        '[slug]',
        'globals.css',
        'layout.tsx',
        'not-found.tsx',
        'page.tsx',
        'robots.ts',
        'sitemap.ts',
        'suppression-compte',
      ].sort(),
    );
    expect(entries).not.toContain('admin');
  });
});
