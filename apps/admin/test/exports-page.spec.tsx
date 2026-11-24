import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ExportsPage, {
  describeRecapResult,
  filterDac7IncompleteRows,
  sendDac7RecapsRequest,
} from '../app/exports/page';
import { ExportsPreviewTable } from '../components/ExportsPreviewTable';
import type {
  AdminExportColumnDef,
  AdminExportPreviewResponse,
  AdminExportSummary,
} from '@revime/shared';

const mockDac7Columns: AdminExportColumnDef[] = [
  { key: 'repairerName', label: 'Réparateur', type: 'text' },
  { key: 'status', label: 'Statut', type: 'text' },
  { key: 'identifier', label: 'NIF / SIREN', type: 'text' },
  { key: 'birthDate', label: 'Date de naissance', type: 'text' },
  { key: 'maskedIban', label: 'IBAN', type: 'text' },
  { key: 'transactionsCount', label: 'Nb', type: 'text' },
  { key: 'q1DisbursedEur', label: 'T1', type: 'currency' },
  { key: 'q2DisbursedEur', label: 'T2', type: 'currency' },
  { key: 'q3DisbursedEur', label: 'T3', type: 'currency' },
  { key: 'q4DisbursedEur', label: 'T4', type: 'currency' },
  { key: 'feesRetainedEur', label: 'Frais', type: 'currency' },
  { key: 'recapStatus', label: 'Récap', type: 'badge' },
];

const mockDac7Rows: Record<string, unknown>[] = [
  {
    id: 'rep_1',
    repairerName: 'Camille Martin',
    status: 'Particulier',
    identifier: 'Manquant',
    birthDate: '14/03/1995',
    maskedIban: 'FR76...0412',
    transactionsCount: 8,
    q1DisbursedEur: '0,00 €',
    q2DisbursedEur: '0,00 €',
    q3DisbursedEur: '520,00 €',
    q4DisbursedEur: '620,00 €',
    feesRetainedEur: '0,00 €',
    recapStatus: 'Bloqué',
    isIncomplete: true,
  },
  {
    id: 'rep_2',
    repairerName: 'Atelier Phone Lyon',
    status: 'Société',
    identifier: '912 345 678',
    birthDate: '—',
    maskedIban: 'FR76...3301',
    transactionsCount: 42,
    q1DisbursedEur: '1 980,00 €',
    q2DisbursedEur: '2 410,00 €',
    q3DisbursedEur: '3 050,00 €',
    q4DisbursedEur: '3 300,00 €',
    feesRetainedEur: '0,00 €',
    recapStatus: 'Envoyé',
    isIncomplete: false,
  },
  {
    id: 'rep_3',
    repairerName: 'Hugo Leroy',
    status: 'Micro-entrepreneur',
    identifier: '0 98 76 543 210 98',
    birthDate: '21/07/1988',
    maskedIban: 'FR76...9054',
    transactionsCount: 15,
    q1DisbursedEur: '300,00 €',
    q2DisbursedEur: '640,00 €',
    q3DisbursedEur: '820,00 €',
    q4DisbursedEur: '910,00 €',
    feesRetainedEur: '0,00 €',
    recapStatus: 'Envoyé',
    isIncomplete: false,
  },
  {
    id: 'rep_4',
    repairerName: 'Lucas Bernard',
    status: 'Particulier',
    identifier: '1 23 45 67 890 12',
    birthDate: '05/11/1992',
    maskedIban: 'FR76...1122',
    transactionsCount: 3,
    q1DisbursedEur: '100,00 €',
    q2DisbursedEur: '0,00 €',
    q3DisbursedEur: '0,00 €',
    q4DisbursedEur: '0,00 €',
    feesRetainedEur: '0,00 €',
    recapStatus: 'En attente',
    isIncomplete: false,
  },
];

const mockSummary: AdminExportSummary = {
  totalOrdersCount: 68,
  totalGrossCents: 1250000,
  totalCommissionTtcCents: 125000,
  totalCommissionHtCents: 104167,
  totalVatCents: 20833,
  totalPayoutsCents: 1125000,
  totalRefundsCents: 0,
  uniqueRepairersCount: 4,
};

const mockDac7Preview: AdminExportPreviewResponse = {
  reportType: 'DAC7_ANNUAL',
  summary: mockSummary,
  columns: mockDac7Columns,
  previewRows: mockDac7Rows,
  totalRows: 4,
  periodLabel: 'Année 2026',
  incompleteCount: 1,
};

describe('Task 4: DAC7 Admin Dashboard UI (page6_img1.png)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Dark Navy Table Header (#1e293b) for DAC7', () => {
    it('applies dark navy styling (#1e293b and white text) to table header cells for DAC7_ANNUAL', () => {
      const html = renderToString(
        <ExportsPreviewTable
          reportType="DAC7_ANNUAL"
          columns={mockDac7Columns}
          rows={mockDac7Rows}
          totalRows={4}
          periodLabel="Année 2026"
        />
      );

      // Verify dark navy background and white text on header cells
      expect(html).toContain('data-testid="exports-preview-table"');
      expect(html).toMatch(/style="[^"]*background-color:\s*var\(--navy\)[^"]*color:\s*#ffffff/i);
      expect(html).toContain('Réparateur');
      expect(html).toContain('NIF / SIREN');
      expect(html).toContain('Récap');
    });

    it('retains standard slate light header for non-DAC7 reports', () => {
      const html = renderToString(
        <ExportsPreviewTable
          reportType="COLLECTIONS"
          columns={mockDac7Columns}
          rows={mockDac7Rows}
          totalRows={4}
          periodLabel="Ce mois-ci"
        />
      );

      // Non-DAC7 does not use #1e293b header
      expect(html).not.toMatch(/<thead[^>]*style="[^"]*background-color:\s*var\(--navy\)/i);
      expect(html).not.toMatch(/<th[^>]*style="[^"]*background-color:\s*var\(--navy\)/i);
    });
  });

  describe('2. Bold Red Text (#ef4444) for Missing Identifier', () => {
    it('formats "Manquant" in bold red text (#ef4444) for identifier column', () => {
      const html = renderToString(
        <ExportsPreviewTable
          reportType="DAC7_ANNUAL"
          columns={mockDac7Columns}
          rows={mockDac7Rows}
          totalRows={4}
          periodLabel="Année 2026"
        />
      );

      // Red bold Manquant span
      expect(html).toMatch(
        /<span[^>]*style="[^"]*color:\s*var\(--badge-danger-text\)[^"]*font-weight:\s*600[^"]*"[^>]*>Manquant<\/span>/i
      );
      // Valid identifiers are rendered normally without red color
      expect(html).toContain('912 345 678');
      expect(html).toContain('0 98 76 543 210 98');
    });
  });

  describe('3. Recap Status Badges (Envoyé, Bloqué, En attente)', () => {
    it('renders green badge for "Envoyé", red badge for "Bloqué", and neutral slate for "En attente"', () => {
      const html = renderToString(
        <ExportsPreviewTable
          reportType="DAC7_ANNUAL"
          columns={mockDac7Columns}
          rows={mockDac7Rows}
          totalRows={4}
          periodLabel="Année 2026"
        />
      );

      // "Envoyé" green pill: #dcfce7 / #166534
      expect(html).toMatch(
        /<span[^>]*style="[^"]*background-color:\s*var\(--badge-success-bg\)[^"]*color:\s*var\(--badge-success-text\)[^"]*"[^>]*>Envoyé<\/span>/i
      );

      // "Bloqué" red pill: #fee2e2 / #991b1b
      expect(html).toMatch(
        /<span[^>]*style="[^"]*background-color:\s*var\(--badge-danger-bg\)[^"]*color:\s*var\(--badge-danger-text\)[^"]*"[^>]*>Bloqué<\/span>/i
      );

      // "En attente" neutral slate pill: #f1f5f9 / #475569
      expect(html).toMatch(
        /<span[^>]*style="[^"]*background-color:\s*var\(--badge-neutral-bg\)[^"]*color:\s*var\(--ink2\)[^"]*"[^>]*>En attente<\/span>/i
      );
    });
  });

  describe('4. Incomplete Dossiers Filter Pill Toggle', () => {
    it('isolates incomplete dossiers when filter is active', () => {
      // Unfiltered: all 4 rows
      const allRows = mockDac7Rows;
      expect(allRows.length).toBe(4);

      // Filtered: only rows the API flagged `isIncomplete`, not rows whose French labels happen to match
      const incompleteRows = filterDac7IncompleteRows(allRows);
      expect(incompleteRows.length).toBe(1);
      expect(incompleteRows[0].repairerName).toBe('Camille Martin');
      expect(incompleteRows[0].identifier).toBe('Manquant');
      expect(incompleteRows[0].recapStatus).toBe('Bloqué');
    });

    it('trusts the isIncomplete flag the API sends, not the French labels of the row', () => {
      const rows = [
        // Labelled like an incomplete dossier, flagged complete: not isolated.
        { repairerUserId: 'a', repairerName: 'A', identifier: 'Manquant', recapStatus: 'Bloqué', isIncomplete: false },
        // Labelled fine, flagged incomplete: isolated.
        { repairerUserId: 'b', repairerName: 'B', identifier: '123', recapStatus: 'En attente', isIncomplete: true },
      ];
      expect(filterDac7IncompleteRows(rows).map((r) => r.repairerName)).toEqual(['B']);
    });

    it('renders interactive filter pill with incompleteCount and amber styling', () => {
      const html = renderToString(
        <ExportsPage
          initialReportType="DAC7_ANNUAL"
          initialYear={2026}
          initialPreview={mockDac7Preview}
          initialSummary={mockSummary}
        />
      );

      expect(html).toContain('data-testid="dac7-incomplete-filter-pill"');
      expect(html).toContain('1 dossier incomplet');
      expect(html).not.toContain('1 dossiers incomplets');
      // Amber styling: #fef3c7 bg, #b45309 text, #fde68a border
      expect(html).toMatch(/style="[^"]*background-color:\s*var\(--badge-warning-bg\)[^"]*color:\s*var\(--badge-warning-text\)/i);
    });

    it('renders filtered rows when initialFilterIncompleteOnly is true', () => {
      const htmlFiltered = renderToString(
        <ExportsPage
          initialReportType="DAC7_ANNUAL"
          initialYear={2026}
          initialPreview={mockDac7Preview}
          initialSummary={mockSummary}
          initialFilterIncompleteOnly={true}
        />
      );

      // Incomplete row is present
      expect(htmlFiltered).toContain('Camille Martin');
      // Compliant rows are filtered out
      expect(htmlFiltered).not.toContain('Atelier Phone Lyon');
      expect(htmlFiltered).not.toContain('Hugo Leroy');
      expect(htmlFiltered).not.toContain('Lucas Bernard');
    });
  });

  describe('5. Action Bar, Title/Subtitle, and Recap Dispatch', () => {
    it('renders title "Exports · DAC7" and legal subtitle matching page6_img1.png', () => {
      const html = renderToString(
        <ExportsPage
          initialReportType="DAC7_ANNUAL"
          initialYear={2026}
          initialPreview={mockDac7Preview}
          initialSummary={mockSummary}
        />
      );

      expect(html).toContain('Exports · DAC7');
      expect(html).toContain(
        'Déclaration annuelle des revenus des réparateurs, à déposer avant le 31 janvier'
      );
    });

    it('renders Action Bar with Exporter button and Envoyer les récapitulatifs button', () => {
      const html = renderToString(
        <ExportsPage
          initialReportType="DAC7_ANNUAL"
          initialYear={2026}
          initialPreview={mockDac7Preview}
          initialSummary={mockSummary}
        />
      );

      expect(html).toContain('data-testid="dac7-action-bar"');

      // Navy button: Exporter l'année 2026 (CSV)
      expect(html).toContain('data-testid="dac7-export-csv-button"');
      expect(html).toMatch(/Exporter l(&#x27;|')année 2026 \(CSV\)/);
      expect(html).toMatch(/style="[^"]*background-color:\s*var\(--navy\)[^"]*color:\s*#ffffff/i);

      // White button: Envoyer les récapitulatifs aux réparateurs
      expect(html).toContain('data-testid="dac7-send-recaps-button"');
      expect(html).toContain('Envoyer les récapitulatifs aux réparateurs');
      expect(html).toMatch(
        /style="[^"]*background-color:\s*var\(--paper\)[^"]*color:\s*var\(--ink2\)[^"]*border:\s*1px solid var\(--line\)/i
      );
    });

    it('displays loading spinner state and recap feedback banner when provided', () => {
      const htmlFeedback = renderToString(
        <ExportsPage
          initialReportType="DAC7_ANNUAL"
          initialYear={2026}
          initialPreview={mockDac7Preview}
          initialSummary={mockSummary}
          initialRecapFeedback="3 récapitulatifs envoyés, 1 bloqué"
        />
      );

      expect(htmlFeedback).toContain('data-testid="dac7-recap-feedback"');
      expect(htmlFeedback).toContain('3 récapitulatifs envoyés, 1 bloqué');

      const htmlLoading = renderToString(
        <ExportsPage
          initialReportType="DAC7_ANNUAL"
          initialYear={2026}
          initialPreview={mockDac7Preview}
          initialSummary={mockSummary}
          initialSendingRecaps={true}
        />
      );

      expect(htmlLoading).toContain('Envoi en cours…');
    });

    it('dispatches POST /api/proxy/admin/exports/dac7/send-recaps?year=2026 via sendDac7RecapsRequest', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sentCount: 3, blockedCount: 1, totalCount: 4 }),
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await sendDac7RecapsRequest(2026);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/proxy/admin/exports/dac7/send-recaps?year=2026',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result).toEqual({ sentCount: 3, blockedCount: 1, totalCount: 4 });
    });

    it("shows the API's own French message when the request is refused", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: "L'export DAC7 est réservé à la finance et aux administrateurs." }),
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(sendDac7RecapsRequest(2026)).rejects.toThrow(
        "L'export DAC7 est réservé à la finance et aux administrateurs."
      );
    });

    it('falls back to the HTTP status when the refusal carries no message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json');
        },
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(sendDac7RecapsRequest(2026)).rejects.toThrow('Erreur HTTP 502');
    });

    it('reports failures and already-sent recaps instead of calling every outcome « envoyé »', () => {
      expect(
        describeRecapResult({ sentCount: 3, blockedCount: 1, failedCount: 2, skippedCount: 4, totalCount: 10 })
      ).toBe('Récapitulatifs : 3 envoyés, 1 bloqué, 2 en échec (à renvoyer), 4 déjà envoyés.');
      expect(
        describeRecapResult({ sentCount: 1, blockedCount: 0, failedCount: 0, skippedCount: 0, totalCount: 1 })
      ).toBe('Récapitulatifs : 1 envoyé, 0 bloqué.');
    });

    it('opens on the year that just ended, not a hard-coded one', () => {
      const html = renderToString(
        <ExportsPage initialReportType="DAC7_ANNUAL" initialPreview={mockDac7Preview} initialSummary={mockSummary} />
      );
      const lastYear = new Date().getFullYear() - 1;
      expect(html).toContain(`Exporter l&#x27;année ${lastYear} (CSV)`);
      expect(html).toMatch(new RegExp(`<option value="${lastYear}" selected`));
    });

    it('lists the years from this one down to 2025, the API lower bound', () => {
      const html = renderToString(
        <ExportsPage initialReportType="DAC7_ANNUAL" initialPreview={mockDac7Preview} initialSummary={mockSummary} />
      );
      const thisYear = new Date().getFullYear();
      const listed = [...html.matchAll(/<option value="(\d{4})"/g)].map((m) => Number(m[1]));
      expect(listed).toEqual(Array.from({ length: thisYear - 2024 }, (_, i) => thisYear - i));
    });

    it('does not print the mockup caption « Données fictives » under real data', () => {
      const html = renderToString(
        <ExportsPreviewTable
          reportType="DAC7_ANNUAL"
          columns={mockDac7Columns}
          rows={mockDac7Rows}
          totalRows={mockDac7Rows.length}
          periodLabel="Année 2026"
        />
      );
      expect(html).not.toContain('Données fictives');
    });

    it('guarantees ZERO pure black buttons in DAC7 view', () => {
      const html = renderToString(
        <ExportsPage
          initialReportType="DAC7_ANNUAL"
          initialYear={2026}
          initialPreview={mockDac7Preview}
          initialSummary={mockSummary}
        />
      );

      const buttonMatches = html.match(/<button[^>]*style="([^"]*)"[^>]*>/g) ?? [];
      expect(buttonMatches.length).toBeGreaterThan(0);
      for (const btn of buttonMatches) {
        const lower = btn.toLowerCase();
        expect(lower).not.toContain('background-color:#000000');
        expect(lower).not.toContain('background-color: #000000');
        expect(lower).not.toContain('background-color:black');
        expect(lower).not.toContain('background-color: black');
        expect(lower).not.toContain('background-color:rgb(0,0,0)');
      }
    });

    it('renders stable row keys using repairerUserId and userId fallbacks in preview table', () => {
      const rowsWithFallbacks = [
        {
          repairerUserId: 'rep-user-abc',
          repairerName: 'Repairer With RepairerUserId',
          recapStatus: 'Envoyé',
        },
        {
          id: 'row-id-xyz',
          repairerName: 'Repairer With Id',
          recapStatus: 'Bloqué',
        },
      ];
      const html = renderToString(
        <ExportsPreviewTable
          reportType="DAC7_ANNUAL"
          columns={mockDac7Columns}
          rows={rowsWithFallbacks}
          totalRows={2}
          periodLabel="Année 2026"
        />
      );
      expect(html).toContain('Repairer With RepairerUserId');
      expect(html).toContain('Repairer With Id');
    });
  });
});
