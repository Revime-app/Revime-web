'use client';

import type { AdminStatsOverviewDto } from '@revime/shared';
import { formatEuros, formatCount, formatPercentage } from './StatsKpiCards';

export interface CategoryStatsViewProps {
  repairsByCategory: AdminStatsOverviewDto['repairsByCategory'];
  popularCategories: AdminStatsOverviewDto['popularCategories'];
}

export function CategoryStatsView({
  repairsByCategory,
  popularCategories,
}: CategoryStatsViewProps) {
  const totalRepairs = repairsByCategory.reduce((acc, cat) => acc + cat.count, 0);
  const totalVolumeCents = repairsByCategory.reduce((acc, cat) => acc + cat.volumeCents, 0);

  const totalDemandes = popularCategories.reduce((acc, cat) => acc + cat.demandesCount, 0);
  const totalOffers = popularCategories.reduce((acc, cat) => acc + cat.offersCount, 0);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
        gap: '20px',
        marginBottom: '28px',
      }}
    >
      {/* Indicator 1: Nombre de réparations par catégorie */}
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--ink, #1f2937)' }}>
                Réparations par catégorie
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                Volume d'affaires et nombre de commandes payées
              </p>
            </div>
            {totalRepairs > 0 && (
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--muted, #6b7280)',
                  backgroundColor: 'var(--navy-soft, #f0f1f5)',
                  padding: '2px 8px',
                  borderRadius: 'var(--r-pill, 999px)',
                }}
              >
                {formatCount(totalRepairs)} rép. • {formatEuros(totalVolumeCents)}
              </span>
            )}
          </div>
        </div>

        {repairsByCategory.length === 0 ? (
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
            <p style={{ margin: 0, fontSize: '14px' }}>Aucune réparation enregistrée pour cette période.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {repairsByCategory.map((cat) => (
              <div key={cat.categoryId} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink, #111827)' }}>
                    {cat.categoryName}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                      {formatCount(cat.count)} rép. ({formatEuros(cat.volumeCents)})
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--ink, #111827)',
                        minWidth: '45px',
                        textAlign: 'right',
                      }}
                    >
                      {formatPercentage(cat.percentage)}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    height: '8px',
                    width: '100%',
                    backgroundColor: 'var(--line, #e5e7eb)',
                    borderRadius: 'var(--r-pill, 999px)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, cat.percentage))}%`,
                      backgroundColor: 'var(--navy-deep, #1e3a8a)',
                      borderRadius: 'var(--r-pill, 999px)',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Indicator 5: Catégories les plus populaires */}
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--ink, #1f2937)' }}>
                Catégories les plus populaires
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted, #6b7280)' }}>
                Demandes créées, offres reçues et taux de conversion
              </p>
            </div>
            {totalDemandes > 0 && (
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--muted, #6b7280)',
                  backgroundColor: 'var(--navy-soft, #f0f1f5)',
                  padding: '2px 8px',
                  borderRadius: 'var(--r-pill, 999px)',
                }}
              >
                {formatCount(totalDemandes)} dem. • {formatCount(totalOffers)} offres
              </span>
            )}
          </div>
        </div>

        {popularCategories.length === 0 ? (
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
            <p style={{ margin: 0, fontSize: '14px' }}>Aucune donnée de demande enregistrée sur cette période.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: '8px' }}>Catégorie</th>
                  <th style={{ textAlign: 'right', paddingBottom: '8px' }}>Demandes</th>
                  <th style={{ textAlign: 'right', paddingBottom: '8px' }}>Offres</th>
                  <th style={{ textAlign: 'right', paddingBottom: '8px' }}>Offres / dem.</th>
                  <th style={{ textAlign: 'right', paddingBottom: '8px' }}>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {popularCategories.map((cat) => {
                  const ratio =
                    cat.demandesCount > 0 ? (cat.offersCount / cat.demandesCount).toFixed(1) : '0.0';

                  let badgeBg = 'var(--navy-soft, #f0f1f5)';
                  let badgeColor = 'var(--muted, #4b5563)';
                  if (cat.conversionRate >= 50) {
                    badgeBg = 'var(--green-soft, #e7f8f0)';
                    badgeColor = 'var(--green-deep, #0a8a50)';
                  } else if (cat.conversionRate >= 25) {
                    badgeBg = 'var(--badge-info-bg)';
                    badgeColor = 'var(--badge-info-text)';
                  }

                  return (
                    <tr key={cat.categoryId}>
                      <td style={{ fontWeight: 600, color: 'var(--ink, #111827)', padding: '10px 8px' }}>
                        {cat.categoryName}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--ink, #374151)', padding: '10px 8px' }}>
                        {formatCount(cat.demandesCount)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--ink, #374151)', padding: '10px 8px' }}>
                        {formatCount(cat.offersCount)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--muted, #6b7280)', padding: '10px 8px' }}>
                        {ratio}
                      </td>
                      <td style={{ textAlign: 'right', padding: '10px 8px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-pill, 999px)',
                            fontSize: '12px',
                            fontWeight: 700,
                            backgroundColor: badgeBg,
                            color: badgeColor,
                          }}
                        >
                          {formatPercentage(cat.conversionRate)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
