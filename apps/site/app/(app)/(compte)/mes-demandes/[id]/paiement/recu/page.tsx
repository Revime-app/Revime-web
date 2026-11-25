'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, use, useEffect, useState } from 'react';
import type { CommandeDto } from '@revime/shared';
import { api } from '../../../../../../../lib/client/api';
import { DEMO } from '../../../../../../../lib/client/config';
import { useRequireSession } from '../../../../../../../lib/client/session';
import { IconShieldCheck } from '../../../../../../../components/app/icons';
import { Loader, euroFmt } from '../../../../../../../components/app/ui';

/**
 * After the card. Stripe confirms to the API by webhook, so the commande may still say
 * PENDING_PAYMENT for a few seconds: this page asks again every 2 s for one minute, like the app's
 * « acceptée » screen. A bank redirect that failed comes back with `redirect_status=failed`.
 */
const POLL_MS = 2000;
const CEILING_MS = 60_000;

function Received({ id }: { id: string }) {
  const me = useRequireSession();
  const params = useSearchParams();
  const commandeId = params.get('c');
  const failed = params.get('redirect_status') === 'failed';
  const [commande, setCommande] = useState<CommandeDto | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!me || !commandeId || failed || DEMO) return;
    let live = true;
    const started = Date.now();
    const tick = async () => {
      try {
        const c = await api.get<CommandeDto>(`/commandes/${commandeId}`);
        if (!live) return;
        setCommande(c);
        if (c.status !== 'PENDING_PAYMENT') return;
      } catch {
        /* the next tick retries */
      }
      if (!live) return;
      if (Date.now() - started > CEILING_MS) setExpired(true);
      else setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      live = false;
    };
  }, [me, commandeId, failed]);

  if (!me) return <Loader />;
  const back = `/mes-demandes/${id}`;

  if (failed || commande?.status === 'ABANDONED') {
    return (
      <div className="ap-page ap-narrow">
        <div className="ap-published ap-published--warn">
          <h1>Le paiement n’a pas abouti</h1>
          <p>Aucun montant n’a été prélevé. Vous pouvez réessayer avec la même offre ou une autre carte.</p>
          <Link href={back} className="ap-btn ap-btn--primary">Retour aux offres</Link>
        </div>
      </div>
    );
  }

  const paid = DEMO || (commande !== null && commande.status !== 'PENDING_PAYMENT');
  if (!paid) {
    return (
      <div className="ap-page ap-narrow">
        <div className="ap-published">
          <h1>Paiement en cours de confirmation</h1>
          <p>
            {expired
              ? 'La confirmation prend plus de temps que prévu. Votre paiement est bien enregistré s’il a été accepté : vous recevrez un e-mail, et la réparation apparaîtra dans « Mes réparations ».'
              : 'Nous finalisons votre commande. Cela prend en général quelques secondes et cette page se met à jour toute seule.'}
          </p>
          {expired ? <Link href="/mes-demandes" className="ap-btn ap-btn--secondary">Mes réparations</Link> : <Loader />}
        </div>
      </div>
    );
  }

  return (
    <div className="ap-page ap-narrow">
      <div className="ap-published">
        <h1>Paiement reçu</h1>
        <p>
          {commande ? `${euroFmt(commande.totalCents)} payés pour « ${commande.demandeTitle} ». ` : ''}
          Votre argent est bloqué par REVIME jusqu’à ce que vous validiez la réparation.
        </p>
        <h2>Et maintenant ?</h2>
        <ol className="ap-isteps--compact">
          <li>
            <strong>{commande?.repairerName ?? 'Le réparateur'} est prévenu</strong>
            <span>Il vous écrit pour convenir du rendez-vous, du dépôt ou de l’envoi.</span>
          </li>
          <li>
            <strong>La réparation</strong>
            <span>Vous suivez chaque étape dans « Mes réparations » et par e-mail.</span>
          </li>
          <li>
            <strong>Vous validez</strong>
            <span>Le réparateur est payé seulement à ce moment-là. Un souci ? REVIME intervient.</span>
          </li>
        </ol>
        <div className="ap-row-actions">
          <Link href={back} className="ap-btn ap-btn--primary">Suivre ma réparation</Link>
          <Link href="/messages" className="ap-btn ap-btn--secondary">Écrire au réparateur</Link>
        </div>
        <p className="ap-hint">
          <IconShieldCheck size={14} /> Protection REVIME active sur cette commande.
        </p>
      </div>
    </div>
  );
}

export default function PaiementRecuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Loader />}>
      <Received id={id} />
    </Suspense>
  );
}
