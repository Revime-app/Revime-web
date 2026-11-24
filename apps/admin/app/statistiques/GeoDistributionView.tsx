'use client';

import type { AdminStatsOverviewDto } from '@revime/shared';
import { formatCount, formatPercentage } from './StatsKpiCards';

export interface GeoDistributionViewProps {
  geoDistribution: AdminStatsOverviewDto['geoDistribution'];
}

export function GeoDistributionView({ geoDistribution }: GeoDistributionViewProps) {
  const totalDemandes = geoDistribution.reduce((acc, d) => acc + d.demandesCount, 0);
  const maxPercentage =
    geoDistribution.length > 0 ? Math.max(...geoDistribution.map((d) => d.percentage), 1) : 1;

  return (
    <div
      className="card"
      style={{
        marginBottom: '28px',
        padding: '20px',
        backgroundColor: 'var(--paper, #ffffff)',
        border: '1px solid var(--line, #dfe2e2)',
        borderRadius: 'var(--r-card, 12px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
            }}
          >
            Répartition géographique des demandes
          </h3>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '13px',
              color: 'var(--muted, #6b7280)',
            }}
          >
            Top départements par volume de demandes créées par les clients et réparateurs actifs
          </p>
        </div>

        {totalDemandes > 0 && (
          <span
            className="badge"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--navy-text, #25324f)',
              backgroundColor: 'var(--navy-soft, #f0f1f5)',
              padding: '2px 8px',
              borderRadius: 'var(--r-pill, 999px)',
              border: '1px solid var(--line, #dfe2e2)',
            }}
          >
            {`${formatCount(totalDemandes)} demande${totalDemandes > 1 ? 's' : ''} répartie${totalDemandes > 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      {geoDistribution.length === 0 ? (
        <div
          style={{
            padding: '36px 16px',
            textAlign: 'center',
            color: 'var(--muted, #6b7280)',
            backgroundColor: 'var(--canvas)',
            borderRadius: 'var(--r-field, 6px)',
          }}
        >
          <p style={{ margin: 0, fontSize: '14px' }}>
            Aucune donnée géographique enregistrée sur cette période.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '14px',
          }}
        >
          {geoDistribution.map((dept, idx) => {
            // Relative bar length for contrast
            const relativeBarWidth = Math.min(
              100,
              Math.max(5, (dept.percentage / maxPercentage) * 100),
            );

            return (
              <div
                key={dept.departmentCode}
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'var(--canvas)',
                  borderRadius: 'var(--r-card, 8px)',
                  border: '1px solid var(--line, #dfe2e2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: idx < 3 ? 'var(--ink, #141414)' : 'var(--muted, #6b7280)',
                        minWidth: '22px',
                      }}
                    >
                      #{idx + 1}
                    </span>
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: 'var(--r-field, 4px)',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: 'var(--navy-soft, #f0f1f5)',
                        color: 'var(--navy-text, #25324f)',
                        border: '1px solid var(--line, #dfe2e2)',
                      }}
                    >
                      {dept.departmentCode}
                    </span>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--ink, #141414)',
                      }}
                    >
                      {dept.departmentName}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      className="badge"
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--r-pill, 999px)',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: 'var(--navy-soft, #f0f1f5)',
                        color: 'var(--navy-text, #25324f)',
                        border: '1px solid var(--line, #dfe2e2)',
                      }}
                    >
                      {`${formatCount(dept.activeRepairersCount ?? 0)} réparateur${(dept.activeRepairersCount ?? 0) > 1 ? 's' : ''} actif${(dept.activeRepairersCount ?? 0) > 1 ? 's' : ''}`}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                      {`${formatCount(dept.demandesCount)} demande${dept.demandesCount > 1 ? 's' : ''}`}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--ink, #141414)',
                        minWidth: '45px',
                        textAlign: 'right',
                      }}
                    >
                      {formatPercentage(dept.percentage)}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    height: '6px',
                    width: '100%',
                    backgroundColor: 'var(--line, #dfe2e2)',
                    borderRadius: 'var(--r-pill, 999px)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${relativeBarWidth}%`,
                      backgroundColor:
                        idx < 3 ? 'var(--navy, #25324f)' : 'rgba(37, 50, 79, 0.45)',
                      borderRadius: 'var(--r-pill, 999px)',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
