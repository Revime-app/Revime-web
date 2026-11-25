'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/client/api';
import { useSession } from '../../lib/client/session';
import { IconBell } from './icons';

/** The bell of the app's header, with the unread count of the current mode (asked every minute). */
export function NotifBell() {
  const { status, me } = useSession();
  const mode = me?.profile.activeMode ?? 'CLIENT';
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (status !== 'in') return;
    let live = true;
    const ask = () =>
      api
        .get<{ count: number }>(`/notifications/unread-count?mode=${mode}`)
        .then((r) => live && setCount(r.count))
        .catch(() => {});
    void ask();
    const t = setInterval(() => document.visibilityState === 'visible' && void ask(), 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [status, mode]);
  if (status !== 'in') return null;
  return (
    <Link href="/notifications" className="ap-bell" aria-label={count ? `Notifications, ${count} non lues` : 'Notifications'}>
      <IconBell size={22} />
      {count > 0 && <span className="ap-bell__n">{count > 9 ? '9+' : count}</span>}
    </Link>
  );
}
