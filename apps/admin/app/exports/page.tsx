'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ExportReportType,
  ExportPeriodPreset,
  AdminDac7RecapResult,
  AdminExportPreviewResponse,
  AdminExportSummary,
} from '@revime/shared';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ExportsReportSelector } from '../../components/ExportsReportSelector';
import { ExportsPeriodFilterToolbar } from '../../components/ExportsPeriodFilterToolbar';
import { ExportsPreviewTable } from '../../components/ExportsPreviewTable';
import { ExportsKpiCards } from '../../components/ExportsKpiCards';
import { ExportsDownloadCard } from '../../components/ExportsDownloadCard';
import { ExportsComplianceCard } from '../../components/ExportsComplianceCard';

export interface ExportsPageProps {
  initialReportType?: ExportReportType;
  initialPeriod?: ExportPeriodPreset;
  initialPreview?: AdminExportPreviewResponse | null;
  initialSummary?: AdminExportSummary | null;
  initialYear?: number;
  initialFilterIncompleteOnly?: boolean;
  initialSendingRecaps?: boolean;
  initialRecapFeedback?: string | null;
}

export function filterDac7IncompleteRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.filter((r) => r.isIncomplete === true);
}

/** The declaration is for the year that just ended, which is the one the screen opens on. */
function lastCalendarYear(): number {
  return new Date().getFullYear() - 1;
}

/** The API's own French message when it sent one (a refused role, an unfinished year), else the status. */
async function apiErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === 'string') return body.message;
  } catch {
    // Not JSON: the status below is all there is.
  }
  return `Erreur HTTP ${res.status}`;
}

export function describeRecapResult(r: AdminDac7RecapResult): string {
  const parts = [`${r.sentCount} envoyé${r.sentCount > 1 ? 's' : ''}`, `${r.blockedCount} bloqué${r.blockedCount > 1 ? 's' : ''}`];
  if (r.failedCount > 0) parts.push(`${r.failedCount} en échec (à renvoyer)`);
  if (r.skippedCount > 0) parts.push(`${r.skippedCount} déjà envoyé${r.skippedCount > 1 ? 's' : ''}`);
  return `Récapitulatifs : ${parts.join(', ')}.`;
}

export async function sendDac7RecapsRequest(year: number): Promise<AdminDac7RecapResult> {
  const res = await fetch(`/api/proxy/admin/exports/dac7/send-recaps?year=${year}`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(await apiErrorMessage(res));
  }
  return (await res.json()) as AdminDac7RecapResult;
}

function getPeriodLabel(
  reportType: ExportReportType,
  period: ExportPeriodPreset,
  year: number,
  startDate?: string,
  endDate?: string
): string {
  if (reportType === 'DAC7_ANNUAL') {
    return `Année ${year}`;
  }
  switch (period) {
    case 'this_month':
      return 'Ce mois-ci';
    case 'last_month':
      return 'Mois dernier';
    case 'this_quarter':
      return 'Ce trimestre';
    case 'last_quarter':
      return 'Trimestre dernier';
    case 'this_year':
      return 'Cette année';
    case 'last_year':
      return 'Année dernière';
    case 'custom':
      if (startDate && endDate) {
        return `Du ${startDate} au ${endDate}`;
      }
      if (startDate) {
        return `À partir du ${startDate}`;
      }
      if (endDate) {
        return `Jusqu'au ${endDate}`;
      }
      return 'Période personnalisée';
    default:
      return 'Période';
  }
}

export default function ExportsPage({
  initialReportType = 'COLLECTIONS',
  initialPeriod = 'this_month',
  initialPreview = null,
  initialSummary = null,
  initialYear = lastCalendarYear(),
  initialFilterIncompleteOnly = false,
  initialSendingRecaps = false,
  initialRecapFeedback = null,
}: ExportsPageProps) {
  // State
  const [reportType, setReportType] = useState<ExportReportType>(initialReportType);
  const [period, setPeriod] = useState<ExportPeriodPreset>(initialPeriod);
  const [year, setYear] = useState<number>(initialYear);
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [preview, setPreview] = useState<AdminExportPreviewResponse | null>(initialPreview);
  const [summary, setSummary] = useState<AdminExportSummary | null>(
    initialSummary ?? initialPreview?.summary ?? null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // DAC7 state
  const [filterIncompleteOnly, setFilterIncompleteOnly] = useState<boolean>(initialFilterIncompleteOnly);
  const [sendingRecaps, setSendingRecaps] = useState<boolean>(initialSendingRecaps);
  const [recapFeedback, setRecapFeedback] = useState<string | null>(initialRecapFeedback);

  // Track initial mount with provided preview to prevent redundant immediate fetch
  const skipFirstFetchRef = useRef<boolean>(initialPreview !== null && initialPreview !== undefined);

  // Sync external props changes
  useEffect(() => {
    if (initialReportType !== undefined) {
      setReportType(initialReportType);
    }
  }, [initialReportType]);

  useEffect(() => {
    if (initialPeriod !== undefined) {
      setPeriod(initialPeriod);
    }
  }, [initialPeriod]);

  useEffect(() => {
    if (initialYear !== undefined) {
      setYear(initialYear);
    }
  }, [initialYear]);

  useEffect(() => {
    if (initialPreview !== undefined) {
      setPreview(initialPreview);
      if (!initialSummary && initialPreview?.summary) {
        setSummary(initialPreview.summary);
      }
    }
  }, [initialPreview, initialSummary]);

  useEffect(() => {
    if (initialSummary !== undefined) {
      setSummary(initialSummary);
    }
  }, [initialSummary]);

  useEffect(() => {
    if (initialFilterIncompleteOnly !== undefined) {
      setFilterIncompleteOnly(initialFilterIncompleteOnly);
    }
  }, [initialFilterIncompleteOnly]);

  useEffect(() => {
    if (initialSendingRecaps !== undefined) {
      setSendingRecaps(initialSendingRecaps);
    }
  }, [initialSendingRecaps]);

  useEffect(() => {
    if (initialRecapFeedback !== undefined) {
      setRecapFeedback(initialRecapFeedback);
    }
  }, [initialRecapFeedback]);

  // Data fetching
  const fetchPreview = useCallback(
    async (
      targetReport: ExportReportType,
      targetPeriod: ExportPeriodPreset,
      targetYear: number,
      targetStart?: string,
      targetEnd?: string,
      targetQ?: string
    ) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('reportType', targetReport);
        if (targetReport === 'DAC7_ANNUAL') {
          params.set('year', String(targetYear));
        } else {
          params.set('period', targetPeriod);
          if (targetPeriod === 'custom') {
            if (targetStart) params.set('startDate', targetStart);
            if (targetEnd) params.set('endDate', targetEnd);
          }
        }
        if (targetQ?.trim()) {
          params.set('q', targetQ.trim());
        }
        params.set('page', '1');
        params.set('limit', '25');

        const res = await fetch(`/api/proxy/admin/exports/preview?${params.toString()}`);
        if (!res.ok) {
          throw new Error(await apiErrorMessage(res));
        }
        const data = (await res.json()) as AdminExportPreviewResponse;
        setPreview(data);
        if (data.summary) {
          setSummary(data.summary);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur de chargement de l'aperçu";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Effect to load data on filter change or initial mount
  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }
    void fetchPreview(reportType, period, year, startDate, endDate, searchQuery);
  }, [fetchPreview, reportType, period, year, startDate, endDate, searchQuery]);

  // Reset filters
  const handleReset = () => {
    setPeriod('this_month');
    setYear(lastCalendarYear());
    setStartDate(undefined);
    setEndDate(undefined);
    setSearchQuery('');
    setFilterIncompleteOnly(false);
  };

  // CSV Download trigger
  const handleDownload = () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      params.set('reportType', reportType);
      if (reportType === 'DAC7_ANNUAL') {
        params.set('year', String(year));
      } else {
        params.set('period', period);
        if (period === 'custom') {
          if (startDate) params.set('startDate', startDate);
          if (endDate) params.set('endDate', endDate);
        }
      }
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim());
      }
      const downloadUrl = `/api/proxy/admin/exports/download?${params.toString()}`;
      if (typeof window !== 'undefined') {
        window.location.href = downloadUrl;
      }
    } finally {
      setDownloading(false);
    }
  };

  // Recap dispatch trigger
  const handleSendRecaps = async () => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const ok = window.confirm(
        `Confirmez-vous l'envoi des récapitulatifs annuels DAC7 pour l'année ${year} aux réparateurs éligibles ?`
      );
      if (!ok) return;
    }
    setSendingRecaps(true);
    setRecapFeedback(null);
    try {
      const data = await sendDac7RecapsRequest(year);
      setRecapFeedback(describeRecapResult(data));
      await fetchPreview(reportType, period, year, startDate, endDate, searchQuery);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors de l'envoi des récapitulatifs";
      setError(msg);
    } finally {
      setSendingRecaps(false);
    }
  };

  const rawRows = preview?.previewRows ?? [];
  const incompleteCount = preview?.incompleteCount ?? 0;
  const displayedRows =
    reportType === 'DAC7_ANNUAL' && filterIncompleteOnly
      ? filterDac7IncompleteRows(rawRows)
      : rawRows;

  const effectivePeriodLabel =
    preview?.periodLabel || getPeriodLabel(reportType, period, year, startDate, endDate);

  return (
    <div className="page page--detail">
      {/* Breadcrumbs Navigation */}
      <Breadcrumbs
        items={[
          { label: 'Accueil', href: '/' },
          { label: 'Finance', href: '/paiements' },
          { label: 'Exports comptables' },
        ]}
      />

      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginTop: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 6px 0',
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--ink, #141414)',
            }}
          >
            {reportType === 'DAC7_ANNUAL' ? 'Exports · DAC7' : 'Exports comptables'}
          </h1>
          <p style={{ margin: 0, color: 'var(--muted, #6b7280)', fontSize: '15px' }}>
            {reportType === 'DAC7_ANNUAL'
              ? 'Déclaration annuelle des revenus des réparateurs, à déposer avant le 31 janvier'
              : 'Hub de reporting financier, TVA sur commissions et déclaration fiscale annuelle DAC7.'}
          </p>
        </div>
      </div>

      {/* Recap feedback banner */}
      {recapFeedback && (
        <div
          role="status"
          data-testid="dac7-recap-feedback"
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--r-field, 4px)',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--badge-success-bg)',
            border: '1px solid var(--badge-success-border)',
            color: 'var(--badge-success-text)',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true">✓</span>
            <span>{recapFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setRecapFeedback(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '16px',
              padding: '0 4px',
            }}
            aria-label="Fermer le message"
          >
            ×
          </button>
        </div>
      )}

      {/* Error alert banner */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--r-field, 4px)',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--red-soft, #feedf0)',
            border: '1px solid var(--badge-danger-border)',
            color: 'var(--red-text, #bd0e26)',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '16px',
              padding: '0 4px',
            }}
            aria-label="Fermer le message"
          >
            ×
          </button>
        </div>
      )}

      {/* Responsive 2-column Detail Grid */}
      <div className="detail-grid">
        {/* Left Column (1.6fr): Selector, Period Toolbar, Action Bar, Preview Table */}
        <div data-testid="detail-grid-left">
          <ExportsReportSelector
            activeReportType={reportType}
            onSelectReportType={(newType) => setReportType(newType)}
          />

          <ExportsPeriodFilterToolbar
            reportType={reportType}
            period={period}
            startDate={startDate}
            endDate={endDate}
            year={year}
            q={searchQuery}
            onPeriodChange={(newPreset) => setPeriod(newPreset)}
            onCustomDatesChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
            onYearChange={(newYear) => setYear(newYear)}
            onSearchChange={(q) => setSearchQuery(q)}
            onReset={handleReset}
          />

          {/* DAC7 Action Bar (matching page6_img1.png) */}
          {reportType === 'DAC7_ANNUAL' && (
            <div
              data-testid="dac7-action-bar"
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '16px',
                padding: '14px 18px',
                backgroundColor: 'var(--paper, #ffffff)',
                border: '1px solid var(--line, #dfe2e2)',
                borderRadius: 'var(--r-card, 8px)',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
              }}
            >
              <button
                type="button"
                data-testid="dac7-export-csv-button"
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  backgroundColor: 'var(--navy)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '9px 18px',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  opacity: downloading ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {downloading ? 'Génération…' : `Exporter l'année ${year} (CSV)`}
              </button>

              <button
                type="button"
                data-testid="dac7-send-recaps-button"
                onClick={handleSendRecaps}
                disabled={sendingRecaps}
                style={{
                  backgroundColor: 'var(--paper)',
                  color: 'var(--ink2)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  padding: '9px 18px',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: sendingRecaps ? 'not-allowed' : 'pointer',
                  opacity: sendingRecaps ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {sendingRecaps ? (
                  <>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '12px',
                        height: '12px',
                        border: '2px solid var(--line)',
                        borderTopColor: 'var(--ink2)',
                        borderRadius: '50%',
                      }}
                    />
                    <span>Envoi en cours…</span>
                  </>
                ) : (
                  'Envoyer les récapitulatifs aux réparateurs'
                )}
              </button>

              <button
                type="button"
                data-testid="dac7-incomplete-filter-pill"
                onClick={() => setFilterIncompleteOnly((prev) => !prev)}
                style={{
                  backgroundColor: filterIncompleteOnly ? 'var(--badge-warning-border)' : 'var(--badge-warning-bg)',
                  color: 'var(--badge-warning-text)',
                  border: '1px solid var(--badge-warning-border)',
                  borderRadius: '9999px',
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: filterIncompleteOnly ? 'inset 0 1px 2px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {`${incompleteCount} ${incompleteCount > 1 ? 'dossiers incomplets' : 'dossier incomplet'}`}
              </button>
            </div>
          )}

          <ExportsPreviewTable
            reportType={reportType}
            columns={preview?.columns ?? []}
            rows={displayedRows}
            totalRows={preview?.totalRows ?? 0}
            periodLabel={effectivePeriodLabel}
            loading={loading}
          />
        </div>

        {/* Right Column (1.1fr): KPI Cards, Download Card, Compliance Card */}
        <div data-testid="detail-grid-right">
          <ExportsKpiCards summary={summary} loading={loading} />

          <ExportsDownloadCard
            reportType={reportType}
            periodLabel={effectivePeriodLabel}
            totalRows={preview?.totalRows ?? 0}
            onDownload={handleDownload}
            loading={downloading}
          />

          <ExportsComplianceCard />
        </div>
      </div>
    </div>
  );
}
