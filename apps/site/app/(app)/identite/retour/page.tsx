'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { IdentityStatusResponse } from '@revime/shared';
import { identityRefusalReasonFr } from '@revime/shared';
import { api } from '../../../../lib/client/api';
import { useRequireSession, useSession } from '../../../../lib/client/session';
import { useIdentityStart } from '../../../../lib/client/journey';
import { Loader, PageTitle } from '../../../../components/app/ui';
import { SuccessMark } from '../../../../components/app/SuccessMark';

/**
 * Back from Stripe Identity (the app's identite/retour.tsx). Returning only means the flow was left;
 * the webhook grants. So this page reads /identity/status a few times while Stripe answers.
 */
export default function IdentiteRetourPage() {
  const me = useRequireSession();
  const { refresh } = useSession();
  const retry = useIdentityStart();
  const [s, setS] = useState<IdentityStatusResponse | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!me) return;
    let live = true;
    api
      .get<IdentityStatusResponse>('/identity/status')
      .then((r) => {
        if (!live) return;
        setS(r);
        if (r.status === 'VERIFIED') void refresh();
      })
      .catch(() => undefined);
    const t = tries < 12 && s?.status !== 'VERIFIED' ? setTimeout(() => setTries((n) => n + 1), 5000) : null;
    return () => {
      live = false;
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, tries]);

  if (!me) return <Loader />;
  const status = s?.status ?? null;

  return (
    <div className="ap-page ap-narrow ap-idret" data-mode="pro">
      <PageTitle title="Vérification d'identité" back="/statut-verification" />
      {status === 'VERIFIED' ? (
        <div className="ap-box ap-idret__box">
          <SuccessMark />
          <h2>Félicitations !</h2>
          <p>Identité vérifiée. Profil activé : vous pouvez envoyer des offres.</p>
          <Link className="ap-btn ap-btn--primary ap-btn--block" href="/statut-verification">
            Continuer la configuration
          </Link>
        </div>
      ) : status === 'REQUIRES_INPUT' || status === 'CANCELED' ? (
        <div className="ap-box ap-idret__box">
          <h2>{s?.decision === 'DOCUMENTS_REQUESTED' ? 'Nouveaux documents demandés' : 'Vérification échouée'}</h2>
          <p>{identityRefusalReasonFr(s?.lastErrorCode)}</p>
          {retry.error && <p className="ap-field__error">{retry.error}</p>}
          <button type="button" className="ap-btn ap-btn--primary ap-btn--block" onClick={() => void retry.start()} disabled={retry.loading}>
            {retry.loading ? 'Ouverture de Stripe…' : 'Réessayer'}
          </button>
          <Link className="ap-btn ap-btn--secondary ap-btn--block" href="/profil">
            Retour au profil
          </Link>
        </div>
      ) : (
        <div className="ap-box ap-idret__box">
          <h2>Documents envoyés</h2>
          <p>Stripe vérifie votre pièce d&apos;identité. Cela prend en général quelques minutes. Cette page se met à jour toute seule.</p>
          <Loader />
          <Link className="ap-btn ap-btn--secondary ap-btn--block" href="/profil">
            Retour au profil
          </Link>
        </div>
      )}
    </div>
  );
}
