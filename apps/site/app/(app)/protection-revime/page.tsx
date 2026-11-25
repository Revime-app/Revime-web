import type { Metadata } from 'next';
import Link from 'next/link';
import { protectionCentsFor } from '@revime/shared';
import { buildMetadata } from '../../../lib/seo';
import { CtaBand, Crumbs, InfoHero } from '../../../components/app/info';

export const metadata: Metadata = buildMetadata({
  title: 'Protection REVIME : paiement protégé et frais',
  description: 'Votre argent reste bloqué jusqu’à ce que vous validiez la réparation. Protection REVIME : 2,90 € + 4,5 % du prix, affichée avant de payer.',
  path: '/protection-revime',
});

const euro = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export default function ProtectionPage() {
  // Computed with the same function as the app and the API, so the examples cannot drift.
  const examples = [3000, 8900, 15000].map((c) => ({ price: c, fee: protectionCentsFor(c) }));
  return (
    <div className="ap-info">
      <Crumbs here="Protection REVIME" />
      <InfoHero
        tone="navy"
        eyebrow="PROTECTION REVIME"
        title="Votre argent reste bloqué jusqu’à ce que la réparation soit faite"
        lede="Vous payez sur REVIME au moment de choisir l’offre. Le réparateur est payé seulement quand vous avez validé."
      />
      <div className="ap-igrid ap-igrid--3">
        <div className="ap-icard">
          <h3>Prix connu avant de payer</h3>
          <p>Vous payez le prix de l’offre choisie, plus la Protection REVIME, affichée avant le paiement.</p>
        </div>
        <div className="ap-icard">
          <h3>Payé après validation</h3>
          <p>Sans action de votre part, les fonds sont versés à la date indiquée sur la commande.</p>
        </div>
        <div className="ap-icard">
          <h3>Un problème ? On s’en occupe</h3>
          <p>Signalez-le depuis la commande : l’argent reste bloqué pendant que REVIME étudie le dossier.</p>
        </div>
      </div>
      <section className="ap-section ap-igrid ap-igrid--2">
        <div>
          <h2>Combien ça coûte ?</h2>
          <p className="ap-ip">Publier une demande et recevoir des offres est gratuit. Quand vous payez une réparation, la Protection REVIME s’ajoute :</p>
          <p className="ap-ibig">2,90 € + 4,5 % du prix</p>
          <p className="ap-hint">TVA non applicable, article 293 B du CGI.</p>
        </div>
        <table className="ap-itable">
          <thead>
            <tr>
              <th>Prix de la réparation</th>
              <th>Protection</th>
              <th>Vous payez</th>
            </tr>
          </thead>
          <tbody>
            {examples.map((e) => (
              <tr key={e.price}>
                <td>{euro(e.price)}</td>
                <td>{euro(e.fee)}</td>
                <td>
                  <strong>{euro(e.price + e.fee)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="ap-section ap-narrowtext">
        <h2>En cas de litige</h2>
        <ol className="ap-iol">
          <li>Vous cliquez sur « Signaler un problème » dans le suivi de la réparation, avant de valider.</li>
          <li>L’argent reste bloqué. Vous, le réparateur et REVIME échangez dans une conversation dédiée.</li>
          <li>REVIME prend une décision et vous l’explique.</li>
          <li>Si vous n’êtes pas d’accord, vous pouvez saisir gratuitement le médiateur de la consommation (CM2C).</li>
        </ol>
        <p className="ap-hint">
          Le détail est dans le document <Link href="/protection">Protection REVIME</Link>.
        </p>
      </section>
      <CtaBand title="Faites réparer en toute tranquillité" text="Le réparateur n’est payé qu’une fois la réparation validée." cta="Décrire ma panne" href="/publier" />
    </div>
  );
}
