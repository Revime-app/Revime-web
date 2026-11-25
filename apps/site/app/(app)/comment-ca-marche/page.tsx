import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '../../../lib/seo';
import { CtaBand, Crumbs, InfoHero, Steps } from '../../../components/app/info';

export const metadata: Metadata = buildMetadata({
  title: 'Comment ça marche',
  description: 'Décrivez la panne, recevez des offres de réparateurs près de chez vous, comparez, et payez seulement quand c’est réparé.',
  path: '/comment-ca-marche',
});

export default function CommentCaMarche() {
  return (
    <div className="ap-info">
      <Crumbs here="Comment ça marche" />
      <InfoHero
        eyebrow="COMMENT ÇA MARCHE"
        title="De l’objet cassé à l’objet réparé, en 5 étapes"
        lede="Vous décrivez, les réparateurs proposent, vous choisissez. À chaque étape, vous savez ce qui se passe et qui doit agir."
      >
        <Link href="/publier" className="ap-btn ap-btn--primary">
          Décrire ma panne
        </Link>
      </InfoHero>
      <Steps
        items={[
          { who: 'Vous', title: 'Vous décrivez la panne', text: 'Catégorie, titre, une photo, ce qui ne marche pas et votre code postal. Environ 2 minutes, gratuit et sans engagement. Votre nom et votre adresse restent cachés.' },
          { who: 'Les réparateurs', title: 'Les réparateurs proches répondent', text: 'Ils envoient leur offre : prix, délai, garantie, pièce utilisée, à l’atelier, à domicile ou par colis. Une offre reste valable 7 jours.' },
          { who: 'Vous', title: 'Vous comparez et choisissez', text: 'Toutes les offres côte à côte, avec les avis et les badges de vérification. Une question ? Écrivez au réparateur avant de choisir.' },
          { who: 'Vous', title: 'Vous payez sur REVIME', text: 'Le prix de l’offre et la Protection REVIME (2,90 € + 4,5 %), affichés avant de payer. Vous avez 2 heures pour payer après votre choix. L’argent reste bloqué.' },
          { who: 'Le réparateur, puis vous', title: 'Le réparateur répare, vous validez', text: 'Vous vérifiez l’objet et validez : le réparateur est payé. Un problème ? Signalez-le avant de valider, REVIME étudie le dossier.' },
        ]}
      />
      <section className="ap-section">
        <h2>Deux façons de demander</h2>
        <div className="ap-igrid ap-igrid--2">
          <div className="ap-icard ap-icard--on">
            <h3>Recevoir des offres</h3>
            <p>Votre demande est publique : tous les réparateurs proches peuvent proposer. Idéal pour comparer.</p>
          </div>
          <div className="ap-icard">
            <h3>Demander un devis à un réparateur</h3>
            <p>Depuis sa fiche, vous envoyez une demande privée : lui seul la voit et vous répond.</p>
          </div>
        </div>
      </section>
      <CtaBand title="Prêt à faire réparer ?" text="Publier une demande prend 2 minutes." cta="Décrire ma panne" href="/publier" />
    </div>
  );
}
