'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_ROLE_LABEL, isStaffRole } from '@revime/shared';
import { api, errorMessage } from '../../../../../lib/client/api';
import { useRequireSession, useSession } from '../../../../../lib/client/session';
import { useStepUp } from '../../../../../components/app/StepUp';
import { Loader, PageTitle } from '../../../../../components/app/ui';

/** The app's « Supprimer mon compte » (parametres/supprimer.tsx), same text, same « SUPPRIMER » check. */
export default function SupprimerPage() {
  const me = useRequireSession();
  const { signOut } = useSession();
  const withStepUp = useStepUp();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (!me) return <Loader />;

  const staff = isStaffRole(me.role);
  const can = confirmation === 'SUPPRIMER';

  async function remove() {
    if (!can || deleting) return;
    setError(null);
    setDeleting(true);
    try {
      const done = await withStepUp(() => api.del('/users/me'), 'DELETE');
      if (!done.ok) return;
      await signOut().catch(() => undefined);
      router.replace('/?compte=supprime');
    } catch (e) {
      setError(errorMessage(e) || "Votre compte n'a pas pu être supprimé. Veuillez réessayer.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="ap-page ap-settings">
      <PageTitle title="Supprimer mon compte" back="/parametres" />
      <div className="ap-box ap-delete">
        <h2>Que se passe-t-il lors de la suppression ?</h2>
        <ul>
          <li>Votre compte sera fermé et vous ne pourrez plus vous connecter.</li>
          <li>
            Vos données d&apos;identification seront effacées de votre profil : nom, prénom, pseudo, adresse e-mail, numéro de
            téléphone, photo de profil, bannière, code postal et coordonnées géographiques.
          </li>
          <li>
            Cependant, certaines données sont conservées :
            <ul>
              <li>Vos demandes de réparation et leurs photos.</li>
              <li>Vos conversations et les messages échangés.</li>
              <li>
                Les réparations terminées et les avis restent visibles, mais votre identité apparaît comme « Utilisateur
                supprimé ». Ces données appartiennent également à la contrepartie et constituent leur historique et leur
                réputation.
              </li>
              <li>Le code postal d&apos;une demande passée et l&apos;adresse de livraison d&apos;une commande passée.</li>
              <li>
                Les données de vérification d&apos;entreprise pour les professionnels vérifiés (SIREN, SIRET, dénomination
                sociale, adresse de l&apos;établissement, dirigeants).
              </li>
              <li>
                L&apos;enregistrement de votre vérification d&apos;identité. Nous demandons à Stripe de supprimer votre pièce
                d&apos;identité et la photo de votre visage, ce qui peut prendre jusqu&apos;à quatre jours. Stripe peut conserver
                une copie : pour en demander la suppression complète, contactez le support Stripe sur support.stripe.com.
              </li>
              <li>
                Si vous avez configuré vos virements, votre compte Stripe Connect n&apos;est pas supprimé. Pour en demander la
                suppression, contactez le support Stripe sur support.stripe.com.
              </li>
            </ul>
          </li>
        </ul>
        <p className="ap-muted">Consultez la politique de confidentialité dans les paramètres pour la liste complète.</p>
      </div>

      {staff && (
        <div className="ap-banner ap-banner--warn" role="alert">
          Vous êtes membre de l&apos;équipe REVIME ({me.role ? ADMIN_ROLE_LABEL[me.role as keyof typeof ADMIN_ROLE_LABEL] : ''}). Supprimer ce
          compte supprime aussi votre accès à l&apos;administration.
        </div>
      )}

      <form
        className="ap-form"
        onSubmit={(e) => {
          e.preventDefault();
          void remove();
        }}
      >
        <label className="ap-field">
          <span>Pour confirmer, tapez SUPPRIMER</span>
          <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="SUPPRIMER" autoCapitalize="characters" autoComplete="off" />
        </label>
        {error && <p className="ap-field__error">{error}</p>}
        <button className="ap-btn ap-btn--danger ap-btn--block" disabled={!can || deleting}>
          {deleting ? 'Suppression…' : 'Supprimer définitivement mon compte'}
        </button>
      </form>
    </div>
  );
}
