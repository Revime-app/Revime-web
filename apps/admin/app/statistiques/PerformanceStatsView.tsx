'use client';

import type { AdminStatsOverviewDto } from '@revime/shared';
import { formatCount, formatPercentage, formatResponseTime } from './StatsKpiCards';

export interface PerformanceStatsViewProps {
  offerAcceptance: AdminStatsOverviewDto['offerAcceptance'];
  responseTime: AdminStatsOverviewDto['responseTime'];
}

export function PerformanceStatsView({
  offerAcceptance,
  responseTime,
}: PerformanceStatsViewProps) {
  const totalOffers = offerAcceptance.totalOffers;
  const acceptedPct = totalOffers > 0 ? (offerAcceptance.acceptedOffers / totalOffers) * 100 : 0;
  const rejectedPct = totalOffers > 0 ? (offerAcceptance.rejectedOffers / totalOffers) * 100 : 0;
  const pendingPct = totalOffers > 0 ? (offerAcceptance.pendingOffers / totalOffers) * 100 : 0;

  const totalDemandesMeasured =
    responseTime.within1HourCount +
    responseTime.within24HoursCount +
    responseTime.over24HoursCount +
    responseTime.noOfferCount;

  const buckets = [
    {
      label: '< 1 heure',
      description: 'Réponse ultra-rapide',
      count: responseTime.within1HourCount,
      percentage: totalDemandesMeasured > 0 ? (responseTime.within1HourCount / totalDemandesMeasured) * 100 : 0,
      color: 'var(--badge-success-text)', // green
    },
    {
      label: '1h à 24 heures',
      description: 'Dans la journée',
      count: responseTime.within24HoursCount,
      percentage: totalDemandesMeasured > 0 ? (responseTime.within24HoursCount / totalDemandesMeasured) * 100 : 0,
      color: 'var(--badge-info-text)', // blue
    },
    {
      label: '> 24 heures',
      description: 'Délai long',
      count: responseTime.over24HoursCount,
      percentage: totalDemandesMeasured > 0 ? (responseTime.over24HoursCount / totalDemandesMeasured) * 100 : 0,
      color: 'var(--badge-warning-text)', // amber
    },
    {
      label: 'Sans offre',
      description: 'Demandes en attente de devis',
      count: responseTime.noOfferCount,
      percentage: totalDemandesMeasured > 0 ? (responseTime.noOfferCount / totalDemandesMeasured) * 100 : 0,
      color: 'var(--faint)', // gray
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
        gap: '20px',
        marginBottom: '28px',
      }}
    >
      {/* Indicator 4: Taux d'acceptation des offres */}
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--ink, #1f2937)' }}>
            Taux d'acceptation des offres
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            Statut des propositions de devis soumises par les réparateurs
          </p>
        </div>

        {totalOffers === 0 ? (
          <div
            style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'var(--muted, #6b7280)',
              backgroundColor: 'var(--canvas)',
              borderRadius: 'var(--r-field, 6px)',
              margin: 'auto 0',
            }}
          >
            <p style={{ margin: 0, fontSize: '14px' }}>Aucune offre émise sur cette période.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Main KPI display */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
              <span style={{ fontSize: '32px', fontWeight: 800, color: 'var(--ink, #111827)' }}>
                {formatPercentage(offerAcceptance.acceptanceRate)}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                d'offres converties sur {formatCount(totalOffers)} offres au total
              </span>
            </div>

            {/* Segmented Progress Bar */}
            <div
              style={{
                display: 'flex',
                height: '12px',
                width: '100%',
                backgroundColor: 'var(--line, #e5e7eb)',
                borderRadius: 'var(--r-pill, 999px)',
                overflow: 'hidden',
                gap: '2px',
              }}
            >
              {acceptedPct > 0 && (
                <div
                  style={{
                    width: `${acceptedPct}%`,
                    backgroundColor: 'var(--badge-success-text)',
                    borderRadius: 'var(--r-pill, 999px)',
                    transition: 'width 0.4s ease',
                  }}
                  title={`Acceptées: ${formatPercentage(acceptedPct)}`}
                />
              )}
              {rejectedPct > 0 && (
                <div
                  style={{
                    width: `${rejectedPct}%`,
                    backgroundColor: 'var(--badge-danger-text)',
                    borderRadius: 'var(--r-pill, 999px)',
                    transition: 'width 0.4s ease',
                  }}
                  title={`Refusées: ${formatPercentage(rejectedPct)}`}
                />
              )}
              {pendingPct > 0 && (
                <div
                  style={{
                    width: `${pendingPct}%`,
                    backgroundColor: 'var(--badge-warning-text)',
                    borderRadius: 'var(--r-pill, 999px)',
                    transition: 'width 0.4s ease',
                  }}
                  title={`En attente: ${formatPercentage(pendingPct)}`}
                />
              )}
            </div>

            {/* Breakdown Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                marginTop: '4px',
              }}
            >
              {/* Acceptées */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--r-card, 8px)',
                  backgroundColor: 'var(--green-soft, #e7f8f0)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--badge-success-text)',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--green-deep, #0a8a50)' }}>
                    Acceptées
                  </span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--green-deep, #0a8a50)' }}>
                  {formatCount(offerAcceptance.acceptedOffers)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--green-deep, #0a8a50)', opacity: 0.85 }}>
                  {formatPercentage(acceptedPct)} des offres
                </div>
              </div>

              {/* Refusées */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--r-card, 8px)',
                  backgroundColor: 'var(--red-soft, #feedf0)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--badge-danger-text)',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--red-text, #bd0e26)' }}>
                    Refusées
                  </span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--red-text, #bd0e26)' }}>
                  {formatCount(offerAcceptance.rejectedOffers)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--red-text, #bd0e26)', opacity: 0.85 }}>
                  {formatPercentage(rejectedPct)} des offres
                </div>
              </div>

              {/* En attente */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--r-card, 8px)',
                  backgroundColor: 'var(--amber-soft, #fef7ec)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--badge-warning-text)',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber-deep, #92400e)' }}>
                    En attente
                  </span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--amber-deep, #92400e)' }}>
                  {formatCount(offerAcceptance.pendingOffers)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--amber-deep, #92400e)', opacity: 0.85 }}>
                  {formatPercentage(pendingPct)} des offres
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Indicator 3: Temps moyen de réponse */}
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--ink, #1f2937)' }}>
            Temps moyen de réponse
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
            Délai d'attente du client avant la première proposition d'un réparateur
          </p>
        </div>

        {totalDemandesMeasured === 0 ? (
          <div
            style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'var(--muted, #6b7280)',
              backgroundColor: 'var(--canvas)',
              borderRadius: 'var(--r-field, 6px)',
              margin: 'auto 0',
            }}
          >
            <p style={{ margin: 0, fontSize: '14px' }}>Aucune demande disponible pour mesurer le délai de réponse.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Average & Median Metrics */}
            <div style={{ display: 'flex', gap: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--line, #f0f1f5)' }}>
              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)', textTransform: 'uppercase' }}>
                  Délai Moyen
                </span>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink, #111827)', marginTop: '2px' }}>
                  {formatResponseTime(responseTime.averageMinutes)}
                </div>
              </div>
              <div style={{ borderLeft: '1px solid var(--line, #e5e7eb)', paddingLeft: '20px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted, #6b7280)', textTransform: 'uppercase' }}>
                  Délai Médian
                </span>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink, #111827)', marginTop: '2px' }}>
                  {formatResponseTime(responseTime.medianMinutes)}
                </div>
              </div>
            </div>

            {/* Distribution Buckets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {buckets.map((b, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #111827)' }}>
                        {b.label}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--muted, #9ca3af)' }}>
                        ({b.description})
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>
                        {formatCount(b.count)}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink, #111827)', minWidth: '45px', textAlign: 'right' }}>
                        {formatPercentage(b.percentage)}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      height: '6px',
                      width: '100%',
                      backgroundColor: 'var(--line, #e5e7eb)',
                      borderRadius: 'var(--r-pill, 999px)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(0, b.percentage))}%`,
                        backgroundColor: b.color,
                        borderRadius: 'var(--r-pill, 999px)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
