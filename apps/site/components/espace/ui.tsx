import Link from 'next/link';
import { IconArrowLeft } from './icons';
import { repairStatus, type DemandeListItem, type RepairTone } from '@revime/shared';

export function Loader({ full = false }: { full?: boolean }) {
  return (
    <div className={full ? 'esp-center esp-center--full' : 'esp-center'} role="status" aria-live="polite">
      <span className="esp-spinner" />
      <span className="esp-sr">Chargement…</span>
    </div>
  );
}

export function Eyebrow({ children, red = false }: { children: React.ReactNode; red?: boolean }) {
  return <p className={red ? 'esp-eyebrow esp-eyebrow--red' : 'esp-eyebrow'}>{children}</p>;
}

export function Badge({ tone, children }: { tone: RepairTone | 'info'; children: React.ReactNode }) {
  return <span className={`esp-badge esp-badge--${tone}`}>{children}</span>;
}

/** The client's status for one demande, from the shared rule the app uses. */
export function demandeStatus(d: Pick<DemandeListItem, 'status' | 'offerCount' | 'commande'>) {
  return repairStatus({ demandeStatus: d.status, offerCount: d.offerCount, commande: d.commande }, 'CLIENT');
}

export function ScreenTitle({ title, back, sub }: { title: string; back?: string; sub?: string }) {
  return (
    <div className="esp-screen-title">
      {back && (
        <Link href={back} className="esp-back" aria-label="Retour">
          <IconArrowLeft size={20} />
        </Link>
      )}
      <div>
        <h1>{title}</h1>
        {sub && <p className="esp-muted">{sub}</p>}
      </div>
    </div>
  );
}

export const euroFmt = (cents: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
