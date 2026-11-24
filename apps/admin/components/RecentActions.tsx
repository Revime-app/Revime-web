'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  auditOk,
  ADMIN_AUDIT_ACTION_LABEL,
  TARGET_TYPE_LABEL,
  type AdminAuditAction,
  type AdminAuditEntry,
} from '@revime/shared';
import { isDeletedUser, DELETED_USER_NAME } from '../lib/user-display';

export function formatAuditStatus(statusCode: number): string {
  if (auditOk(statusCode)) {
    return 'Réussie';
  }
  switch (statusCode) {
    case 400:
      return 'Refusée · Requête invalide (400)';
    case 401:
      return 'Refusée · Non authentifié (401)';
    case 403:
      return 'Refusée · Accès refusé (403)';
    case 404:
      return 'Refusée · Introuvable (404)';
    case 409:
      return 'Refusée · Conflit métier (409)';
    case 422:
      return 'Refusée · Données non conformes (422)';
    case 429:
      return 'Refusée · Limite de requêtes (429)';
    default:
      if (statusCode >= 500) {
        return `Échec serveur (${statusCode})`;
      }
      return `Refusée (${statusCode})`;
  }
}

export function getAuditTargetHref(targetType: string | null, targetId: string | null): string | null {
  if (!targetType || !targetId) return null;
  const lower = targetType.toLowerCase();
  switch (lower) {
    case 'user':
    case 'repairer':
      return `/utilisateurs/${encodeURIComponent(targetId)}`;
    case 'demande':
      return `/demandes/${encodeURIComponent(targetId)}`;
    case 'dispute':
      return `/litiges?q=${encodeURIComponent(targetId)}`;
    case 'commande':
      return `/paiements?commande=${encodeURIComponent(targetId)}`;
    case 'report':
    case 'signalement':
      return `/signalements/${encodeURIComponent(targetId)}`;
    case 'cancellation':
      return `/annulations?id=${encodeURIComponent(targetId)}`;
    case 'review':
      return `/avis`;
    case 'compliance':
      return `/conformite`;
    default:
      return null;
  }
}

export function formatAuditTarget(targetType: string | null, targetId: string | null): string {
  if (!targetType) return '-';
  const typeLabel = TARGET_TYPE_LABEL[targetType] ?? targetType;
  return targetId ? `${typeLabel} ${targetId}` : typeLabel;
}

/**
 * `/admin/audit` answers with the `AdminAuditListResponse` envelope (since 0449f517); the
 * dashboard block still read it as a raw array and crashed on `.map`. A body that is not the
 * envelope THROWS so the caller shows the error state: the old tolerant reader turned it into
 * `[]`, which renders « Aucune action enregistrée » over a log we could not read.
 */
export function readAuditItems(data: unknown): AdminAuditEntry[] {
  const items = (data as { items?: unknown } | null | undefined)?.items;
  if (!Array.isArray(items)) throw new Error('Unexpected /admin/audit response');
  return items as AdminAuditEntry[];
}

/** The twenty newest entries; rejects on a non-OK answer or a body that is not the envelope. */
export async function fetchRecentAudit(fetchImpl: typeof fetch = fetch): Promise<AdminAuditEntry[]> {
  const r = await fetchImpl('/api/proxy/admin/audit?limit=20');
  if (!r.ok) throw new Error(String(r.status));
  return readAuditItems(await r.json());
}

type State =
  | { s: 'loading' }
  | { s: 'error' }
  | { s: 'loaded'; rows: AdminAuditEntry[] };

/**
 * 🛑 THREE states, and no `?? []`. An error coalesced into an empty array renders
 * « Aucune action », which asserts the log is empty when the truth is that we could not
 * read it. That exact defect is recorded twice in this repo: slice 15's residual 4 and
 * slice 18's follow-up (e).
 */
export function RecentActions({ initialEntries }: { initialEntries?: AdminAuditEntry[] } = {}) {
  const [state, setState] = useState<State>(
    initialEntries ? { s: 'loaded', rows: initialEntries } : { s: 'loading' }
  );

  useEffect(() => {
    if (initialEntries) return;
    let live = true;
    fetchRecentAudit()
      .then((rows) => live && setState({ s: 'loaded', rows }))
      .catch(() => live && setState({ s: 'error' }));
    return () => {
      live = false;
    };
  }, [initialEntries]);

  if (state.s === 'loading') return <p className="state">Chargement des actions...</p>;
  if (state.s === 'error')
    return <p className="state state--error">Impossible de charger les dernières actions.</p>;
  if (state.rows.length === 0)
    return <p className="state">Aucune action enregistrée pour le moment.</p>;

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Opérateur</th>
          <th>Action</th>
          <th>Cible</th>
          <th>Résultat</th>
        </tr>
      </thead>
      <tbody>
        {state.rows.map((r) => {
          const targetHref = getAuditTargetHref(r.targetType, r.targetId);
          const targetText = formatAuditTarget(r.targetType, r.targetId);
          const actorDisplay = isDeletedUser(null, r.actorEmail)
            ? DELETED_USER_NAME
            : (r.actorEmail || '-');

          return (
            <tr key={r.id}>
              <td>{new Date(r.createdAt).toLocaleString('fr-FR')}</td>
              <td>{actorDisplay}</td>
              <td>{ADMIN_AUDIT_ACTION_LABEL[r.action as AdminAuditAction] ?? r.action}</td>
              <td>
                {targetHref ? (
                  <Link
                    href={targetHref}
                    style={{
                      color: 'var(--navy-text, #25324f)',
                      fontWeight: 600,
                      textDecoration: 'underline',
                    }}
                  >
                    {targetText}
                  </Link>
                ) : (
                  targetText
                )}
              </td>
              <td>{formatAuditStatus(r.statusCode)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
