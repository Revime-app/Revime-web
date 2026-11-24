'use client';

import Link from 'next/link';
import type { AdminPaymentListItem } from '@revime/shared';
import { STEP_LABEL } from '@revime/shared';
import { useAdminMe } from '../../components/AdminGate';
import { hasPermission } from '../../lib/permissions';
import { formatEuros } from '../../lib/money';
import { CopyableReference } from '../../components/CopyableReference';
import { isDeletedUser, DELETED_USER_NAME } from '../../lib/user-display';
import { SortableTh } from '../../components/SortableTh';
import type { SortDirection } from '../../lib/table-sort';
import { Info, TriangleAlert } from 'lucide-react';
import { Icon } from '../../components/Icon';

export interface PaymentsTableProps {
  items: AdminPaymentListItem[];
  onOpenDispute: (commandeId: string) => void;
  sortKey?: string | null;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; border: string }
> = {
  PAID: {
    label: 'Payé',
    bg: 'var(--badge-success-bg)',
    color: 'var(--badge-success-text)',
    border: 'var(--badge-success-border)',
  },
  PENDING_PAYMENT: {
    label: 'En attente de paiement',
    bg: 'var(--badge-warning-bg)',
    color: 'var(--badge-warning-text)',
    border: 'var(--badge-warning-border)',
  },
  ABANDONED: {
    label: 'Abandonnée',
    bg: 'var(--badge-neutral-bg)',
    color: 'var(--muted)',
    border: 'var(--line)',
  },
  REFUNDED: {
    label: 'Remboursée',
    bg: 'var(--badge-info-bg)',
    color: 'var(--badge-info-text)',
    border: 'var(--badge-info-border)',
  },
};

const DELIVERY_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; border: string }
> = {
  HOME: {
    label: 'Domicile',
    bg: 'var(--badge-info-bg)',
    color: 'var(--badge-info-text)',
    border: 'var(--badge-info-border)',
  },
  WORKSHOP: {
    label: 'Atelier',
    bg: 'var(--badge-neutral-bg)',
    color: 'var(--ink2)',
    border: 'var(--line)',
  },
  PARCEL: {
    label: 'Colis',
    bg: 'var(--badge-warning-bg)',
    color: 'var(--badge-warning-text)',
    border: 'var(--badge-warning-border)',
  },
};

function getStepBadge(step: string | null, status?: string) {
  if (status === 'REFUNDED' || !step) {
    return {
      label: '—',
      bg: 'var(--badge-neutral-bg)',
      color: 'var(--faint)',
      border: 'var(--line)',
    };
  }

  const label = (STEP_LABEL as Record<string, string>)[step] ?? step;

  if (step === 'RELEASED') {
    return {
      label,
      bg: 'var(--badge-success-bg)',
      color: 'var(--badge-success-text)',
      border: 'var(--badge-success-border)',
    };
  }
  if (step === 'AWAITING_VALIDATION') {
    return {
      label,
      bg: 'var(--badge-warning-bg)',
      color: 'var(--badge-warning-text)',
      border: 'var(--badge-warning-border)',
    };
  }
  return {
    label,
    bg: 'var(--badge-neutral-bg)',
    color: 'var(--ink2)',
    border: 'var(--line)',
  };
}

export function PaymentsTable({
  items,
  onOpenDispute,
  sortKey = null,
  sortDirection = 'desc',
  onSort,
}: PaymentsTableProps) {
  // CF4-40: display only - the API answers 403 to a role without the permission.
  const adminMe = useAdminMe();
  const canDispute = hasPermission(adminMe, 'disputes.handle');

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
      <table className="table" style={{ width: '100%', minWidth: '940px', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {onSort ? (
              <SortableTh
                columnKey="createdAt"
                activeKey={sortKey}
                direction={sortDirection}
                label="ID / Date"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px' }}>ID / Date</th>
            )}
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
                label="Total (€)"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px' }}>Total (€)</th>
            )}
              <th style={{ padding: '10px 12px' }}>Versement réparateur</th>
            {onSort ? (
              <SortableTh
                columnKey="delivery"
                activeKey={sortKey}
                direction={sortDirection}
                label="Livraison"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px' }}>Livraison</th>
            )}
            {onSort ? (
              <SortableTh
                columnKey="step"
                activeKey={sortKey}
                direction={sortDirection}
                label="Étape escrow"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px' }}>Étape escrow</th>
            )}
            {onSort ? (
              <SortableTh
                columnKey="status"
                activeKey={sortKey}
                direction={sortDirection}
                label="Statut"
                onSort={onSort}
              />
            ) : (
              <th style={{ padding: '10px 12px' }}>Statut</th>
            )}
              <th style={{ padding: '10px 12px' }}>Litige</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const statusStyle = STATUS_CONFIG[row.status] ?? {
              label: row.status,
              bg: 'var(--badge-neutral-bg)',
              color: 'var(--ink2)',
              border: 'var(--line)',
            };
            const deliveryStyle = DELIVERY_CONFIG[row.delivery] ?? {
              label: row.delivery,
              bg: 'var(--badge-neutral-bg)',
              color: 'var(--ink2)',
              border: 'var(--line)',
            };
            const stepStyle = getStepBadge(row.step, row.status);
            const isDisputed = row.status !== 'REFUNDED' && Boolean(row.isDisputed);
            const isPaid = row.status === 'PAID';
            const isClientDeleted = isDeletedUser(row.clientName, row.clientEmail);
            const isRepairerDeleted = isDeletedUser(row.repairerName, row.repairerEmail);

            return (
              <tr key={row.id}>
                {/* ID / Date */}
                <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  <div>
                    <CopyableReference
                      value={row.id}
                      prefix="CMD"
                      href={`/commandes/${encodeURIComponent(row.id)}`}
                    />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)', marginTop: '3px' }}>
                    {new Date(row.createdAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </td>

                {/* Client (compacted with ellipsis and title tooltip) */}
                <td style={{ padding: '10px 12px', verticalAlign: 'top', maxWidth: '150px' }}>
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
                    title={isClientDeleted ? DELETED_USER_NAME : (row.clientName || 'Inconnu')}
                  >
                    {isClientDeleted ? DELETED_USER_NAME : (row.clientName || 'Inconnu')}
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

                {/* Réparateur (compacted with ellipsis and title tooltip) */}
                <td style={{ padding: '10px 12px', verticalAlign: 'top', maxWidth: '150px' }}>
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
                    title={isRepairerDeleted ? DELETED_USER_NAME : (row.repairerName || 'Inconnu')}
                  >
                    {isRepairerDeleted ? DELETED_USER_NAME : (row.repairerName || 'Inconnu')}
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

                {/* Total (€) with breakdown in tooltip (UI1 - compact single line) */}
                <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  {row.status === 'REFUNDED' && row.refundedCents !== null ? (
                    <div
                      title={`Détail du montant :\n• Réparation : ${formatEuros(row.repairCents)}\n• Commission : ${formatEuros(row.protectionCents)}\n• Port : ${formatEuros(row.shippingCents)}\n• Remboursé : ${formatEuros(row.refundedCents)} sur ${formatEuros(row.totalCents)}`}
                      style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--badge-info-text)' }}>
                        {formatEuros(row.refundedCents)}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--muted, #6b7280)' }}>
                        {`(sur ${formatEuros(row.totalCents)})`}
                      </span>
                      <span
                        role="img"
                        aria-label="Détail du montant"
                        style={{
                          fontSize: '11px',
                          color: 'var(--muted, #6b7280)',
                          opacity: 0.8,
                          userSelect: 'none',
                        }}
                      >
                        <Icon as={Info} />
                      </span>
                    </div>
                  ) : (
                    <div
                      title={`Détail du montant :\n• Réparation : ${formatEuros(row.repairCents)}\n• Commission : ${formatEuros(row.protectionCents)}\n• Port : ${formatEuros(row.shippingCents)}\n• Total : ${formatEuros(row.totalCents)}`}
                      style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink, #141414)' }}>
                        {formatEuros(row.totalCents)}
                      </span>
                      <span
                        role="img"
                        aria-label="Détail du montant"
                        style={{
                          fontSize: '11px',
                          color: 'var(--muted, #6b7280)',
                          opacity: 0.8,
                          userSelect: 'none',
                        }}
                      >
                        <Icon as={Info} />
                      </span>
                    </div>
                  )}
                </td>

                {/* Versement réparateur badge */}
                <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  {(() => {
                    const status = row.payoutStatus ?? 'NOT_APPLICABLE';
                    if (status === 'TRANSFERRED') {
                      return (
                        <span
                          className="badge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: 'var(--badge-success-bg)',
                            color: 'var(--badge-success-text)',
                            border: '1px solid var(--badge-success-border)',
                          }}
                        >
                          Transféré{row.payoutAmountCents != null ? ` (${formatEuros(row.payoutAmountCents)})` : ''}
                        </span>
                      );
                    }
                    if (status === 'PENDING') {
                      return (
                        <span
                          className="badge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: 'var(--badge-warning-bg)',
                            color: 'var(--badge-warning-text)',
                            border: '1px solid var(--badge-warning-border)',
                          }}
                        >
                          En attente{row.payoutAmountCents != null ? ` (${formatEuros(row.payoutAmountCents)})` : ''}
                        </span>
                      );
                    }
                    if (status === 'FAILED' || status === 'REVERSED') {
                      return (
                        <span
                          className="badge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: 'var(--badge-danger-bg)',
                            color: 'var(--badge-danger-text)',
                            border: '1px solid var(--badge-danger-border)',
                          }}
                        >
                          {status === 'REVERSED' ? 'Annulé' : 'Échoué'}
                        </span>
                      );
                    }
                    return (
                      <span style={{ color: 'var(--muted, #6b7280)', fontSize: '13px' }}>
                        —
                      </span>
                    );
                  })()}
                </td>

                {/* Livraison badge */}
                <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  <span
                    className="badge"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: deliveryStyle.bg,
                      color: deliveryStyle.color,
                      border: `1px solid ${deliveryStyle.border}`,
                    }}
                  >
                    {deliveryStyle.label}
                  </span>
                </td>

                {/* Étape escrow badge */}
                <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  <span
                    className="badge"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: stepStyle.bg,
                      color: stepStyle.color,
                      border: `1px solid ${stepStyle.border}`,
                    }}
                  >
                    {stepStyle.label}
                  </span>
                </td>

                {/* Statut badge */}
                <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  <span
                    className="badge"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      borderRadius: '9999px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.color,
                      border: `1px solid ${statusStyle.border}`,
                    }}
                  >
                    {statusStyle.label}
                  </span>
                </td>

                {/* Litige pill */}
                <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  {isDisputed ? (
                    <span
                      className="badge"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: 'var(--badge-danger-bg)',
                        color: 'var(--badge-danger-text)',
                        border: '1px solid var(--badge-danger-border)',
                      }}
                    >
                      <Icon as={TriangleAlert} /> En litige
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--muted, #9ca3af)',
                      }}
                    >
                      Non
                    </span>
                  )}
                  {/* CF4-27 (spec §4.5). The frozen-order tag, independent of the dispute pill -
                      a request and a dispute exclude each other (I12), so both never render at once
                      in practice, but nothing here assumes it. */}
                  {row.cancellationPending && (
                    <div style={{ marginTop: '4px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: 'var(--badge-warning-bg)',
                          color: 'var(--badge-warning-text)',
                          border: '1px solid var(--badge-warning-border)',
                        }}
                      >
                        Annulation demandée
                      </span>
                    </div>
                  )}
                </td>

                {/* Actions */}
                <td style={{ padding: '10px 12px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {isDisputed && (
                      <Link
                        href={`/litiges?q=${encodeURIComponent(row.id)}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 8px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: 'var(--badge-neutral-bg)',
                          border: '1px solid var(--line, #dfe2e2)',
                          borderRadius: 'var(--r-field, 4px)',
                          color: 'var(--ink, #141414)',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Voir litige
                      </Link>
                    )}

                    {isPaid && !isDisputed && (
                      <button hidden={!canDispute}
                        type="button"
                        onClick={() => onOpenDispute(row.id)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: 'var(--red-soft, #feedf0)',
                          border: '1px solid var(--badge-danger-border)',
                          borderRadius: 'var(--r-field, 4px)',
                          color: 'var(--red-text, #bd0e26)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Ouvrir litige
                      </button>
                    )}

                    {isPaid && (
                      <Link
                        href={`/remboursement?commande=${encodeURIComponent(row.id)}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 8px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: 'var(--badge-info-bg)',
                          border: '1px solid var(--badge-info-border)',
                          borderRadius: 'var(--r-field, 4px)',
                          color: 'var(--badge-info-text)',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Rembourser
                      </Link>
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
