import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ExportsReportSelector } from '../components/ExportsReportSelector';
import { ExportsPeriodFilterToolbar } from '../components/ExportsPeriodFilterToolbar';
import { ExportsPreviewTable } from '../components/ExportsPreviewTable';
import { ExportsKpiCards } from '../components/ExportsKpiCards';
import { ExportsDownloadCard } from '../components/ExportsDownloadCard';
import { ExportsComplianceCard } from '../components/ExportsComplianceCard';
import type {
  AdminExportColumnDef,
  AdminExportSummary,
} from '@revime/shared';

const mockColumns: AdminExportColumnDef[] = [
  { key: 'paidAt', label: 'Date paiement', type: 'date' },
  { key: 'orderNumber', label: 'N° Commande', type: 'link' },
  { key: 'clientName', label: 'Client', type: 'text' },
  { key: 'totalEur', label: 'Montant TTC', type: 'currency' },
  { key: 'status', label: 'Statut', type: 'badge' },
  { key: 'chargeId', label: 'ID Charge', type: 'text' },
];

const mockRows: Record<string, unknown>[] = [
  {
    id: 'cmd_1',
    orderId: 'cmd_1',
    paidAt: '2026-10-15T14:30:00.000Z',
    orderNumber: 'REV-2026-001',
    clientName: 'Alice Dupont',
    totalEur: '150,00 €',
    status: 'PAID',
    chargeId: 'ch_1234567890',
  },
  {
    id: 'cmd_2',
    orderId: 'cmd_2',
    paidAt: '2026-10-16T09:15:00.000Z',
    orderNumber: 'REV-2026-002',
    clientName: 'Bob Martin',
    totalEur: 8500, // In cents for formatCellCurrency number branch
    status: 'REFUNDED',
    chargeId: 'ch_0987654321',
  },
];

const mockSummary: AdminExportSummary = {
  totalOrdersCount: 42,
  totalGrossCents: 547283,
  totalCommissionTtcCents: 54728,
  totalCommissionHtCents: 45607,
  totalVatCents: 9121,
  totalPayoutsCents: 492555,
  totalRefundsCents: 0,
  uniqueRepairersCount: 12,
};

describe('F6 Frontend Accounting Hub Components', () => {
  describe('1. ExportsReportSelector', () => {
    it('renders 5 report pills with testids and highlights active selection', () => {
      const onSelect = vi.fn();
      const html = renderToString(
        <ExportsReportSelector
          activeReportType="COMMISSIONS_VAT"
          onSelectReportType={onSelect}
        />
      );

      expect(html).toContain('data-testid="exports-report-selector"');
      expect(html).toContain('data-testid="report-tab-collections"');
      expect(html).toContain('Encaissements globaux');
      expect(html).toContain('data-testid="report-tab-commissions_vat"');
      expect(html).toContain('Commissions &amp; TVA Revime');
      expect(html).toContain('data-testid="report-tab-payouts"');
      expect(html).toContain('Versements réparateurs');
      expect(html).toContain('data-testid="report-tab-refunds"');
      expect(html).toContain('Remboursements clients');
      expect(html).toContain('data-testid="report-tab-dac7_annual"');
      expect(html).toContain('Déclaration fiscale DAC7');

      // Active pill (COMMISSIONS_VAT) styling checks
      expect(html).toContain('background-color:var(--badge-info-bg)');
      expect(html).toContain('border:1.5px solid var(--navy, #25324f)');
    });

    it('triggers callback when onSelectReportType is called', () => {
      const onSelect = vi.fn();
      const element = (
        <ExportsReportSelector
          activeReportType="COLLECTIONS"
          onSelectReportType={onSelect}
        />
      );
      // Verify props and JSX structure
      expect(element.props.activeReportType).toBe('COLLECTIONS');
      element.props.onSelectReportType('DAC7_ANNUAL');
      expect(onSelect).toHaveBeenCalledWith('DAC7_ANNUAL');
    });
  });

  describe('2. ExportsPeriodFilterToolbar', () => {
    it('renders presets, search input and reset button in standard mode', () => {
      const onPeriodChange = vi.fn();
      const onCustomDatesChange = vi.fn();
      const onYearChange = vi.fn();
      const onSearchChange = vi.fn();
      const onReset = vi.fn();

      const html = renderToString(
        <ExportsPeriodFilterToolbar
          reportType="COLLECTIONS"
          period="this_month"
          q="Alice"
          onPeriodChange={onPeriodChange}
          onCustomDatesChange={onCustomDatesChange}
          onYearChange={onYearChange}
          onSearchChange={onSearchChange}
          onReset={onReset}
        />
      );

      expect(html).toContain('data-testid="exports-period-filter-toolbar"');
      expect(html).toContain('data-testid="exports-search-input"');
      expect(html).toContain('value="Alice"');
      expect(html).toContain('data-testid="period-preset-this_month"');
      expect(html).toContain('data-testid="period-preset-last_month"');
      expect(html).toContain('data-testid="period-preset-this_quarter"');
      expect(html).toContain('data-testid="period-preset-last_quarter"');
      expect(html).toContain('data-testid="period-preset-this_year"');
      expect(html).toContain('data-testid="period-preset-last_year"');
      expect(html).toContain('data-testid="period-preset-custom"');
      expect(html).toContain('data-testid="exports-reset-button"');
      expect(html).not.toContain('data-testid="dac7-year-select"');
    });

    it('renders custom date pickers when period is "custom"', () => {
      const html = renderToString(
        <ExportsPeriodFilterToolbar
          reportType="COMMISSIONS_VAT"
          period="custom"
          startDate="2026-01-01"
          endDate="2026-03-31"
          onPeriodChange={vi.fn()}
          onCustomDatesChange={vi.fn()}
          onYearChange={vi.fn()}
          onSearchChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="custom-start-date"');
      expect(html).toContain('value="2026-01-01"');
      expect(html).toContain('data-testid="custom-end-date"');
      expect(html).toContain('value="2026-03-31"');
    });

    it('renders calendar year dropdown when reportType is "DAC7_ANNUAL"', () => {
      const html = renderToString(
        <ExportsPeriodFilterToolbar
          reportType="DAC7_ANNUAL"
          period="this_year"
          year={2026}
          onPeriodChange={vi.fn()}
          onCustomDatesChange={vi.fn()}
          onYearChange={vi.fn()}
          onSearchChange={vi.fn()}
          onReset={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="dac7-year-select"');
      expect(html).toContain('Année 2026');
      expect(html).toContain('Année 2025');
      expect(html).not.toContain('data-testid="period-preset-this_month"');
    });
  });

  describe('3. ExportsPreviewTable', () => {
    it('renders column headers, formatted preview rows, badges, links, and banner', () => {
      const html = renderToString(
        <ExportsPreviewTable
          reportType="COLLECTIONS"
          columns={mockColumns}
          rows={mockRows}
          totalRows={42}
          periodLabel="Octobre 2026"
        />
      );

      expect(html).toContain('data-testid="exports-preview-table-container"');
      expect(html).toContain('data-testid="exports-preview-table"');
      expect(html).toContain('data-testid="exports-preview-banner"');
      expect(html).toContain('Aperçu des premiers enregistrements (2 / 42) pour Octobre 2026');

      // Headers
      expect(html).toContain('Date paiement');
      expect(html).toContain('N° Commande');
      expect(html).toContain('Client');
      expect(html).toContain('Montant TTC');
      expect(html).toContain('Statut');
      expect(html).toContain('ID Charge');

      // Rows
      expect(html).toContain('Alice Dupont');
      expect(html).toContain('Bob Martin');
      expect(html).toContain('REV-2026-001');
      expect(html).toContain('REV-2026-002');
      expect(html).toContain('/commandes/cmd_1');
      expect(html).toContain('/commandes/cmd_2');
      expect(html).toContain('150,00 €');
      expect(html).toContain('85,00\u00a0€'); // formatEuros from cents
      expect(html).toContain('PAID');
      expect(html).toContain('REFUNDED');
      expect(html).toContain('ch_1234567890');
    });

    it('renders clean empty state when rows is empty', () => {
      const html = renderToString(
        <ExportsPreviewTable
          reportType="PAYOUTS"
          columns={mockColumns}
          rows={[]}
          totalRows={0}
          periodLabel="Novembre 2026"
        />
      );

      expect(html).toContain('data-testid="exports-preview-empty"');
      expect(html).toContain('Aucun enregistrement trouvé');
      expect(html).toContain('Aperçu des premiers enregistrements (0 / 0) pour Novembre 2026');
    });

    it('renders loading state when loading is true and rows is empty', () => {
      const html = renderToString(
        <ExportsPreviewTable
          reportType="DAC7_ANNUAL"
          columns={mockColumns}
          rows={[]}
          totalRows={0}
          periodLabel="Année 2026"
          loading={true}
        />
      );

      expect(html).toContain('data-testid="exports-preview-loading"');
      expect(html).toMatch(/Chargement de l(&#x27;|')aperçu de l(&#x27;|')export…/);
    });
  });

  describe('4. ExportsKpiCards', () => {
    it('renders 4 financial metric cards with formatted Euro values and descriptions', () => {
      const html = renderToString(<ExportsKpiCards summary={mockSummary} />);

      expect(html).toContain('data-testid="exports-kpi-cards"');
      expect(html).toContain('data-testid="kpi-gross-volume"');
      expect(html).toContain('data-testid="kpi-commission-ht"');
      expect(html).toContain('data-testid="kpi-vat-collected"');
      expect(html).toContain('data-testid="kpi-payouts-disbursed"');

      // Formatted Euro amounts check
      expect(html).toContain('5\u202f472,83\u00a0€'); // Gross volume
      expect(html).toContain('456,07\u00a0€');       // Commission HT
      expect(html).toContain('91,21\u00a0€');        // VAT 20%
      expect(html).toContain('4\u202f925,55\u00a0€'); // Payouts disbursed

      // Explanatory sub-texts
      expect(html).toContain('Total des paiements clients encaissés TTC');
      expect(html).toContain('Base hors taxes des frais de protection Revime');
      expect(html).toContain('TVA française 20 % déclarable au Trésor Public');
      expect(html).toContain('Total viré sur les comptes Stripe des réparateurs');
    });

    it('renders fallback values when summary is null or loading is true', () => {
      const htmlNull = renderToString(<ExportsKpiCards summary={null} />);
      expect(htmlNull).toContain('0,00\u00a0€');

      const htmlLoading = renderToString(<ExportsKpiCards summary={mockSummary} loading={true} />);
      expect(htmlLoading).toContain('…');
    });
  });

  describe('5. ExportsDownloadCard', () => {
    it('renders report recap, matching records, and primary Bleu Ink download button', () => {
      const onDownload = vi.fn();
      const html = renderToString(
        <ExportsDownloadCard
          reportType="COMMISSIONS_VAT"
          periodLabel="3e Trimestre 2026"
          totalRows={128}
          onDownload={onDownload}
        />
      );

      expect(html).toContain('data-testid="exports-download-card"');
      expect(html).toContain('Commissions &amp; TVA Revime');
      expect(html).toContain('3e Trimestre 2026');
      expect(html).toContain('data-testid="exports-download-count"');
      expect(html).toContain('128 enregistrements');
      expect(html).toContain('data-testid="exports-download-button"');
      expect(html).toMatch(/Télécharger l(&#x27;|')export CSV/);
      expect(html).toContain('Encodage UTF-8 avec BOM pour compatibilité Excel native');
    });

    it('disables download button when totalRows is 0 or loading is true', () => {
      const htmlZero = renderToString(
        <ExportsDownloadCard
          reportType="REFUNDS"
          periodLabel="Septembre 2026"
          totalRows={0}
          onDownload={vi.fn()}
        />
      );
      expect(htmlZero).toContain('disabled=""');

      const htmlLoading = renderToString(
        <ExportsDownloadCard
          reportType="COLLECTIONS"
          periodLabel="Octobre 2026"
          totalRows={50}
          onDownload={vi.fn()}
          loading={true}
        />
      );
      expect(htmlLoading).toContain('disabled=""');
      expect(htmlLoading).toContain('Génération du CSV…');
    });
  });

  describe('6. ExportsComplianceCard', () => {
    it('renders French tax compliance guidance, Article 256 CGI, DAC7 directive, and 0% repairer fee pledge', () => {
      const html = renderToString(<ExportsComplianceCard />);

      expect(html).toContain('data-testid="exports-compliance-card"');
      expect(html).toContain('Conformité fiscale &amp; Cadre légal');
      expect(html).toContain('Article 256 CGI');
      expect(html).toContain('TVA standard 20 % sur commissions');
      expect(html).toContain('Directive DAC7 &amp; Art. 242 bis CGI');
      expect(html).toContain('Engagement Revime');
      expect(html).toContain('0 % de commission retenue sur le réparateur');
    });
  });

  describe('7. Brand Guidelines - ZERO BLACK BUTTONS Invariant', () => {
    it('guarantees no prohibited black styles or classes on buttons across all components', () => {
      const renderedComponents = [
        renderToString(
          <ExportsReportSelector
            activeReportType="COLLECTIONS"
            onSelectReportType={vi.fn()}
          />
        ),
        renderToString(
          <ExportsReportSelector
            activeReportType="DAC7_ANNUAL"
            onSelectReportType={vi.fn()}
          />
        ),
        renderToString(
          <ExportsPeriodFilterToolbar
            reportType="COLLECTIONS"
            period="this_month"
            onPeriodChange={vi.fn()}
            onCustomDatesChange={vi.fn()}
            onYearChange={vi.fn()}
            onSearchChange={vi.fn()}
            onReset={vi.fn()}
          />
        ),
        renderToString(
          <ExportsPeriodFilterToolbar
            reportType="COMMISSIONS_VAT"
            period="custom"
            startDate="2026-01-01"
            endDate="2026-02-01"
            onPeriodChange={vi.fn()}
            onCustomDatesChange={vi.fn()}
            onYearChange={vi.fn()}
            onSearchChange={vi.fn()}
            onReset={vi.fn()}
          />
        ),
        renderToString(
          <ExportsPeriodFilterToolbar
            reportType="DAC7_ANNUAL"
            period="this_year"
            year={2026}
            onPeriodChange={vi.fn()}
            onCustomDatesChange={vi.fn()}
            onYearChange={vi.fn()}
            onSearchChange={vi.fn()}
            onReset={vi.fn()}
          />
        ),
        renderToString(
          <ExportsPreviewTable
            reportType="COLLECTIONS"
            columns={mockColumns}
            rows={mockRows}
            totalRows={2}
            periodLabel="Octobre 2026"
          />
        ),
        renderToString(
          <ExportsPreviewTable
            reportType="PAYOUTS"
            columns={mockColumns}
            rows={[]}
            totalRows={0}
            periodLabel="Novembre 2026"
          />
        ),
        renderToString(<ExportsKpiCards summary={mockSummary} />),
        renderToString(<ExportsKpiCards summary={null} />),
        renderToString(
          <ExportsDownloadCard
            reportType="COLLECTIONS"
            periodLabel="Octobre 2026"
            totalRows={42}
            onDownload={vi.fn()}
          />
        ),
        renderToString(
          <ExportsDownloadCard
            reportType="DAC7_ANNUAL"
            periodLabel="Année 2026"
            totalRows={0}
            onDownload={vi.fn()}
            loading={true}
          />
        ),
        renderToString(<ExportsComplianceCard />),
      ];

      for (const html of renderedComponents) {
        // Extract all button tags
        const buttonMatches = html.match(/<button[^>]*style="([^"]*)"[^>]*>/g) ?? [];
        for (const buttonTag of buttonMatches) {
          const lower = buttonTag.toLowerCase();
          expect(lower).not.toContain('background-color:#000000');
          expect(lower).not.toContain('background-color: #000000');
          expect(lower).not.toContain('background-color:black');
          expect(lower).not.toContain('background-color: black');
          expect(lower).not.toContain('background-color:rgb(0,0,0)');
          expect(lower).not.toContain('background-color: rgb(0, 0, 0)');
          expect(lower).not.toContain('background-color:#000;');
          expect(lower).not.toContain('background-color: #000;');
          expect(lower).not.toContain('class="*black*"');
        }
      }
    });
  });
});
