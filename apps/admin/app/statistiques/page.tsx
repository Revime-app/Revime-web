'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminStatsOverviewDto, AdminStatsPeriod } from '@revime/shared';
import { StatsPeriodSelector } from './StatsPeriodSelector';
import { StatsKpiCards } from './StatsKpiCards';
import { FinancialTrendsChart } from './FinancialTrendsChart';
import { CategoryStatsView } from './CategoryStatsView';
import { PerformanceStatsView } from './PerformanceStatsView';
import { GeoDistributionView } from './GeoDistributionView';
import { RepairerLeaderboardView } from './RepairerLeaderboardView';
import { ConversionFunnelView } from './ConversionFunnelView';

type View =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: AdminStatsOverviewDto };

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export default function StatistiquesPage() {
  const [period, setPeriod] = useState<AdminStatsPeriod>('30d');
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>(() => ({
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  }));
  const [view, setView] = useState<View>({ status: 'loading' });

  const load = useCallback(
    async (
      selectedPeriod: AdminStatsPeriod,
      range?: { from: string; to: string },
      signal?: AbortSignal,
    ) => {
      setView({ status: 'loading' });
      try {
        let url = `/api/proxy/admin/stats/overview?period=${selectedPeriod}`;
        if (selectedPeriod === 'custom') {
          const activeRange = range ?? customRange;
          if (activeRange.from) url += `&from=${encodeURIComponent(activeRange.from)}`;
          if (activeRange.to) url += `&to=${encodeURIComponent(activeRange.to)}`;
        }
        const res = await fetch(url, { signal });
        if (!res.ok) {
          setView({
            status: 'error',
            message: 'Impossible de charger les statistiques de la plateforme.',
          });
          return;
        }
        const data = (await res.json()) as AdminStatsOverviewDto;
        setView({ status: 'loaded', data });
      } catch (err: unknown) {
        if (
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err as { name?: string })?.name === 'AbortError'
        ) {
          return;
        }
        setView({
          status: 'error',
          message: 'Erreur réseau lors du chargement des statistiques.',
        });
      }
    },
    [customRange],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(period, customRange, controller.signal);
    return () => {
      controller.abort();
    };
  }, [load, period, customRange]);

  const handlePeriodChange = (
    newPeriod: AdminStatsPeriod,
    newRange?: { from: string; to: string },
  ) => {
    if (newRange) {
      setCustomRange(newRange);
    }
    setPeriod(newPeriod);
  };

  const handleRetry = () => {
    void load(period, customRange);
  };

  return (
    <div className="page page--wide">
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 6px 0' }}>Statistiques</h1>
          <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
            Indicateurs d&apos;activité, conversion et performances de la plateforme
          </p>
        </div>

        {/* Period Selector */}
        <StatsPeriodSelector
          period={period}
          onPeriodChange={handlePeriodChange}
          customFrom={customRange.from}
          customTo={customRange.to}
          disabled={view.status === 'loading'}
        />
      </div>

      {/* Error state with retry button */}
      {view.status === 'error' && (
        <div
          role="alert"
          style={{
            padding: '16px 20px',
            backgroundColor: 'var(--red-soft, #feedf0)',
            color: 'var(--red-text, #bd0e26)',
            borderRadius: 'var(--r-card, 12px)',
            border: '1px solid rgba(246, 27, 57, 0.2)',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>{view.message}</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
              Veuillez vérifier votre connexion ou réessayer ultérieurement.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={handleRetry}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--red-deep, #bd0e26)',
              color: 'var(--on-accent, #ffffff)',
              border: 'none',
              borderRadius: 'var(--r-field, 6px)',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {view.status === 'loading' && (
        <div aria-busy="true" aria-label="Chargement des indicateurs">
          <div className="group" style={{ marginBottom: '28px' }}>
            <p className="group__title">Vue d&apos;ensemble</p>
            <div
              className="group__tiles"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '14px',
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="card kpi"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    backgroundColor: 'var(--paper, #ffffff)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        height: '13px',
                        width: '48%',
                        backgroundColor: 'var(--line, #dfe2e2)',
                        borderRadius: '4px',
                        marginBottom: '10px',
                        opacity: 0.6,
                      }}
                    />
                    <div
                      style={{
                        height: '28px',
                        width: '65%',
                        backgroundColor: 'var(--line, #dfe2e2)',
                        borderRadius: '6px',
                        marginBottom: '8px',
                        opacity: 0.7,
                      }}
                    />
                    <div
                      style={{
                        height: '12px',
                        width: '80%',
                        backgroundColor: 'var(--line, #dfe2e2)',
                        borderRadius: '4px',
                        opacity: 0.5,
                      }}
                    />
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <div
                      style={{
                        height: '18px',
                        width: '42%',
                        backgroundColor: 'var(--line, #dfe2e2)',
                        borderRadius: '999px',
                        opacity: 0.5,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="card"
            style={{
              height: '260px',
              backgroundColor: 'var(--paper, #ffffff)',
              marginBottom: '28px',
              opacity: 0.6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted, #6b7280)',
              fontSize: '14px',
            }}
          >
            Chargement des graphiques...
          </div>
        </div>
      )}

      {/* Loaded Content */}
      {view.status === 'loaded' && (
        <>
          <p style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', margin: '0 0 16px 0' }}>
            Données du {formatDate(view.data.startDate)} au {formatDate(view.data.endDate)}
            {view.data.comparisonPeriod ? (
              <span> (comparées à la période du {formatDate(view.data.comparisonPeriod.startDate)} au {formatDate(view.data.comparisonPeriod.endDate)})</span>
            ) : null}
          </p>

          {/* 8 Business & Operations KPI Cards */}
          <StatsKpiCards kpis={view.data.kpis} period={period} />

          {/* 5-Stage Demand Conversion Funnel */}
          <ConversionFunnelView funnel={view.data.conversionFunnel} />

          {/* Interactive Timeseries Chart (GMV/Commissions & Inscriptions/Demandes) */}
          <FinancialTrendsChart timeseries={view.data.timeseries} />

          {/* Indicators 1 & 5: Category repairs and popularity */}
          <CategoryStatsView
            repairsByCategory={view.data.repairsByCategory}
            popularCategories={view.data.popularCategories}
          />

          {/* Indicators 4 & 3: Offer acceptance breakdown & Response time distribution */}
          <PerformanceStatsView
            offerAcceptance={view.data.offerAcceptance}
            responseTime={view.data.responseTime}
          />

          {/* Indicator 2: Geographic distribution across French departments */}
          <GeoDistributionView geoDistribution={view.data.geoDistribution} />

          {/* Indicator 6: Top 10 active repairers leaderboard */}
          <RepairerLeaderboardView topRepairers={view.data.topRepairers} />
        </>
      )}
    </div>
  );
}
