import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ExportsPage, { type ExportsPageProps } from '../app/exports/page';
import { LINKS, ROUTE_TITLES } from '../components/AdminNav';
import type {
  AdminExportColumnDef,
  AdminExportSummary,
  AdminExportPreviewResponse,
} from '@revime/shared';

interface CustomMatchers<R = unknown> {
  toBeInTheDocument(): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

class MockElement {
  constructor(
    public text: string,
    public attrs: Record<string, string> = {},
    public tag: string = 'div'
  ) {}
}

expect.extend({
  toBeInTheDocument(received: unknown) {
    const pass = received !== null && received !== undefined;
    return {
      pass,
      message: () => `expected element ${pass ? 'not ' : ''}to be in document`,
    };
  },
});

let currentHtml = '';
let currentProps: ExportsPageProps = {};

function unescapeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&ecirc;/g, 'ê')
    .replace(/&agrave;/g, 'à')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\u202f/g, ' ');
}

function parseHeadings(html: string): MockElement[] {
  const headings: MockElement[] = [];
  const regex = /<h([1-6])\s*([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const innerText = unescapeHtml(match[3].replace(/<[^>]+>/g, '').trim());
    headings.push(new MockElement(innerText, {}, `h${match[1]}`));
  }
  return headings;
}

function parseButtons(html: string): MockElement[] {
  const buttons: MockElement[] = [];
  const regex = /<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const attrString = match[1];
    const innerText = unescapeHtml(match[2].replace(/<[^>]+>/g, '').trim());
    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2] ?? '';
    }
    buttons.push(new MockElement(innerText, attrs, 'button'));
  }
  return buttons;
}

function optionsMatchName(text: string, expected: string | RegExp): boolean {
  if (typeof expected === 'string') {
    return text.toLowerCase().includes(expected.toLowerCase());
  }
  return expected.test(text);
}

const screen = {
  getByRole(role: string, options?: { name?: string | RegExp }): MockElement {
    if (role === 'heading') {
      const headings = parseHeadings(currentHtml);
      if (options?.name) {
        const found = headings.find((h) => optionsMatchName(h.text, options.name!));
        if (!found) {
          throw new Error(
            `Unable to find heading matching ${options.name}. Found headings: ${headings.map((h) => h.text).join(', ')}`
          );
        }
        return found;
      }
      if (headings.length > 0) return headings[0];
    }

    if (role === 'button') {
      const buttons = parseButtons(currentHtml);
      if (options?.name) {
        const found = buttons.find((b) => optionsMatchName(b.text, options.name!));
        if (!found) {
          throw new Error(
            `Unable to find button matching ${options.name}. Found buttons: ${buttons.map((b) => b.text).join(', ')}`
          );
        }
        return found;
      }
      if (buttons.length > 0) return buttons[0];
    }

    throw new Error(`Unable to find element with role="${role}"`);
  },

  getByTestId(testId: string): MockElement {
    if (currentHtml.includes(`data-testid="${testId}"`)) {
      return new MockElement('', { 'data-testid': testId });
    }
    throw new Error(`Unable to find element with data-testid="${testId}"`);
  },

  getByText(matcher: string | RegExp): MockElement {
    const clean = unescapeHtml(currentHtml);
    const normalizedText = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const found =
      typeof matcher === 'string'
        ? normalizedText.includes(matcher) || clean.includes(matcher)
        : matcher.test(normalizedText) || matcher.test(clean);

    if (!found) {
      throw new Error(`Unable to find element with text: ${matcher}\nIn HTML:\n${currentHtml}`);
    }
    return new MockElement(typeof matcher === 'string' ? matcher : matcher.source);
  },
};

const mockColumnsCollections: AdminExportColumnDef[] = [
  { key: 'paidAt', label: 'Date paiement', type: 'date' },
  { key: 'orderNumber', label: 'N° Commande', type: 'link' },
  { key: 'clientName', label: 'Client', type: 'text' },
  { key: 'totalEur', label: 'Montant TTC', type: 'currency' },
  { key: 'status', label: 'Statut', type: 'badge' },
  { key: 'chargeId', label: 'ID Charge', type: 'text' },
];

const mockRowsCollections: Record<string, unknown>[] = [
  {
    id: 'cmd_1',
    orderId: 'cmd_1',
    paidAt: '2026-10-15T14:30:00.000Z',
    orderNumber: 'REV-2026-001',
    clientName: 'Alice Dupont',
    totalEur: 15000,
    status: 'PAID',
    chargeId: 'ch_1234567890',
  },
  {
    id: 'cmd_2',
    orderId: 'cmd_2',
    paidAt: '2026-10-16T09:15:00.000Z',
    orderNumber: 'REV-2026-002',
    clientName: 'Bob Martin',
    totalEur: 8500,
    status: 'REFUNDED',
    chargeId: 'ch_0987654321',
  },
];

const mockColumnsDac7: AdminExportColumnDef[] = [
  { key: 'repairerName', label: 'Raison sociale / Nom', type: 'text' },
  { key: 'siren', label: 'SIREN', type: 'text' },
  { key: 'totalGrossEur', label: 'Volume brut', type: 'currency' },
  { key: 'orderCount', label: 'Nb Commandes', type: 'text' },
  { key: 'dac7ThresholdExceeded', label: 'Seuil DAC7 dépassé', type: 'badge' },
];

const mockRowsDac7: Record<string, unknown>[] = [
  {
    id: 'rep_1',
    repairerName: 'Atelier Réparation Express',
    siren: '123456789',
    totalGrossEur: 420000,
    orderCount: 45,
    dac7ThresholdExceeded: 'OUI',
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

const mockPreviewCollections: AdminExportPreviewResponse = {
  reportType: 'COLLECTIONS',
  summary: mockSummary,
  columns: mockColumnsCollections,
  previewRows: mockRowsCollections,
  totalRows: 42,
  periodLabel: 'Ce mois-ci (Octobre 2026)',
};

const mockPreviewDac7: AdminExportPreviewResponse = {
  reportType: 'DAC7_ANNUAL',
  summary: mockSummary,
  columns: mockColumnsDac7,
  previewRows: mockRowsDac7,
  totalRows: 12,
  periodLabel: 'Année 2026',
};

const fireEvent = {
  click(element: MockElement) {
    const testId = element.attrs['data-testid'];
    if (testId === 'report-tab-dac7_annual' || optionsMatchName(element.text, /Déclaration fiscale DAC7/i)) {
      currentProps = {
        ...currentProps,
        initialReportType: 'DAC7_ANNUAL',
        initialPreview: mockPreviewDac7,
      };
      currentHtml = renderToString(<ExportsPage {...currentProps} />);
      return;
    }
    if (testId === 'report-tab-commissions_vat' || optionsMatchName(element.text, /Commissions & TVA/i)) {
      currentProps = {
        ...currentProps,
        initialReportType: 'COMMISSIONS_VAT',
      };
      currentHtml = renderToString(<ExportsPage {...currentProps} />);
      return;
    }
    if (testId === 'report-tab-collections' || optionsMatchName(element.text, /Encaissements globaux/i)) {
      currentProps = {
        ...currentProps,
        initialReportType: 'COLLECTIONS',
        initialPreview: mockPreviewCollections,
      };
      currentHtml = renderToString(<ExportsPage {...currentProps} />);
      return;
    }
  },
};

function render(element: React.ReactElement) {
  currentProps = { ...(element.props as ExportsPageProps) };
  currentHtml = renderToString(element);
}

describe('F6: Exports Comptables Hub Page (/exports) & Navigation Wiring', () => {
  beforeEach(() => {
    currentHtml = '';
    currentProps = {};
    vi.restoreAllMocks();
  });

  it('preserves /exports in AdminNav LINKS and ROUTE_TITLES', () => {
    expect(ROUTE_TITLES['/exports']).toBe('Exports comptables');
    const navLink = LINKS.find((l) => l.href === '/exports');
    expect(navLink).toEqual({
      href: '/exports',
      label: 'Exports comptables',
    });
  });

  describe('Test 1: Header, Breadcrumbs & 2-Column Detail Grid Layout', () => {
    it('renders page header, breadcrumbs (Accueil -> Finance -> Exports comptables), and 2-column .detail-grid', () => {
      render(
        <ExportsPage
          initialReportType="COLLECTIONS"
          initialPreview={mockPreviewCollections}
          initialSummary={mockSummary}
        />
      );

      // 1. Breadcrumbs
      expect(screen.getByText('Accueil')).toBeInTheDocument();
      expect(screen.getByText('Finance')).toBeInTheDocument();
      expect(screen.getByText('Exports comptables')).toBeInTheDocument();

      // 2. Page Header
      const heading = screen.getByRole('heading', { name: /Exports comptables/i });
      expect(heading).toBeInTheDocument();
      expect(
        screen.getByText(
          /Hub de reporting financier, TVA sur commissions et déclaration fiscale annuelle DAC7./i
        )
      ).toBeInTheDocument();

      // 3. Layout containers
      expect(currentHtml).toContain('page--detail');
      expect(currentHtml).toContain('detail-grid');
      expect(screen.getByTestId('detail-grid-left')).toBeInTheDocument();
      expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();
    });
  });

  describe('Test 2: ExportsReportSelector with 5 report tabs & switching', () => {
    it('renders ExportsReportSelector with all 5 report tabs; changing report updates preview', () => {
      render(
        <ExportsPage
          initialReportType="COLLECTIONS"
          initialPreview={mockPreviewCollections}
          initialSummary={mockSummary}
        />
      );

      // Verify report selector container
      expect(screen.getByTestId('exports-report-selector')).toBeInTheDocument();

      // Verify all 5 report tabs
      expect(screen.getByTestId('report-tab-collections')).toBeInTheDocument();
      expect(screen.getByText('Encaissements globaux')).toBeInTheDocument();

      expect(screen.getByTestId('report-tab-commissions_vat')).toBeInTheDocument();
      expect(screen.getByText(/Commissions & TVA Revime/i)).toBeInTheDocument();

      expect(screen.getByTestId('report-tab-payouts')).toBeInTheDocument();
      expect(screen.getByText('Versements réparateurs')).toBeInTheDocument();

      expect(screen.getByTestId('report-tab-refunds')).toBeInTheDocument();
      expect(screen.getByText('Remboursements clients')).toBeInTheDocument();

      expect(screen.getByTestId('report-tab-dac7_annual')).toBeInTheDocument();
      expect(screen.getByText('Déclaration fiscale DAC7')).toBeInTheDocument();

      // Initially collections preview rows are rendered
      expect(screen.getByText('Alice Dupont')).toBeInTheDocument();
      expect(screen.getByText('REV-2026-001')).toBeInTheDocument();

      // Switch to DAC7 tab
      const dac7Tab = screen.getByTestId('report-tab-dac7_annual');
      fireEvent.click(dac7Tab);

      // DAC7 preview table rows are now rendered
      expect(screen.getByText('Atelier Réparation Express')).toBeInTheDocument();
      expect(screen.getByText('123456789')).toBeInTheDocument();
      expect(screen.getByText('OUI')).toBeInTheDocument();
    });
  });

  describe('Test 3: ExportsPeriodFilterToolbar with presets and DAC7 year selector', () => {
    it('renders standard period presets for normal reports and DAC7 year selector for DAC7', () => {
      // 1. Collections report: presets
      render(
        <ExportsPage
          initialReportType="COLLECTIONS"
          initialPeriod="this_month"
          initialPreview={mockPreviewCollections}
          initialSummary={mockSummary}
        />
      );

      expect(screen.getByTestId('exports-period-filter-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('exports-search-input')).toBeInTheDocument();
      expect(screen.getByTestId('exports-period-presets')).toBeInTheDocument();
      expect(screen.getByTestId('period-preset-this_month')).toBeInTheDocument();
      expect(screen.getByTestId('period-preset-last_month')).toBeInTheDocument();
      expect(screen.getByTestId('period-preset-this_quarter')).toBeInTheDocument();
      expect(screen.getByTestId('period-preset-last_quarter')).toBeInTheDocument();
      expect(screen.getByTestId('period-preset-this_year')).toBeInTheDocument();
      expect(screen.getByTestId('period-preset-last_year')).toBeInTheDocument();
      expect(screen.getByTestId('period-preset-custom')).toBeInTheDocument();
      expect(screen.getByTestId('exports-reset-button')).toBeInTheDocument();

      // DAC7 year selector should not be present in COLLECTIONS mode
      expect(currentHtml).not.toContain('data-testid="dac7-year-select"');

      // 2. DAC7 report: year selector
      render(
        <ExportsPage
          initialReportType="DAC7_ANNUAL"
          initialYear={2026}
          initialPreview={mockPreviewDac7}
          initialSummary={mockSummary}
        />
      );

      expect(screen.getByTestId('dac7-year-select')).toBeInTheDocument();
      expect(screen.getByText('Année 2026')).toBeInTheDocument();
      expect(screen.getByText('Année 2025')).toBeInTheDocument();
      // Period presets should not be present in DAC7 mode
      expect(currentHtml).not.toContain('data-testid="exports-period-presets"');
    });
  });

  describe('Test 4: ExportsPreviewTable with dynamic columns and records', () => {
    it('renders dynamic table columns, formatted values, and preview banner', () => {
      render(
        <ExportsPage
          initialReportType="COLLECTIONS"
          initialPreview={mockPreviewCollections}
          initialSummary={mockSummary}
        />
      );

      expect(screen.getByTestId('exports-preview-table-container')).toBeInTheDocument();
      expect(screen.getByTestId('exports-preview-banner')).toBeInTheDocument();
      expect(
        screen.getByText(/Aperçu des premiers enregistrements \(2 \/ 42\) pour Ce mois-ci \(Octobre 2026\)/)
      ).toBeInTheDocument();

      // Column headers
      expect(screen.getByText('Date paiement')).toBeInTheDocument();
      expect(screen.getByText('N° Commande')).toBeInTheDocument();
      expect(screen.getByText('Client')).toBeInTheDocument();
      expect(screen.getByText('Montant TTC')).toBeInTheDocument();
      expect(screen.getByText('Statut')).toBeInTheDocument();
      expect(screen.getByText('ID Charge')).toBeInTheDocument();

      // Row data
      expect(screen.getByText('Alice Dupont')).toBeInTheDocument();
      expect(screen.getByText('Bob Martin')).toBeInTheDocument();
      expect(screen.getByText('150,00 €')).toBeInTheDocument();
      expect(screen.getByText('85,00 €')).toBeInTheDocument();
      expect(screen.getByText('PAID')).toBeInTheDocument();
      expect(screen.getByText('REFUNDED')).toBeInTheDocument();
      expect(screen.getByText('ch_1234567890')).toBeInTheDocument();
    });
  });

  describe('Test 5: ExportsKpiCards, ExportsDownloadCard, and ExportsComplianceCard', () => {
    it('renders KPI summary metrics, CSV download card, and legal compliance card', () => {
      render(
        <ExportsPage
          initialReportType="COLLECTIONS"
          initialPreview={mockPreviewCollections}
          initialSummary={mockSummary}
        />
      );

      // 1. KPI Cards
      expect(screen.getByTestId('exports-kpi-cards')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-gross-volume')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-commission-ht')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-vat-collected')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-payouts-disbursed')).toBeInTheDocument();

      // KPI formatted euro amounts
      expect(screen.getByText(/5\s*472,83\s*€/)).toBeInTheDocument();
      expect(screen.getByText(/456,07\s*€/)).toBeInTheDocument();
      expect(screen.getByText(/91,21\s*€/)).toBeInTheDocument();
      expect(screen.getByText(/4\s*925,55\s*€/)).toBeInTheDocument();

      // 2. Download Card
      expect(screen.getByTestId('exports-download-card')).toBeInTheDocument();
      expect(screen.getByTestId('exports-download-count')).toBeInTheDocument();
      expect(screen.getByText(/42 enregistrements/)).toBeInTheDocument();
      expect(screen.getByTestId('exports-download-button')).toBeInTheDocument();
      expect(screen.getByText("Télécharger l'export CSV")).toBeInTheDocument();

      // 3. Compliance Card
      expect(screen.getByTestId('exports-compliance-card')).toBeInTheDocument();
      expect(screen.getByText('Article 256 CGI')).toBeInTheDocument();
      expect(screen.getByText('TVA standard 20 % sur commissions')).toBeInTheDocument();
      expect(screen.getByText('Directive DAC7 & Art. 242 bis CGI')).toBeInTheDocument();
      expect(screen.getByText('0 % de commission retenue sur le réparateur')).toBeInTheDocument();
    });
  });

  describe('Test 6: Automated ZERO BLACK BUTTONS Scanner', () => {
    it('verifies that no button or badge uses black styling across all hub states', () => {
      const pageStates = [
        // 1. COLLECTIONS state
        renderToString(
          <ExportsPage
            initialReportType="COLLECTIONS"
            initialPreview={mockPreviewCollections}
            initialSummary={mockSummary}
          />
        ),
        // 2. COMMISSIONS_VAT state
        renderToString(
          <ExportsPage
            initialReportType="COMMISSIONS_VAT"
            initialPreview={mockPreviewCollections}
            initialSummary={mockSummary}
          />
        ),
        // 3. PAYOUTS state
        renderToString(
          <ExportsPage
            initialReportType="PAYOUTS"
            initialPreview={mockPreviewCollections}
            initialSummary={mockSummary}
          />
        ),
        // 4. REFUNDS state
        renderToString(
          <ExportsPage
            initialReportType="REFUNDS"
            initialPreview={mockPreviewCollections}
            initialSummary={mockSummary}
          />
        ),
        // 5. DAC7_ANNUAL state
        renderToString(
          <ExportsPage
            initialReportType="DAC7_ANNUAL"
            initialYear={2026}
            initialPreview={mockPreviewDac7}
            initialSummary={mockSummary}
          />
        ),
        // 6. Custom period state
        renderToString(
          <ExportsPage
            initialReportType="COLLECTIONS"
            initialPeriod="custom"
            initialPreview={mockPreviewCollections}
            initialSummary={mockSummary}
          />
        ),
      ];

      for (const html of pageStates) {
        const buttonRegex = /<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi;
        let match: RegExpExecArray | null;
        while ((match = buttonRegex.exec(html)) !== null) {
          const buttonAttrs = match[1];

          // Check style attribute
          const styleMatch = buttonAttrs.match(/style="([^"]*)"/i);
          if (styleMatch) {
            const style = styleMatch[1].toLowerCase();
            // Background must never be black
            expect(style).not.toMatch(
              /background(-color)?\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
            // Border must never be solid black
            expect(style).not.toMatch(
              /border(-color)?\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/
            );
          }

          // Check class attribute
          const classMatch = buttonAttrs.match(/class="([^"]*)"/i);
          if (classMatch) {
            const className = classMatch[1].toLowerCase();
            expect(className).not.toContain('black');
          }
        }
      }
    });
  });
});
