'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ADMIN_ROLE_LABEL,
  formatAdminUserStatus,
  VERIFICATION_LEVEL_LABEL,
  VERIFIED_BADGE_LABEL,
  type AdminUserListResponse,
} from '@revime/shared';
import { formatEuros } from '../../lib/money';
import { isDeletedUser, safeUserEmail } from '../../lib/user-display';
import { Star } from 'lucide-react';
import { Icon } from '../../components/Icon';

/**
 * Formats a rating value into a star icon, 4.8 (12), or '—' if no reviews exist.
 */
function formatRating(rating: number | null | undefined, reviewCount: number | undefined): React.ReactNode {
  if (rating === null || rating === undefined || !reviewCount) {
    return '—';
  }
  return (
    <>
      <Icon as={Star} /> {rating.toFixed(1)} ({reviewCount})
    </>
  );
}

/**
 * 🛑 FOUR outputs, not three. « Aucun utilisateur ne correspond » is a DIFFERENT
 * statement from « impossible de charger », and collapsing them is how an operator
 * concludes an account was deleted when the filter was merely wrong. Design §9.
 */
type View =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'loaded'; data: AdminUserListResponse };

export default function UtilisateursPage() {
  const [view, setView] = useState<View>({ state: 'loading' });
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [type, setType] = useState('');
  const [niveau, setNiveau] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setView({ state: 'loading' });
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (statut) params.set('statut', statut);
    if (type) params.set('type', type);
    if (niveau) params.set('niveau', niveau);
    params.set('page', String(page));

    try {
      const r = await fetch(`/api/proxy/admin/users?${params.toString()}`);
      // 🛑 No `?? []`. A failed fetch must never render as an empty list.
      if (!r.ok) {
        setView({ state: 'error' });
        return;
      }
      setView({ state: 'loaded', data: (await r.json()) as AdminUserListResponse });
    } catch {
      setView({ state: 'error' });
    }
  }, [q, statut, type, niveau, page]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const initialQ = search.get('q');
    const initialStatut = search.get('statut');
    const initialType = search.get('type');
    const initialNiveau = search.get('niveau');
    if (initialQ) setQ(initialQ);
    if (initialStatut) setStatut(initialStatut);
    if (initialType) setType(initialType);
    if (initialNiveau) setNiveau(initialNiveau);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * P5: Dedicated view for deleted accounts when statut === 'supprime' or all items are deleted.
   */
  const isDeletedView =
    statut === 'supprime' ||
    (view.state === 'loaded' &&
      view.data.items.length > 0 &&
      view.data.items.every((u) => u.status.kind === 'deleted'));

  /**
   * P5: Réparateurs view when repairer metrics or repairerProfile is present in response.
   */
  const repairerView =
    !isDeletedView &&
    view.state === 'loaded' &&
    view.data.items.some(
      (u) => u.repairer !== undefined || u.repairerMetrics !== undefined,
    );

  return (
    <div className="page page--wide">
      <h1>Utilisateurs</h1>

      <div className="filters">
        <input
          type="search"
          value={q}
          placeholder="Nom, identifiant, e-mail ou téléphone"
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          value={statut}
          onChange={(e) => {
            setPage(1);
            setStatut(e.target.value);
          }}
        >
          <option value="">Tous sauf les supprimés</option>
          <option value="actif">Actifs</option>
          <option value="suspendu">Suspendus</option>
          <option value="supprime">Supprimés</option>
        </select>
        <select
          value={type}
          onChange={(e) => {
            setPage(1);
            setType(e.target.value);
          }}
        >
          <option value="">Tous les comptes</option>
          <option value="client">Clients</option>
          <option value="reparateur">Réparateurs</option>
          <option value="les-deux">Les deux</option>
          <option value="equipe">Équipe</option>
        </select>
        <select
          value={niveau}
          onChange={(e) => {
            setPage(1);
            setNiveau(e.target.value);
          }}
        >
          <option value="">Tous les niveaux</option>
          <option value="NONE">Non vérifié</option>
          <option value="BASIC">Basique</option>
          <option value="IDENTITY">Identité vérifiée</option>
          <option value="BUSINESS">Professionnel</option>
        </select>
      </div>

      {view.state === 'loading' && <p>Chargement...</p>}

      {view.state === 'error' && (
        <p role="alert" style={{ color: 'red' }}>
          Impossible de charger la liste des utilisateurs.
        </p>
      )}

      {view.state === 'loaded' && view.data.items.length === 0 && view.data.total === 0 && (
        <p>Aucun utilisateur ne correspond à cette recherche.</p>
      )}

      {view.state === 'loaded' && view.data.items.length === 0 && view.data.total > 0 && (
        <p>Aucun utilisateur sur cette page. Réduisez le numéro de page.</p>
      )}

      {view.state === 'loaded' && view.data.items.length > 0 && (
        <>
          <p>
            {view.data.total} compte(s) · page {view.data.page}
          </p>
          <table className="table">
            <thead>
              <tr>
                {isDeletedView ? (
                  <>
                    <th>Nom</th>
                    <th>E-mail / Identifiant</th>
                    <th>Motif de suppression</th>
                    <th>Auteur de la suppression (admin)</th>
                    <th>Supprimé le</th>
                  </>
                ) : repairerView ? (
                  <>
                    <th>Nom</th>
                    <th>E-mail</th>
                    <th>Note</th>
                    <th>Réparations</th>
                    <th>Chiffre d&apos;affaires</th>
                    <th>Badge public</th>
                    <th>Statut réparateur</th>
                    <th>Inscrit le</th>
                  </>
                ) : (
                  <>
                    <th>Nom</th>
                    <th>Identifiant</th>
                    <th>Coordonnées</th>
                    <th>Compte</th>
                    <th>Niveau</th>
                    <th>Statut</th>
                    <th>Inscrit le</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {view.data.items.map((u) => (
                <tr key={u.userId}>
                  {isDeletedView ? (
                    <>
                      <td>
                        <Link href={`/utilisateurs/${u.userId}`}>{u.name}</Link>
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--badge-neutral-bg)',
                            color: 'var(--ink2)',
                          }}
                        >
                          (Compte supprimé)
                        </span>
                      </td>
                      <td>
                        {safeUserEmail(u.email, u.name) ??
                          (u.username && !u.username.startsWith('deleted+') ? u.username : '—')}
                      </td>
                      <td>{u.deletionMeta?.deletedReason ?? 'Non spécifié'}</td>
                      <td>{u.deletionMeta?.deletedBy ?? '—'}</td>
                      <td>
                        {u.deletionMeta?.deletedAt
                          ? new Date(u.deletionMeta.deletedAt).toLocaleDateString('fr-FR')
                          : u.status.kind === 'deleted'
                            ? new Date(u.status.at).toLocaleDateString('fr-FR')
                            : '—'}
                      </td>
                    </>
                  ) : repairerView ? (
                    <>
                      <td>
                        <Link href={`/utilisateurs/${u.userId}`}>
                          {u.repairer?.displayName ?? u.name}
                        </Link>
                        {u.marker === 'demo' && ' · démo'}
                        {u.marker === 'fixture' && ' · fixture de test'}
                        {u.marker === 'review' && ' · compte de revue'}
                      </td>
                      <td>{isDeletedUser(u.name, u.email, u.status.kind === 'deleted') ? '—' : u.email}</td>
                      <td>{formatRating(u.repairerMetrics?.rating, u.repairerMetrics?.reviewCount)}</td>
                      <td>{u.repairerMetrics ? u.repairerMetrics.repairsCount : '—'}</td>
                      <td>{u.repairerMetrics ? formatEuros(u.repairerMetrics.totalRevenueCents) : '—'}</td>
                      <td>
                        {u.repairer?.publicBadge
                          ? VERIFIED_BADGE_LABEL[u.repairer.publicBadge]
                          : '—'}
                      </td>
                      <td>{u.repairer ? (u.repairer.suspended ? 'Suspendu' : 'Actif') : '—'}</td>
                      <td>{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                    </>
                  ) : (
                    <>
                      <td>
                        <Link href={`/utilisateurs/${u.userId}`}>{u.name}</Link>
                        {u.marker === 'demo' && ' · démo'}
                        {u.marker === 'fixture' && ' · fixture de test'}
                        {u.marker === 'review' && ' · compte de revue'}
                      </td>
                      <td>{u.username}</td>
                      <td>
                        {isDeletedUser(u.name, u.email, u.status.kind === 'deleted')
                          ? '—'
                          : `${u.email}${u.phone ? ` · ${u.phone}` : ''}`}
                      </td>
                      <td>
                        {[u.modes.client ? 'Client' : null, u.modes.repairer ? 'Réparateur' : null]
                          .filter(Boolean)
                          .join(' et ') || '—'}
                        {type === 'equipe' && u.staffRole && ` · ${ADMIN_ROLE_LABEL[u.staffRole]}`}
                      </td>
                      <td>{VERIFICATION_LEVEL_LABEL[u.verificationLevel] ?? u.verificationLevel}</td>
                      <td>{formatAdminUserStatus(u.status)}</td>
                      <td>{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="filters">
            <button type="button" disabled={view.data.page <= 1} onClick={() => setPage((p) => p - 1)}>
              Précédent
            </button>
            <button
              type="button"
              disabled={view.data.page * view.data.pageSize >= view.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </div>
  );
}
