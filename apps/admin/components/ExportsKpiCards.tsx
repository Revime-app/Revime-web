'use client';

import React from 'react';
import type { AdminExportSummary } from '@revime/shared';
import { formatEuros } from '../lib/money';
import { Briefcase, CreditCard, Euro, Landmark } from 'lucide-react';
import { Icon } from './Icon';

export interface ExportsKpiCardsProps {
  summary: AdminExportSummary | null;
  loading?: boolean;
}

export function ExportsKpiCards({ summary, loading = false }: ExportsKpiCardsProps) {
  const cards = [
    {
      id: 'kpi-gross-volume',
      label: 'Volume brut TTC',
      value: formatEuros(summary?.totalGrossCents ?? 0),
      helper: 'Total des paiements clients encaissés TTC',
      icon: CreditCard,
      badgeBg: 'var(--badge-info-bg)',
      textColor: 'var(--navy-text, #25324f)',
    },
    {
      id: 'kpi-commission-ht',
      label: 'Commissions Revime HT',
      value: formatEuros(summary?.totalCommissionHtCents ?? 0),
      helper: 'Base hors taxes des frais de protection Revime',
      icon: Briefcase,
      badgeBg: 'var(--badge-success-bg)',
      textColor: 'var(--badge-success-text)',
    },
    {
      id: 'kpi-vat-collected',
      label: 'TVA collectée (20 %)',
      value: formatEuros(summary?.totalVatCents ?? 0),
      helper: 'TVA française 20 % déclarable au Trésor Public',
      icon: Landmark,
      badgeBg: 'var(--badge-danger-bg)',
      textColor: 'var(--badge-danger-text)',
    },
    {
      id: 'kpi-payouts-disbursed',
      label: 'Versements décaissés',
      value: formatEuros(summary?.totalPayoutsCents ?? 0),
      helper: 'Total viré sur les comptes Stripe des réparateurs',
      icon: Euro,
      badgeBg: 'var(--badge-success-bg)',
      textColor: 'var(--badge-success-text)',
    },
  ];

  return (
    <div
      data-testid="exports-kpi-cards"
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
            border: '1px solid var(--line, #dfe2e2)',
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
            <span
              style={{
                fontSize: '16px',
                padding: '4px 6px',
                borderRadius: '6px',
                backgroundColor: card.badgeBg,
              }}
              aria-hidden="true"
            >
              <Icon as={card.icon} />
            </span>
          </div>

          {/* Value */}
          <div
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
              letterSpacing: '-0.02em',
              marginBottom: '6px',
            }}
          >
            {loading ? '…' : card.value}
          </div>

          {/* Helper */}
          <div
            style={{
              fontSize: '11.5px',
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
