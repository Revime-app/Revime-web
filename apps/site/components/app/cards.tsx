import Link from 'next/link';
import { VERIFIED_BADGE_LABEL, type DemandeListItem, type DirectoryCardDto, type PublicDemandeView } from '@revime/shared';
import { CategoryIcon, iconForLabel } from './categories';
import { IconChevronRight, IconPin, IconShieldCheck } from './icons';
import { Badge, MACRO_STEPS, Stars, ago, demandeStatus, euroFmt, initials, macroStep } from './ui';

/** One public demande, as anyone browsing sees it: what is broken, where, and when. */
export function DemandeTile({ d, onOpen }: { d: PublicDemandeView; onOpen?: () => void }) {
  const body = (
    <>
      <span className="ap-tile__media">
        {d.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.photos[0]} alt="" loading="lazy" />
        ) : (
          <span className="ap-tile__icon">
            <CategoryIcon path={iconForLabel(d.category.labelFr)} size={30} />
          </span>
        )}
        {d.budgetCents !== null && <span className="ap-tile__budget">Budget {euroFmt(d.budgetCents)}</span>}
      </span>
      <span className="ap-tile__body">
        <span className="ap-tile__cat">{d.category.labelFr}</span>
        <span className="ap-tile__title">{d.title}</span>
        <span className="ap-tile__meta">
          <IconPin size={14} /> {d.locationLabel}
          <span aria-hidden="true">·</span>
          {ago(d.createdAt)}
        </span>
      </span>
    </>
  );
  return onOpen ? (
    <button type="button" className="ap-tile" onClick={onOpen}>
      {body}
    </button>
  ) : (
    <Link href="/demandes" className="ap-tile">
      {body}
    </Link>
  );
}

/** One réparateur in a list: his face first, then how trusted he is and where he works. */
export function RepairerCard({ r }: { r: DirectoryCardDto }) {
  return (
    <Link href={`/reparateurs/${r.userId}`} className="ap-rcard">
      <span className="ap-rcard__cover" aria-hidden="true">
        {r.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.avatarUrl} alt="" loading="lazy" />
        ) : (
          <span className="ap-rcard__initials">{initials(r.displayName)}</span>
        )}
        {r.distanceKm !== null && <span className="ap-tile__budget">{r.distanceKm.toString().replace('.', ',')} km</span>}
      </span>
      <span className="ap-rcard__body">
        <span className="ap-rcard__name">{r.displayName}</span>
        <Stars rating={r.rating} count={r.reviewCount} />
        {r.verifiedBadge && (
          <span className="ap-verified">
            <IconShieldCheck size={14} /> {VERIFIED_BADGE_LABEL[r.verifiedBadge]}
          </span>
        )}
        <span className="ap-rcard__area">
          <IconPin size={14} /> {r.serviceAreaLabel ?? 'Zone non précisée'}
        </span>
      </span>
    </Link>
  );
}

/** One of the client's own demandes: status, the step it is at, and whether offers wait. */
export function MyDemandeRow({ d, highlight = false }: { d: DemandeListItem; highlight?: boolean }) {
  const status = demandeStatus(d);
  const step = macroStep(status.currentIndex);
  const waiting = d.status === 'OPEN' && d.offerCount > 0;
  return (
    <Link href={`/mes-demandes/${d.id}`} className={highlight ? 'ap-mine ap-mine--hi' : 'ap-mine'}>
      <span className="ap-mine__media" aria-hidden="true">
        {d.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.photoUrl} alt="" />
        ) : (
          <CategoryIcon path={iconForLabel(d.categoryLabelFr)} size={24} />
        )}
      </span>
      <span className="ap-mine__body">
        <span className="ap-mine__title">{d.title}</span>
        <span className="ap-mine__meta">
          {d.categoryLabelFr} · {d.locationLabel}
        </span>
        <span className="ap-mine__row">
          <Badge tone={status.tone}>{status.label}</Badge>
          {waiting && <span className="ap-mine__cta">Comparer</span>}
        </span>
        {step >= 0 && (
          <span className="ap-steps" aria-label={`Étape ${step + 1} sur 4 : ${MACRO_STEPS[step]}`}>
            {MACRO_STEPS.map((s, i) => (
              <span key={s} className={i <= step ? 'is-on' : undefined} />
            ))}
          </span>
        )}
      </span>
      <IconChevronRight size={18} className="ap-mine__chev" />
    </Link>
  );
}
