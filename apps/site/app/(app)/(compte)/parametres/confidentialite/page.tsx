'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { IdentityStatusResponse } from '@revime/shared';
import { api, errorMessage } from '../../../../../lib/client/api';
import { useRequireSession } from '../../../../../lib/client/session';
import { Loader, PageTitle } from '../../../../../components/app/ui';
import { SettingsRow, SettingsSection } from '../../../../../components/app/Settings';

/** The app's « Confidentialité » (parametres/confidentialite.tsx): the policy, then the identity-data erasure. */
export default function ConfidentialitePage() {
  const me = useRequireSession();
  const [facts, setFacts] = useState<IdentityStatusResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    api
      .get<IdentityStatusResponse>('/identity/status')
      .then(setFacts)
      .catch(() => setFacts(null));
  }, [me]);

  if (!me) return <Loader />;

  const requestedAt = facts?.erasureRequestedAt ?? null;
  const redaction = facts?.redactionStatus ?? null;
  const message =
    requestedAt !== null
      ? redaction === 'REDACTED'
        ? 'Votre demande a été enregistrée. La suppression de vos données chez Stripe est terminée.'
        : redaction !== null
          ? 'Votre demande a été enregistrée. La suppression chez Stripe est en cours.'
          : "Votre demande a été enregistrée. Nous n'avons pu supprimer aucun document chez Stripe : seul le support Stripe peut encore le faire."
      : done
        ? "Votre demande a été enregistrée. Nous ne détenons aucune vérification d'identité pour votre compte."
        : null;

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.del<IdentityStatusResponse>('/identity/verification');
      if (r) setFacts(r);
      setDone(true);
      setAsking(false);
    } catch (e) {
      setError(errorMessage(e) || "Votre demande n'a pas pu être envoyée. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-page ap-settings">
      <PageTitle title="Confidentialité" back="/parametres" />
      <SettingsSection title={null}>
        <SettingsRow label="Lire la politique de confidentialité" href="/confidentialite" />
      </SettingsSection>

      <SettingsSection title="Données d'identité">
        <div className="ap-set__text">
          <p>
            Nous ne conservons jamais votre pièce d&apos;identité : elle est traitée par Stripe. Nous demandons à Stripe de
            supprimer vos documents et la photo de votre visage. Cette opération peut prendre jusqu&apos;à quatre jours.
            Stripe peut toutefois conserver une copie de ces données : pour en demander la suppression complète, vous
            devez contacter le support Stripe sur support.stripe.com.
          </p>
          {message && <p className="ap-ok">{message}</p>}
          {error && <p className="ap-field__error">{error}</p>}
          {asking ? (
            <div className="ap-set__confirm">
              <p>
                Nous demanderons à Stripe de supprimer votre pièce d&apos;identité et la photo de votre visage. Votre compte
                et votre niveau de vérification ne changent pas.
              </p>
              <div>
                <button type="button" className="ap-btn ap-btn--secondary ap-btn--sm" onClick={() => setAsking(false)} disabled={busy}>
                  Annuler
                </button>
                <button type="button" className="ap-btn ap-btn--danger ap-btn--sm" onClick={() => void erase()} disabled={busy}>
                  {busy ? 'Envoi…' : 'Supprimer'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="ap-btn ap-btn--secondary ap-btn--block" onClick={() => setAsking(true)}>
              Supprimer mes données d&apos;identité
            </button>
          )}
        </div>
      </SettingsSection>
      <p className="ap-hint">
        Une question sur vos données ? <Link href="/parametres">Contactez le support</Link> depuis Paramètres.
      </p>
    </div>
  );
}
