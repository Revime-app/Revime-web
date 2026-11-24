'use client';

import React from 'react';
import type { AdminPayoutKpis } from '@revime/shared';
import { formatEuros, formatCount } from '../lib/money';
import { Clock, Euro, Hourglass, Landmark, TriangleAlert } from 'lucide-react';
import { Icon } from './Icon';

export interface PayoutsKpiCardsProps {
  kpis: AdminPayoutKpis | null;
  loading?: boolean;
}

export function PayoutsKpiCards({ kpis, loading = false }: PayoutsKpiCardsProps) {
  const failedCount = kpis?.failedTransfersCount ?? 0;
  const incompleteCount = kpis?.incompleteAccountsCount ?? 0;
  // V8 `ISS8-013`: payouts waiting on the réparateur's setup. Absent on an API older than the fix.
  const heldCount = kpis?.heldPayoutsCount;
  const heldCents = kpis?.heldPayoutsCents ?? 0;

  const cards = [
    {
      id: 'kpi-total-transferred',
      label: 'Total transféré',
      value: formatEuros(kpis?.totalTransferredCents ?? 0),
      helper: 'Cumul des virements Stripe réussis',
      icon: Euro,
      badgeColor: 'var(--badge-success-bg)',
      textColor: 'var(--badge-success-text)',
      hasAlert: false,
    },
    {
      id: 'kpi-pending-escrow',
      label: 'En attente de versement',
      value: formatEuros(kpis?.pendingEscrowCents ?? 0),
      helper: 'Fonds bloqués sous séquestre',
      icon: Hourglass,
      badgeColor: 'var(--badge-info-bg)',
      textColor: 'var(--navy-text, #25324f)',
      hasAlert: false,
    },
    {
      id: 'kpi-held-payouts',
      label: 'En attente de configuration du réparateur',
      value: heldCount === undefined ? 'Non disponible' : formatCount(heldCount),
      helper:
        heldCount === undefined
          ? 'Non disponible'
          : heldCount > 0
            ? `${formatEuros(heldCents)} versés dès la configuration terminée`
            : 'Aucun versement en attente du réparateur',
      icon: Clock,
      badgeColor: (heldCount ?? 0) > 0 ? 'var(--badge-warning-bg)' : 'var(--badge-neutral-bg)',
      textColor: (heldCount ?? 0) > 0 ? 'var(--badge-warning-text)' : 'var(--muted, #6b7280)',
      // Not an alert: the money leaves by itself once he finishes; nothing for the team to repair.
      hasAlert: false,
    },
    {
      id: 'kpi-failed-transfers',
      label: 'Versements échoués',
      value: formatCount(failedCount),
      helper: failedCount > 0 ? 'Virements nécessitant une intervention' : 'Aucun échec de virement à ce jour',
      icon: TriangleAlert,
      badgeColor: failedCount > 0 ? 'var(--badge-danger-bg)' : 'var(--badge-neutral-bg)',
      textColor: failedCount > 0 ? 'var(--badge-danger-text)' : 'var(--muted, #6b7280)',
      hasAlert: failedCount > 0,
      alertLabel: 'Action requise',
    },
    {
      id: 'kpi-incomplete-accounts',
      label: 'Comptes Stripe incomplets',
      value: formatCount(incompleteCount),
      helper: incompleteCount > 0 ? 'Comptes bloquant la libération des fonds' : 'Tous les comptes sont vérifiés',
      icon: Landmark,
      badgeColor: incompleteCount > 0 ? 'var(--badge-warning-bg)' : 'var(--badge-neutral-bg)',
      textColor: incompleteCount > 0 ? 'var(--badge-warning-text)' : 'var(--muted, #6b7280)',
      hasAlert: incompleteCount > 0,
      alertLabel: 'À relancer',
    },
  ];

  return (
    <div
      data-testid="payouts-kpi-cards"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '20px',
      }}
    >
      {cards.map((card) => (
        <div
          key={card.id}
          data-testid={card.id}
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            border: card.hasAlert ? `1px solid ${card.textColor}` : '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 8px)',
            padding: '18px 20px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--muted, #6b7280)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {card.label}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {card.hasAlert && (
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: card.badgeColor,
                    color: card.textColor,
                  }}
                >
                  {card.alertLabel}
                </span>
              )}
              <span
                style={{
                  fontSize: '16px',
                  padding: '4px 6px',
                  borderRadius: '6px',
                  backgroundColor: card.badgeColor,
                }}
                aria-hidden="true"
              >
                <Icon as={card.icon} />
              </span>
            </div>
          </div>

          {/* Value */}
          <div
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: card.hasAlert ? card.textColor : 'var(--ink, #141414)',
              letterSpacing: '-0.02em',
              marginBottom: '6px',
            }}
          >
            {loading ? '…' : card.value}
          </div>

          {/* Helper */}
          <div
            style={{
              fontSize: '11px',
              color: 'var(--muted, #6b7280)',
              lineHeight: 1.35,
            }}
          >
            {card.helper}
          </div>
        </div>
      ))}
    </div>
  );
}
