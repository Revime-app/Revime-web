import Link from 'next/link';
import type { DemandeListItem } from '@revime/shared';
import { Badge, demandeStatus } from './ui';
import { IconChevronRight } from './icons';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** One demande in a list: title, where, status badge, and the step it is at. */
export function DemandeCard({ demande, highlight = false }: { demande: DemandeListItem; highlight?: boolean }) {
  const status = demandeStatus(demande);
  const showOffers = demande.status === 'OPEN' && demande.offerCount > 0;
  return (
    <Link href={`/demande/${demande.id}`} className={highlight ? 'esp-dcard esp-dcard--hi' : 'esp-dcard'}>
      <span className="esp-dcard__body">
        <span className="esp-dcard__meta">
          {demande.categoryLabelFr} · {demande.locationLabel} · {dateFmt.format(new Date(demande.createdAt))}
        </span>
        <span className="esp-dcard__title">{demande.title}</span>
        <span className="esp-dcard__row">
          <Badge tone={status.tone}>{status.label}</Badge>
          {showOffers && <span className="esp-dcard__offers">À comparer</span>}
        </span>
        {status.currentIndex >= 0 && (
          <span className="esp-progress" aria-hidden="true">
            {status.stages.map((s, i) => (
              <span key={s} className={i <= status.currentIndex ? 'is-on' : undefined} />
            ))}
          </span>
        )}
      </span>
      <IconChevronRight size={18} className="esp-dcard__chev" />
    </Link>
  );
}
