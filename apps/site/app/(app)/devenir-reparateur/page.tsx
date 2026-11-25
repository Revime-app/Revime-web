import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '../../../lib/seo';
import { RecentDemandes } from '../HomeIslands';
import { CtaBand, Crumbs, InfoHero, Steps } from '../../../components/app/info';

export const metadata: Metadata = buildMetadata({
  title: 'Devenir réparateur',
  description: 'Artisan, atelier ou particulier bricoleur : recevez les demandes de réparation de votre quartier, envoyez votre prix, soyez payé à la validation.',
  path: '/devenir-reparateur',
});

export default function DevenirReparateur() {
  return (
    <div className="ap-info">
      <Crumbs here="Devenir réparateur" />
      <InfoHero
        tone="navy"
        eyebrow="DEVENIR RÉPARATEUR"
        title="Vous savez réparer ? Faites-vous trouver."
        lede="Recevez les demandes de votre quartier, envoyez votre prix, soyez payé à la validation du client."
      >
        <div className="ap-irow">
          <Link href="/inscription?role=reparateur" className="ap-btn ap-btn--primary ap-btn--pro">
            Créer mon compte réparateur
          </Link>
          <Link href="/demandes" className="ap-btn ap-btn--secondary">
            Voir les demandes
          </Link>
        </div>
        <p className="ap-hint">Gratuit. L’envoi d’offres et le suivi des revenus se font ensuite dans l’appli REVIME, avec le même compte.</p>
      </InfoHero>
      <RecentDemandes title="Des clients attendent un réparateur en ce moment" cta="Voir toutes les demandes" />
      <section className="ap-section">
        <h2>Trois étapes pour vos premiers clients</h2>
        <Steps
          tone="navy"
          items={[
            { title: 'Créez votre profil', text: 'Photo, spécialités, zone d’intervention, horaires. Vérifiez votre identité.' },
            { title: 'Répondez aux demandes', text: 'Les plus proches s’affichent en premier. Vous envoyez votre prix, votre délai et votre garantie.' },
            { title: 'Soyez payé', text: 'Le client paie avant la réparation. Vous êtes versé après sa validation, sur votre compte bancaire.' },
          ]}
        />
      </section>
      <section className="ap-section">
        <h2>Professionnel ou particulier : les deux sont les bienvenus</h2>
        <div className="ap-igrid ap-igrid--2">
          <div className="ap-icard ap-icard--navytop">
            <h3>Professionnel</h3>
            <ul>
              <li>Vérifiez votre SIREN ou SIRET</li>
              <li>Badge « Professionnel vérifié » sur votre fiche</li>
              <li>Pas de limite de missions</li>
            </ul>
          </div>
          <div className="ap-icard ap-icard--redtop">
            <h3>Particulier</h3>
            <ul>
              <li>Vérifiez votre identité</li>
              <li>Jusqu’à 10 missions ou 1 500 € sur 12 mois glissants</li>
              <li>Au-delà, un SIRET est demandé</li>
            </ul>
          </div>
        </div>
      </section>
      <CtaBand tone="navy" title="Prêt à recevoir vos premières demandes ?" text="Créez votre compte en 2 minutes, puis envoyez vos offres depuis l’appli REVIME." cta="Créer mon compte réparateur" href="/inscription?role=reparateur" />
    </div>
  );
}
