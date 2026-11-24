'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  DELETED_USER_NAME,
  REPORT_GRAVITY_LABEL,
  REPORT_REASON_LABEL,
  REPORT_TARGET_TYPE_LABEL,
  type AdminReportListItemDto,
  type AdminReportListResponse,
  type ReportGravity,
  type ReportTargetType,
} from '@revime/shared';
import { formatUserDisplay } from '../../lib/user-display';

type StatusFilter = 'OPEN' | 'RESOLVED' | 'ALL';
type GravityFilter = 'HIGH' | 'MEDIUM' | 'LOW' | 'ALL';
type AssignmentFilter = 'MINE' | 'UNASSIGNED' | 'ALL';
type SortByFilter = 'created_asc' | 'gravity_desc' | 'created_desc';

function GravityBadge({ gravity }: { gravity: ReportGravity }) {
  const styles: Record<ReportGravity, { bg: string; color: string; border: string }> = {
    HIGH: {
      bg: 'var(--red-soft, #feedf0)',
      color: 'var(--red-text, #bd0e26)',
      border: '1px solid var(--badge-danger-border)',
    },
    MEDIUM: {
      bg: 'var(--amber-soft, #fef0c7)',
      color: 'var(--amber-deep, #b45309)',
      border: '1px solid var(--badge-warning-border)',
    },
    LOW: {
      bg: 'var(--badge-neutral-bg)',
      color: 'var(--ink2)',
      border: '1px solid var(--line)',
    },
  };
  const s = styles[gravity] ?? styles.LOW;
  const label = REPORT_GRAVITY_LABEL[gravity] ?? gravity;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
        border: s.border,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export default function SignalementsPage({
  initialData,
}: {
  initialData?: AdminReportListResponse;
} = {}) {
  const [data, setData] = useState<AdminReportListResponse | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [gravity, setGravity] = useState<GravityFilter>('ALL');
  const [assignment, setAssignment] = useState<AssignmentFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortByFilter>('created_asc');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search query input
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set('status', status);
    if (gravity !== 'ALL') params.set('gravity', gravity);
    if (assignment !== 'ALL') params.set('assignment', assignment);
    if (sortBy) params.set('sortBy', sortBy);
    if (q.trim()) params.set('q', q.trim());
    params.set('page', String(page));

    try {
      const response = await fetch(`/api/proxy/admin/reports?${params.toString()}`);
      if (!response.ok) {
        setError('Impossible de charger les signalements.');
        setLoading(false);
        return;
      }
      const json = (await response.json()) as AdminReportListResponse;
      setData(json);
    } catch {
      setError('Impossible de charger les signalements.');
    } finally {
      setLoading(false);
    }
  }, [status, gravity, assignment, sortBy, q, page]);

  useEffect(() => {
    if (!initialData) {
      void loadReports();
    }
  }, [loadReports, initialData]);

  const counts = data?.counts ?? { open: 0, resolved: 0, total: 0 };

  return (
    <div className="page page--wide">
      <h1>Signalements</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>
        File de modération des conversations signalées. Examinez les signalements, attribuez-les et traitez les dossiers.
      </p>

      {/* Status Tabs */}
      <div
        role="tablist"
        aria-label="Statut des signalements"
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--line)',
          marginBottom: '1.25rem',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={status === 'OPEN'}
          onClick={() => {
            if (status !== 'OPEN') {
              setStatus('OPEN');
              setPage(1);
            }
          }}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderBottom: status === 'OPEN' ? '2px solid var(--accent)' : '2px solid transparent',
            color: status === 'OPEN' ? 'var(--ink)' : 'var(--muted)',
            fontWeight: status === 'OPEN' ? 600 : 500,
            cursor: 'pointer',
            borderRadius: 0,
            fontSize: '14px',
          }}
        >
          En attente ({counts.open})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={status === 'RESOLVED'}
          onClick={() => {
            if (status !== 'RESOLVED') {
              setStatus('RESOLVED');
              setPage(1);
            }
          }}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderBottom: status === 'RESOLVED' ? '2px solid var(--accent)' : '2px solid transparent',
            color: status === 'RESOLVED' ? 'var(--ink)' : 'var(--muted)',
            fontWeight: status === 'RESOLVED' ? 600 : 500,
            cursor: 'pointer',
            borderRadius: 0,
            fontSize: '14px',
          }}
        >
          Résolus ({counts.resolved})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={status === 'ALL'}
          onClick={() => {
            if (status !== 'ALL') {
              setStatus('ALL');
              setPage(1);
            }
          }}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderBottom: status === 'ALL' ? '2px solid var(--accent)' : '2px solid transparent',
            color: status === 'ALL' ? 'var(--ink)' : 'var(--muted)',
            fontWeight: status === 'ALL' ? 600 : 500,
            cursor: 'pointer',
            borderRadius: 0,
            fontSize: '14px',
          }}
        >
          Tous ({counts.total})
        </button>
      </div>

      {/* Filters & Controls */}
      <div className="filters" style={{ marginBottom: '1.5rem', gap: '0.75rem' }}>
        <input
          type="search"
          value={searchInput}
          placeholder="Rechercher par nom, email ou titre de demande"
          onChange={(e) => {
            setPage(1);
            setSearchInput(e.target.value);
          }}
          style={{ minWidth: '320px', flex: '1 1 300px' }}
          aria-label="Recherche par nom, email ou titre de demande"
        />

        <select
          value={gravity}
          onChange={(e) => {
            setPage(1);
            setGravity(e.target.value as GravityFilter);
          }}
          aria-label="Filtrer par gravité"
        >
          <option value="ALL">Toutes les gravités</option>
          <option value="HIGH">Élevée</option>
          <option value="MEDIUM">Moyenne</option>
          <option value="LOW">Faible</option>
        </select>

        <select
          value={assignment}
          onChange={(e) => {
            setPage(1);
            setAssignment(e.target.value as AssignmentFilter);
          }}
          aria-label="Filtrer par assignation"
        >
          <option value="ALL">Toutes les assignations</option>
          <option value="MINE">Mes dossiers</option>
          <option value="UNASSIGNED">Non assignés</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => {
            setPage(1);
            setSortBy(e.target.value as SortByFilter);
          }}
          aria-label="Trier par"
        >
          <option value="created_asc">Plus anciens (file d'attente)</option>
          <option value="gravity_desc">Gravité prioritaire</option>
          <option value="created_desc">Plus récents</option>
        </select>
      </div>

      {/* Loading state */}
      {loading && <p>Chargement des signalements...</p>}

      {/* Error state */}
      {error && (
        <p role="alert" style={{ color: 'red' }}>
          {error}
        </p>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.items.length === 0 && (
        <p style={{ marginTop: '1.5rem', color: 'var(--muted)' }}>
          Aucun signalement ne correspond à ces critères.
        </p>
      )}

      {/* Data Table */}
      {!loading && !error && data && data.items.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
            <table className="table" style={{ width: '100%', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>Gravité</th>
                  <th style={{ width: '90px' }}>Cible</th>
                  <th>Motif</th>
                  <th>Signalé par</th>
                  <th>Personne signalée</th>
                  <th>Demande associée</th>
                  <th>Assigné à</th>
                  <th style={{ width: '110px' }}>Reçu le</th>
                  <th style={{ width: '100px' }}>Statut</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: AdminReportListItemDto) => (
                  <tr key={item.id}>
                    <td>
                      <GravityBadge gravity={item.gravity} />
                    </td>
                    <td>
                      <span
                        data-testid="report-target-type-badge"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: 'var(--navy-soft, #f0f1f5)',
                          color: 'var(--navy-text, #25324f)',
                          border: '1px solid var(--line)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {REPORT_TARGET_TYPE_LABEL[item.targetType ?? 'MESSAGE'] ?? 'Message'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>
                        {REPORT_REASON_LABEL[item.reason] ?? item.reason}
                      </span>
                    </td>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{formatUserDisplay(item.reporter.name, item.reporter.email).name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {formatUserDisplay(item.reporter.name, item.reporter.email).email}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{formatUserDisplay(item.reported.name, item.reported.email).name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {formatUserDisplay(item.reported.name, item.reported.email).email}
                        </div>
                      </div>
                    </td>
                    <td>
                      {item.demande ? (
                        <Link
                          href={`/demandes/${item.demande.id}`}
                          style={{ color: 'var(--navy-text)', textDecoration: 'underline' }}
                        >
                          {item.demande.title}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {item.assignedTo &&
                      item.assignedTo.name !== DELETED_USER_NAME &&
                      item.assignedTo.name !== 'Opérateur supprimé' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-field, 4px)',
                            fontSize: '12px',
                            fontWeight: 500,
                            backgroundColor: 'var(--navy-soft, #f0f1f5)',
                            color: 'var(--navy-text, #25324f)',
                          }}
                        >
                          {item.assignedTo.name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '13px' }}>
                          Non assigné
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {new Date(item.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                    </td>
                    <td>
                      {item.resolvedAt ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: 'var(--green-soft, #e7f8f0)',
                            color: 'var(--green-deep, #0a8a50)',
                            border: '1px solid var(--badge-success-border)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Résolu
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: 'var(--navy-soft, #f0f1f5)',
                            color: 'var(--navy-text, #25324f)',
                            border: '1px solid var(--line)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          En attente
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/signalements/${item.id}`}
                        style={{
                          display: 'inline-block',
                          padding: '6px 12px',
                          backgroundColor: 'var(--navy, #25324f)',
                          color: '#ffffff',
                          borderRadius: 'var(--r-field, 4px)',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Consulter
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '1.5rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div style={{ color: 'var(--muted)', fontSize: '14px' }}>
              Page {data.page} sur {data.totalPages} (Total: {data.total} signalement{data.total > 1 ? 's' : ''})
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '6px 16px',
                  fontSize: '14px',
                  cursor: data.page <= 1 ? 'not-allowed' : 'pointer',
                  opacity: data.page <= 1 ? 0.5 : 1,
                }}
              >
                Précédent
              </button>
              <button
                type="button"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  padding: '6px 16px',
                  fontSize: '14px',
                  cursor: data.page >= data.totalPages ? 'not-allowed' : 'pointer',
                  opacity: data.page >= data.totalPages ? 0.5 : 1,
                }}
              >
                Suivant
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
