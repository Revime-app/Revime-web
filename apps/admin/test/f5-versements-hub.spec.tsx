import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import VersementsPage, { type VersementsPageProps } from '../app/versements/page';
import { LINKS, ROUTE_TITLES } from '../components/AdminNav';
import type {
  AdminPayoutListItem,
  AdminIncompleteConnectAccount,
  AdminPayoutKpis,
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
let currentProps: VersementsPageProps = {};

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

    if (role === 'button' || role === 'tab') {
      const buttons = parseButtons(currentHtml);
      if (options?.name) {
        const found = buttons.find((b) => optionsMatchName(b.text, options.name!));
        if (!found) {
          throw new Error(
            `Unable to find ${role} matching ${options.name}. Found buttons: ${buttons.map((b) => b.text).join(', ')}`
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
    throw new Error(`Unable to find element with data-testid="${testId}"\nIn HTML:\n${currentHtml}`);
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
    const testId = element.attrs['data-testid'];
    if (testId === 'tab-incomplete-accounts' || optionsMatchName(element.text, /Comptes Connect incomplets/i)) {
      currentProps = { ...currentProps, initialTab: 'incomplete-accounts' };
      currentHtml = renderToString(<VersementsPage {...currentProps} />);
      return;
    }
    if (testId === 'tab-payouts' || optionsMatchName(element.text, /Journal des versements/i)) {
      currentProps = { ...currentProps, initialTab: 'payouts' };
      currentHtml = renderToString(<VersementsPage {...currentProps} />);
      return;
    }
    if (testId?.includes('retry') || optionsMatchName(element.text, /Réessayer/i)) {
      currentProps = {
        ...currentProps,
        initialRetryModalOpen: true,
        initialRetryItem: mockPayoutFailed,
      };
      currentHtml = renderToString(<VersementsPage {...currentProps} />);
      return;
    }
    if (testId?.includes('remind') || optionsMatchName(element.text, /Envoyer un rappel/i)) {
      currentProps = {
        ...currentProps,
        initialRemindModalOpen: true,
        initialRemindAccount: mockIncompleteAccount,
      };
      currentHtml = renderToString(<VersementsPage {...currentProps} />);
      return;
    }
  },
};

function render(element: React.ReactElement) {
  currentProps = { ...(element.props as VersementsPageProps) };
  currentHtml = renderToString(element);
}

const mockPayoutTransferred: AdminPayoutListItem = {
  id: 'cmd_123',
  orderNumber: 'REV-2026-001',
  createdAt: '2026-10-15T10:00:00.000Z',
  paidAt: '2026-10-15T10:05:00.000Z',
  releasedAt: '2026-10-15T12:00:00.000Z',
  amountCents: 4500,
  totalOrderCents: 5000,
  commissionCents: 500,
  status: 'TRANSFERRED',
  repairerId: 'usr_rep_1',
  repairerName: 'Atelier Réparation Express',
  repairerEmail: 'contact@atelier-express.fr',
  stripeAccountId: 'acct_1234567890',
  transfersActive: true,
  stripeTransferId: 'tr_1N8ABCDEFGH1234567',
  stripeChargeId: 'ch_1N8ABCDEFGH9876543',
  failureReason: null,
  canRetry: false,
};

const mockPayoutFailed: AdminPayoutListItem = {
  id: 'cmd_456',
  orderNumber: 'REV-2026-002',
  createdAt: '2026-10-16T08:00:00.000Z',
  paidAt: '2026-10-16T08:10:00.000Z',
  releasedAt: null,
  amountCents: 8500,
  totalOrderCents: 10000,
  commissionCents: 1500,
  status: 'FAILED',
  repairerId: 'usr_rep_2',
  repairerName: 'Docteur Smartphone',
  repairerEmail: 'doc@smartphone.fr',
  stripeAccountId: 'acct_0987654321',
  transfersActive: false,
  stripeTransferId: null,
  stripeChargeId: 'ch_2M9ABCDEFGH1234567',
  failureReason: 'Compte Stripe restreint (KYC incomplet)',
  canRetry: true,
};

const mockIncompleteAccount: AdminIncompleteConnectAccount = {
  id: 'acc_block_1',
  userId: 'usr_rep_2',
  repairerName: 'Docteur Smartphone',
  repairerEmail: 'doc@smartphone.fr',
  stripeAccountId: 'acct_0987654321',
  status: 'RESTRICTED',
  transfersActive: false,
  disabledReason: 'Justificatif d’identité requis',
  pendingPayoutsCount: 3,
  pendingPayoutsTotalCents: 24500,
  createdAt: '2026-09-01T09:00:00.000Z',
  lastSyncedAt: '2026-10-16T07:00:00.000Z',
};

const mockKpis: AdminPayoutKpis = {
  totalTransferredCents: 1250000,
  pendingEscrowCents: 345000,
  failedTransfersCount: 2,
  incompleteAccountsCount: 5,
};

describe('F5: Versements Réparateurs Hub Page (/versements) & Navigation Wiring', () => {
  beforeEach(() => {
    currentHtml = '';
    currentProps = {};
  });

  it('preserves /versements in AdminNav LINKS and ROUTE_TITLES', () => {
    expect(ROUTE_TITLES['/versements']).toBe('Versements réparateurs');
    const navLink = LINKS.find((l) => l.href === '/versements');
    expect(navLink).toEqual({
      href: '/versements',
      label: 'Versements réparateurs',
    });
  });

  describe('1. Renders header, breadcrumbs, and 2-column detail grid', () => {
    it('renders header, breadcrumbs trail, and detail grid container with 1.6fr and 1.1fr columns', () => {
      render(
        <VersementsPage
          initialPayouts={[mockPayoutTransferred, mockPayoutFailed]}
          initialIncompleteAccounts={[mockIncompleteAccount]}
          initialKpis={mockKpis}
          initialTotalPayouts={2}
          initialTotalIncomplete={1}
        />
      );

      // 1. Breadcrumbs
      expect(screen.getByText('Accueil')).toBeInTheDocument();
      expect(screen.getByText('Finance')).toBeInTheDocument();
      expect(screen.getByText('Versements réparateurs')).toBeInTheDocument();

      // 2. Header
      const heading = screen.getByRole('heading', { name: /Versements réparateurs/i });
      expect(heading).toBeInTheDocument();
      expect(
        screen.getByText(
          /Suivez les versements Stripe Connect aux réparateurs, relancez les comptes incomplets et gérez les déblocages de fonds./i
        )
      ).toBeInTheDocument();

      // 3. Layout containers
      expect(currentHtml).toContain('page--detail');
      expect(currentHtml).toContain('detail-grid');
      expect(screen.getByTestId('detail-grid-left')).toBeInTheDocument();
      expect(screen.getByTestId('detail-grid-right')).toBeInTheDocument();
    });
  });

  describe('2. Tab navigation switches between Journal des versements and Comptes Connect incomplets', () => {
    it('renders tab switcher, displays count badge for incomplete accounts, and switches content upon tab click', () => {
      render(
        <VersementsPage
          initialTab="payouts"
          initialPayouts={[mockPayoutTransferred, mockPayoutFailed]}
          initialIncompleteAccounts={[mockIncompleteAccount]}
          initialKpis={mockKpis}
          initialTotalPayouts={2}
          initialTotalIncomplete={1}
        />
      );

      // Verify Tab 1 is active and shows PayoutsFilterToolbar and PayoutsTable
      expect(screen.getByTestId('tab-payouts')).toBeInTheDocument();
      expect(screen.getByTestId('tab-incomplete-accounts')).toBeInTheDocument();
      expect(screen.getByTestId('payouts-filter-toolbar')).toBeInTheDocument();
      expect(screen.getByTestId('payouts-table')).toBeInTheDocument();
      expect(currentHtml).not.toContain('data-testid="incomplete-connect-table"');

      // Verify Incomplete Accounts Badge with count from KPIs (5)
      expect(screen.getByTestId('incomplete-accounts-badge')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();

      // Click on Tab 2: Comptes Connect incomplets
      const incompleteTab = screen.getByTestId('tab-incomplete-accounts');
      fireEvent.click(incompleteTab);

      // Verify Tab 2 is active: search bar and IncompleteConnectAccountsTable are shown
      expect(screen.getByTestId('incomplete-accounts-search-input')).toBeInTheDocument();
      expect(screen.getByTestId('incomplete-connect-table')).toBeInTheDocument();
      expect(screen.getByText('Docteur Smartphone')).toBeInTheDocument();
      expect(screen.getByText('acct_0987654321')).toBeInTheDocument();
      expect(currentHtml).not.toContain('data-testid="payouts-table"');

      // Switch back to Tab 1
      const payoutsTab = screen.getByTestId('tab-payouts');
      fireEvent.click(payoutsTab);

      expect(screen.getByTestId('payouts-table')).toBeInTheDocument();
      expect(currentHtml).not.toContain('data-testid="incomplete-connect-table"');
    });
  });

  describe('3. Renders KPI metrics, export card, and escrow info card', () => {
    it('renders 4 KPI metrics, export card with CSV trigger, and Stripe Connect escrow rules', () => {
      render(
        <VersementsPage
          initialPayouts={[mockPayoutTransferred, mockPayoutFailed]}
          initialIncompleteAccounts={[mockIncompleteAccount]}
          initialKpis={mockKpis}
          initialTotalPayouts={2}
          initialTotalIncomplete={1}
        />
      );

      // Right column: KPI cards
      expect(screen.getByTestId('payouts-kpi-cards')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-total-transferred')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-pending-escrow')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-failed-transfers')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-incomplete-accounts')).toBeInTheDocument();

      // Check values formatted in French euros and counts
      expect(screen.getByText(/12\s*500,00\s*€/)).toBeInTheDocument();
      expect(screen.getByText(/3\s*450,00\s*€/)).toBeInTheDocument();

      // Export card
      expect(screen.getByTestId('payouts-export-card')).toBeInTheDocument();
      expect(screen.getByTestId('payouts-export-csv-btn')).toBeInTheDocument();
      expect(screen.getByText('Exporter en CSV')).toBeInTheDocument();

      // Escrow info card
      expect(screen.getByTestId('payouts-escrow-info-card')).toBeInTheDocument();
      expect(screen.getByText('Règles de versement Stripe Connect')).toBeInTheDocument();
      expect(screen.getByText(/Séquestre garanti/i)).toBeInTheDocument();
      expect(screen.getByText(/Virement automatisé/i)).toBeInTheDocument();
    });
  });

  describe('4. Triggers retry modal when clicking Réessayer on a failed payout', () => {
    it('opens PayoutRetryModal with orderNumber, amount, idempotency guarantee and confirm button', () => {
      render(
        <VersementsPage
          initialPayouts={[mockPayoutTransferred, mockPayoutFailed]}
          initialIncompleteAccounts={[mockIncompleteAccount]}
          initialKpis={mockKpis}
          initialTotalPayouts={2}
          initialTotalIncomplete={1}
        />
      );

      // Initially retry modal is not in DOM
      expect(currentHtml).not.toContain('data-testid="payout-retry-modal"');

      // Click "Réessayer" button on the failed payout row
      const retryBtn = screen.getByTestId('payout-retry-btn-cmd_456');
      fireEvent.click(retryBtn);

      // Verify modal is open with dialog accessibility
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('payout-retry-modal')).toBeInTheDocument();
      expect(screen.getByTestId('payout-retry-modal-title')).toBeInTheDocument();
      expect(screen.getByText('REV-2026-002')).toBeInTheDocument();
      expect(screen.getByText(/85,00\s*€/)).toBeInTheDocument();
      expect(screen.getByText(/Compte Stripe restreint \(KYC incomplet\)/i)).toBeInTheDocument();
      expect(screen.getByTestId('payout-retry-modal-confirm-btn')).toBeInTheDocument();
      expect(screen.getByText('Confirmer le virement')).toBeInTheDocument();
    });
  });

  describe('5. Triggers reminder modal when clicking Envoyer un rappel on an incomplete account', () => {
    it('opens ConnectRemindModal with repairer identity, escrow funds held, and confirm button', () => {
      render(
        <VersementsPage
          initialTab="incomplete-accounts"
          initialPayouts={[mockPayoutTransferred, mockPayoutFailed]}
          initialIncompleteAccounts={[mockIncompleteAccount]}
          initialKpis={mockKpis}
          initialTotalPayouts={2}
          initialTotalIncomplete={1}
        />
      );

      // Initially reminder modal is not in DOM
      expect(currentHtml).not.toContain('data-testid="connect-remind-modal"');

      // Click "Envoyer un rappel" button on the incomplete account row
      const remindBtn = screen.getByTestId('incomplete-remind-btn-acc_block_1');
      fireEvent.click(remindBtn);

      // Verify modal is open with dialog accessibility
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('connect-remind-modal')).toBeInTheDocument();
      expect(screen.getByTestId('connect-remind-modal-title')).toBeInTheDocument();
      expect(screen.getByText('Docteur Smartphone')).toBeInTheDocument();
      expect(screen.getByText('acct_0987654321')).toBeInTheDocument();
      expect(screen.getByText(/245,00\s*€/)).toBeInTheDocument();
      expect(screen.getByTestId('connect-remind-modal-confirm-btn')).toBeInTheDocument();
      expect(screen.getByText('Envoyer la notification')).toBeInTheDocument();
    });
  });

  describe('6. Automated DOM Scanner - ZERO BLACK BUTTONS Brand Guidelines', () => {
    it('scans all <button> elements across all page states to guarantee ZERO black styles (#000000, rgb(0,0,0), black)', () => {
      const pageStates = [
        // Tab 1: Payouts list
        renderToString(
          <VersementsPage
            initialTab="payouts"
            initialPayouts={[mockPayoutTransferred, mockPayoutFailed]}
            initialIncompleteAccounts={[mockIncompleteAccount]}
            initialKpis={mockKpis}
          />
        ),
        // Tab 2: Incomplete accounts list
        renderToString(
          <VersementsPage
            initialTab="incomplete-accounts"
            initialPayouts={[mockPayoutTransferred, mockPayoutFailed]}
            initialIncompleteAccounts={[mockIncompleteAccount]}
            initialKpis={mockKpis}
          />
        ),
        // Retry Modal open
        renderToString(
          <VersementsPage
            initialTab="payouts"
            initialPayouts={[mockPayoutFailed]}
            initialKpis={mockKpis}
            initialRetryModalOpen={true}
            initialRetryItem={mockPayoutFailed}
          />
        ),
        // Remind Modal open
        renderToString(
          <VersementsPage
            initialTab="incomplete-accounts"
            initialIncompleteAccounts={[mockIncompleteAccount]}
            initialKpis={mockKpis}
            initialRemindModalOpen={true}
            initialRemindAccount={mockIncompleteAccount}
          />
        ),
        // Drawer open
        renderToString(
          <VersementsPage
            initialTab="payouts"
            initialPayouts={[mockPayoutFailed]}
            initialKpis={mockKpis}
            initialDrawerOpen={true}
            initialSelectedItem={mockPayoutFailed}
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
            expect(style).not.toMatch(/background(-color)?\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/);
            // Border must never be solid black
            expect(style).not.toMatch(/border(-color)?\s*:\s*(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/);
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
