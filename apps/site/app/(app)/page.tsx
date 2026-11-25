import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, organizationJsonLd, websiteJsonLd } from '../../lib/jsonld';
import { buildMetadata } from '../../lib/seo';
import { SITE_TAGLINE } from '../../lib/site';
import { CategoryIcon, FEATURED_CATEGORIES } from '../../components/app/categories';
import { IconArrowRight, IconCompare, IconShieldCheck, IconUserCheck } from '../../components/app/icons';
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

      <section className="ap-hero ap-hero--solo">
        <div className="ap-hero__text">
          <HomePersonal slot="greeting" />
          <h1>
            Une réparation ?<br />
            Comparez, puis choisissez.
          </h1>
          <p className="ap-hero__lede">
            REVIME vous met en relation avec des réparateurs vérifiés près de chez vous. Vous comparez leurs offres, et le
            réparateur est payé seulement quand c’est réparé.
          </p>
          <HomeHeroSearch />
        </div>
      </section>

      <HomePersonal slot="active" />

      <div className="ap-herorow">
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
        <section className="ap-howcard" aria-labelledby="h-how">
          <h2 id="h-how">Comment ça marche ?</h2>
          <ol>
            <li>
              <strong>Décrivez la panne</strong>
              <span>Gratuit, environ 2 minutes</span>
            </li>
            <li>
              <strong>Comparez les offres</strong>
              <span>Prix, délai, garantie, avis</span>
            </li>
            <li>
              <strong>Payez quand c’est réparé</strong>
              <span>Argent bloqué jusqu’à votre validation</span>
            </li>
          </ol>
          <Link href="/comment-ca-marche" className="ap-more">
            En savoir plus
          </Link>
        </section>
      </div>

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

      <ul className="ap-trustbar" aria-label="Nos engagements">
        <li>Gratuit et sans engagement</li>
        <li>Réparateurs vérifiés</li>
        <li>Payé après votre validation</li>
        <li>Aide de REVIME en cas de litige</li>
      </ul>

      <TopRepairers />

      <RecentDemandes />

      <section className="ap-section" aria-labelledby="h-why">
        <h2 id="h-why">Faire réparer, sans mauvaise surprise</h2>
        <ul className="ap-promises ap-promises--4">
          <li>
            <span className="ap-promises__icon">
              <IconCompare size={24} />
            </span>
            <strong>Vous comparez</strong>
            <span>Plusieurs offres côte à côte : prix, délai, garantie, avis.</span>
            <Link href="/comment-ca-marche" className="ap-more">Comment ça marche</Link>
          </li>
          <li>
            <span className="ap-promises__icon">
              <IconShieldCheck size={24} />
            </span>
            <strong>Votre argent est protégé</strong>
            <span>Bloqué jusqu’à votre validation. En cas de litige, REVIME étudie le dossier.</span>
            <Link href="/protection-revime" className="ap-more">Protection REVIME</Link>
          </li>
          <li>
            <span className="ap-promises__icon">
              <IconUserCheck size={24} />
            </span>
            <strong>Des réparateurs vérifiés</strong>
            <span>Identité contrôlée, entreprise vérifiée pour les pros, avis de vrais clients.</span>
            <Link href="/qui-sommes-nous" className="ap-more">Qui sommes-nous</Link>
          </li>
          <li>
            <span className="ap-promises__icon">
              <IconArrowRight size={24} />
            </span>
            <strong>Près de chez vous</strong>
            <span>Atelier, domicile ou colis : vous voyez la distance et le mode.</span>
            <Link href="/reparateurs" className="ap-more">Trouver un réparateur</Link>
          </li>
        </ul>
      </section>

      <section className="ap-proband" aria-labelledby="h-pro">
        <div>
          <p className="ap-eyebrow">Vous savez réparer ?</p>
          <h2 id="h-pro">Faites-vous trouver par les gens de votre quartier.</h2>
          <p>Artisan, atelier ou particulier bricoleur : recevez les demandes proches, envoyez votre prix, soyez payé à la validation.</p>
        </div>
        <Link href="/devenir-reparateur" className="ap-proband__cta">
          Devenir réparateur
        </Link>
      </section>
    </div>
  );
}
