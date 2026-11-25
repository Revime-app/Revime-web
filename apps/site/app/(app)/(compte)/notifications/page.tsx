'use client';

import Link from 'next/link';
import { notificationCopy, type NotificationDto } from '@revime/shared';
import { api } from '../../../../lib/client/api';
import { useRequireSession } from '../../../../lib/client/session';
import { useApi } from '../../../../lib/client/use-api';
import { Loader, PageTitle, ago } from '../../../../components/app/ui';

/** The app's « Notifications » screen, per mode, with its own wording (`notificationCopy`). */
function target(n: NotificationDto, pro: boolean): string {
  if (n.conversationId) return `/messages?c=${n.conversationId}`;
  if (n.commandeId) return `/commandes/${n.commandeId}`;
  if (n.demandeId) return pro ? `/demandes/${n.demandeId}/offre` : `/mes-demandes/${n.demandeId}`;
  return pro ? '/tableau-de-bord' : '/mes-demandes';
}

export default function NotificationsPage() {
  const me = useRequireSession();
  const mode = me?.profile.activeMode ?? 'CLIENT';
  const list = useApi<NotificationDto[]>(me ? `/notifications?mode=${mode}` : null);
  if (!me) return <Loader />;
  const pro = mode === 'REPAIRER';
  const unread = (list.data ?? []).filter((n) => !n.read).length;

  return (
    <div className="ap-page">
      <PageTitle title="Notifications" sub={pro ? 'Côté réparateur' : 'Côté client'}>
        {unread > 0 && (
          <button
            className="ap-btn ap-btn--secondary ap-btn--sm"
            onClick={() => void api.post(`/notifications/read-all?mode=${mode}`, {}).then(list.reload).catch(() => {})}
          >
            Tout marquer comme lu
          </button>
        )}
      </PageTitle>
      {list.loading && <Loader />}
      {list.data && list.data.length === 0 && (
        <div className="ap-empty">
          <strong>Rien de neuf pour l’instant</strong>
          <span>{pro ? 'Les nouvelles demandes, les offres acceptées et les paiements apparaîtront ici.' : 'Les offres reçues, les messages et chaque étape de vos réparations apparaîtront ici.'}</span>
        </div>
      )}
      <ul className="ap-list">
        {(list.data ?? []).map((n, i) => {
          const c = notificationCopy(n);
          return (
            <li key={n.id} style={{ '--i': i } as React.CSSProperties}>
              <Link
                href={target(n, pro)}
                className={n.read ? 'ap-row ap-notif' : 'ap-row ap-notif is-unread'}
                onClick={() => !n.read && void api.post(`/notifications/${n.id}/read`, {}).catch(() => {})}
              >
                <span className="ap-notif__dot" aria-label={n.read ? undefined : 'Non lue'} />
                <span className="ap-row__main">
                  <strong>{c.title}</strong>
                  <span>{c.sub}</span>
                </span>
                <time>{ago(n.createdAt)}</time>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
