'use client';

import type { AdminStatsOverviewDto, AdminStatsPeriod } from '@revime/shared';
import { formatEuros, formatCount, formatPercentage } from '../../lib/money';

export interface StatsKpiCardsProps {
  kpis: AdminStatsOverviewDto['kpis'];
  period: AdminStatsPeriod;
}

export { formatEuros, formatCount, formatPercentage };

export function formatResponseTime(minutes: number): string {
  if (minutes <= 0) return '0 min';
  if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  }
  const hours = minutes / 60;
  const formattedHours = hours.toFixed(1).replace(/\.0$/, '');
  return `${formattedHours} h`;
}

export type TrendSentiment = 'positive' | 'negative' | 'neutral' | 'na';

export function getTrendSentiment(
  changePct: number | null,
  invertSentiment = false,
): TrendSentiment {
  if (changePct === null) return 'na';
  if (changePct === 0) return 'neutral';
  if (changePct > 0) return invertSentiment ? 'negative' : 'positive';
  return invertSentiment ? 'positive' : 'negative';
}

export function renderTrendBadge(
  changePct: number | null,
  period: AdminStatsPeriod,
  invertSentiment = false,
) {
  if (period === 'all') {
    return (
      <span
        className="badge"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: 'var(--r-pill, 999px)',
          fontSize: '11px',
          fontWeight: 600,
          backgroundColor: 'var(--navy-soft, #f0f1f5)',
          color: 'var(--muted, #6b7280)',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      >
        Historique global
      </span>
    );
  }

  if (changePct === null) {
    return (
      <span
        className="badge"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: 'var(--r-pill, 999px)',
          fontSize: '11px',
          fontWeight: 600,
          backgroundColor: 'var(--navy-soft, #f0f1f5)',
          color: 'var(--muted, #6b7280)',
          border: '1px solid var(--line, #dfe2e2)',
        }}
      >
        vs période précédente : n/a
      </span>
    );
  }

  const sentiment = getTrendSentiment(changePct, invertSentiment);

  let bg = 'var(--navy-soft, #f0f1f5)';
  let color = 'var(--muted, #6b7280)';
  let border = 'var(--line, #dfe2e2)';
  let arrow = '=';
  let formattedVal = '0,0 %';

  if (sentiment === 'positive') {
    bg = 'var(--green-soft, #e7f8f0)';
    color = 'var(--green-deep, #0a8a50)';
    border = 'rgba(18, 183, 106, 0.25)';
    arrow = changePct > 0 ? '↑' : '↓';
    const formattedAbs = formatPercentage(Math.abs(changePct));
    formattedVal = changePct > 0 ? `+${formattedAbs}` : `-${formattedAbs}`;
  } else if (sentiment === 'negative') {
    bg = 'var(--red-soft, #feedf0)';
    color = 'var(--red-deep, #bd0e26)';
    border = 'rgba(246, 27, 57, 0.25)';
    arrow = changePct > 0 ? '↑' : '↓';
    const formattedAbs = formatPercentage(Math.abs(changePct));
    formattedVal = changePct > 0 ? `+${formattedAbs}` : `-${formattedAbs}`;
  }

  return (
    <span
      className="badge"
      data-sentiment={sentiment}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: 'var(--r-pill, 999px)',
        fontSize: '11px',
        fontWeight: 600,
        backgroundColor: bg,
        color: color,
        border: `1px solid ${border}`,
      }}
    >
      <span>{arrow}</span>
      <span>{formattedVal} vs période précédente</span>
    </span>
  );
}

export function StatsKpiCards({ kpis, period }: StatsKpiCardsProps) {
  // Section 1: Performance Financière & Volume
  const cardsRow1 = [
    {
      id: 'gmv',
      label: "Chiffre d'affaires (GMV)",
      value: formatEuros(kpis.totalGmvCents.value),
      note: 'Volume brut des réparations payées',
      changePct: kpis.totalGmvCents.changePct,
      invertSentiment: false,
    },
    {
      id: 'averageBasket',
      label: 'Panier moyen',
      value: formatEuros(kpis.averageBasketCents.value),
      note: 'Montant moyen par réparation payée',
      changePct: kpis.averageBasketCents.changePct,
      invertSentiment: false,
    },
    {
      id: 'commissions',
      label: 'Commissions plateforme',
      value: formatEuros(kpis.totalCommissionsCents.value),
      note: 'Commissions perçues',
      changePct: kpis.totalCommissionsCents.changePct,
      invertSentiment: false,
    },
    {
      id: 'actualCommissionRate',
      label: 'Taux de commission effectif',
      value: formatPercentage(kpis.actualCommissionRate.value),
      note: 'Frais de protection perçus / montant encaissé',
      changePct: kpis.actualCommissionRate.changePct,
      invertSentiment: false,
    },
  ];

  // Section 2: Qualité Opérationnelle & Conversion
  const cardsRow2 = [
    {
      id: 'demandes',
      label: 'Demandes créées',
      value: formatCount(kpis.totalDemandes.value),
      note: 'Demandes publiées sur la période',
      changePct: kpis.totalDemandes.changePct,
      invertSentiment: false,
    },
    {
      id: 'acceptanceRate',
      label: "Taux d'acceptation offres",
      value: formatPercentage(kpis.acceptanceRate.value),
      note: 'Offres converties en commandes',
      changePct: kpis.acceptanceRate.changePct,
      invertSentiment: false,
    },
    {
      id: 'disputeRate',
      label: 'Taux de litiges',
      value: formatPercentage(kpis.disputeRate.value),
      note: 'Commandes signalées en litige',
      changePct: kpis.disputeRate.changePct,
      invertSentiment: true,
    },
    {
      id: 'refundRate',
      label: 'Taux de remboursements',
      value: formatPercentage(kpis.refundRate.value),
      note: "Commandes ayant fait l'objet d'un remboursement",
      changePct: kpis.refundRate.changePct,
      invertSentiment: true,
    },
  ];

  return (
    <div style={{ marginBottom: '28px' }}>
      {/* Section 1: Performance Financière & Volume */}
      <div className="group" style={{ marginBottom: '24px' }}>
        <p
          className="group__title"
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--ink, #141414)',
            marginBottom: '12px',
          }}
        >
          Performance Financière &amp; Volume
        </p>
        <div
          className="group__tiles"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px',
          }}
        >
          {cardsRow1.map((card) => (
            <div
              key={card.id}
              data-testid={`kpi-card-${card.id}`}
              className="card kpi admin-kpi-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '140px',
                backgroundColor: 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-card, 12px)',
                padding: '16px',
              }}
            >
              <div>
                <p
                  className="kpi__label"
                  style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}
                >
                  {card.label}
                </p>
                <p
                  className="kpi__value"
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: 'var(--ink, #141414)',
                  }}
                >
                  {card.value}
                </p>
                <p
                  className="kpi__note"
                  style={{ margin: 0, fontSize: '12px', color: 'var(--muted, #6b7280)' }}
                >
                  {card.note}
                </p>
              </div>
              <div style={{ marginTop: '12px' }}>
                {renderTrendBadge(card.changePct, period, card.invertSentiment)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Qualité Opérationnelle & Conversion */}
      <div className="group">
        <p
          className="group__title"
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--ink, #141414)',
            marginBottom: '12px',
          }}
        >
          Qualité Opérationnelle &amp; Conversion
        </p>
        <div
          className="group__tiles"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px',
          }}
        >
          {cardsRow2.map((card) => (
            <div
              key={card.id}
              data-testid={`kpi-card-${card.id}`}
              className="card kpi admin-kpi-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '140px',
                backgroundColor: 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-card, 12px)',
                padding: '16px',
              }}
            >
              <div>
                <p
                  className="kpi__label"
                  style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}
                >
                  {card.label}
                </p>
                <p
                  className="kpi__value"
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: 'var(--ink, #141414)',
                  }}
                >
                  {card.value}
                </p>
                <p
                  className="kpi__note"
                  style={{ margin: 0, fontSize: '12px', color: 'var(--muted, #6b7280)' }}
                >
                  {card.note}
                </p>
              </div>
              <div style={{ marginTop: '12px' }}>
                {renderTrendBadge(card.changePct, period, card.invertSentiment)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
