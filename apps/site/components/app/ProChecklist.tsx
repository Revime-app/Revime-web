'use client';

import Link from 'next/link';
import type { ConnectStatusResponse, MeResponse } from '@revime/shared';
import { useApi } from '../../lib/client/use-api';

/**
 * « Votre profil est prêt à X % »: what a réparateur still has to do before clients choose him,
 * each step one click away. Only facts the account already holds; nothing is invented.
 */
export function ProChecklist({ me }: { me: MeResponse }) {
  const connect = useApi<ConnectStatusResponse>('/connect/status');
  const r = me.repairer;
  if (!r) return null;
  const steps = [
    { done: Boolean(r.postalCode), label: 'Votre zone d’intervention', href: '/profil-pro' },
    { done: r.categoryIds.length > 0, label: 'Ce que vous réparez', href: '/profil-pro#categories' },
    { done: Boolean(r.bio && r.bio.length >= 40), label: 'Une description de 40 caractères ou plus', href: '/profil-pro' },
    { done: (r.availability?.length ?? 0) === 7, label: 'Vos horaires', href: '/profil-pro' },
    { done: Boolean(me.avatarUrl), label: 'Une photo (dans l’appli)', href: '/profil-pro' },
    { done: Boolean(connect.data?.transfersActive), label: 'Vos versements', href: '/tableau-de-bord#versements' },
  ];
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) return null;
  const pct = Math.round((n / steps.length) * 100);
  return (
    <section className="ap-box ap-ready" aria-labelledby="h-ready">
      <div className="ap-ready__ring" style={{ '--p': pct } as React.CSSProperties} aria-hidden="true">
        <span>{pct} %</span>
      </div>
      <div className="ap-ready__body">
        <h2 id="h-ready">Votre profil est prêt à {pct} %</h2>
        <p>Un profil complet reçoit plus de demandes et inspire confiance. Encore {steps.length - n} étape{steps.length - n > 1 ? 's' : ''} :</p>
        <ul>
          {steps
            .filter((s) => !s.done)
            .map((s) => (
              <li key={s.label}>
                <Link href={s.href}>{s.label}</Link>
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}
