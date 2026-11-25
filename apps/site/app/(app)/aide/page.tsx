import type { Metadata } from 'next';
import { buildMetadata } from '../../../lib/seo';
import { SUPPORT_EMAIL } from '../../../lib/documents';
import { Crumbs, Faq, InfoHero } from '../../../components/app/info';

export const metadata: Metadata = buildMetadata({
  title: 'Aide et questions',
  description: 'Paiement, Protection REVIME, litige, compte, demandes et offres : les réponses aux questions fréquentes, et un contact si besoin.',
  path: '/aide',
});

const GROUPS = [
  {
    title: 'Paiement et frais',
    items: [
      { q: 'Publier une demande est-il payant ?', a: 'Non. Publier et recevoir des offres est gratuit. Vous payez seulement si vous choisissez une offre.' },
      { q: 'Combien coûte la Protection REVIME ?', a: '2,90 € + 4,5 % du prix de la réparation, affichée avant le paiement.' },
      { q: 'Quand le réparateur est-il payé ?', a: 'Après votre validation. Sans action de votre part, les fonds sont versés à la date indiquée sur la commande.' },
    ],
  },
  {
    title: 'Un problème avec une réparation',
    items: [
      { q: 'Comment signaler un problème ?', a: 'Depuis le suivi de la réparation, avec « Signaler un problème », avant de valider. L’argent reste bloqué pendant que REVIME étudie le dossier.' },
      { q: 'Et si je ne suis pas d’accord avec la décision ?', a: 'Vous pouvez saisir gratuitement le médiateur de la consommation (CM2C), après une réclamation auprès de REVIME.' },
    ],
  },
  {
    title: 'Demandes et offres',
    items: [
      { q: 'Combien de temps une offre reste-t-elle valable ?', a: '7 jours. Après votre choix, vous avez 2 heures pour payer.' },
      { q: 'Mon adresse est-elle visible ?', a: 'Non. Votre nom et votre adresse restent cachés jusqu’à ce que vous choisissiez une offre.' },
    ],
  },
];

export default function AidePage() {
  return (
    <div className="ap-info">
      <Crumbs here="Aide et questions" />
      <InfoHero tone="navy" eyebrow="AIDE" title="Comment pouvons-nous vous aider ?" lede="Les réponses aux questions les plus fréquentes. Vous ne trouvez pas ? Écrivez-nous." />
      {GROUPS.map((g) => (
        <section key={g.title} className="ap-section ap-narrowtext">
          <h2>{g.title}</h2>
          <Faq items={g.items} />
        </section>
      ))}
      <section className="ap-section ap-iband">
        <h2>Vous n’avez pas trouvé ?</h2>
        <p>Écrivez-nous, nous répondons à chaque message.</p>
        <a className="ap-btn ap-btn--primary ap-btn--pro" href={`mailto:${SUPPORT_EMAIL}`}>
          Écrire à {SUPPORT_EMAIL}
        </a>
      </section>
    </div>
  );
}
