'use client';

import React from 'react';
import type { AdminAlertKpis } from '@revime/shared';
import { Bell, CreditCard, Scale, Siren } from 'lucide-react';
import { Icon } from './Icon';

export interface AlertsKpiCardsProps {
  kpis: AdminAlertKpis | null;
  loading?: boolean;
}

export function AlertsKpiCards({ kpis, loading = false }: AlertsKpiCardsProps) {
  const cards = [
    {
      id: 'unread',
      label: 'Alertes non lues',
      value: kpis?.unreadTotal ?? 0,
      sublabel: 'Actions en attente',
      accentColor: (kpis?.unreadTotal ?? 0) > 0 ? 'var(--accent, #f61b39)' : 'var(--ink, #141414)',
      icon: Bell,
    },
    {
      id: 'critical',
      label: 'Alertes critiques',
      value: kpis?.criticalCount ?? 0,
      sublabel: 'SLA < 1h requis',
      accentColor:
        (kpis?.criticalCount ?? 0) > 0 ? 'var(--accent, #f61b39)' : 'var(--ink, #141414)',
      icon: Siren,
    },
    {
      id: 'disputes',
      label: 'Litiges ouverts',
      value: kpis?.disputesCount ?? 0,
      sublabel: 'Contestations clients',
      accentColor: 'var(--navy, #25324f)',
      icon: Scale,
    },
    {
      id: 'payments',
      label: 'Échecs de paiement',
      value: kpis?.paymentsCount ?? 0,
      sublabel: 'Stripe / Virements',
      accentColor: (kpis?.paymentsCount ?? 0) > 0 ? 'var(--badge-warning-text)' : 'var(--ink, #141414)',
      icon: CreditCard,
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        marginBottom: '16px',
      }}
    >
      {cards.map((card) => (
        <div
          key={card.id}
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: 'var(--r-card, 8px)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted, #6b7280)',
              }}
            >
              {card.label}
            </span>
            <span style={{ fontSize: '16px' }} aria-hidden="true">
              <Icon as={card.icon} />
            </span>
          </div>

          <div
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: card.accentColor,
              marginBottom: '2px',
              fontFeatureSettings: '"tnum"',
            }}
          >
            {loading ? '—' : card.value}
          </div>

          <div
            style={{
              fontSize: '11px',
              color: 'var(--muted, #6b7280)',
            }}
          >
            {card.sublabel}
          </div>
        </div>
      ))}
    </div>
  );
}
