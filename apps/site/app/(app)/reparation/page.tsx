import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '../../../lib/seo';
import { CategoryIcon, FEATURED_CATEGORIES } from '../../../components/app/categories';
import { CtaBand, Crumbs, InfoHero } from '../../../components/app/info';

export const metadata: Metadata = buildMetadata({
  title: 'Tout ce qu’on répare',
  description: 'Téléphone, ordinateur, électroménager, vélo, vêtements, chaussures, meubles : trouvez un réparateur vérifié près de chez vous pour chaque objet.',
  path: '/reparation',
});

/** The app's eight families (same wording as the publish form), with what each covers. */
const FAMILIES = [
  { label: 'Électronique', text: 'Téléphones, ordinateurs, tablettes, consoles, télévisions, photo et vidéo', q: 'électronique' },
  { label: 'Maison & jardin', text: 'Électroménager, petit électroménager, meubles, outillage, jardin', q: 'électroménager' },
  { label: 'Mode & accessoires', text: 'Vêtements, chaussures, maroquinerie, montres et bijoux', q: 'vêtements' },
  { label: 'Mobilité', text: 'Vélos, trottinettes électriques, motos', q: 'vélo' },
  { label: 'Famille', text: 'Poussettes, mobilier enfant, jouets', q: 'poussette' },
  { label: 'Loisirs', text: 'Instruments de musique, sport, loisirs créatifs', q: 'instrument' },
  { label: 'Véhicules', text: 'Voitures, deux-roues', q: 'voiture' },
  { label: 'Autres', text: 'Tout ce qui ne rentre pas ailleurs : décrivez-le, les réparateurs vous diront', q: '' },
];

export default function ReparationHub() {
  return (
    <div className="ap-info">
      <Crumbs here="Tout ce qu’on répare" />
      <InfoHero
        eyebrow="TOUT CE QU’ON RÉPARE"
        title="Si ça se répare, quelqu’un près de chez vous sait le faire"
        lede="Choisissez votre objet pour trouver un réparateur, ou publiez une demande pour recevoir des offres."
      />
      <section className="ap-section" aria-labelledby="h-pop">
        <h2 id="h-pop">Les plus demandés</h2>
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
      <section className="ap-section" aria-labelledby="h-fam">
        <h2 id="h-fam">Toutes les familles d’objets</h2>
        <div className="ap-igrid ap-igrid--2">
          {FAMILIES.map((f) => (
            <div key={f.label} className="ap-icard ap-family">
              <h3>{f.label}</h3>
              <p>{f.text}</p>
              <div className="ap-irow">
                <Link href={f.q ? `/reparateurs?q=${encodeURIComponent(f.q)}` : '/reparateurs'} className="ap-more">
                  Trouver un réparateur
                </Link>
                <Link href="/publier" className="ap-more">
                  Publier une demande
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
      <CtaBand title="Vous ne trouvez pas votre objet ?" text="Choisissez « Autres » : les réparateurs vous diront s’ils peuvent le faire." cta="Publier une demande" href="/publier" />
    </div>
  );
}
