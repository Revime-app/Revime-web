'use client';

import React from 'react';
import type { AdminPromoKpis } from '@revime/shared';
import { formatEuros, formatCount } from '../lib/money';
import { Euro, Handshake, Package, Ticket } from 'lucide-react';
import { Icon } from './Icon';

export interface PromoKpiCardsProps {
  kpis?: AdminPromoKpis | null;
  loading?: boolean;
}

export function PromoKpiCards({ kpis, loading = false }: PromoKpiCardsProps) {
  const cards = [
    {
      id: 'kpi-total-discount',
      label: 'Montant total des réductions',
      value: formatEuros(kpis?.totalDiscountDisbursedCents ?? 0, '0,00 €'),
      helper: 'Économies accordées et subventionnées par la plateforme',
      icon: Euro,
      badgeColor: 'var(--badge-info-bg)',
      textColor: 'var(--navy-text, #25324f)',
    },
    {
      id: 'kpi-active-codes',
      label: 'Codes actifs',
      value: formatCount(kpis?.activeCodesCount ?? 0),
      helper: 'Codes opérationnels utilisables immédiatement',
      icon: Ticket,
      badgeColor: 'var(--badge-success-bg)',
      textColor: 'var(--badge-success-text)',
    },
    {
      id: 'kpi-orders-count',
      label: 'Commandes avec code promo',
      value: formatCount(kpis?.totalOrdersWithPromoCount ?? 0),
      helper: 'Volume de commandes bénéficiant d’un coupon',
      icon: Package,
      badgeColor: 'var(--badge-info-bg)',
      textColor: 'var(--badge-info-text)',
    },
    {
      id: 'kpi-referrals-count',
      label: 'Parrainages convertis',
      value: formatCount(kpis?.totalReferralConversionsCount ?? 0),
      helper: 'Filleuls ayant validé leur 1ère commande',
      icon: Handshake,
      badgeColor: 'var(--badge-warning-bg)',
      textColor: 'var(--badge-warning-text)',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
      }}
      data-testid="promo-kpi-cards"
    >
      {cards.map((card) => (
        <div
          key={card.id}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span
              style={{
                fontSize: '12px',
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
              lineHeight: 1.3,
            }}
          >
            {card.helper}
          </div>
        </div>
      ))}
    </div>
  );
}
