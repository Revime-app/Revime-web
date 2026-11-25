import type { Metadata } from 'next';
import { buildMetadata } from '../../../lib/seo';
import { CtaBand, Crumbs, InfoHero } from '../../../components/app/info';

export const metadata: Metadata = buildMetadata({
  title: 'Qui sommes-nous',
  description: 'REVIME met en relation les personnes qui ont un objet cassé avec les réparateurs qui savent le remettre en état, près de chez elles.',
  path: '/qui-sommes-nous',
});

export default function QuiSommesNous() {
  return (
    <div className="ap-info">
      <Crumbs here="Qui sommes-nous" />
      <InfoHero
        eyebrow="QUI SOMMES-NOUS"
        title="Pour que réparer devienne plus simple que jeter"
        lede="REVIME est une plateforme française qui met en relation les personnes qui ont un objet cassé avec les réparateurs qui savent le remettre en état, près de chez elles. Téléphone, ordinateur, électroménager, vélo, vêtements, chaussures, meubles : si ça se répare, il y a quelqu’un près de chez vous qui sait le faire."
      />
      <section className="ap-section">
        <h2>Ce qui compte pour nous</h2>
        <div className="ap-igrid ap-igrid--3">
          <div className="ap-icard">
            <h3>Réparer d’abord</h3>
            <p>Un objet réparé, c’est de l’argent économisé et un déchet en moins.</p>
          </div>
          <div className="ap-icard">
            <h3>Le quartier</h3>
            <p>Nous faisons travailler les artisans et les bricoleurs de chez vous.</p>
          </div>
          <div className="ap-icard">
            <h3>La transparence</h3>
            <p>Prix, frais, avis et règles de classement sont visibles. Rien n’est acheté.</p>
          </div>
        </div>
      </section>
      <section className="ap-section ap-iband">
        <h2>Comment nous choisissons les réparateurs</h2>
        <p>
          Chaque réparateur fait vérifier son identité. Les professionnels peuvent faire vérifier leur entreprise. Les avis ne
          viennent que de clients qui ont payé une réparation sur REVIME, et restent publiés 3 ans.
        </p>
      </section>
      <CtaBand title="Une question pour l’équipe ?" text="Écrivez-nous, nous répondons à chaque message." cta="Nous contacter" href="/aide" />
    </div>
  );
}
