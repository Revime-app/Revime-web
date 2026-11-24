import type { Metadata } from 'next';
import Link from 'next/link';
import { PUBLIC_DOCUMENTS, SUPPORT_EMAIL } from '../../lib/documents';
import { JsonLd, organizationJsonLd, websiteJsonLd } from '../../lib/jsonld';
import { buildMetadata } from '../../lib/seo';
import { SITE_TAGLINE } from '../../lib/site';

export const metadata: Metadata = buildMetadata({
  title: 'REVIME – Réparation de tous vos objets',
  description: SITE_TAGLINE,
  path: '/',
  absoluteTitle: true,
});

/**
 * revime.fr's home: what Revime is, every public document, account deletion and the support
 * address. It states nothing the product does not do today (no store badges until the apps are
 * published, no figures).
 */
export default function HomePage() {
  return (
    <div className="home">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      <section className="home__intro">
        <h1 className="home__title">Revime</h1>
        <p className="home__lede">
          Revime met en relation des particuliers et des professionnels pour la réparation de leurs
          objets.
        </p>
      </section>

      <section className="home__index" aria-labelledby="documents">
        <h2 id="documents" className="home__heading">
          Documents
        </h2>
        <ul className="index">
          {PUBLIC_DOCUMENTS.map((d) => (
            <li key={d.slug}>
              <Link href={`/${d.slug}`}>{d.label}</Link>
            </li>
          ))}
          <li>
            <Link href="/suppression-compte">Supprimer votre compte</Link>
          </li>
        </ul>
      </section>

      <section className="home__contact">
        <h2 className="home__heading">Contact</h2>
        <p>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </section>
    </div>
  );
}
