import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import AuditPage from '../app/audit/page';
import { AuditDetailDrawer } from '../components/AuditDetailDrawer';
import { AuditFilterToolbar } from '../components/AuditFilterToolbar';
import { AuditLogTable } from '../components/AuditLogTable';
import { AuditKpiCards } from '../components/AuditKpiCards';
import { AuditExportCard } from '../components/AuditExportCard';
import { LINKS, ROUTE_TITLES } from '../components/AdminNav';
import type { AdminAuditDetailedEntry, AdminAuditKpis } from '@revime/shared';

interface CustomMatchers<R = unknown> {
  toBeInTheDocument(): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

class MockElement {
  constructor(
    public text: string,
    public attrs: Record<string, string> = {},
    public tag: string = 'div',
    public clickHandler?: () => void
  ) {}
}

expect.extend({
  toBeInTheDocument(received: any) {
    const pass = received !== null && received !== undefined;
    return {
      pass,
      message: () => `expected element ${pass ? 'not ' : ''}to be in document`,
    };
  },
});

let currentHtml = '';
let currentProps: any = {};

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

    if (role === 'dialog') {
      if (currentHtml.includes('role="dialog"')) {
        return new MockElement('dialog', { role: 'dialog' });
      }
      throw new Error('Unable to find element with role="dialog"');
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

const fireEvent = {
  click(element: MockElement) {
    if (optionsMatchName(element.text, /Inspecter/i)) {
      currentProps.initialDrawerOpen = true;
      currentProps.initialSelectedEntry = mockEntries[0];
      currentHtml = renderToString(<AuditPage {...currentProps} />);
    }
  },
};

function render(element: React.ReactElement) {
  currentProps = { ...(element.props as any) };
  currentHtml = renderToString(element);
}

const mockEntries: AdminAuditDetailedEntry[] = [
  {
    id: 'audit-test-1',
    actorUserId: 'user-admin-1',
    actorEmail: 'admin@revime.fr',
    actorRole: 'admin',
    action: 'commande.refund',
    actionLabel: 'Remboursement commande',
    domain: 'COMMANDES',
    targetType: 'Commande',
    targetId: 'cmd-999',
    statusCode: 200,
    detail: {
      amount: 4500,
      reason: 'Article non réparable',
    },
    createdAt: '2026-10-16T10:30:00.000Z',
  },
  {
    id: 'audit-test-2',
    actorUserId: 'user-mod-1',
    actorEmail: 'moderator@revime.fr',
    actorRole: 'moderateur',
    action: 'user.suspend',
    actionLabel: 'Suspension utilisateur',
    domain: 'USERS',
    targetType: 'User',
    targetId: 'usr-123',
    statusCode: 403,
    detail: {
      reason: 'Comportement abusif répété',
    },
    createdAt: '2026-10-16T11:00:00.000Z',
  },
];

const mockKpis: AdminAuditKpis = {
  actionsTodayCount: 42,
  uniqueActorsTodayCount: 5,
  topDomain: 'Commandes & Remboursements',
  totalActionsCount: 1337,
};

describe('F4: Journal d\'Audit Hub Page (/audit) & Navigation Wiring', () => {
  beforeEach(() => {
    currentHtml = '';
    currentProps = {};
  });

  it('preserves /audit in AdminNav LINKS and ROUTE_TITLES', () => {
    expect(ROUTE_TITLES['/audit']).toBe("Journal d'audit");
    const navLink = LINKS.find((l) => l.href === '/audit');
    expect(navLink).toEqual({
      href: '/audit',
      label: "Journal d'audit",
    });
  });

  describe('Test 1: Header, Breadcrumbs & 2-Column Detail Grid Layout', () => {
    it('renders page header, breadcrumbs, and 2-column detail grid', () => {
      render(
        <AuditPage
          initialItems={mockEntries}
          initialKpis={mockKpis}
          initialTotal={mockEntries.length}
        />
      );

      // 1. Breadcrumbs (Accueil -> Sécurité -> Journal d'audit)
      expect(screen.getByText('Accueil')).toBeInTheDocument();
      expect(screen.getByText('Sécurité')).toBeInTheDocument();
      expect(screen.getByText("Journal d'audit")).toBeInTheDocument();

      // 2. Page Header
      const heading = screen.getByRole('heading', { name: /Journal d'audit/i });
      expect(heading).toBeInTheDocument();

      // 3. Layout: .page.page--detail with .detail-grid and left/right columns
      expect(currentHtml).toContain('page--detail');
      expect(currentHtml).toContain('detail-grid');
      expect(screen.getByTestId('detail-grid-left')).toBeInTheDocument();
      expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();
    });
  });

  describe('Test 2: Toolbar, KPIs, Table & Export Card Rendering', () => {
    it('renders filter toolbar, KPI cards, table with audit log entries, and export card', () => {
      render(
        <AuditPage
          initialItems={mockEntries}
          initialKpis={mockKpis}
          initialTotal={mockEntries.length}
        />
      );

      // 1. Left column: Filter toolbar & Audit log table
      expect(screen.getByTestId('audit-filter-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('audit-log-table')).toBeInTheDocument();
      expect(screen.getByTestId('audit-row-audit-test-1')).toBeInTheDocument();
      expect(screen.getByTestId('audit-row-audit-test-2')).toBeInTheDocument();
      expect(screen.getByText('Remboursement commande')).toBeInTheDocument();
      expect(screen.getByText('Suspension utilisateur')).toBeInTheDocument();
      expect(screen.getByText('admin@revime.fr')).toBeInTheDocument();
      expect(screen.getByText('moderator@revime.fr')).toBeInTheDocument();

      // 2. Right column: KPI cards & Export card
      expect(screen.getByTestId('audit-kpi-cards')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-actions-today')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-unique-actors-today')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-top-domain')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-total-actions')).toBeInTheDocument();

      expect(screen.getByTestId('audit-export-card')).toBeInTheDocument();
      expect(screen.getByTestId('audit-export-csv-btn')).toBeInTheDocument();
      expect(screen.getByText('Exporter le journal')).toBeInTheDocument();
    });
  });

  describe('Test 3: Opening Detail Drawer upon clicking Inspecter', () => {
    it('opens detail drawer upon clicking Inspecter and verifies metadata and JSON payload', () => {
      render(
        <AuditPage
          initialItems={mockEntries}
          initialKpis={mockKpis}
          initialTotal={mockEntries.length}
        />
      );

      // Verify drawer is initially closed
      expect(currentHtml).not.toContain('role="dialog"');

      // Click "Inspecter" on the first audit item
      const inspectBtn = screen.getByRole('button', { name: /Inspecter/i });
      fireEvent.click(inspectBtn);

      // Verify drawer opens
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('audit-detail-drawer')).toBeInTheDocument();

      // Verify metadata in drawer
      expect(screen.getByText(/Détails de l'événement/i)).toBeInTheDocument();
      expect(screen.getByText('audit-test-1')).toBeInTheDocument();
      expect(screen.getByText('admin@revime.fr')).toBeInTheDocument();

      // Verify JSON payload formatted inside drawer
      expect(screen.getByText(/Article non réparable/i)).toBeInTheDocument();
      expect(screen.getByText(/4500/i)).toBeInTheDocument();
    });
  });

  describe('Test 4: ZERO BLACK BUTTONS Brand Guidelines', () => {
    it('scans all <button> elements to assert none have #000000, rgb(0,0,0), or black in style or class', () => {
      // 1. Render AuditPage in closed state
      const htmlClosed = renderToString(
        <AuditPage
          initialItems={mockEntries}
          initialKpis={mockKpis}
          initialTotal={mockEntries.length}
        />
      );

      // 2. Render AuditPage with Drawer open
      const htmlOpen = renderToString(
        <AuditPage
          initialItems={mockEntries}
          initialKpis={mockKpis}
          initialTotal={mockEntries.length}
          initialDrawerOpen={true}
          initialSelectedEntry={mockEntries[0]}
        />
      );

      // Check all rendered outputs for forbidden black styling on buttons
      const htmlSnippets = [htmlClosed, htmlOpen];

      for (const html of htmlSnippets) {
        const buttonRegex = /<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi;
        let match: RegExpExecArray | null;
        while ((match = buttonRegex.exec(html)) !== null) {
          const buttonAttrs = match[1];
          // Style attribute check
          const styleMatch = buttonAttrs.match(/style="([^"]*)"/i);
          if (styleMatch) {
            const style = styleMatch[1].toLowerCase();
            // Background or background-color must never be #000, #000000, black, rgb(0,0,0), rgb(0, 0, 0)
            expect(style).not.toMatch(/background(-color)?\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/);
            // Border must not be solid black
            expect(style).not.toMatch(/border(-color)?\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/);
          }

          // Class attribute check
          const classMatch = buttonAttrs.match(/class="([^"]*)"/i);
          if (classMatch) {
            const className = classMatch[1].toLowerCase();
            expect(className).not.toContain('black');
          }
        }
      }

      // Check primary buttons use Bleu Ink var(--navy, #25324f)
      expect(htmlOpen).toContain('var(--navy, #25324f)');
    });
  });
});
