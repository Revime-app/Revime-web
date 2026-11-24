'use client';

import React from 'react';
import Link from 'next/link';
import type { AdminPayoutListItem } from '@revime/shared';
import { formatEuros, formatCount } from '../lib/money';
import { CreditCard } from 'lucide-react';
import { Icon } from './Icon';

export interface PayoutsTableProps {
  items: AdminPayoutListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onInspect: (item: AdminPayoutListItem) => void;
  onRetry: (item: AdminPayoutListItem) => void;
  loading?: boolean;
}

export function formatPayoutDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(dateString);
  }
}

export function getPayoutStatusBadge(status: AdminPayoutListItem['status']) {
  switch (status) {
    case 'TRANSFERRED':
      return { bg: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', border: 'var(--badge-success-border)', label: 'Transféré' };
    case 'PENDING':
      return { bg: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: 'var(--badge-warning-border)', label: 'En attente' };
    case 'HELD':
      // V8 ISS8-013: waiting on the réparateur's setup, paid automatically once done; not a failure.
      return { bg: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: 'var(--badge-warning-border)', label: 'En attente du réparateur' };
    case 'FAILED':
      return { bg: 'var(--badge-danger-bg)', color: 'var(--badge-danger-text)', border: 'var(--badge-danger-border)', label: 'Échoué' };
    case 'REVERSED':
      return { bg: 'var(--badge-neutral-bg)', color: 'var(--ink2)', border: 'var(--line)', label: 'Remboursé' };
    default:
      return { bg: 'var(--badge-neutral-bg)', color: 'var(--ink2)', border: 'var(--line)', label: status };
  }
}

export function PayoutsTable({
  items,
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onInspect,
  onRetry,
  loading = false,
}: PayoutsTableProps) {
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  return (
    <section
      data-testid="payouts-table-container"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
      }}
      aria-labelledby="payouts-table-heading"
    >
      {/* Table Header Row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2
            id="payouts-table-heading"
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
              margin: '0 0 4px 0',
            }}
          >
            Historique des versements
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--muted, #6b7280)',
              margin: 0,
            }}
          >
            {loading ? (
              'Actualisation des données…'
            ) : total === 0 ? (
              'Aucun versement trouvé'
            ) : (
              <>
                Affichage de <span style={{ fontWeight: 600 }}>{startIndex}</span> à{' '}
                <span style={{ fontWeight: 600 }}>{endIndex}</span> sur{' '}
                <span style={{ fontWeight: 600 }}>{formatCount(total)}</span> versement{total > 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Table Container */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--line, #dfe2e2)', borderRadius: '6px' }}>
        <table
          data-testid="payouts-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: 'var(--badge-neutral-bg)',
                borderBottom: '1px solid var(--line, #dfe2e2)',
                color: 'var(--muted, #6b7280)',
                fontSize: '11.5px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontWeight: 600,
              }}
            >
              <th style={{ padding: '12px 14px' }}>Commande</th>
              <th style={{ padding: '12px 14px' }}>Date</th>
              <th style={{ padding: '12px 14px' }}>Réparateur</th>
              <th style={{ padding: '12px 14px' }}>Montant versé</th>
              <th style={{ padding: '12px 14px' }}>Statut</th>
              <th style={{ padding: '12px 14px' }}>ID Virement</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  data-testid="payouts-empty-state"
                  style={{
                    padding: '48px 16px',
                    textAlign: 'center',
                    color: 'var(--muted, #6b7280)',
                    fontSize: '14px',
                  }}
                >
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}><Icon as={CreditCard} /></div>
                  <div style={{ fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '4px' }}>
                    {loading ? 'Chargement des versements en cours…' : 'Aucun versement trouvé'}
                  </div>
                  <div>
                    {loading
                      ? 'Veuillez patienter pendant la récupération des enregistrements.'
                      : 'Aucun versement ne correspond aux critères de recherche et filtres actuels.'}
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const statusBadge = getPayoutStatusBadge(item.status);
                const displayDate = formatPayoutDate(item.releasedAt || item.paidAt || item.createdAt);

                return (
                  <tr
                    key={item.id}
                    data-testid={`payout-row-${item.id}`}
                    style={{
                      borderBottom: '1px solid var(--line, #dfe2e2)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* Commande ID Link */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/commandes/${item.id}`}
                        data-testid={`payout-order-link-${item.id}`}
                        style={{
                          fontWeight: 600,
                          color: 'var(--navy-text, #25324f)',
                          textDecoration: 'none',
                        }}
                      >
                        {item.orderNumber}
                      </Link>
                    </td>

                    {/* Date */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--muted, #6b7280)' }}>
                      {displayDate}
                    </td>

                    {/* Réparateur */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Link
                          href={`/utilisateurs/${item.repairerId}`}
                          data-testid={`payout-repairer-link-${item.id}`}
                          style={{
                            fontWeight: 600,
                            color: 'var(--navy-text, #25324f)',
                            textDecoration: 'none',
                          }}
                        >
                          {item.repairerName}
                        </Link>
                        <span
                          style={{
                            fontSize: '11.5px',
                            color: 'var(--muted, #6b7280)',
                            maxWidth: '220px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.repairerEmail}
                        </span>
                      </div>
                    </td>

                    {/* Montant versé */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700, color: 'var(--ink, #141414)' }}>
                        {formatEuros(item.amountCents)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)' }}>
                        sur {formatEuros(item.totalOrderCents)}
                      </div>
                    </td>

                    {/* Statut Badge */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <span
                        data-testid={`payout-status-badge-${item.id}`}
                        style={{
                          display: 'inline-block',
                          padding: '3px 9px',
                          borderRadius: '9999px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          backgroundColor: statusBadge.bg,
                          color: statusBadge.color,
                          border: `1px solid ${statusBadge.border}`,
                        }}
                      >
                        {statusBadge.label}
                      </span>
                    </td>

                    {/* ID Virement */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      {item.stripeTransferId ? (
                        <span
                          data-testid={`payout-transfer-id-${item.id}`}
                          style={{
                            fontFamily: 'monospace, monospace',
                            fontSize: '12px',
                            padding: '2px 6px',
                            backgroundColor: 'var(--badge-neutral-bg)',
                            border: '1px solid var(--line, #dfe2e2)',
                            borderRadius: '4px',
                            color: 'var(--ink, #141414)',
                          }}
                        >
                          {item.stripeTransferId}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted, #6b7280)' }}>—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <button
                          type="button"
                          data-testid={`payout-inspect-btn-${item.id}`}
                          onClick={() => onInspect(item)}
                          disabled={loading}
                          style={{
                            padding: '5px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            borderRadius: 'var(--r-field, 4px)',
                            border: '1px solid var(--line, #dfe2e2)',
                            backgroundColor: 'var(--paper, #ffffff)',
                            color: 'var(--navy-text, #25324f)',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          Détails
                        </button>

                        {item.canRetry && (
                          <button
                            type="button"
                            data-testid={`payout-retry-btn-${item.id}`}
                            onClick={() => onRetry(item)}
                            disabled={loading}
                            style={{
                              padding: '5px 10px',
                              fontSize: '12px',
                              fontWeight: 600,
                              borderRadius: 'var(--r-field, 4px)',
                              border: '1px solid var(--navy, #25324f)',
                              backgroundColor: 'var(--navy, #25324f)',
                              color: '#ffffff',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              transition: 'opacity 0.15s ease',
                            }}
                          >
                            Réessayer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <nav
          aria-label="Pagination des versements"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            Page <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>{page}</span> sur{' '}
            <span style={{ fontWeight: 600, color: 'var(--ink, #141414)' }}>{totalPages}</span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              data-testid="payouts-pagination-prev"
              disabled={!hasPrev || loading}
              onClick={() => onPageChange(page - 1)}
              style={{
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: 500,
                backgroundColor: !hasPrev ? 'var(--badge-neutral-bg)' : 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                color: !hasPrev ? 'var(--faint)' : 'var(--ink, #141414)',
                cursor: !hasPrev || loading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              Précédent
            </button>
            <button
              type="button"
              data-testid="payouts-pagination-next"
              disabled={!hasNext || loading}
              onClick={() => onPageChange(page + 1)}
              style={{
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: 500,
                backgroundColor: !hasNext ? 'var(--badge-neutral-bg)' : 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-field, 4px)',
                color: !hasNext ? 'var(--faint)' : 'var(--ink, #141414)',
                cursor: !hasNext || loading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              Suivant
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
