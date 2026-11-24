import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  sanitizeCsvCell,
  escapeCsvCell,
  generateCsv,
  downloadCsv,
  type CsvColumn,
} from '../lib/export-csv';
import {
  compareValues,
  sortItems,
  toggleSort,
  getAriaSort,
  getSortGlyph,
} from '../lib/table-sort';
import { syncUrlParams } from '../lib/url-sync';
import { ListPagination } from '../components/ListPagination';
import { SortableTh } from '../components/SortableTh';
import { CsvExportButton } from '../components/CsvExportButton';
import { AttentionTable, type AttentionItem } from '../app/attention/page';
import { DisputeQueueTable } from '../app/litiges/DisputeQueueTable';
import { PaymentsTable } from '../app/paiements/PaymentsTable';
import type { AdminDisputeListItem, AdminPaymentListItem } from '@revime/shared';

describe('UI8 - List Improvements & Restyled Tables', () => {
  describe('Pillar 1: CSV Export Utility (RFC 4180 & OWASP CSV Injection)', () => {
    it('sanitizes null and undefined to empty strings', () => {
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
    });

    it('leaves standard numbers, booleans, and alphanumeric strings intact', () => {
      expect(sanitizeCsvCell('Bonjour')).toBe('Bonjour');
      expect(sanitizeCsvCell(1234)).toBe('1234');
      expect(sanitizeCsvCell(true)).toBe('true');
    });

    it('escapes OWASP formula injection triggers (=, +, -, @, \\t, \\r) by prepending a single quote', () => {
      expect(sanitizeCsvCell('=1+1')).toBe("'=1+1");
      expect(sanitizeCsvCell('+cmd|/c calc')).toBe("'+cmd|/c calc");
      expect(sanitizeCsvCell('-cmd|/c calc')).toBe("'-cmd|/c calc");
      expect(sanitizeCsvCell('-1+1')).toBe("'-1+1");
      expect(sanitizeCsvCell('+1-1')).toBe("'+1-1");
      expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
      expect(sanitizeCsvCell('\tmalicious')).toBe("'\tmalicious");
      expect(sanitizeCsvCell('\rmalicious')).toBe("'\rmalicious");
    });

    it('leaves a plain negative number or amount as a number (a refund exports as -5,00 €, not as text)', () => {
      expect(sanitizeCsvCell('-5')).toBe('-5');
      expect(sanitizeCsvCell('-5,00\u00a0€')).toBe('-5,00\u00a0€');
      expect(sanitizeCsvCell('-1\u202f234,50\u00a0€')).toBe('-1\u202f234,50\u00a0€');
      expect(sanitizeCsvCell('-12,5\u00a0%')).toBe('-12,5\u00a0%');
    });

    it('escapes cells containing delimiters, quotes, or newlines according to RFC 4180', () => {
      // Normal string
      expect(escapeCsvCell('Paris', ';')).toBe('Paris');

      // String with delimiter
      expect(escapeCsvCell('Paris;Lyon', ';')).toBe('"Paris;Lyon"');

      // String with quotes (quotes are doubled)
      expect(escapeCsvCell('Société "Acme"', ';')).toBe('"Société ""Acme"""');

      // String with newline
      expect(escapeCsvCell("Ligne 1\nLigne 2", ';')).toBe("\"Ligne 1\nLigne 2\"");
      expect(escapeCsvCell("Ligne 1\rLigne 2", ';')).toBe("\"Ligne 1\rLigne 2\"");
    });

    it('generates a CSV with UTF-8 BOM, headers, and semicolon delimiter by default', () => {
      interface Row {
        id: string;
        name: string;
        amount: number;
      }

      const columns: CsvColumn<Row>[] = [
        { key: 'id', label: 'Identifiant' },
        { key: 'name', label: 'Nom' },
        { key: 'amount', label: 'Montant (€)', format: (val) => `${val} €` },
      ];

      const data: Row[] = [
        { id: '1', name: 'Écran OLED', amount: 120 },
        { id: '2', name: 'Batterie "Pro"', amount: 45 },
      ];

      const csv = generateCsv(columns, data);

      // Must start with UTF-8 BOM (\uFEFF) for Excel compatibility
      expect(csv.startsWith('\uFEFF')).toBe(true);

      const content = csv.slice(1);
      const lines = content.split('\r\n');

      expect(lines[0]).toBe('Identifiant;Nom;Montant (€)');
      expect(lines[1]).toBe('1;Écran OLED;120 €');
      expect(lines[2]).toBe('2;"Batterie ""Pro""";45 €');
    });

    it('supports custom delimiters (e.g., comma)', () => {
      const columns: CsvColumn<{ a: string; b: string }>[] = [
        { key: 'a', label: 'Col A' },
        { key: 'b', label: 'Col B' },
      ];

      const csv = generateCsv(columns, [{ a: '1', b: '2' }], { delimiter: ',' });
      expect(csv).toContain('Col A,Col B\r\n1,2');
    });

    it('neutralizes malicious formula injection in generated CSV rows', () => {
      const columns: CsvColumn<{ formula: string }>[] = [
        { key: 'formula', label: 'Formule' },
      ];

      const csv = generateCsv(columns, [{ formula: '=cmd|"/C calc"!A0' }]);
      // Single quote prepended and enclosed in double quotes
      expect(csv).toContain('"\'=cmd|""/C calc""!A0"');
    });

    it('triggers client-side file download in DOM environment', () => {
      const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
      const revokeObjectURLMock = vi.fn();
      const clickMock = vi.fn();

      const fakeAnchor: Record<string, unknown> = {
        setAttribute: vi.fn(),
        style: {},
        click: clickMock,
      };

      const fakeBody = {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      };

      const fakeDocument = {
        createElement: vi.fn().mockReturnValue(fakeAnchor),
        body: fakeBody,
      };

      const originalWindow = global.window;
      const originalDocument = global.document;
      const originalURL = global.URL;

      (global as unknown as { window: unknown }).window = {};
      (global as unknown as { document: unknown }).document = fakeDocument;
      (global as unknown as { URL: unknown }).URL = {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      };

      try {
        downloadCsv('test-export.csv', 'Col1;Col2\r\nVal1;Val2');

        expect(createObjectURLMock).toHaveBeenCalledTimes(1);
        expect(fakeDocument.createElement).toHaveBeenCalledWith('a');
        expect(fakeAnchor.setAttribute).toHaveBeenCalledWith('href', 'blob:mock-url');
        expect(fakeAnchor.setAttribute).toHaveBeenCalledWith('download', 'test-export.csv');
        expect(fakeBody.appendChild).toHaveBeenCalledTimes(1);
        expect(clickMock).toHaveBeenCalledTimes(1);
        expect(fakeBody.removeChild).toHaveBeenCalledTimes(1);
        expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
      } finally {
        (global as unknown as { window: unknown }).window = originalWindow;
        (global as unknown as { document: unknown }).document = originalDocument;
        (global as unknown as { URL: unknown }).URL = originalURL;
      }
    });
  });

  describe('Pillar 2: Table Sorting Utilities (compareValues, sortItems, toggleSort)', () => {
    it('compares numbers correctly in asc and desc', () => {
      expect(compareValues(10, 20, 'asc')).toBeLessThan(0);
      expect(compareValues(20, 10, 'asc')).toBeGreaterThan(0);
      expect(compareValues(10, 10, 'asc')).toBe(0);

      expect(compareValues(10, 20, 'desc')).toBeGreaterThan(0);
      expect(compareValues(20, 10, 'desc')).toBeLessThan(0);
    });

    it('compares strings with French locale sensitivity and numeric awareness', () => {
      expect(compareValues('Alpha', 'Bêta', 'asc')).toBeLessThan(0);
      expect(compareValues('Bêta', 'Alpha', 'asc')).toBeGreaterThan(0);

      // Numeric natural sorting: "Item 2" should precede "Item 10"
      expect(compareValues('Item 2', 'Item 10', 'asc')).toBeLessThan(0);
      expect(compareValues('Item 10', 'Item 2', 'desc')).toBeLessThan(0);
    });

    it('compares ISO date strings and Date objects correctly', () => {
      const d1 = new Date('2026-01-01T10:00:00.000Z');
      const d2 = new Date('2026-02-01T10:00:00.000Z');
      expect(compareValues(d1, d2, 'asc')).toBeLessThan(0);
      expect(compareValues(d2, d1, 'desc')).toBeLessThan(0);

      const iso1 = '2026-01-01T10:00:00.000Z';
      const iso2 = '2026-03-01T10:00:00.000Z';
      expect(compareValues(iso1, iso2, 'asc')).toBeLessThan(0);
      expect(compareValues(iso2, iso1, 'desc')).toBeLessThan(0);
    });

    it('sorts null and undefined to the end in both directions', () => {
      expect(compareValues(null, 'Value', 'asc')).toBeGreaterThan(0);
      expect(compareValues('Value', null, 'asc')).toBeLessThan(0);
      expect(compareValues(null, 'Value', 'desc')).toBeGreaterThan(0);
      expect(compareValues('Value', undefined, 'desc')).toBeLessThan(0);
    });

    it('sortItems performs pure shallow sorting without mutating original array', () => {
      const original = [{ val: 3 }, { val: 1 }, { val: 2 }];
      const sorted = sortItems(original, 'val', 'asc');

      expect(sorted).toEqual([{ val: 1 }, { val: 2 }, { val: 3 }]);
      expect(original).toEqual([{ val: 3 }, { val: 1 }, { val: 2 }]); // Immuntability check
    });

    it('sortItems supports custom accessor functions', () => {
      const items = [{ nested: { score: 50 } }, { nested: { score: 10 } }];
      const sorted = sortItems(items, (row) => row.nested.score, 'asc');

      expect(sorted[0].nested.score).toBe(10);
      expect(sorted[1].nested.score).toBe(50);
    });

    it('toggleSort cycles between asc and desc for active column, and defaults to asc for new column', () => {
      // New column
      expect(toggleSort('amount', 'date', 'desc')).toEqual({ key: 'date', direction: 'asc' });

      // Same column toggles asc -> desc
      expect(toggleSort('date', 'date', 'asc')).toEqual({ key: 'date', direction: 'desc' });

      // Same column toggles desc -> asc
      expect(toggleSort('date', 'date', 'desc')).toEqual({ key: 'date', direction: 'asc' });
    });

    it('getAriaSort returns valid WAI-ARIA values', () => {
      expect(getAriaSort('date', 'amount', 'asc')).toBe('none');
      expect(getAriaSort('date', 'date', 'asc')).toBe('ascending');
      expect(getAriaSort('date', 'date', 'desc')).toBe('descending');
    });

    it('getSortGlyph returns visual indicator glyphs', () => {
      expect(getSortGlyph('date', 'amount', 'asc')).toBe(' ↕');
      expect(getSortGlyph('date', 'date', 'asc')).toBe(' ▲');
      expect(getSortGlyph('date', 'date', 'desc')).toBe(' ▼');
    });
  });

  describe('Pillar 3: URL Synchronization (syncUrlParams)', () => {
    it('updates URL search parameters via window.history.replaceState without page reload', () => {
      const replaceStateMock = vi.fn();
      const originalWindow = global.window;
      (global as unknown as { window: unknown }).window = {
        location: new URL('http://localhost/admin/paiements?page=1'),
        history: { replaceState: replaceStateMock },
      };

      try {
        syncUrlParams(
          { page: 2, pageSize: 50, sort: 'totalCents', dir: 'desc' },
          { page: 1, pageSize: 25, sort: 'createdAt', dir: 'desc' }
        );

        expect(replaceStateMock).toHaveBeenCalledTimes(1);
        const calledUrl = replaceStateMock.mock.calls[0][2];
        expect(calledUrl).toContain('page=2');
        expect(calledUrl).toContain('pageSize=50');
        expect(calledUrl).toContain('sort=totalCents');
      } finally {
        (global as unknown as { window: unknown }).window = originalWindow;
      }
    });

    it('omits defaults and empty values from the URL query string', () => {
      const replaceStateMock = vi.fn();
      const originalWindow = global.window;
      (global as unknown as { window: unknown }).window = {
        location: new URL('http://localhost/admin/paiements?q=test&status=PENDING'),
        history: { replaceState: replaceStateMock },
      };

      try {
        syncUrlParams(
          { page: 1, q: '', status: 'ALL' },
          { page: 1, q: '', status: 'ALL' }
        );

        expect(replaceStateMock).toHaveBeenCalledTimes(1);
        const calledUrl = replaceStateMock.mock.calls[0][2];
        expect(calledUrl).not.toContain('page=');
        expect(calledUrl).not.toContain('q=');
        expect(calledUrl).not.toContain('status=');
      } finally {
        (global as unknown as { window: unknown }).window = originalWindow;
      }
    });
  });

  describe('Pillar 4: ListPagination Component', () => {
    it('renders item count, "Page X sur Y", rows-per-page selector, and navigation buttons', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      const html = renderToString(
        <ListPagination
          page={2}
          pageSize={25}
          total={85}
          noun="transaction"
          pluralNoun="transactions"
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      );

      const clean = html.replace(/<!--.*?-->/g, '');
      expect(clean).toContain('85 transactions · Page 2 sur 4');
      expect(clean).toContain('Précédent');
      expect(clean).toContain('Suivant');
      expect(clean).toContain('Afficher :');
      expect(clean).toContain('value="10"');
      expect(clean).toContain('value="25"');
      expect(clean).toContain('value="50"');
      expect(clean).toContain('value="100"');
    });

    it('disables previous button on first page and next button on last page', () => {
      const firstPageHtml = renderToString(
        <ListPagination page={1} pageSize={25} total={50} onPageChange={() => {}} />
      );
      expect(firstPageHtml).toContain('disabled=""');

      const lastPageHtml = renderToString(
        <ListPagination page={2} pageSize={25} total={50} onPageChange={() => {}} />
      );
      expect(lastPageHtml).toContain('disabled=""');
    });

    it('correctly handles singular nouns when total is 1', () => {
      const html = renderToString(
        <ListPagination
          page={1}
          pageSize={10}
          total={1}
          noun="commande"
          pluralNoun="commandes"
          onPageChange={() => {}}
        />
      );
      const clean = html.replace(/<!--.*?-->/g, '');
      expect(clean).toContain('1 commande · Page 1 sur 1');
    });
  });

  describe('Pillar 5: SortableTh & CsvExportButton Components', () => {
    it('SortableTh renders accessible th with button and aria-sort', () => {
      const html = renderToString(
        <SortableTh
          columnKey="amount"
          activeKey="amount"
          direction="desc"
          label="Montant total"
          onSort={() => {}}
        />
      );

      expect(html).toContain('aria-sort="descending"');
      expect(html).toContain('data-testid="sort-amount"');
      expect(html).toContain('Montant total');
      expect(html).toContain('▼');
    });

    it('SortableTh renders inactive column with aria-sort="none" and ↕ glyph', () => {
      const html = renderToString(
        <SortableTh
          columnKey="date"
          activeKey="amount"
          direction="asc"
          label="Date de commande"
          onSort={() => {}}
        />
      );

      expect(html).toContain('aria-sort="none"');
      expect(html).toContain('Date de commande');
      expect(html).toContain('↕');
    });

    it('CsvExportButton renders download icon, label, and count badge', () => {
      const html = renderToString(
        <CsvExportButton
          onClick={() => {}}
          count={42}
          label="Exporter les données"
        />
      );

      expect(html).toContain('Exporter les données');
      expect(html).toContain('42');
      expect(html).toContain('lucide-download');
    });

    it('CsvExportButton handles disabled state', () => {
      const html = renderToString(
        <CsvExportButton
          onClick={() => {}}
          disabled={true}
          label="Exporter"
        />
      );

      expect(html).toContain('disabled=""');
    });
  });

  describe('Pillar 6: Restyled Tables & Integration', () => {
    it('AttentionTable renders sortable headers, tokenized card container, and data rows', () => {
      const mockItems: AttentionItem[] = [
        {
          commandeId: '2c53de51-0000-0000-0000-000000000001',
          demandeTitle: 'Écran iPhone 13 brisé',
          reason: 'CHARGE_MISSING',
          status: 'PENDING',
          step: 'PAYMENT_PENDING',
          totalCents: 12900,
          since: '2026-10-10T12:00:00.000Z',
        },
      ];

      const html = renderToString(
        <AttentionTable
          items={mockItems}
          sortKey="since"
          sortDirection="desc"
          onSort={() => {}}
          onCancel={() => {}}
        />
      );

      expect(html).toContain('Écran iPhone 13 brisé');
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('data-testid="sort-demandeTitle"');
      expect(html).toContain('data-testid="sort-since"');
      expect(html).toContain('129,00');
      expect(html).toContain('Charge Stripe manquante');
    });

    it('PaymentsTable renders with SortableTh headers and sorted columns', () => {
      const mockPayments: AdminPaymentListItem[] = [
        {
          id: '2c53de51-b157-430a-9d04-123456789abc',
          createdAt: '2026-10-12T14:30:00Z',
          paidAt: '2026-10-12T14:31:00Z',
          clientName: 'Alice Martin',
          clientEmail: 'alice@example.fr',
          repairerName: 'Atelier Express',
          repairerEmail: 'contact@atelier.fr',
          totalCents: 15000,
          repairCents: 12000,
          shippingCents: 1000,
          protectionCents: 2000,
          delivery: 'HAND_DELIVERY',
          step: 'RELEASED',
          status: 'PAID',
          isDisputed: false,
          disputeId: null,
          disputeStatus: null,
          stripeChargeId: null,
          stripeTransferId: null,
          stripeRefundId: null,
          refundedCents: null,
          cancellationPending: false,
          payoutStatus: 'NOT_APPLICABLE',
          payoutAmountCents: null,
        },
      ];

      const html = renderToString(
        <PaymentsTable
          items={mockPayments}
          sortKey="totalCents"
          sortDirection="desc"
          onSort={() => {}}
          onOpenDispute={() => {}}
        />
      );

      expect(html).toContain('data-testid="sort-totalCents"');
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('Alice Martin');
      expect(html).toContain('150,00');
      expect(html).toContain('Fonds débloqués');
    });

    it('DisputeQueueTable renders with SortableTh headers and dispute rows', () => {
      const mockDisputes: AdminDisputeListItem[] = [
        {
          id: 'lit-001',
          commandeId: '2c53de51-0000-0000-0000-000000000002',
          number: 104,
          motif: 'REPAIR_NON_CONFORMING',
          status: 'OPEN',
          initiator: 'CLIENT',
          reason: "L'appareil ne s'allume pas",
          clientName: 'Jean Dupont',
          clientEmail: 'jean@example.com',
          repairerName: 'Réparations Rapides',
          repairerEmail: 'reparations@example.com',
          totalCents: 20000,
          repairCents: 16000,
          assignedToUserId: null,
          assignedToName: null,
          createdAt: '2026-10-11T09:00:00Z',
          resolvedAt: null,
          verdict: null,
          commandeStatus: null,
        },
      ];

      const html = renderToString(
        <DisputeQueueTable
          items={mockDisputes}
          sortKey="disputeNumber"
          sortDirection="desc"
          onSort={() => {}}
          onOpenDossier={() => {}}
        />
      );

      expect(html).toContain('#LIT-0104');
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('data-testid="sort-disputeNumber"');
      expect(html).toContain('data-testid="sort-totalCents"');
      expect(html).toContain('Jean Dupont');
      expect(html).toContain('160,00');
    });
  });
});
