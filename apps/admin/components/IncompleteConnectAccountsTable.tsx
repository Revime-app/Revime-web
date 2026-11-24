'use client';

import React from 'react';
import Link from 'next/link';
import type { AdminIncompleteConnectAccount } from '@revime/shared';
import { formatEuros, formatCount } from '../lib/money';
import { PartyPopper } from 'lucide-react';
import { Icon } from './Icon';

export interface IncompleteConnectAccountsTableProps {
  items: AdminIncompleteConnectAccount[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onSync: (item: AdminIncompleteConnectAccount) => Promise<void> | void;
  onRemind: (item: AdminIncompleteConnectAccount) => void;
  syncingId?: string | null;
  loading?: boolean;
}

export function getConnectAccountStatusBadge(status: AdminIncompleteConnectAccount['status']) {
  switch (status) {
    case 'RESTRICTED':
      return { bg: 'var(--badge-danger-bg)', color: 'var(--badge-danger-text)', border: 'var(--badge-danger-border)', label: 'Restreint' };
    case 'PENDING':
      return { bg: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: 'var(--badge-warning-border)', label: 'En attente' };
    case 'REJECTED':
      return { bg: 'var(--badge-danger-bg)', color: 'var(--badge-danger-text)', border: 'var(--badge-danger-border)', label: 'Rejeté' };
    case 'VERIFIED':
      return { bg: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', border: 'var(--badge-success-border)', label: 'Vérifié' };
    case null:
      // V8 ISS8-013: a réparateur with held payouts who never created a Connect account.
      return { bg: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: 'var(--badge-warning-border)', label: 'Non créé' };
    default:
      return { bg: 'var(--badge-neutral-bg)', color: 'var(--ink2)', border: 'var(--line)', label: status };
  }
}

export function IncompleteConnectAccountsTable({
  items,
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onSync,
  onRemind,
  syncingId = null,
  loading = false,
}: IncompleteConnectAccountsTableProps) {
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  return (
    <section
      data-testid="incomplete-connect-table-container"
      style={{
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 24px',
      }}
      aria-labelledby="incomplete-connect-heading"
    >
      {/* Header */}
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
            id="incomplete-connect-heading"
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
              margin: '0 0 4px 0',
            }}
          >
            Comptes Stripe Connect incomplets
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--muted, #6b7280)',
              margin: 0,
            }}
          >
            {loading ? (
              'Actualisation des comptes en cours…'
            ) : total === 0 ? (
              'Aucun compte incomplet'
            ) : (
              <>
                Affichage de <span style={{ fontWeight: 600 }}>{startIndex}</span> à{' '}
                <span style={{ fontWeight: 600 }}>{endIndex}</span> sur{' '}
                <span style={{ fontWeight: 600 }}>{formatCount(total)}</span> compte{total > 1 ? 's' : ''} nécessitant une attention
              </>
            )}
          </p>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--line, #dfe2e2)', borderRadius: '6px' }}>
        <table
          data-testid="incomplete-connect-table"
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
              <th style={{ padding: '12px 14px' }}>Réparateur</th>
              <th style={{ padding: '12px 14px' }}>Compte Stripe</th>
              <th style={{ padding: '12px 14px' }}>Statut Connect</th>
              <th style={{ padding: '12px 14px' }}>Motif de blocage</th>
              <th style={{ padding: '12px 14px' }}>Fonds bloqués</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  data-testid="incomplete-connect-empty-state"
                  style={{
                    padding: '48px 16px',
                    textAlign: 'center',
                    color: 'var(--muted, #6b7280)',
                    fontSize: '14px',
                  }}
                >
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}><Icon as={PartyPopper} /></div>
                  <div style={{ fontWeight: 600, color: 'var(--ink, #141414)', marginBottom: '4px' }}>
                    {loading ? 'Chargement des comptes Stripe…' : 'Aucun compte incomplet'}
                  </div>
                  <div>
                    {loading
                      ? 'Vérification des statuts Stripe Connect en cours.'
                      : 'Tous les comptes réparateurs ont finalisé leur vérification Stripe Connect et reçoivent leurs virements.'}
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const statusBadge = getConnectAccountStatusBadge(item.status);
                const isSyncing =
                  syncingId === item.id ||
                  syncingId === item.userId ||
                  syncingId === item.stripeAccountId;

                return (
                  <tr
                    key={item.id}
                    data-testid={`incomplete-connect-row-${item.id}`}
                    style={{
                      borderBottom: '1px solid var(--line, #dfe2e2)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* Réparateur */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Link
                          href={`/utilisateurs/${item.userId}`}
                          data-testid={`incomplete-repairer-link-${item.id}`}
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

                    {/* Compte Stripe */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <span
                        data-testid={`incomplete-stripe-account-${item.id}`}
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
                        {item.stripeAccountId ?? 'Aucun compte'}
                      </span>
                    </td>

                    {/* Statut Connect Badge */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <span
                        data-testid={`incomplete-status-badge-${item.id}`}
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

                    {/* Motif de blocage */}
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        data-testid={`incomplete-blocked-reason-${item.id}`}
                        style={{
                          fontSize: '12.5px',
                          color: item.disabledReason ? 'var(--badge-danger-text)' : 'var(--muted, #6b7280)',
                        }}
                      >
                        {item.disabledReason || "Vérification d'identité en cours"}
                      </span>
                    </td>

                    {/* Fonds bloqués */}
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <div
                        data-testid={`incomplete-blocked-funds-${item.id}`}
                        style={{ fontWeight: 700, color: item.pendingPayoutsCount > 0 ? 'var(--badge-warning-text)' : 'var(--ink, #141414)' }}
                      >
                        {formatEuros(item.pendingPayoutsTotalCents)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)' }}>
                        {item.pendingPayoutsCount} commande{item.pendingPayoutsCount > 1 ? 's' : ''} en attente
                      </div>
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
                        {/* Synchroniser button: nothing to sync without an account (V8 ISS8-013) */}
                        {item.stripeAccountId !== null && (
                        <button
                          type="button"
                          data-testid={`incomplete-sync-btn-${item.id}`}
                          onClick={() => onSync(item)}
                          disabled={loading || isSyncing}
                          style={{
                            padding: '5px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            borderRadius: 'var(--r-field, 4px)',
                            border: '1px solid var(--line, #dfe2e2)',
                            backgroundColor: 'var(--paper, #ffffff)',
                            color: 'var(--navy-text, #25324f)',
                            cursor: loading || isSyncing ? 'not-allowed' : 'pointer',
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          {isSyncing ? 'Synchronisation…' : 'Synchroniser'}
                        </button>
                        )}

                        {/* Envoyer un rappel button */}
                        <button
                          type="button"
                          data-testid={`incomplete-remind-btn-${item.id}`}
                          onClick={() => onRemind(item)}
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
                          Envoyer un rappel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Pagination des comptes incomplets"
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
              data-testid="incomplete-connect-pagination-prev"
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
              data-testid="incomplete-connect-pagination-next"
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
