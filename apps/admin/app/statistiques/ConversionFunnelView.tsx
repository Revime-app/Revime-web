'use client';

import type { AdminConversionFunnelDto } from '@revime/shared';
import { formatCount, formatPercentage } from './StatsKpiCards';

export interface ConversionFunnelViewProps {
  funnel?: AdminConversionFunnelDto | null;
}

const STAGE_DEFAULT_LABELS: Record<string, string> = {
  demandes: 'Demandes publiées',
  with_offer: 'Avec offre reçue',
  accepted: 'Offre acceptée',
  paid: 'Commande payée',
  completed: 'Réparation confirmée',
};

export function ConversionFunnelView({ funnel }: ConversionFunnelViewProps) {
  const stages = funnel?.stages ?? [];

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
          marginBottom: '24px',
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
            Entonnoir de conversion des demandes
          </h3>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '13px',
              color: 'var(--muted, #6b7280)',
            }}
          >
            Progression des demandes clients depuis la publication jusqu&apos;à la confirmation de réparation
          </p>
        </div>

        <span
          className="badge"
          data-testid="overall-conversion-badge"
          style={{
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--navy-text, #25324f)',
            backgroundColor: 'var(--navy-soft, #f0f1f5)',
            padding: '4px 12px',
            borderRadius: 'var(--r-pill, 999px)',
            border: '1px solid var(--line, #dfe2e2)',
          }}
        >
          {`Taux de conversion global : ${formatPercentage(funnel?.overallConversionRate ?? 0)}`}
        </span>
      </div>

      {stages.length === 0 ? (
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
            Aucune donnée d&apos;entonnoir disponible sur cette période.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {stages.map((stage, idx) => {
            const isFirst = idx === 0;
            const label = STAGE_DEFAULT_LABELS[stage.id] || stage.label;
            const barWidth = Math.max(2, Math.min(100, stage.percentageOfTotal));

            return (
              <div
                key={stage.id}
                data-testid={`funnel-stage-${stage.id}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  padding: '14px 16px',
                  backgroundColor: 'var(--canvas)',
                  borderRadius: 'var(--r-card, 8px)',
                  border: '1px solid var(--line, #dfe2e2)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--navy, #25324f)',
                        color: 'var(--on-accent, #ffffff)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: 'var(--ink, #141414)',
                      }}
                    >
                      {label}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: 'var(--ink, #141414)',
                      }}
                    >
                      {formatCount(stage.count)}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--muted, #6b7280)',
                      }}
                    >
                      {`${formatPercentage(stage.percentageOfTotal)} du total`}
                    </span>

                    {!isFirst && (
                      <>
                        <span
                          className="badge"
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 'var(--r-pill, 999px)',
                            backgroundColor: 'var(--green-soft, #e7f8f0)',
                            color: 'var(--green-deep, #0a8a50)',
                            border: '1px solid rgba(18, 183, 106, 0.25)',
                          }}
                        >
                          {formatPercentage(stage.stepConversionRate)}
                        </span>
                        <span
                          className="badge"
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 'var(--r-pill, 999px)',
                            backgroundColor: 'var(--red-soft, #feedf0)',
                            color: 'var(--red-text, #bd0e26)',
                            border: '1px solid rgba(246, 27, 57, 0.25)',
                          }}
                        >
                          {`${formatPercentage(stage.dropOffRate)} déperdition`}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress Bar Indicator */}
                <div
                  style={{
                    height: '8px',
                    width: '100%',
                    backgroundColor: 'var(--navy-soft, #f0f1f5)',
                    borderRadius: 'var(--r-pill, 999px)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${barWidth}%`,
                      backgroundColor: 'var(--navy, #25324f)',
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
