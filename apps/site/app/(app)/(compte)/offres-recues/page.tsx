'use client';

import Link from 'next/link';
import { delayLabel, type ReceivedOfferListItem } from '@revime/shared';
import { useRequireSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { IconChevronRight } from '../../../../components/app/icons';
import { Loader, PageTitle, ago, euroFmt, initials } from '../../../../components/app/ui';

/** The app's « Mes offres reçues »: every offer on every demande, each opening its comparison. */
export default function OffresRecuesPage() {
  const me = useRequireSession();
  const offers = useApi<ReceivedOfferListItem[]>(me ? '/offers/received' : null);
  if (!me) return <Loader />;
  return (
    <div className="ap-page">
      <PageTitle title="Mes offres reçues" sub="Les offres des réparateurs sur vos demandes" />
      {offers.loading && <Loader />}
      {offers.error && <p className="ap-error">{offers.error}</p>}
      {offers.data && offers.data.length === 0 && (
        <div className="ap-empty">
          <strong>Aucune offre pour l’instant</strong>
          <span>Les réparateurs de votre zone répondent en général dans la journée.</span>
        </div>
      )}
      {offers.data && offers.data.length > 0 && (
        <>
          <div className="ap-stack">
            {offers.data.map((o) => (
              <Link key={o.id} href={`/mes-demandes/${o.demandeId}`} className="ap-offrow">
                <span className="ap-offrow__av" aria-hidden="true">
                  {initials(o.repairerName)}
                </span>
                <span className="ap-offrow__body">
                  <strong>{o.repairerName}</strong>
                  <span>
                    {o.demandeTitle} · {delayLabel(o.delayHours)} · {ago(o.createdAt)}
                  </span>
                </span>
                <span className="ap-offrow__price">{euroFmt(o.priceCents)}</span>
                <IconChevronRight size={18} className="ap-offrow__chev" />
              </Link>
            ))}
          </div>
          <p className="ap-hint">Cliquez sur une offre pour la comparer aux autres offres de la même demande.</p>
        </>
      )}
    </div>
  );
}
