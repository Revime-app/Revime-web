import Link from 'next/link';
import type { AdminPendingActions } from '@revime/shared';

export interface PendingActionsBlockProps {
  actions: AdminPendingActions;
}

interface ActionQueueConfig {
  key: keyof AdminPendingActions;
  title: string;
  href: string;
}

const ACTION_QUEUES: ActionQueueConfig[] = [
  {
    key: 'litiges',
    // Open AND under review, the count the sidebar badge shows: the page's two tabs add up to it.
    title: 'Litiges en cours',
    href: '/litiges',
  },
  {
    key: 'verifications',
    title: 'Vérifications en attente',
    href: '/verifications?needsAction=true',
  },
  {
    key: 'signalements',
    title: 'Signalements en attente',
    href: '/signalements',
  },
  {
    key: 'annulations',
    title: 'Annulations en attente',
    href: '/annulations',
  },
  {
    key: 'attention',
    title: 'Commandes à surveiller',
    href: '/attention',
  },
  {
    key: 'stalePayments',
    title: 'Paiements en attente (> 24 h)',
    // Counted from the « Commandes à surveiller » list, so that is where its orders are.
    href: '/attention',
  },
];

export function PendingActionsBlock({ actions }: PendingActionsBlockProps) {
  return (
    <section className="pending-actions" aria-labelledby="pending-actions-title">
      <h2 id="pending-actions-title" className="pending-actions__title title-section">
        À traiter
      </h2>
      <div className="pending-actions__grid">
        {ACTION_QUEUES.map((queue) => {
          const count = actions[queue.key];
          const isUrgent = count > 0;

          return (
            <Link
              key={queue.key}
              href={queue.href}
              className={`pending-card ${isUrgent ? 'pending-card--urgent' : ''}`}
              data-testid={`pending-card-${queue.key}`}
            >
              <div className="pending-card__header">
                <span className="pending-card__title">{queue.title}</span>
                <span
                  className={`pending-card__badge ${
                    isUrgent ? 'pending-card__badge--urgent' : 'pending-card__badge--neutral'
                  }`}
                  data-testid={`pending-badge-${queue.key}`}
                >
                  {isUrgent ? `${count} à traiter` : '0 à traiter'}
                </span>
              </div>
              <div className="pending-card__body">
                <span className="pending-card__count">{count}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
