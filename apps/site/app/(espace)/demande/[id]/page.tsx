'use client';

import { use, useState } from 'react';
import type { DemandeDto, OfferDto } from '@revime/shared';
import { VERIFIED_BADGE_LABEL } from '@revime/shared';
import { useApi } from '../../../../lib/client/use-api';
import { Badge, Eyebrow, Loader, ScreenTitle, demandeStatus, euroFmt } from '../../../../components/espace/ui';
import { IconShieldCheck, IconStar } from '../../../../components/espace/icons';

const SORTS = [
  { key: 'prix', label: 'Prix', by: (a: OfferDto, b: OfferDto) => a.priceCents - b.priceCents },
  { key: 'delai', label: 'Délai', by: (a: OfferDto, b: OfferDto) => a.delayHours - b.delayHours },
  { key: 'note', label: 'Note', by: (a: OfferDto, b: OfferDto) => (b.rating ?? 0) - (a.rating ?? 0) },
] as const;

const PARTS: Record<string, string> = {
  UNKNOWN: 'Je ne sais pas',
  ORIGINAL: "Pièce d'origine",
  COMPATIBLE: 'Pièce compatible',
  CLIENT_SUPPLIED: 'Je fournis la pièce',
};

function delay(hours: number) {
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} jour${days > 1 ? 's' : ''}`;
}

export default function DemandePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const demande = useApi<DemandeDto>(`/demandes/${id}`);
  const offers = useApi<OfferDto[]>(`/demandes/${id}/offers`);
  const [sort, setSort] = useState<(typeof SORTS)[number]['key']>('prix');
  const [chosen, setChosen] = useState<OfferDto | null>(null);

  if (demande.loading) return <Loader />;
  if (demande.error || !demande.data) {
    return (
      <div className="esp-page">
        <ScreenTitle title="Demande" back="/mes-demandes" />
        <p className="esp-error">{demande.error ?? 'Demande introuvable.'}</p>
      </div>
    );
  }

  const d = demande.data;
  const status = demandeStatus(d);
  const live = (offers.data ?? []).filter((o) => o.status === 'SENT');
  const sorted = [...live].sort(SORTS.find((s) => s.key === sort)!.by);
  const cheapest = live.length ? Math.min(...live.map((o) => o.priceCents)) : null;

  return (
    <div className="esp-page esp-detail">
      <ScreenTitle title={d.title} back="/mes-demandes" sub={`${d.category.labelFr} · ${d.locationLabel}`} />

      <div className="esp-detail__grid">
        <section className="esp-card esp-detail__summary">
          <div className="esp-dcard__row">
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {status.currentIndex >= 0 && (
            <ol className="esp-steps">
              {status.stages.map((s, i) => (
                <li key={s} className={i < status.currentIndex ? 'is-done' : i === status.currentIndex ? 'is-now' : ''}>
                  {s}
                </li>
              ))}
            </ol>
          )}
          <dl className="esp-facts">
            {(d.brand || d.model) && (
              <>
                <dt>Objet</dt>
                <dd>{[d.brand, d.model].filter(Boolean).join(' ')}</dd>
              </>
            )}
            <dt>Problème</dt>
            <dd>{d.description}</dd>
            <dt>Pièces</dt>
            <dd>{PARTS[d.parts] ?? '—'}</dd>
            <dt>Mode</dt>
            <dd>{d.mode === 'BUDGET' && d.budgetCents ? `Budget de ${euroFmt(d.budgetCents)}` : 'Je reçois des offres'}</dd>
          </dl>
        </section>

        <section className="esp-detail__offers">
          <div className="esp-section__head">
            <Eyebrow>
              {live.length > 0 ? `${live.length} OFFRE${live.length > 1 ? 'S' : ''} REÇUE${live.length > 1 ? 'S' : ''}` : 'OFFRES'}
            </Eyebrow>
            {live.length > 1 && (
              <div className="esp-chips esp-chips--sm" aria-label="Trier par">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    className={s.key === sort ? 'esp-chip is-on' : 'esp-chip'}
                    onClick={() => setSort(s.key)}
                    aria-pressed={s.key === sort}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {offers.loading && <Loader />}
          {!offers.loading && live.length === 0 && d.status === 'OPEN' && (
            <div className="esp-card">
              <p className="esp-card__title">En attente d’offres</p>
              <p className="esp-muted">
                Les réparateurs proches de chez vous ont été prévenus. Vous recevrez une notification à chaque offre.
              </p>
            </div>
          )}

          <div className="esp-stack">
            {sorted.map((o) => (
              <article key={o.id} className={chosen?.id === o.id ? 'esp-offer is-chosen' : 'esp-offer'}>
                <header className="esp-offer__head">
                  <span className="esp-avatar esp-avatar--lg" aria-hidden="true">
                    {o.repairerName.slice(0, 1)}
                  </span>
                  <span className="esp-offer__who">
                    <strong>{o.repairerName}</strong>
                    <span className="esp-offer__rating">
                      {o.rating !== null ? (
                        <>
                          <IconStar size={13} className="esp-star" /> {o.rating.toFixed(1).replace('.', ',')} ({o.reviewCount}{' '}
                          avis)
                        </>
                      ) : (
                        'Nouveau sur REVIME'
                      )}
                      {o.repairCount > 0 && ` · ${o.repairCount} réparations`}
                    </span>
                    {o.verifiedBadge && (
                      <span className="esp-verified">
                        <IconShieldCheck size={13} /> {VERIFIED_BADGE_LABEL[o.verifiedBadge]}
                      </span>
                    )}
                  </span>
                  <span className="esp-offer__price">
                    {euroFmt(o.priceCents)}
                    {o.priceCents === cheapest && live.length > 1 && <span className="esp-offer__tag">Le moins cher</span>}
                  </span>
                </header>
                <ul className="esp-offer__facts">
                  <li>
                    <span>Délai</span>
                    {delay(o.delayHours)}
                  </li>
                  <li>
                    <span>Garantie</span>
                    {o.warrantyLabel}
                  </li>
                  <li>
                    <span>Pièces</span>
                    {o.partsLabel}
                  </li>
                  <li>
                    <span>Où</span>
                    {o.travel === 'HOME' ? 'À domicile' : 'En atelier'}
                    {o.acceptsParcel ? ' ou par colis' : ''}
                    {o.distanceKm !== null ? ` · ${o.distanceKm.toString().replace('.', ',')} km` : ''}
                  </li>
                </ul>
                {o.comment && <p className="esp-offer__comment">« {o.comment} »</p>}
                <button className="esp-btn esp-btn--primary esp-btn--block" onClick={() => setChosen(o)}>
                  Choisir cette offre
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>

      {chosen && (
        <div className="esp-sheet" role="dialog" aria-modal="true" aria-labelledby="esp-sheet-title">
          <div className="esp-sheet__panel">
            <h2 id="esp-sheet-title">Offre de {chosen.repairerName}</h2>
            <p className="esp-muted">
              {euroFmt(chosen.priceCents)} · {delay(chosen.delayHours)} · garantie {chosen.warrantyLabel}
            </p>
            <div className="esp-card esp-card--soft">
              <p className="esp-card__title">
                <IconShieldCheck size={16} /> Protection REVIME
              </p>
              <p className="esp-muted">
                Votre paiement est bloqué jusqu’à ce que vous validiez la réparation. Le réparateur n’est payé qu’après.
              </p>
            </div>
            <p className="esp-muted esp-small">
              Le paiement par carte arrive sur le site dans la prochaine étape. Pour l’instant, il se fait dans l’appli
              REVIME.
            </p>
            <div className="esp-sheet__actions">
              <button className="esp-btn esp-btn--secondary" onClick={() => setChosen(null)}>
                Fermer
              </button>
              <button className="esp-btn esp-btn--primary" disabled>
                Payer {euroFmt(chosen.priceCents)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
