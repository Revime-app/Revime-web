import Link from 'next/link';
import { repairStatus, type DemandeListItem, type RepairTone } from '@revime/shared';
import { IconArrowLeft } from './icons';

export function Loader() {
  return (
    <div className="ap-skel" role="status" aria-live="polite">
      <span />
      <span />
      <span />
      <span className="ap-sr">Chargement…</span>
    </div>
  );
}

export function Badge({ tone, children }: { tone: RepairTone | 'info'; children: React.ReactNode }) {
  return <span className={`ap-badge ap-badge--${tone}`}>{children}</span>;
}

/** The client's status for one demande, from the shared rule the app uses. */
export function demandeStatus(d: Pick<DemandeListItem, 'status' | 'offerCount' | 'commande'>) {
  return repairStatus({ demandeStatus: d.status, offerCount: d.offerCount, commande: d.commande }, 'CLIENT');
}

/**
 * The app's eight client stages, grouped into the four a person thinks in. The full wording stays
 * on the badge; this is the ladder shown above it.
 */
export const MACRO_STEPS = ['Offres', 'Paiement', 'Réparation', 'Terminé'] as const;
export function macroStep(currentIndex: number): number {
  if (currentIndex < 0) return -1;
  if (currentIndex <= 1) return 0;
  if (currentIndex === 2) return 1;
  if (currentIndex <= 5) return 2;
  return 3;
}

export function PageTitle({ title, back, sub, children }: { title: string; back?: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="ap-title">
      {back && (
        <Link href={back} className="ap-back" aria-label="Retour">
          <IconArrowLeft size={20} />
        </Link>
      )}
      <div className="ap-title__text">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export const euroFmt = (cents: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** « il y a 3 h », « hier », « il y a 4 j » - short, like the app's lists. */
export function ago(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return 'à l’instant';
  if (h < 24) return `il y a ${Math.floor(h)} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} j`;
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Stars({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null || count === 0) return <span className="ap-stars ap-stars--new">Nouveau sur REVIME</span>;
  return (
    <span className="ap-stars">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#f79009"
          d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.8 6.6 19.6l1.1-6L3.2 9.4l6.1-.8L12 3Z"
        />
      </svg>
      <strong>{rating.toFixed(1).replace('.', ',')}</strong>
      <span>({count} avis)</span>
    </span>
  );
}
