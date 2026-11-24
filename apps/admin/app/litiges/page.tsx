'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  ADMIN_DISPUTE_SORT_KEYS,
  DISPUTE_MOTIFS,
  formatDisputeRef,
  type AdminDisputeListItem,
  type AdminDisputeListResponse,
} from '@revime/shared';
import { DisputeQueueTable } from './DisputeQueueTable';
import { DisputeDossierDrawer } from './DisputeDossierDrawer';
import { ListPagination } from '../../components/ListPagination';
import { CsvExportButton } from '../../components/CsvExportButton';
import { generateCsv, downloadCsv, type CsvColumn } from '../../lib/export-csv';
import { syncUrlParams } from '../../lib/url-sync';
import { toggleSort, type SortDirection } from '../../lib/table-sort';
import { formatEuros } from '../../lib/money';
import { disputeInitiatorLabel, storedDisputeStatusLabel } from '../../lib/status-labels';
import { formatShortReference } from '../../components/CopyableReference';

import { isDeletedUser } from '../../lib/user-display';
import { CreditCard, TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; data: AdminDisputeListResponse };

const isDisputeSortKey = (key: string | null): key is (typeof ADMIN_DISPUTE_SORT_KEYS)[number] =>
  (ADMIN_DISPUTE_SORT_KEYS as readonly string[]).includes(key ?? '');

export type TabStatus = 'ALL' | 'MINE' | 'OPEN' | 'IN_REVIEW' | 'RESOLVED';

export const TABS: Array<{ label: string; value: TabStatus }> = [
  { label: 'Tous', value: 'ALL' },
  { label: 'Mes dossiers', value: 'MINE' },
  { label: 'Ouverts', value: 'OPEN' },
  { label: "En cours d'examen", value: 'IN_REVIEW' },
  { label: 'Résolus', value: 'RESOLVED' },
];

export function buildLitigesQueryString(options: {
  q?: string;
  status?: TabStatus;
  onlyMine?: boolean;
  assigned?: string;
  page?: number;
  pageSize?: number;
  sort?: string | null;
  dir?: SortDirection;
}): string {
  const params = new URLSearchParams();
  if (options.q?.trim()) params.set('q', options.q.trim());
  if (options.onlyMine || options.status === 'MINE') {
    params.set('onlyMine', 'true');
  } else if (options.status && options.status !== 'ALL') {
    params.set('status', options.status);
  }
  if (options.assigned && options.assigned !== 'all') params.set('assigned', options.assigned);
  if (isDisputeSortKey(options.sort ?? null)) {
    params.set('sort', options.sort as string);
    params.set('dir', options.dir ?? 'desc');
  }
  params.set('page', String(options.page ?? 1));
  params.set('pageSize', String(options.pageSize ?? 25));
  return params.toString();
}

export async function fetchDisputesQueue(
  queryString: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; data?: AdminDisputeListResponse; error?: string }> {
  try {
    const res = await fetchImpl(`/api/proxy/admin/litiges?${queryString}`);
    if (!res.ok) {
      return { ok: false, error: 'Impossible de charger la file des litiges.' };
    }
    const data = (await res.json()) as AdminDisputeListResponse;
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Erreur réseau lors du chargement des litiges.' };
  }
}

function LitigesContent() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const initialDisputeId = searchParams.get('disputeId') ?? null;
  const initialStatusParam = searchParams.get('status') as TabStatus | null;
  const initialOnlyMine = searchParams.get('onlyMine') === 'true' || initialStatusParam === 'MINE';
  const initialStatus: TabStatus = initialOnlyMine
    ? 'MINE'
    : (initialStatusParam && ['OPEN', 'IN_REVIEW', 'RESOLVED'].includes(initialStatusParam)
      ? initialStatusParam
      : 'ALL');
  const initialPage = Number(searchParams.get('page')) || 1;
  const initialPageSize = Number(searchParams.get('pageSize')) || 25;
  const urlSort = searchParams.get('sort');
  const initialSort = isDisputeSortKey(urlSort) ? urlSort : 'createdAt';
  const urlDir = searchParams.get('dir');
  const initialDir: SortDirection = urlDir === 'asc' || urlDir === 'desc' ? urlDir : 'desc';

  const [view, setView] = useState<View>({ state: 'loading' });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Filters state
  const [status, setStatus] = useState<TabStatus>(initialStatus);
  const [searchInput, setSearchInput] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [assigned, setAssigned] = useState<'all' | 'unassigned' | string>('all');
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortKey, setSortKey] = useState<string | null>(initialSort);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialDir);
  const [exportError, setExportError] = useState<string | null>(null);

  // Selected dispute for slide-over drawer
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(initialDisputeId);

  // Fetch current user ID for assignment shortcut & highlighting
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/proxy/admin/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.user?.id) {
          setCurrentUserId(data.user.id);
        } else if (data.id) {
          setCurrentUserId(data.id);
        }
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce search query (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Synchronize filters, pagination, sort, and selected dispute with URL
  useEffect(() => {
    syncUrlParams(
      {
        q,
        status: status === 'MINE' ? undefined : status,
        onlyMine: status === 'MINE' ? 'true' : undefined,
        assigned,
        page,
        pageSize,
        sort: sortKey,
        dir: sortDirection,
        disputeId: selectedDisputeId,
      },
      {
        q: '',
        status: 'ALL',
        onlyMine: undefined,
        assigned: 'all',
        page: 1,
        pageSize: 25,
        sort: 'createdAt',
        dir: 'desc',
        disputeId: null,
      }
    );
  }, [q, status, assigned, page, pageSize, sortKey, sortDirection, selectedDisputeId]);

  const load = useCallback(async () => {
    setView({ state: 'loading' });
    const qs = buildLitigesQueryString({
      q,
      status,
      assigned,
      page,
      pageSize,
      sort: sortKey,
      dir: sortDirection,
    });

    const result = await fetchDisputesQueue(qs);
    if (!result.ok || !result.data) {
      setView({ state: 'error', message: result.error ?? 'Impossible de charger la file des litiges.' });
      return;
    }
    setView({ state: 'loaded', data: result.data });
  }, [q, status, assigned, page, pageSize, sortKey, sortDirection]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasActiveFilters = Boolean(
    searchInput.trim() || status !== 'ALL' || assigned !== 'all'
  );

  const handleResetFilters = () => {
    setSearchInput('');
    setQ('');
    setStatus('ALL');
    setAssigned('all');
    setPage(1);
  };

  const handleSort = (key: string) => {
    const next = toggleSort(sortKey, key, sortDirection);
    setSortKey(next.key);
    setSortDirection(next.direction);
    setPage(1);
  };

  const handleExportCsv = async () => {
    if (view.state !== 'loaded' || view.data.items.length === 0) return;
    // The whole filtered queue, not the page on screen: same filters and order, one request.
    const everything = await fetchDisputesQueue(
      buildLitigesQueryString({
        q,
        status,
        assigned,
        page: 1,
        pageSize: Math.max(1, view.data.total),
        sort: sortKey,
        dir: sortDirection,
      }),
    );
    if (!everything.ok || !everything.data) {
      setExportError("L'export a échoué : impossible de charger toute la file des litiges.");
      return;
    }
    setExportError(null);
    const columns: CsvColumn<AdminDisputeListItem>[] = [
      {
        key: 'number',
        label: 'N° Litige',
        format: (_, d) => formatDisputeRef(d.number),
      },
      {
        key: 'createdAt',
        label: 'Date ouverture',
        format: (val) => (val ? new Date(val as string).toLocaleDateString('fr-FR') : '—'),
      },
      {
        key: 'status',
        label: 'Statut',
        format: (val) => storedDisputeStatusLabel(String(val)),
      },
      {
        key: 'initiator',
        label: 'Initiateur',
        format: (val) => disputeInitiatorLabel(String(val)),
      },
      {
        key: 'motif',
        label: 'Motif',
        format: (val, d) => (val ? DISPUTE_MOTIFS[val as keyof typeof DISPUTE_MOTIFS]?.label ?? String(val) : d.reason || '—'),
      },
      {
        key: 'clientName',
        label: 'Client',
        format: (_, d) => (isDeletedUser(d.clientName, d.clientEmail) ? 'Utilisateur supprimé' : (d.clientName || d.clientEmail || '—')),
      },
      {
        key: 'repairerName',
        label: 'Réparateur',
        format: (_, d) => (isDeletedUser(d.repairerName, d.repairerEmail) ? 'Utilisateur supprimé' : (d.repairerName || d.repairerEmail || '—')),
      },
      {
        key: 'repairCents',
        label: 'Montant bloqué (€)',
        format: (val) => formatEuros(val as number),
      },
      {
        key: 'totalCents',
        label: 'Total commande (€)',
        format: (val) => formatEuros(val as number),
      },
      {
        key: 'commandeId',
        label: 'Réf commande',
        format: (val) => (val ? formatShortReference(String(val)) : '—'),
      },
      {
        key: 'assignedToName',
        label: 'Assigné à',
        format: (val) => (val ? String(val) : 'Non assigné'),
      },
    ];
    const csv = generateCsv(columns, everything.data.items);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(`litiges-${dateStr}.csv`, csv);
  };

  // Counts from loaded data
  const counts = view.state === 'loaded' ? {
    ALL: view.data.openCount + view.data.inReviewCount + view.data.resolvedCount,
    MINE: status === 'MINE' ? view.data.total : null,
    OPEN: view.data.openCount,
    IN_REVIEW: view.data.inReviewCount,
    RESOLVED: view.data.resolvedCount,
  } : null;

  return (
    <div className="page page--wide">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 6px 0' }}>Gestion des litiges</h1>
          <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
            File de traitement, examen des dossiers et arbitrage des conflits
          </p>
        </div>

        {/* Quick action links */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <CsvExportButton
            onClick={handleExportCsv}
            disabled={view.state !== 'loaded' || view.data.items.length === 0}
            count={view.state === 'loaded' ? view.data.total : undefined}
            label="Exporter en CSV"
          />
          <Link
            href="/paiements"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--ink, #141414)',
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 6px)',
              textDecoration: 'none',
            }}
          >
            <Icon as={CreditCard} /> Flux paiements
          </Link>
          <Link
            href="/attention"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--ink, #141414)',
              backgroundColor: 'var(--paper, #ffffff)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 6px)',
              textDecoration: 'none',
            }}
          >
            <Icon as={TriangleAlert} /> Commandes à surveiller
          </Link>
        </div>
      </div>

      {exportError && (
        <p role="alert" style={{ color: 'var(--red-text, #bd0e26)', fontSize: '13px', margin: '0 0 12px' }}>
          {exportError}
        </p>
      )}

      {/* Tabs Row */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--line, #dfe2e2)',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((tab) => {
          const isActive = status === tab.value;
          const count = counts ? counts[tab.value] : null;

          return (
            <button
              key={tab.value}
              type="button"
              data-testid={`tab-${tab.value.toLowerCase()}`}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--navy-deep-text, #1e293b)' : 'var(--muted, #6b7280)',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--navy, #25324f)' : '2px solid transparent',
                cursor: 'pointer',
                borderRadius: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'color 0.15s ease',
              }}
            >
              {tab.label}
              {count != null && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '9999px',
                    backgroundColor: isActive ? 'var(--navy, #25324f)' : 'var(--badge-neutral-bg)',
                    color: isActive ? '#ffffff' : 'var(--muted, #6b7280)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search & Filters Bar */}
      <div
        className="filters"
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}
      >
        <div style={{ flex: '1 1 300px' }}>
          <input
            type="text"
            placeholder="Rechercher par réf commande, client ou réparateur…"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="assigned-filter" style={{ fontSize: '13px', margin: 0, whiteSpace: 'nowrap' }}>
            Assigné à :
          </label>
          <select
            id="assigned-filter"
            value={assigned}
            onChange={(e) => {
              setAssigned(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              backgroundColor: 'var(--paper, #ffffff)',
              cursor: 'pointer',
            }}
          >
            <option value="all">Tous les litiges</option>
            <option value="unassigned">Non assigné</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetFilters}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor: 'var(--badge-neutral-bg)',
              color: 'var(--ink, #141414)',
              border: '1px solid var(--line, #dfe2e2)',
              borderRadius: 'var(--r-field, 4px)',
              cursor: 'pointer',
            }}
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Loading state */}
      {view.state === 'loading' && (
        <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement des litiges…</p>
      )}

      {/* Error state */}
      {view.state === 'error' && (
        <div
          role="alert"
          style={{
            color: 'var(--red-text, #bd0e26)',
            backgroundColor: 'var(--red-soft, #feedf0)',
            border: '1px solid var(--badge-danger-border)',
            padding: '12px 16px',
            borderRadius: 'var(--r-field, 4px)',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{view.message}</span>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: 'var(--red-deep, #bd0e26)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Loaded Content */}
      {view.state === 'loaded' && (
        <>
          {view.data.items.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 0',
                color: 'var(--muted, #6b7280)',
                backgroundColor: 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-card, 8px)',
              }}
            >
              <p style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 6px 0' }}>
                Aucun litige trouvé
              </p>
              <p style={{ fontSize: '13px', margin: 0 }}>
                {hasActiveFilters
                  ? 'Aucun litige ne correspond aux filtres appliqués.'
                  : 'Aucun dossier de litige dans cette vue.'}
              </p>
            </div>
          ) : (
            <>
              <DisputeQueueTable
                items={view.data.items}
                onOpenDossier={(id) => setSelectedDisputeId(id)}
                currentUserId={currentUserId}
                onDisputeAssigned={() => void load()}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />

              <ListPagination
                page={view.data.page}
                pageSize={view.data.pageSize}
                total={view.data.total}
                noun="litige"
                pluralNoun="litiges"
                onPageChange={(p) => setPage(p)}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </>
          )}
        </>
      )}

      {/* Slide-over Inspection Dossier Drawer */}
      <DisputeDossierDrawer
        disputeId={selectedDisputeId}
        isOpen={selectedDisputeId !== null}
        onClose={() => setSelectedDisputeId(null)}
        onDisputeUpdated={() => void load()}
      />
    </div>
  );
}

export default function LitigesPage() {
  return (
    <Suspense fallback={<div className="page page--wide"><p>Chargement…</p></div>}>
      <LitigesContent />
    </Suspense>
  );
}
