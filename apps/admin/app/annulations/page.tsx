'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminCancellationListItem, CancellationReason } from '@revime/shared';
import { CANCELLATION_REASON_LABEL } from '@revime/shared';
import { CancellationDrawer } from './CancellationDrawer';
import { cancellationStatusLabel, frozenStepLabel } from '../../lib/cancellation-admin';
import { formatEuros } from '../../lib/money';
import { sortItems, toggleSort, type SortDirection } from '../../lib/table-sort';
import { generateCsv, downloadCsv, type CsvColumn } from '../../lib/export-csv';
import { syncUrlParams } from '../../lib/url-sync';
import { CopyableReference } from '../../components/CopyableReference';
import { isDeletedUser, DELETED_USER_NAME } from '../../lib/user-display';
import { ListPagination } from '../../components/ListPagination';
import { SortableTh } from '../../components/SortableTh';
import { CsvExportButton } from '../../components/CsvExportButton';

type Tab = 'PENDING' | 'HISTORY';

type View =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'loaded'; items: AdminCancellationListItem[] };

/**
 * CF4-27 (spec §4.5) & UI8 List Improvements:
 * Responsive full-width layout, tokenized data-table card, column sorting,
 * "Page X sur Y" pagination with rows-per-page selector, CSV export, and URL query preservation.
 */
export default function AnnulationsPage({ initialItems }: { initialItems?: AdminCancellationListItem[] } = {}) {
  const [tab, setTab] = useState<Tab>('PENDING');
  const [view, setView] = useState<View>(
    initialItems ? { state: 'loaded', items: initialItems } : { state: 'loading' }
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Sorting & pagination state
  const [sortKey, setSortKey] = useState<string | null>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Read initial query params on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const urlTab = sp.get('tab') as Tab | null;
      const urlId = sp.get('id');
      const urlPage = Number(sp.get('page'));
      const urlPageSize = Number(sp.get('pageSize'));
      const urlSort = sp.get('sort');
      const urlDir = sp.get('dir') as SortDirection | null;

      if (urlTab === 'PENDING' || urlTab === 'HISTORY') setTab(urlTab);
      if (urlId) setSelectedId(urlId);
      if (urlPage > 0) setPage(urlPage);
      if (urlPageSize > 0) setPageSize(urlPageSize);
      if (urlSort) setSortKey(urlSort);
      if (urlDir === 'asc' || urlDir === 'desc') setSortDirection(urlDir);
    }
  }, []);

  // Sync state to URL params
  useEffect(() => {
    syncUrlParams(
      {
        tab,
        page,
        pageSize,
        sort: sortKey,
        dir: sortDirection,
        id: selectedId,
      },
      {
        tab: 'PENDING',
        page: 1,
        pageSize: 10,
        sort: 'createdAt',
        dir: 'desc',
        id: null,
      }
    );
  }, [tab, page, pageSize, sortKey, sortDirection, selectedId]);

  const load = useCallback(async () => {
    setView({ state: 'loading' });
    try {
      const res = await fetch(`/api/proxy/admin/cancellations?status=${tab}`);
      if (!res.ok) {
        setView({ state: 'error', message: 'Impossible de charger les demandes d\u2019annulation.' });
        return;
      }
      const items = (await res.json()) as AdminCancellationListItem[];
      setView({ state: 'loaded', items });
    } catch {
      setView({ state: 'error', message: 'Erreur réseau.' });
    }
  }, [tab]);

  useEffect(() => {
    if (initialItems && view.state === 'loaded') return;
    void load();
  }, [load, initialItems]);

  const handleSort = (key: string) => {
    const next = toggleSort(sortKey, key, sortDirection);
    setSortKey(next.key);
    setSortDirection(next.direction);
    setPage(1);
  };

  const rawItems = view.state === 'loaded' ? view.items : [];

  const sortedItems = useMemo(() => {
    return sortItems(
      rawItems,
      (item) => {
        if (sortKey === 'clientName') {
          return `${item.clientName} ${item.repairerName}`;
        }
        if (sortKey === 'requestedByName') {
          return item.requestedByName ?? '';
        }
        if (sortKey === 'reason') {
          return CANCELLATION_REASON_LABEL[item.reason] ?? item.reason;
        }
        if (sortKey === 'decidedByName') {
          return item.decidedByName ?? '';
        }
        return (item as unknown as Record<string, unknown>)[sortKey ?? 'createdAt'];
      },
      sortDirection
    );
  }, [rawItems, sortKey, sortDirection]);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, page, pageSize]);

  // CSV export
  const handleExportCsv = () => {
    const columns: CsvColumn<AdminCancellationListItem>[] = [
      { key: 'id', label: 'ID Demande' },
      { key: 'commandeId', label: 'ID Commande' },
      { key: 'demandeTitle', label: 'Demande' },
      {
        key: 'requestedByName',
        label: 'Demandé par',
        format: (val) => (isDeletedUser(val as string) ? DELETED_USER_NAME : (val as string)),
      },
      {
        key: 'requestedByRole',
        label: 'Rôle demandeur',
        format: (val) =>
          val === 'CLIENT' ? 'Client' : val === 'REPAIRER' ? 'Réparateur' : 'Admin',
      },
      {
        key: 'reason',
        label: 'Motif',
        format: (val) => CANCELLATION_REASON_LABEL[val as CancellationReason] ?? (val as string),
      },
      {
        key: 'clientName',
        label: 'Client',
        format: (val) => (isDeletedUser(val as string) ? DELETED_USER_NAME : (val as string)),
      },
      {
        key: 'repairerName',
        label: 'Réparateur',
        format: (val) => (isDeletedUser(val as string) ? DELETED_USER_NAME : (val as string)),
      },
      {
        key: 'totalCents',
        label: 'Montant (€)',
        format: (val) => formatEuros(val as number),
      },
      {
        key: 'step',
        label: 'Étape gelée',
        format: (val) => frozenStepLabel(val as string | null),
      },
      {
        key: 'status',
        label: 'Statut',
        format: (_, row) => cancellationStatusLabel(row.status),
      },
      {
        key: 'createdAt',
        label: 'Demandée le',
        format: (val) => new Date(val as string).toLocaleDateString('fr-FR'),
      },
      {
        key: 'decidedByName',
        label: 'Traité par',
        format: (_, row) =>
          row.decidedByName
            ? `${isDeletedUser(row.decidedByName) ? DELETED_USER_NAME : row.decidedByName}${row.decidedAt ? ` (${new Date(row.decidedAt).toLocaleDateString('fr-FR')})` : ''}`
            : '—',
      },
    ];

    const csv = generateCsv(columns, sortedItems);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(`annulations-${tab.toLowerCase()}-${dateStr}.csv`, csv);
  };

  return (
    <div className="page page--wide">
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 6px 0' }}>Annulations</h1>
          <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
            Demandes d&apos;annulation après paiement
          </p>
        </div>

        {rawItems.length > 0 && (
          <CsvExportButton
            onClick={handleExportCsv}
            count={sortedItems.length}
            label="Exporter en CSV"
          />
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--line, #dfe2e2)',
          marginBottom: '20px',
        }}
      >
        {(['PENDING', 'HISTORY'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
            style={{
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: tab === t ? 600 : 500,
              color: tab === t ? 'var(--ink, #141414)' : 'var(--muted, #6b7280)',
              background: 'none',
              border: 'none',
              borderRadius: 0,
              borderBottom: tab === t ? '2px solid var(--navy, #25324f)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {t === 'PENDING' ? 'En attente' : 'Historique'}
          </button>
        ))}
      </div>

      {view.state === 'loading' && (
        <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement…</p>
      )}
      {view.state === 'error' && (
        <p role="alert" style={{ color: 'var(--red-text, #bd0e26)', marginBottom: '16px' }}>
          {view.message}
        </p>
      )}

      {view.state === 'loaded' && (
        view.items.length === 0 ? (
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
            <p style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 6px 0', color: 'var(--ink, #141414)' }}>
              Aucune demande d&apos;annulation
            </p>
            <p style={{ fontSize: '13px', margin: 0 }}>
              {tab === 'PENDING'
                ? 'Aucune demande d\'annulation n\'est en attente de traitement.'
                : 'L\'historique des demandes d\'annulation est vide.'}
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                backgroundColor: 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-card, 8px)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                overflowX: 'auto',
              }}
            >
              <table className="table" style={{ width: '100%', minWidth: tab === 'HISTORY' ? '1180px' : '1040px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <SortableTh
                      columnKey="demandeTitle"
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Demande"
                      onSort={handleSort}
                    />
                    <SortableTh
                      columnKey="requestedByName"
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Demandé par"
                      onSort={handleSort}
                    />
                    <SortableTh
                      columnKey="reason"
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Motif"
                      onSort={handleSort}
                    />
                    <SortableTh
                      columnKey="clientName"
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Client → Réparateur"
                      onSort={handleSort}
                    />
                    <SortableTh
                      columnKey="totalCents"
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Montant"
                      align="right"
                      onSort={handleSort}
                    />
                    <SortableTh
                      columnKey="step"
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Étape gelée"
                      onSort={handleSort}
                    />
                    <SortableTh
                      columnKey="status"
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Statut"
                      onSort={handleSort}
                    />
                    <SortableTh
                      columnKey="createdAt"
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Demandée le"
                      onSort={handleSort}
                    />
                    {tab === 'HISTORY' && (
                      <SortableTh
                        columnKey="decidedByName"
                        activeKey={sortKey}
                        direction={sortDirection}
                        label="Traité par"
                        onSort={handleSort}
                      />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item) => {
                    const isClientDeleted = isDeletedUser(item.clientName);
                    const isRepairerDeleted = isDeletedUser(item.repairerName);
                    const isRequesterDeleted = isDeletedUser(item.requestedByName);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        style={{
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--line, #dfe2e2)',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>
                            {item.demandeTitle}
                          </div>
                          <div style={{ marginTop: '2px' }}>
                            <CopyableReference
                              value={item.commandeId}
                              prefix="CMD"
                              href={`/paiements?commande=${item.commandeId}`}
                            />
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 500, color: 'var(--ink, #141414)' }}>
                              {isRequesterDeleted ? DELETED_USER_NAME : item.requestedByName}
                            </span>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '1px 6px',
                                borderRadius: '9999px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor:
                                  item.requestedByRole === 'CLIENT'
                                    ? 'var(--badge-info-bg)'
                                    : item.requestedByRole === 'REPAIRER'
                                    ? 'var(--badge-warning-bg)'
                                    : 'var(--badge-neutral-bg)',
                                color:
                                  item.requestedByRole === 'CLIENT'
                                    ? 'var(--badge-info-text)'
                                    : item.requestedByRole === 'REPAIRER'
                                    ? 'var(--badge-warning-text)'
                                    : 'var(--ink2)',
                                border: `1px solid ${
                                  item.requestedByRole === 'CLIENT'
                                    ? 'var(--badge-info-border)'
                                    : item.requestedByRole === 'REPAIRER'
                                    ? 'var(--badge-warning-border)'
                                    : 'var(--line)'
                                }`,
                              }}
                            >
                              {item.requestedByRole === 'CLIENT'
                                ? 'Client'
                                : item.requestedByRole === 'REPAIRER'
                                ? 'Réparateur'
                                : 'Admin'}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--ink, #141414)' }}>
                          {CANCELLATION_REASON_LABEL[item.reason] ?? item.reason}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                          {isClientDeleted ? DELETED_USER_NAME : item.clientName} →{' '}
                          {isRepairerDeleted ? DELETED_USER_NAME : item.repairerName}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {formatEuros(item.totalCents)}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                          {frozenStepLabel(item.step)}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: item.status === 'PENDING' ? 'var(--badge-warning-bg)' : 'var(--badge-neutral-bg)',
                              color: item.status === 'PENDING' ? 'var(--badge-warning-text)' : 'var(--ink2)',
                              border: `1px solid ${item.status === 'PENDING' ? 'var(--badge-warning-border)' : 'var(--line)'}`,
                            }}
                          >
                            {cancellationStatusLabel(item.status)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                          {new Date(item.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        {tab === 'HISTORY' && (
                          <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                            {item.decidedByName ? (
                              <>
                                <div style={{ fontWeight: 500, color: 'var(--ink, #141414)' }}>
                                  {isDeletedUser(item.decidedByName) ? DELETED_USER_NAME : item.decidedByName}
                                </div>
                                {item.decidedAt && (
                                  <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                                    le {new Date(item.decidedAt).toLocaleDateString('fr-FR')}
                                  </div>
                                )}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ListPagination
              page={page}
              pageSize={pageSize}
              total={sortedItems.length}
              noun="demande"
              pluralNoun="demandes"
              onPageChange={(p) => setPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </>
        )
      )}

      <CancellationDrawer
        id={selectedId}
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        onDecided={() => void load()}
      />
    </div>
  );
}
