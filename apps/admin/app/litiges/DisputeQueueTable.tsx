'use client';

import {
  DISPUTE_MOTIFS,
  DELETED_USER_NAME,
  formatDisputeRef,
  type AdminDisputeListItem,
} from '@revime/shared';
import { formatEuros } from '../../lib/money';
import { CopyableReference } from '../../components/CopyableReference';
import { isDeletedUser } from '../../lib/user-display';
import { SortableTh } from '../../components/SortableTh';
import type { SortDirection } from '../../lib/table-sort';
import { AssigneePicker } from '../../components/AssigneePicker';

export interface DisputeQueueTableProps {
  items: AdminDisputeListItem[];
  onOpenDossier: (disputeId: string) => void;
  currentUserId?: string | null;
  onDisputeAssigned?: (disputeId: string, newAssigneeId: string | null, newAssigneeName: string | null) => void;
  sortKey?: string | null;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'OPEN':
      return {
        label: 'Ouvert',
        bg: 'var(--badge-warning-bg)',
        color: 'var(--badge-warning-text)',
        border: 'var(--badge-warning-border)',
      };
    case 'IN_REVIEW':
      return {
        label: "En cours d'examen",
        bg: 'var(--badge-info-bg)',
        color: 'var(--badge-info-text)',
        border: 'var(--badge-info-border)',
      };
    case 'RESOLVED_RELEASED':
      return {
        label: 'Versé au réparateur',
        bg: 'var(--badge-success-bg)',
        color: 'var(--badge-success-text)',
        border: 'var(--badge-success-border)',
      };
    case 'RESOLVED_REFUNDED':
      return {
        label: 'Remboursé au client',
        bg: 'var(--badge-danger-bg)',
        color: 'var(--badge-danger-text)',
        border: 'var(--badge-danger-border)',
      };
    case 'RESOLVED_DISMISSED':
      return {
        label: 'Réparation reprise',
        bg: 'var(--badge-neutral-bg)',
        color: 'var(--ink2)',
        border: 'var(--line)',
      };
    default:
      return {
        label: status,
        bg: 'var(--badge-neutral-bg)',
        color: 'var(--ink2)',
        border: 'var(--line)',
      };
  }
}

function getInitiatorBadge(initiator: string) {
  switch (initiator) {
    case 'CLIENT':
      return { label: 'Client', bg: 'var(--badge-info-bg)', color: 'var(--badge-info-text)', border: 'var(--badge-info-border)' };
    case 'REPAIRER':
      return { label: 'Réparateur', bg: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: 'var(--badge-warning-border)' };
    case 'ADMIN':
      return { label: 'Admin', bg: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', border: 'var(--badge-success-border)' };
    case 'STRIPE':
      return { label: 'Stripe', bg: 'var(--badge-danger-bg)', color: 'var(--badge-danger-text)', border: 'var(--badge-danger-border)' };
    default:
      return { label: initiator, bg: 'var(--badge-neutral-bg)', color: 'var(--ink2)', border: 'var(--line)' };
  }
}

export function DisputeQueueTable({
  items,
  onOpenDossier,
  currentUserId = null,
  onDisputeAssigned,
  sortKey = null,
  sortDirection = 'desc',
  onSort,
}: DisputeQueueTableProps) {
  return (
    <div
      style={{
        overflowX: 'auto',
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <table className="table" style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {onSort ? (
              <SortableTh
                columnKey="disputeNumber"
                activeKey={sortKey}
                direction={sortDirection}
                label="N° Litige"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px' }}>N° Litige</th>
            )}
            {onSort ? (
              <SortableTh
                columnKey="createdAt"
                activeKey={sortKey}
                direction={sortDirection}
                label="Référence & Date"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px' }}>Référence & Date</th>
            )}
            {onSort ? (
              <SortableTh
                columnKey="initiator"
                activeKey={sortKey}
                direction={sortDirection}
                label="Initiateur"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px' }}>Initiateur</th>
            )}
              <th style={{ padding: '10px 12px' }}>Motif</th>
            {onSort ? (
              <SortableTh
                columnKey="clientName"
                activeKey={sortKey}
                direction={sortDirection}
                label="Client"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px' }}>Client</th>
            )}
            {onSort ? (
              <SortableTh
                columnKey="repairerName"
                activeKey={sortKey}
                direction={sortDirection}
                label="Réparateur"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px' }}>Réparateur</th>
            )}
            {onSort ? (
              <SortableTh
                columnKey="totalCents"
                activeKey={sortKey}
                direction={sortDirection}
                label="Montant bloqué"
                align="right"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Montant bloqué</th>
            )}
              <th style={{ padding: '10px 12px' }}>Assigné à</th>
              <th style={{ padding: '10px 12px' }}>Statut</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const statusStyle = getStatusBadge(row.status);
            const initiatorStyle = getInitiatorBadge(row.initiator);
            const motifLabel = row.motif ? (DISPUTE_MOTIFS[row.motif]?.label ?? row.reason) : row.reason;
            const isClientDeleted = isDeletedUser(row.clientName, row.clientEmail);
            const isRepairerDeleted = isDeletedUser(row.repairerName, row.repairerEmail);

            return (
              <tr
                key={row.id}
                onClick={() => onOpenDossier(row.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* 0. N° Litige */}
                <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--ink, #141414)',
                      backgroundColor: 'var(--badge-info-bg)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {formatDisputeRef(row.number)}
                  </span>
                </td>

                {/* 1. Référence & Date */}
                <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  <div>
                    <CopyableReference
                      value={row.commandeId}
                      prefix="CMD"
                      href={`/paiements?commande=${row.commandeId}`}
                    />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                    {formatDate(row.createdAt)}
                  </div>
                  {row.commandeStatus === 'REFUNDED' && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginTop: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--badge-danger-bg)',
                        color: 'var(--badge-danger-text)',
                        border: '1px solid var(--badge-danger-border)',
                      }}
                    >
                      Commande remboursée
                    </div>
                  )}
                </td>

                {/* 2. Initiateur badge */}
                <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                  <span
                    className="badge"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      backgroundColor: initiatorStyle.bg,
                      color: initiatorStyle.color,
                      border: `1px solid ${initiatorStyle.border}`,
                    }}
                  >
                    {initiatorStyle.label}
                  </span>
                </td>

                {/* 3. Motif */}
                <td style={{ padding: '10px 12px', verticalAlign: 'middle', maxWidth: '170px' }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--ink, #141414)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={motifLabel}
                  >
                    {motifLabel}
                  </div>
                  {row.motif && row.reason && DISPUTE_MOTIFS[row.motif]?.label !== row.reason && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--muted, #6b7280)',
                        marginTop: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={row.reason}
                    >
                      {row.reason}
                    </div>
                  )}
                </td>

                {/* 4. Client (compacted with ellipsis and title tooltip) */}
                <td style={{ padding: '10px 12px', verticalAlign: 'middle', maxWidth: '150px' }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '13px',
                      color: 'var(--ink, #141414)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '150px',
                    }}
                    title={isClientDeleted ? DELETED_USER_NAME : (row.clientName || 'Client inconnu')}
                  >
                    {isClientDeleted ? DELETED_USER_NAME : (row.clientName || 'Client inconnu')}
                  </div>
                  {!isClientDeleted && row.clientEmail && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--muted, #6b7280)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '150px',
                      }}
                      title={row.clientEmail}
                    >
                      {row.clientEmail}
                    </div>
                  )}
                </td>

                {/* 5. Réparateur (compacted with ellipsis and title tooltip) */}
                <td style={{ padding: '10px 12px', verticalAlign: 'middle', maxWidth: '150px' }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '13px',
                      color: 'var(--ink, #141414)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '150px',
                    }}
                    title={isRepairerDeleted ? DELETED_USER_NAME : (row.repairerName || 'Réparateur inconnu')}
                  >
                    {isRepairerDeleted ? DELETED_USER_NAME : (row.repairerName || 'Réparateur inconnu')}
                  </div>
                  {!isRepairerDeleted && row.repairerEmail && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--muted, #6b7280)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '150px',
                      }}
                      title={row.repairerEmail}
                    >
                      {row.repairerEmail}
                    </div>
                  )}
                </td>

                {/* 6. Montant bloqué */}
                <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--badge-danger-text)' }}>
                    {formatEuros(row.totalCents)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', marginTop: '2px' }}>
                    dont {formatEuros(row.repairCents)} prestation
                  </div>
                </td>

                {/* 7. Assigné à */}
                <td
                  style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <AssigneePicker
                    disputeId={row.id}
                    currentAssigneeId={row.assignedToUserId}
                    currentAssigneeName={row.assignedToName}
                    currentUserId={currentUserId}
                    onAssigned={(newId, newName) => {
                      onDisputeAssigned?.(row.id, newId, newName);
                    }}
                  />
                </td>

                {/* 8. Statut badge */}
                <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  <span
                    className="badge"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.color,
                      border: `1px solid ${statusStyle.border}`,
                    }}
                  >
                    {statusStyle.label}
                  </span>
                </td>

                {/* 9. Action button */}
                <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDossier(row.id);
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: 'var(--navy, #25324f)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 'var(--r-field, 4px)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'opacity 0.15s ease',
                    }}
                  >
                    Examiner le dossier
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
