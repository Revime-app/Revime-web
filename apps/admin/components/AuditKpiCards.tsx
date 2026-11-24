'use client';

import React from 'react';
import type { AdminAuditKpis } from '@revime/shared';
import { formatCount } from '../lib/money';
import { ChartColumn, ScrollText, Users, Zap } from 'lucide-react';
import { Icon } from './Icon';

export interface AuditKpiCardsProps {
  kpis?: AdminAuditKpis | null;
  loading?: boolean;
}

export function AuditKpiCards({ kpis, loading = false }: AuditKpiCardsProps) {
  const cards = [
    {
      id: 'kpi-actions-today',
      label: "Actions aujourd'hui",
      value: formatCount(kpis?.actionsTodayCount ?? 0),
      helper: "Événements d'administration enregistrés depuis minuit",
      icon: Zap,
      badgeColor: 'var(--badge-warning-bg)',
      textColor: 'var(--badge-warning-text)',
    },
    {
      id: 'kpi-unique-actors-today',
      label: "Opérateurs actifs aujourd'hui",
      value: formatCount(kpis?.uniqueActorsTodayCount ?? 0),
      helper: 'Admins et modérateurs uniques aujourd’hui',
      icon: Users,
      badgeColor: 'var(--badge-info-bg)',
      textColor: 'var(--navy-text, #25324f)',
    },
    {
      id: 'kpi-top-domain',
      label: 'Domaine le plus actif',
      value: kpis?.topDomain && kpis.topDomain.trim() !== '' ? kpis.topDomain : '—',
      helper: 'Domaine générant le plus de mutations',
      icon: ChartColumn,
      badgeColor: 'var(--badge-success-bg)',
      textColor: 'var(--badge-success-text)',
    },
    {
      id: 'kpi-total-actions',
      label: 'Total des actions enregistrées',
      value: formatCount(kpis?.totalActionsCount ?? 0),
      helper: 'Historique complet des mutations en base',
      icon: ScrollText,
      badgeColor: 'var(--badge-info-bg)',
      textColor: 'var(--badge-info-text)',
    },
  ];

  return (
    <div
      data-testid="audit-kpi-cards"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
                backgroundColor: card.badgeColor,
              }}
              aria-hidden="true"
            >
              <Icon as={card.icon} />
            </span>
          </div>

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
