import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, organizationJsonLd, websiteJsonLd } from '../../lib/jsonld';
import { buildMetadata } from '../../lib/seo';
import { SITE_TAGLINE } from '../../lib/site';
import { CategoryIcon, FEATURED_CATEGORIES } from '../../components/app/categories';
import { IconArrowRight, IconShieldCheck } from '../../components/app/icons';
import { HomeHeroSearch, HomePersonal, RecentDemandes, TopRepairers } from './HomeIslands';

export const metadata: Metadata = buildMetadata({
  title: 'REVIME – Réparation de tous vos objets',
  description: SITE_TAGLINE,
  path: '/',
  absoluteTitle: true,
});

/**
 * The home, for everyone. What does not depend on who is looking is rendered on the server, so
 * search engines read it; the parts that do (« Bonjour Léa », the demande in progress, the latest
 * demandes and réparateurs) fill in on the client.
 */
export default function HomePage() {
  return (
    <div className="ap-home">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />

      <section className="ap-hero">
        <div className="ap-hero__text">
          <HomePersonal slot="greeting" />
          <h1>
            Une réparation ?<br />
            Comparez, puis choisissez.
          </h1>
          <p className="ap-hero__lede">
            Décrivez la panne, recevez les offres de réparateurs vérifiés près de chez vous et payez seulement quand
            c’est réparé.
          </p>
          <HomeHeroSearch />
        </div>
        <Link href="/publier" className="ap-promo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ap-promo__art" src="/illustrations/banner1.webp" alt="" />
          <span className="ap-promo__content">
            <span className="ap-promo__title">
              Un objet cassé ?<br />
              On s’en occupe.
            </span>
            <span className="ap-promo__cta">
              Publier une demande <IconArrowRight size={14} strokeWidth={2.4} />
            </span>
          </span>
        </Link>
      </section>

      <HomePersonal slot="active" />

      <RecentDemandes />

      <TopRepairers />

      <section className="ap-section" aria-labelledby="h-cat">
        <div className="ap-section__head">
          <h2 id="h-cat">Catégories</h2>
          <Link href="/reparateurs" className="ap-more">
            Voir tout
          </Link>
        </div>
        <div className="ap-cats">
          {FEATURED_CATEGORIES.map((c) => (
            <Link key={c.slug} href={`/reparateurs?categorie=${c.slug}`} className="ap-cat">
              <span className="ap-cat__icon">
                <CategoryIcon path={c.icon} />
              </span>
              <span className="ap-cat__text">
                <strong>{c.label}</strong>
                <span>{c.examples}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="ap-section" aria-labelledby="h-how">
        <h2 id="h-how">Comment ça marche</h2>
        <ol className="ap-how">
          <li>
            <strong>Décrivez la panne</strong>
            <span>Une photo et quelques mots. C’est gratuit et sans engagement.</span>
          </li>
          <li>
            <strong>Comparez les offres</strong>
            <span>Prix, délai, garantie et avis : tout est côte à côte.</span>
          </li>
          <li>
            <strong>Payez quand c’est réparé</strong>
            <span>Votre paiement reste bloqué jusqu’à ce que vous validiez la réparation.</span>
          </li>
        </ol>
      </section>

      <div className="ap-trust">
        <IconShieldCheck size={24} className="ap-trust__icon" />
        <span>
          <strong>Réparateurs vérifiés</strong>
          <span>Identité et entreprise contrôlées. Ici, la réputation compte plus que le statut.</span>
        </span>
      </div>
    </div>
  );
}
