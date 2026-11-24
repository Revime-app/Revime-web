'use client';

import React from 'react';
import type { AdminConversationKpis } from '@revime/shared';
import { CircleDot, Flag, MessageSquare, Scale } from 'lucide-react';
import { Icon } from './Icon';

export interface ConversationsKpiCardsProps {
  kpis: AdminConversationKpis | null;
  loading?: boolean;
}

export function ConversationsKpiCards({ kpis, loading = false }: ConversationsKpiCardsProps) {
  const cards = [
    {
      id: 'total',
      label: 'Total',
      value: kpis?.total ?? 0,
      sublabel: 'Conversations indexées',
      accentColor: 'var(--navy, #25324f)',
      icon: MessageSquare,
    },
    {
      id: 'active',
      label: 'Actives',
      value: kpis?.activeCount ?? 0,
      sublabel: 'Discussions en cours',
      accentColor: 'var(--navy, #25324f)',
      icon: CircleDot,
    },
    {
      id: 'disputes',
      label: 'Litiges',
      value: kpis?.withDisputeCount ?? 0,
      sublabel: 'Dossiers contestés',
      accentColor: (kpis?.withDisputeCount ?? 0) > 0 ? 'var(--badge-warning-text)' : 'var(--ink, #141414)',
      icon: Scale,
    },
    {
      id: 'reports',
      label: 'Signalées',
      value: kpis?.withReportCount ?? 0,
      sublabel: 'Modération requise',
      accentColor:
        (kpis?.withReportCount ?? 0) > 0 ? 'var(--accent, #f61b39)' : 'var(--ink, #141414)',
      icon: Flag,
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '10px',
        marginBottom: '16px',
      }}
    >
      {cards.map((card) => (
        <div
          key={card.id}
          style={{
            background: 'var(--paper, #ffffff)',
            border: '1px solid var(--line, #dfe2e2)',
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 1px 2px rgba(20, 20, 20, 0.04)',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--ink-muted, #666666)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {card.label}
            </span>
            <span style={{ fontSize: '14px' }} aria-hidden="true">
              <Icon as={card.icon} />
            </span>
          </div>
          <div>
            <div
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: card.accentColor,
                lineHeight: 1.2,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {card.value.toLocaleString('fr-FR')}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--ink-muted, #737373)',
                marginTop: '2px',
              }}
            >
              {card.sublabel}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
