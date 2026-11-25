'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, use, useState } from 'react';
import { protectionCentsFor, VERIFIED_BADGE_LABEL, type DemandeDto, type OfferDto } from '@revime/shared';
import { useRequireSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { CategoryIcon, iconForLabel } from '../../../../components/app/categories';
import { IconClose, IconShieldCheck } from '../../../../components/app/icons';
import { Badge, Loader, MACRO_STEPS, Stars, demandeStatus, euroFmt, initials, macroStep } from '../../../../components/app/ui';

const PARTS: Record<string, string> = {
  UNKNOWN: 'Je ne sais pas',
  ORIGINAL: 'Pièce d’origine',
  COMPATIBLE: 'Pièce compatible',
  CLIENT_SUPPLIED: 'Je fournis la pièce',
};
const SORTS = [
  { key: 'prix', label: 'Prix', by: (a: OfferDto, b: OfferDto) => a.priceCents - b.priceCents },
  { key: 'delai', label: 'Délai', by: (a: OfferDto, b: OfferDto) => a.delayHours - b.delayHours },
  { key: 'note', label: 'Note', by: (a: OfferDto, b: OfferDto) => (b.rating ?? 0) - (a.rating ?? 0) },
] as const;

function delay(hours: number) {
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} jour${days > 1 ? 's' : ''}`;
}
const where = (o: OfferDto) => `${o.travel === 'HOME' ? 'Chez vous' : 'En atelier'}${o.acceptsParcel ? ' ou par colis' : ''}`;
const km = (o: OfferDto) => (o.distanceKm !== null ? `${o.distanceKm.toString().replace('.', ',')} km` : null);
/** « 6 mois » → 6, so the longest warranty can be marked; unknown wording counts as 0. */
const warrantyMonths = (label: string) => {
  const m = /(\d+)\s*(mois|an)/i.exec(label);
  return m ? Number(m[1]) * (m[2]!.toLowerCase().startsWith('an') ? 12 : 1) : 0;
};

/** Desktop: the offers side by side, the best value of each row marked. */
function CompareTable({ offers, chosen, onChoose }: { offers: OfferDto[]; chosen: string | null; onChoose: (o: OfferDto) => void }) {
  const best = {
    price: Math.min(...offers.map((o) => o.priceCents)),
    delay: Math.min(...offers.map((o) => o.delayHours)),
    warranty: Math.max(...offers.map((o) => warrantyMonths(o.warrantyLabel))),
    repairs: Math.max(...offers.map((o) => o.repairCount)),
  };
  const col = (o: OfferDto) => (o.id === chosen ? 'is-chosen' : undefined);
  const rows: { label: string; cell: (o: OfferDto) => React.ReactNode; best?: (o: OfferDto) => boolean; big?: boolean }[] = [
    { label: 'Prix', cell: (o) => euroFmt(o.priceCents), best: (o) => o.priceCents === best.price, big: true },
    { label: 'Délai', cell: (o) => delay(o.delayHours), best: (o) => o.delayHours === best.delay },
    { label: 'Garantie', cell: (o) => o.warrantyLabel, best: (o) => best.warranty > 0 && warrantyMonths(o.warrantyLabel) === best.warranty },
    { label: 'Pièces', cell: (o) => o.partsLabel },
    { label: 'Où', cell: (o) => [where(o), km(o)].filter(Boolean).join(' · ') },
    { label: 'Réparations', cell: (o) => `${o.repairCount} sur REVIME`, best: (o) => o.repairCount === best.repairs && o.repairCount > 0 },
  ];
  return (
    <div className="ap-compare">
      <table>
        <caption className="ap-sr">Offres comparées</caption>
        <thead>
          <tr>
            <td />
            {offers.map((o) => (
              <th key={o.id} scope="col" className={col(o)}>
                <span className="ap-avatar ap-avatar--lg" aria-hidden="true">
                  {initials(o.repairerName)}
                </span>
                <Link href={`/reparateurs/${o.repairerUserId}`} className="ap-compare__name">
                  {o.repairerName}
                </Link>
                <Stars rating={o.rating} count={o.reviewCount} />
                {o.verifiedBadge && (
                  <span className="ap-verified">
                    <IconShieldCheck size={13} /> {VERIFIED_BADGE_LABEL[o.verifiedBadge]}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {offers.map((o) => (
                <td key={o.id} className={[col(o), r.best?.(o) ? 'is-best' : '', r.big ? 'is-big' : ''].filter(Boolean).join(' ') || undefined}>
                  {r.cell(o)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row">Message</th>
            {offers.map((o) => (
              <td key={o.id} className={col(o)}>
                <span className="ap-compare__comment">{o.comment ? `« ${o.comment} »` : '—'}</span>
              </td>
            ))}
          </tr>
          <tr>
            <td />
            {offers.map((o) => (
              <td key={o.id} className={col(o)}>
                <button className={o.id === chosen ? 'ap-btn ap-btn--dark ap-btn--block' : 'ap-btn ap-btn--outline ap-btn--block'} onClick={() => onChoose(o)} aria-pressed={o.id === chosen}>
                  {o.id === chosen ? 'Choisie' : 'Choisir'}
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Phone: one card per offer, tap to choose. */
function OfferCards({ offers, chosen, onChoose }: { offers: OfferDto[]; chosen: string | null; onChoose: (o: OfferDto) => void }) {
  const cheapest = Math.min(...offers.map((o) => o.priceCents));
  return (
    <div className="ap-stack ap-offercards">
      {offers.map((o) => (
        <button key={o.id} className="ap-offer" aria-pressed={o.id === chosen} onClick={() => onChoose(o)}>
          <span className="ap-offer__head">
            <span className="ap-avatar ap-avatar--lg" aria-hidden="true">
              {initials(o.repairerName)}
            </span>
            <span className="ap-offer__who">
              <strong>{o.repairerName}</strong>
              <Stars rating={o.rating} count={o.reviewCount} />
              {o.verifiedBadge && (
                <span className="ap-verified">
                  <IconShieldCheck size={13} /> {VERIFIED_BADGE_LABEL[o.verifiedBadge]}
                </span>
              )}
            </span>
            <span className="ap-offer__price">
              {euroFmt(o.priceCents)}
              {o.priceCents === cheapest && offers.length > 1 && <em>Le moins cher</em>}
            </span>
          </span>
          <span className="ap-offer__facts">
            <span>
              <small>Délai</small>
              {delay(o.delayHours)}
            </span>
            <span>
              <small>Garantie</small>
              {o.warrantyLabel}
            </span>
            <span>
              <small>Pièces</small>
              {o.partsLabel}
            </span>
          </span>
          <span className="ap-offer__where">{[where(o), km(o)].filter(Boolean).join(' · ')}</span>
          {o.comment && <span className="ap-offer__comment">« {o.comment} »</span>}
        </button>
      ))}
    </div>
  );
}

function Detail({ id }: { id: string }) {
  const me = useRequireSession();
  const published = useSearchParams().get('publiee') === '1';
  const demande = useApi<DemandeDto>(me ? `/demandes/${id}` : null);
  const offers = useApi<OfferDto[]>(me ? `/demandes/${id}/offers` : null);
  const [sort, setSort] = useState<(typeof SORTS)[number]['key']>('prix');
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  if (!me || demande.loading) return <Loader />;
  if (!demande.data) {
    return (
      <div className="ap-page ap-narrow">
        <Link href="/mes-demandes" className="ap-crumb">
          ‹ Mes demandes
        </Link>
        <p className="ap-error">{demande.error ?? 'Demande introuvable.'}</p>
      </div>
    );
  }

  const d = demande.data;
  const status = demandeStatus(d);
  const step = macroStep(status.currentIndex);
  const live = [...(offers.data ?? []).filter((o) => o.status === 'SENT')].sort(SORTS.find((s) => s.key === sort)!.by);
  const chosen = live.find((o) => o.id === chosenId) ?? null;
  const fee = chosen ? protectionCentsFor(chosen.priceCents) : 0;

  return (
    <div className={chosen ? 'ap-page ap-detail has-bar' : 'ap-page ap-detail'}>
      <Link href="/mes-demandes" className="ap-crumb">
        ‹ Mes demandes
      </Link>
      {published && (
        <p className="ap-success" role="status">
          Demande publiée. Les réparateurs de votre zone sont prévenus : vous recevrez une notification à chaque offre.
        </p>
      )}

      <header className="ap-detail__head">
        <span className="ap-detail__media" aria-hidden="true">
          {d.photoUrls[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.photoUrls[0]} alt="" />
          ) : (
            <CategoryIcon path={iconForLabel(d.category.labelFr)} size={30} />
          )}
        </span>
        <div className="ap-detail__title">
          <h1>{d.title}</h1>
          <p>
            {d.category.labelFr} · {d.locationLabel}
          </p>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {step >= 0 && (
          <ol className="ap-ladder" aria-label="Avancement">
            {MACRO_STEPS.map((s, i) => (
              <li key={s} data-state={i < step ? 'done' : i === step ? 'now' : 'next'} aria-current={i === step ? 'step' : undefined}>
                {s}
              </li>
            ))}
          </ol>
        )}
      </header>

      <div className="ap-detail__grid">
        <section className="ap-detail__offers" aria-labelledby="h-offers">
          <div className="ap-section__head">
            <h2 id="h-offers">
              {live.length === 0 ? 'Offres' : live.length === 1 ? '1 offre reçue' : `${live.length} offres, côte à côte`}
            </h2>
            {live.length > 1 && (
              <div className="ap-seg ap-seg--sm" aria-label="Trier par">
                {SORTS.map((s) => (
                  <button key={s.key} aria-pressed={s.key === sort} onClick={() => setSort(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {offers.loading && <Loader />}
          {!offers.loading && live.length === 0 && (
            <div className="ap-empty">
              <strong>{d.status === 'OPEN' ? 'En attente d’offres' : 'Aucune offre en cours'}</strong>
              <span>
                {d.status === 'OPEN'
                  ? 'Les réparateurs proches de chez vous ont été prévenus. Comptez en général quelques heures pour les premières offres.'
                  : 'Le suivi de la réparation arrive sur le site. Il est déjà dans l’appli.'}
              </span>
            </div>
          )}
          {live.length > 0 && (
            <>
              <div className="ap-only-wide">
                <CompareTable offers={live} chosen={chosenId} onChoose={(o) => setChosenId(o.id)} />
                {live.length > 1 && <p className="ap-hint">En vert, le meilleur de chaque ligne.</p>}
              </div>
              <div className="ap-only-narrow">
                <OfferCards offers={live} chosen={chosenId} onChoose={(o) => setChosenId(o.id)} />
              </div>
            </>
          )}
        </section>

        <aside className="ap-stack ap-detail__aside">
          <section className="ap-box">
            <h2>Votre demande</h2>
            <p>{d.description}</p>
            <dl className="ap-facts">
              {(d.brand || d.model) && (
                <>
                  <dt>Objet</dt>
                  <dd>{[d.brand, d.model].filter(Boolean).join(' ')}</dd>
                </>
              )}
              <dt>Pièces</dt>
              <dd>{PARTS[d.parts] ?? '—'}</dd>
              <dt>Prix</dt>
              <dd>{d.mode === 'BUDGET' && d.budgetCents ? `Budget de ${euroFmt(d.budgetCents)}` : 'Je reçois des offres'}</dd>
            </dl>
          </section>
          <section className="ap-box ap-box--dark">
            <IconShieldCheck size={22} />
            <p>
              <strong>Protection REVIME.</strong> Vous payez maintenant, le réparateur est payé seulement quand vous
              validez la réparation.
            </p>
          </section>
        </aside>
      </div>

      {chosen && (
        <div className="ap-paybar">
          <div className="ap-paybar__in">
            <div>
              <p className="ap-paybar__label">Offre de {chosen.repairerName}</p>
              <p className="ap-paybar__total">
                {euroFmt(chosen.priceCents + fee)}
                <span>dont Protection REVIME {euroFmt(fee)}</span>
              </p>
            </div>
            <button className="ap-btn ap-btn--primary" onClick={() => setPaying(true)}>
              Payer
            </button>
          </div>
        </div>
      )}

      {paying && chosen && (
        <div className="ap-sheet" role="dialog" aria-modal="true" aria-labelledby="pay-title" onClick={() => setPaying(false)}>
          <div className="ap-sheet__panel" onClick={(e) => e.stopPropagation()}>
            <button className="ap-sheet__close" aria-label="Fermer" onClick={() => setPaying(false)}>
              <IconClose size={18} />
            </button>
            <h2 id="pay-title">Le paiement arrive sur le site</h2>
            <p className="ap-muted">
              Pour l’instant, il se fait dans l’appli REVIME : ouvrez cette demande, choisissez l’offre de{' '}
              {chosen.repairerName} et payez {euroFmt(chosen.priceCents + fee)}.
            </p>
            <button className="ap-btn ap-btn--secondary ap-btn--block" onClick={() => setPaying(false)}>
              Compris
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DemandeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Loader />}>
      <Detail id={id} />
    </Suspense>
  );
}
