'use client';

import { useEffect, useMemo, useState } from 'react';
import { ATTENTION_REASON_LABEL, ATTENTION_UNDISMISSABLE_REASONS, type AttentionReason } from '@revime/shared';
import {
  attentionAmount,
  attentionStatusLabel,
  attentionStepLabel,
  getStripePaymentUrl,
} from '../../lib/attention-format';
import { formatEuros } from '../../lib/money';
import { sortItems, toggleSort, type SortDirection } from '../../lib/table-sort';
import { generateCsv, downloadCsv, type CsvColumn } from '../../lib/export-csv';
import { syncUrlParams } from '../../lib/url-sync';
import { ListPagination } from '../../components/ListPagination';
import { SortableTh } from '../../components/SortableTh';
import { CsvExportButton } from '../../components/CsvExportButton';
import { CopyableReference, formatShortReference } from '../../components/CopyableReference';
import { DismissAttentionModal } from '../../components/DismissAttentionModal';

export type AttentionItem = {
  commandeId: string;
  demandeTitle: string;
  clientName?: string;
  repairerName?: string;
  reasons?: AttentionReason[];
  reason?: AttentionReason;
  status: string;
  step: string | null;
  totalCents: number;
  since: string;
  stripePaymentIntentId?: string | null;
  stripeSessionId?: string | null;
  details?: Record<string, unknown>;
};

export function getAttentionReasons(item: AttentionItem): AttentionReason[] {
  if (Array.isArray(item.reasons) && item.reasons.length > 0) {
    return item.reasons;
  }
  if (item.reason) {
    return [item.reason];
  }
  return [];
}

export type AttentionTableProps = {
  items: AttentionItem[];
  cancellingId?: string | null;
  sortKey?: string | null;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
  onCancel: (commandeId: string) => void | Promise<void>;
  onDismiss?: (item: AttentionItem) => void;
};

export function AttentionTable({
  items,
  cancellingId,
  sortKey = null,
  sortDirection = 'desc',
  onSort,
  onCancel,
  onDismiss,
}: AttentionTableProps) {
  return (
    <div
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        overflowX: 'auto',
      }}
    >
      <table className="table" style={{ width: '100%', minWidth: '940px', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <SortableTh
              columnKey="demandeTitle"
              activeKey={sortKey}
              direction={sortDirection}
              label="Demande"
              onSort={onSort}
            />
            <th
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted, #6b7280)',
                borderBottom: '1px solid var(--line, #dfe2e2)',
              }}
            >
              Anomalies
            </th>
            <SortableTh
              columnKey="status"
              activeKey={sortKey}
              direction={sortDirection}
              label="Statut"
              onSort={onSort}
            />
            <SortableTh
              columnKey="step"
              activeKey={sortKey}
              direction={sortDirection}
              label="Étape"
              onSort={onSort}
            />
            <SortableTh
              columnKey="totalCents"
              activeKey={sortKey}
              direction={sortDirection}
              label="Montant"
              align="right"
              onSort={onSort}
            />
            <SortableTh
              columnKey="since"
              activeKey={sortKey}
              direction={sortDirection}
              label="Depuis"
              onSort={onSort}
            />
            <th
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted, #6b7280)',
                borderBottom: '1px solid var(--line, #dfe2e2)',
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const reasons = getAttentionReasons(item);
            return (
              <tr key={item.commandeId} style={{ borderBottom: '1px solid var(--line, #dfe2e2)' }}>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>{item.demandeTitle}</div>
                  <div style={{ marginTop: '3px' }}>
                    <CopyableReference
                      value={item.commandeId}
                      prefix="CMD"
                      href={`/commandes/${encodeURIComponent(item.commandeId)}`}
                    />
                  </div>
                  {(item.clientName || item.repairerName) && (
                    <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                      {item.clientName ?? ''} {item.clientName && item.repairerName ? '→ ' : ''}{item.repairerName ?? ''}
                    </div>
                  )}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {reasons.map((r) => (
                      <span
                        key={r}
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: 'var(--red-soft, #feedf0)',
                          color: 'var(--red-text, #bd0e26)',
                          border: '1px solid var(--badge-danger-border)',
                        }}
                      >
                        {ATTENTION_REASON_LABEL[r] ?? r}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                  {attentionStatusLabel(item.status)}
                </td>
                <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                  {attentionStepLabel(item.step, item.status)}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {attentionAmount(item.totalCents)}
                </td>
                <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                  {new Date(item.since).toLocaleDateString('fr-FR')}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Contextual link based on reasons */}
                    {reasons.includes('CANCELLATION_REQUESTED') ? (
                      <a
                        href={`/annulations?id=${item.commandeId}`}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: 'var(--paper, #ffffff)',
                          border: '1px solid var(--line, #dfe2e2)',
                          borderRadius: 'var(--r-field, 4px)',
                          color: 'var(--ink, #141414)',
                          textDecoration: 'none',
                        }}
                      >
                        Examiner l&#39;annulation
                      </a>
                    ) : reasons.includes('DISPUTED') || reasons.includes('DISPUTE_REPLY') ? (
                      <a
                        href={`/litiges?q=${item.commandeId}`}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: 'var(--paper, #ffffff)',
                          border: '1px solid var(--line, #dfe2e2)',
                          borderRadius: 'var(--r-field, 4px)',
                          color: 'var(--ink, #141414)',
                          textDecoration: 'none',
                        }}
                      >
                        Voir le litige
                      </a>
                    ) : reasons.includes('PARCEL_BLOCKED') || reasons.includes('PARCEL_INCIDENT') ? (
                      <a
                        href={`/colis?commandeId=${item.commandeId}`}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: 'var(--badge-info-bg)',
                          border: '1px solid var(--badge-info-border)',
                          borderRadius: 'var(--r-field, 4px)',
                          color: 'var(--badge-info-text)',
                          textDecoration: 'none',
                        }}
                      >
                        Gérer le colis
                      </a>
                    ) : reasons.includes('CHARGE_MISSING') ? (
                      <>
                        <a
                          href={getStripePaymentUrl(item)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            backgroundColor: 'var(--badge-info-bg)',
                            border: '1px solid var(--badge-info-border)',
                            borderRadius: 'var(--r-field, 4px)',
                            color: 'var(--badge-info-text)',
                            textDecoration: 'none',
                          }}
                        >
                          Vérifier dans Stripe
                        </a>
                        <button
                          type="button"
                          onClick={() => onCancel(item.commandeId)}
                          disabled={cancellingId === item.commandeId}
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            backgroundColor: 'var(--red-soft, #feedf0)',
                            border: '1px solid var(--badge-danger-border)',
                            borderRadius: 'var(--r-field, 4px)',
                            color: 'var(--red-text, #bd0e26)',
                            cursor: cancellingId === item.commandeId ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {cancellingId === item.commandeId ? 'Annulation...' : 'Annuler la commande'}
                        </button>
                      </>
                    ) : (
                      <a
                        href={`/remboursement?commande=${item.commandeId}`}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: 'var(--badge-info-bg)',
                          border: '1px solid var(--badge-info-border)',
                          borderRadius: 'var(--r-field, 4px)',
                          color: 'var(--badge-info-text)',
                          textDecoration: 'none',
                        }}
                      >
                        Rembourser
                      </a>
                    )}

                    {/* Marquer comme traité: not offered when the dossier ends by acting (API refuses it too) */}
                    {!reasons.some((r) => ATTENTION_UNDISMISSABLE_REASONS.includes(r)) && (
                    <button
                      type="button"
                      onClick={() => onDismiss?.(item)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 500,
                        backgroundColor: 'var(--paper, #ffffff)',
                        border: '1px solid var(--line, #dfe2e2)',
                        borderRadius: 'var(--r-field, 4px)',
                        color: 'var(--navy-text, #25324f)',
                        cursor: 'pointer',
                      }}
                    >
                      Marquer comme traité
                    </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AttentionPage({ initialItems }: { initialItems?: AttentionItem[] } = {}) {
  const [items, setItems] = useState<AttentionItem[]>(initialItems ?? []);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dismiss modal state
  const [dismissingItem, setDismissingItem] = useState<AttentionItem | null>(null);
  const [isDismissSubmitting, setIsDismissSubmitting] = useState(false);
  const [dismissSuccessMessage, setDismissSuccessMessage] = useState<string | null>(null);

  // Sorting & pagination state
  const [sortKey, setSortKey] = useState<string | null>('since');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [reasonFilter, setReasonFilter] = useState('ALL');

  useEffect(() => {
    // Read initial URL params on mount
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const urlPage = Number(sp.get('page'));
      const urlPageSize = Number(sp.get('pageSize'));
      const urlSort = sp.get('sort');
      const urlDir = sp.get('dir') as SortDirection | null;
      const urlReason = sp.get('reason');

      if (urlPage > 0) setPage(urlPage);
      if (urlPageSize > 0) setPageSize(urlPageSize);
      if (urlSort) setSortKey(urlSort);
      if (urlDir === 'asc' || urlDir === 'desc') setSortDirection(urlDir);
      if (urlReason) setReasonFilter(urlReason);
    }
    if (!initialItems) {
      loadItems();
    }
  }, [initialItems]);

  // Sync state to URL query params
  useEffect(() => {
    syncUrlParams(
      {
        page,
        pageSize,
        sort: sortKey,
        dir: sortDirection,
        reason: reasonFilter,
      },
      {
        page: 1,
        pageSize: 10,
        sort: 'since',
        dir: 'desc',
        reason: 'ALL',
      }
    );
  }, [page, pageSize, sortKey, sortDirection, reasonFilter]);

  async function loadItems() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/proxy/admin/commandes/attention');

      if (!response.ok) {
        const data = await response.json();
        setError(data.error?.message || 'Impossible de charger les éléments.');
        setLoading(false);
        return;
      }

      const data = await response.json();
      setItems(data);
    } catch {
      setError('Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(commandeId: string) {
    if (
      !window.confirm(
        'Annuler cette commande ? Stripe est d’abord interrogé : si un paiement existe, la commande n’est pas annulée et vous devez la rembourser. Sinon la commande est annulée et la demande est clôturée.'
      )
    ) {
      return;
    }

    setCancellingId(commandeId);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/proxy/admin/commandes/${encodeURIComponent(commandeId)}/cancel`,
        { method: 'POST' }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setActionError(data?.error?.message || data?.message || "Impossible d'annuler la commande.");
        return;
      }

      await loadItems();
    } catch {
      setActionError("Une erreur est survenue lors de l'annulation.");
    } finally {
      setCancellingId(null);
    }
  }

  async function handleConfirmDismiss(reason: string) {
    if (!dismissingItem) return;
    setIsDismissSubmitting(true);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/proxy/admin/commandes/${encodeURIComponent(dismissingItem.commandeId)}/attention/dismiss`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setActionError(data?.error?.message || data?.message || "Impossible de retirer la commande de la surveillance.");
        return;
      }

      const dismissedId = dismissingItem.commandeId;
      setItems((prev) => prev.filter((i) => i.commandeId !== dismissedId));
      setDismissSuccessMessage(`La commande ${formatShortReference(dismissedId)} a été retirée de la surveillance.`);
      setDismissingItem(null);
    } catch {
      setActionError("Une erreur est survenue lors du classement.");
    } finally {
      setIsDismissSubmitting(false);
    }
  }

  const handleSort = (key: string) => {
    const next = toggleSort(sortKey, key, sortDirection);
    setSortKey(next.key);
    setSortDirection(next.direction);
    setPage(1);
  };

  // Distinct reasons present in active items
  const availableReasons = useMemo(() => {
    return Array.from(new Set(items.flatMap(getAttentionReasons)));
  }, [items]);

  // Filtered & sorted items
  const filteredItems = useMemo(() => {
    if (reasonFilter === 'ALL') return items;
    return items.filter((item) => getAttentionReasons(item).includes(reasonFilter as AttentionReason));
  }, [items, reasonFilter]);

  const sortedItems = useMemo(() => {
    return sortItems(filteredItems, sortKey as keyof AttentionItem | null, sortDirection);
  }, [filteredItems, sortKey, sortDirection]);

  // Paginated items
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, page, pageSize]);

  // CSV Export handler
  const handleExportCsv = () => {
    const columns: CsvColumn<AttentionItem>[] = [
      { key: 'commandeId', label: 'ID Commande' },
      { key: 'demandeTitle', label: 'Demande' },
      {
        key: 'reasons' as any,
        label: 'Anomalies',
        format: (_val, row) =>
          getAttentionReasons(row)
            .map((r) => ATTENTION_REASON_LABEL[r] ?? r)
            .join(', '),
      },
      {
        key: 'status',
        label: 'Statut',
        format: (val) => attentionStatusLabel(val as string),
      },
      {
        key: 'step',
        label: 'Étape',
        format: (val, row) => attentionStepLabel(val as string | null, row.status),
      },
      {
        key: 'totalCents',
        label: 'Montant (€)',
        format: (val) => formatEuros(val as number),
      },
      {
        key: 'since',
        label: 'Depuis',
        format: (val) => new Date(val as string).toLocaleDateString('fr-FR'),
      },
    ];

    const csv = generateCsv(columns, sortedItems);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(`commandes-attention-${dateStr}.csv`, csv);
  };

  return (
    <div className="page page--wide">
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
          <h1 style={{ margin: '0 0 6px 0' }}>Commandes nécessitant une attention</h1>
          <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
            Commandes présentant une anomalie ou bloquées nécessitant une intervention manuelle
          </p>
        </div>

        {items.length > 0 && (
          <CsvExportButton
            onClick={handleExportCsv}
            count={sortedItems.length}
            label="Exporter en CSV"
          />
        )}
      </div>

      {/* Dismiss Confirmation Toast / Alert */}
      {dismissSuccessMessage && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            backgroundColor: 'var(--badge-success-bg)',
            border: '1px solid var(--badge-success-border)',
            borderRadius: 'var(--r-card, 8px)',
            color: 'var(--badge-success-text)',
            fontSize: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✓ {dismissSuccessMessage}</span>
          <button
            type="button"
            onClick={() => setDismissSuccessMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--badge-success-text)',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter row */}
      {items.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="reason-filter" style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', margin: 0 }}>
              Filtrer par motif :
            </label>
            <select
              id="reason-filter"
              value={reasonFilter}
              onChange={(e) => {
                setReasonFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '6px 10px',
                fontSize: '13px',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                backgroundColor: 'var(--paper, #ffffff)',
                color: 'var(--ink, #141414)',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">Tous les motifs ({items.length})</option>
              {availableReasons.map((r) => (
                <option key={r} value={r}>
                  {ATTENTION_REASON_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading && <p style={{ color: 'var(--muted, #6b7280)', padding: '24px 0' }}>Chargement...</p>}
      {error && <p role="alert" style={{ color: 'var(--red-text, #bd0e26)', marginBottom: '16px' }}>{error}</p>}
      {actionError && (
        <p role="alert" style={{ color: 'var(--red-text, #bd0e26)', marginBottom: '16px' }}>
          {actionError}
        </p>
      )}

      {!loading && items.length === 0 && (
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
            Aucune commande à surveiller
          </p>
          <p style={{ fontSize: '13px', margin: 0 }}>
            Toutes les transactions sont conformes et aucune anomalie n&apos;a été détectée.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <AttentionTable
            items={paginatedItems}
            cancellingId={cancellingId}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onCancel={handleCancel}
            onDismiss={(item) => setDismissingItem(item)}
          />

          <ListPagination
            page={page}
            pageSize={pageSize}
            total={sortedItems.length}
            noun="commande"
            pluralNoun="commandes"
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </>
      )}

      {/* Dismiss Attention Modal */}
      <DismissAttentionModal
        isOpen={dismissingItem !== null}
        onClose={() => setDismissingItem(null)}
        onConfirm={handleConfirmDismiss}
        submitting={isDismissSubmitting}
        commandeId={dismissingItem?.commandeId}
        demandeTitle={dismissingItem?.demandeTitle}
        clientName={dismissingItem?.clientName}
        repairerName={dismissingItem?.repairerName}
        reasons={dismissingItem ? getAttentionReasons(dismissingItem) : []}
      />
    </div>
  );
}
