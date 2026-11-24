import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '../../lib/documents';
import { buildMetadata } from '../../lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Supprimer votre compte',
  description: 'Comment supprimer votre compte Revime, avec ou sans l’application, et ce qu’il advient de vos données.',
  path: '/suppression-compte',
});

/**
 * Google Play's account-deletion requirement: a public page, naming the app and the developer,
 * where a user can ask for deletion without the app (REVIME_APP_PUBLICATION_PREPARATION.md PUB-29).
 *
 * 🛑 The « supprimé » and « conservé » lists repeat the app's own deletion screen
 * (`apps/mobile/app/parametres/supprimer.tsx`) word for word; `test/site.spec.tsx` fails when the
 * two drift. Change both together, never one.
 */
export default function AccountDeletionPage() {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Suppression de compte')}`;
  return (
    <article className="doc doc--plain">
      <header className="doc__head">
        <h1 className="doc__title">Supprimer votre compte Revime</h1>
        <p className="doc__lede">
          Revime est édité par Malek KLIMANE, entrepreneur individuel, nom commercial REVIME. Cette page
          explique comment supprimer votre compte et ce qu’il advient de vos données.
        </p>
      </header>

      <section className="doc__section">
        <h2 className="doc__heading">Depuis l’application</h2>
        <ol>
          <li>Ouvrez Revime et connectez-vous à votre compte.</li>
          <li>Allez dans Paramètres, puis touchez «&nbsp;Supprimer mon compte&nbsp;».</li>
          <li>Confirmez votre identité comme l’application vous le demande.</li>
          <li>Tapez «&nbsp;SUPPRIMER&nbsp;», puis touchez «&nbsp;Supprimer définitivement mon compte&nbsp;».</li>
        </ol>
        <p>Cette action est irréversible.</p>
      </section>

      <section className="doc__section">
        <h2 className="doc__heading">Sans l’application</h2>
        <p>
          Écrivez à <a href={mailto}>{SUPPORT_EMAIL}</a> depuis l’adresse e-mail de votre compte, avec
          pour objet «&nbsp;Suppression de compte&nbsp;». Nous vérifions que la demande vient du titulaire du
          compte, puis nous supprimons le compte et vous le confirmons par e-mail.
        </p>
      </section>

      <section className="doc__section">
        <h2 className="doc__heading">Ce qui est supprimé</h2>
        <ul>
          <li>Votre compte sera fermé et vous ne pourrez plus vous connecter.</li>
          <li>
            Vos données d’identification seront effacées de votre profil&nbsp;: nom, prénom, pseudo, adresse
            e-mail, numéro de téléphone, photo de profil, bannière, code postal et coordonnées
            géographiques.
          </li>
        </ul>
      </section>

      <section className="doc__section">
        <h2 className="doc__heading">Ce qui est conservé</h2>
        <ul>
          <li>Vos demandes de réparation et leurs photos.</li>
          <li>Vos conversations et les messages échangés.</li>
          <li>
            Les réparations terminées et les avis restent visibles, mais votre identité apparaît comme
            «&nbsp;Utilisateur supprimé&nbsp;». Ces données appartiennent également à la contrepartie et
            constituent leur historique et leur réputation.
          </li>
          <li>Le code postal d’une demande passée et l’adresse de livraison d’une commande passée.</li>
          <li>
            Les données de vérification d’entreprise pour les professionnels vérifiés (SIREN, SIRET,
            dénomination sociale, adresse de l’établissement, dirigeants).
          </li>
          <li>
            L’enregistrement de votre vérification d’identité. Nous demandons à Stripe de supprimer votre
            pièce d’identité et la photo de votre visage, ce qui peut prendre jusqu’à quatre jours. Stripe
            peut conserver une copie&nbsp;: pour en demander la suppression complète, contactez le support
            Stripe sur support.stripe.com.
          </li>
          <li>
            Si vous avez configuré vos virements, votre compte Stripe Connect n’est pas supprimé. Pour en
            demander la suppression, contactez le support Stripe sur support.stripe.com.
          </li>
        </ul>
        <p>
          Les durées de conservation sont détaillées dans la{' '}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>
    </article>
  );
}
