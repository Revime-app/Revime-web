'use client';

import React from 'react';
import type { AdminUserSummaryKpis } from '@revime/shared';
import { formatEuros } from '../lib/money';
import { Star } from 'lucide-react';
import { Icon } from './Icon';

interface UserSummaryKpisProps {
  kpis?: AdminUserSummaryKpis;
}

export function UserSummaryKpis({ kpis }: UserSummaryKpisProps) {
  if (!kpis) return null;
  const cards = [
    {
      id: 'demandes',
      label: 'Demandes',
      value: kpis.demandesCount.toString(),
    },
    {
      id: 'repairs',
      label: 'Réparations',
      value: kpis.repairsCompletedCount.toString(),
    },
    {
      id: 'revenue',
      label: "Chiffre d'affaires",
      value: formatEuros(kpis.totalRevenueCents),
    },
    {
      id: 'rating',
      label: 'Note moyenne',
      value:
        kpis.averageRating !== null
          ? (
              <>
                <Icon as={Star} /> {kpis.averageRating.toFixed(1)} ({kpis.reviewCount})
              </>
            )
          : '—',
    },
    {
      id: 'disputes',
      label: 'Litiges',
      value: kpis.disputesCount.toString(),
      isWarning: kpis.disputesCount > 0,
    },
    {
      id: 'reports',
      label: 'Signalements',
      value: kpis.reportsCount.toString(),
      isAlert: kpis.reportsCount > 0,
    },
  ];

  return (
    <div
      data-testid="user-summary-kpis"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '12px',
        marginBottom: '24px',
      }}
    >
      {cards.map((card) => (
        <div
          key={card.id}
          data-testid={`kpi-card-${card.id}`}
          style={{
            backgroundColor: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: '12px',
            padding: '14px 16px',
            fontFamily: 'var(--font-google-sans), Arial, sans-serif',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--muted, #6b7280)',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: card.isAlert
                ? 'var(--red, #f61b39)'
                : card.isWarning
                  ? 'var(--amber-deep, #b45309)'
                  : 'var(--navy-text, #25324f)',
            }}
          >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
