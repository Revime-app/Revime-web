import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  PayoutsFilterToolbar,
  type PayoutFilterState,
} from '../components/PayoutsFilterToolbar';
import { PayoutsTable } from '../components/PayoutsTable';
import { IncompleteConnectAccountsTable } from '../components/IncompleteConnectAccountsTable';
import { PayoutsKpiCards } from '../components/PayoutsKpiCards';
import { PayoutsExportCard } from '../components/PayoutsExportCard';
import { PayoutRetryModal } from '../components/PayoutRetryModal';
import { ConnectRemindModal } from '../components/ConnectRemindModal';
import { PayoutDetailDrawer } from '../components/PayoutDetailDrawer';
import type {
  AdminPayoutListItem,
  AdminIncompleteConnectAccount,
  AdminPayoutKpis,
} from '@revime/shared';

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

describe('F5 Frontend Payout Hub Components', () => {
  describe('1. PayoutsFilterToolbar', () => {
    it('renders search input, period presets, status pills, and reset button', () => {
      const filters: PayoutFilterState = {
        q: 'Atelier',
        status: 'ALL',
        period: '7d',
      };
      const onChange = vi.fn();
      const onReset = vi.fn();

      const html = renderToString(
        <PayoutsFilterToolbar
          filters={filters}
          onChange={onChange}
          onReset={onReset}
        />
      );

      expect(html).toContain('data-testid="payouts-filter-toolbar"');
      expect(html).toContain('data-testid="payouts-search-input"');
      expect(html).toContain('value="Atelier"');
      expect(html).toContain('data-testid="payouts-period-today"');
      expect(html).toContain('data-testid="payouts-period-7d"');
      expect(html).toContain('data-testid="payouts-period-30d"');
      expect(html).toContain('data-testid="payouts-period-all"');
      expect(html).toContain('data-testid="payouts-status-pill-all"');
      expect(html).toContain('data-testid="payouts-status-pill-transferred"');
      expect(html).toContain('data-testid="payouts-status-pill-pending"');
      expect(html).toContain('data-testid="payouts-status-pill-failed"');
      expect(html).toContain('data-testid="payouts-status-pill-reversed"');
      expect(html).toContain('data-testid="payouts-reset-filters-btn"');
    });
  });

  describe('2. PayoutsTable', () => {
    it('renders table headers, row data, badges, and action buttons', () => {
      const onPageChange = vi.fn();
      const onInspect = vi.fn();
      const onRetry = vi.fn();

      const html = renderToString(
        <PayoutsTable
          items={[mockPayoutTransferred, mockPayoutFailed]}
          total={2}
          page={1}
          pageSize={25}
          totalPages={1}
          onPageChange={onPageChange}
          onInspect={onInspect}
          onRetry={onRetry}
        />
      );

      expect(html).toContain('data-testid="payouts-table-container"');
      expect(html).toContain('data-testid="payouts-table"');
      expect(html).toContain('REV-2026-001');
      expect(html).toContain('REV-2026-002');
      expect(html).toContain('Atelier Réparation Express');
      expect(html).toContain('Docteur Smartphone');
      expect(html).toContain('tr_1N8ABCDEFGH1234567');
      expect(html).toContain('data-testid="payout-status-badge-cmd_123"');
      expect(html).toContain('Transféré');
      expect(html).toContain('data-testid="payout-status-badge-cmd_456"');
      expect(html).toContain('Échoué');

      // Retry button is only present for items with canRetry: true
      expect(html).not.toContain('data-testid="payout-retry-btn-cmd_123"');
      expect(html).toContain('data-testid="payout-retry-btn-cmd_456"');
      expect(html).toContain('data-testid="payout-inspect-btn-cmd_123"');
      expect(html).toContain('data-testid="payout-inspect-btn-cmd_456"');
    });

    it('renders empty state when items is empty', () => {
      const html = renderToString(
        <PayoutsTable
          items={[]}
          total={0}
          page={1}
          pageSize={25}
          totalPages={0}
          onPageChange={vi.fn()}
          onInspect={vi.fn()}
          onRetry={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="payouts-empty-state"');
      expect(html).toContain('Aucun versement trouvé');
    });

    it('renders pagination bar when totalPages > 1', () => {
      const html = renderToString(
        <PayoutsTable
          items={[mockPayoutTransferred]}
          total={50}
          page={2}
          pageSize={25}
          totalPages={2}
          onPageChange={vi.fn()}
          onInspect={vi.fn()}
          onRetry={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="payouts-pagination-prev"');
      expect(html).toContain('data-testid="payouts-pagination-next"');
      expect(html).toContain('Page');
      expect(html).toContain('2');
    });
  });

  describe('3. IncompleteConnectAccountsTable', () => {
    it('renders account row, stripe account id, status badge, blocked funds, and actions', () => {
      const onPageChange = vi.fn();
      const onSync = vi.fn();
      const onRemind = vi.fn();

      const html = renderToString(
        <IncompleteConnectAccountsTable
          items={[mockIncompleteAccount]}
          total={1}
          page={1}
          pageSize={25}
          totalPages={1}
          onPageChange={onPageChange}
          onSync={onSync}
          onRemind={onRemind}
        />
      );

      expect(html).toContain('data-testid="incomplete-connect-table-container"');
      expect(html).toContain('data-testid="incomplete-connect-table"');
      expect(html).toContain('data-testid="incomplete-connect-row-acc_block_1"');
      expect(html).toContain('Docteur Smartphone');
      expect(html).toContain('acct_0987654321');
      expect(html).toContain('Restreint');
      expect(html).toContain('Justificatif d’identité requis');
      expect(html).toContain('data-testid="incomplete-sync-btn-acc_block_1"');
      expect(html).toContain('data-testid="incomplete-remind-btn-acc_block_1"');
    });

    it('renders empty state when there are no incomplete accounts', () => {
      const html = renderToString(
        <IncompleteConnectAccountsTable
          items={[]}
          total={0}
          page={1}
          pageSize={25}
          totalPages={0}
          onPageChange={vi.fn()}
          onSync={vi.fn()}
          onRemind={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="incomplete-connect-empty-state"');
      expect(html).toContain('Aucun compte incomplet');
    });
  });

  describe('4. PayoutsKpiCards', () => {
    it('renders 4 KPI cards with formatted values and alert labels', () => {
      const html = renderToString(<PayoutsKpiCards kpis={mockKpis} />);

      expect(html).toContain('data-testid="payouts-kpi-cards"');
      expect(html).toContain('data-testid="kpi-total-transferred"');
      expect(html).toContain('data-testid="kpi-pending-escrow"');
      expect(html).toContain('data-testid="kpi-failed-transfers"');
      expect(html).toContain('data-testid="kpi-incomplete-accounts"');

      // Check formatted euro and count values
      expect(html).toContain('12\u202f500,00\u00a0€');
      expect(html).toContain('3\u202f450,00\u00a0€');
      expect(html).toContain('Action requise');
      expect(html).toContain('À relancer');
    });
  });

  describe('5. PayoutsExportCard', () => {
    it('renders CSV export card, summary of active filters, and Bleu Ink button', () => {
      const filters: PayoutFilterState = {
        q: 'Ecran',
        status: 'FAILED',
        period: '30d',
      };
      const onExport = vi.fn();

      const html = renderToString(
        <PayoutsExportCard
          filters={filters}
          totalCount={42}
          onExport={onExport}
        />
      );

      expect(html).toContain('data-testid="payouts-export-card"');
      expect(html).toContain('data-testid="payouts-export-count"');
      expect(html).toContain('42 versements');
      expect(html).toContain('30 derniers jours');
      expect(html).toContain('Échoués');
      expect(html).toContain('data-testid="payouts-export-csv-btn"');
      expect(html).toContain('Exporter en CSV');
    });
  });

  describe('6. PayoutRetryModal', () => {
    it('renders modal dialog with orderNumber, amount, and confirm button', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      const html = renderToString(
        <PayoutRetryModal
          isOpen={true}
          item={mockPayoutFailed}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('data-testid="payout-retry-modal"');
      expect(html).toContain('data-testid="payout-retry-modal-title"');
      expect(html).toContain('REV-2026-002');
      expect(html).toContain('85,00\u00a0€');
      expect(html).toContain('Compte Stripe restreint (KYC incomplet)');
      expect(html).toContain('data-testid="payout-retry-modal-confirm-btn"');
      expect(html).toContain('Confirmer le virement');
      expect(html).toContain('data-testid="payout-retry-modal-cancel-btn"');
    });

    it('returns null when isOpen is false', () => {
      const html = renderToString(
        <PayoutRetryModal
          isOpen={false}
          item={mockPayoutFailed}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(html).toBe('');
    });
  });

  describe('7. ConnectRemindModal', () => {
    it('renders modal dialog with repairer info, escrow funds, and Bleu Ink button', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      const html = renderToString(
        <ConnectRemindModal
          isOpen={true}
          account={mockIncompleteAccount}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('data-testid="connect-remind-modal"');
      expect(html).toContain('data-testid="connect-remind-modal-title"');
      expect(html).toContain('Docteur Smartphone');
      expect(html).toContain('acct_0987654321');
      expect(html).toContain('245,00\u00a0€');
      expect(html).toContain('data-testid="connect-remind-modal-confirm-btn"');
      expect(html).toContain('Envoyer la notification');
      expect(html).toContain('data-testid="connect-remind-modal-cancel-btn"');
    });

    it('returns null when isOpen is false', () => {
      const html = renderToString(
        <ConnectRemindModal
          isOpen={false}
          account={mockIncompleteAccount}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );

      expect(html).toBe('');
    });
  });

  describe('8. PayoutDetailDrawer', () => {
    it('renders slide-over drawer with deep links, financial breakdown, timestamps, and json copy button', () => {
      const onClose = vi.fn();
      const onRetry = vi.fn();

      const html = renderToString(
        <PayoutDetailDrawer
          isOpen={true}
          item={mockPayoutFailed}
          onClose={onClose}
          onRetry={onRetry}
        />
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('data-testid="payout-detail-drawer"');
      expect(html).toContain('data-testid="payout-detail-drawer-title"');
      expect(html).toContain('data-testid="payout-detail-order-link"');
      expect(html).toContain('data-testid="payout-detail-repairer-link"');
      expect(html).toContain('data-testid="payout-detail-copy-json-btn"');
      expect(html).toContain('data-testid="payout-detail-retry-btn"');
      expect(html).toContain('Réessayer le virement');
      expect(html).toContain('Décomposition Financière');
      expect(html).toContain('Horodatages &amp; Traçabilité Stripe');
    });

    it('returns null when isOpen is false', () => {
      const html = renderToString(
        <PayoutDetailDrawer
          isOpen={false}
          item={mockPayoutFailed}
          onClose={vi.fn()}
        />
      );

      expect(html).toBe('');
    });
  });

  describe('9. Brand Guidelines - ZERO BLACK BUTTONS Invariant', () => {
    it('guarantees no prohibited black styles on buttons across all components', () => {
      const renderedComponents = [
        renderToString(
          <PayoutsFilterToolbar
            filters={{ status: 'ALL', period: 'all' }}
            onChange={vi.fn()}
            onReset={vi.fn()}
          />
        ),
        renderToString(
          <PayoutsTable
            items={[mockPayoutTransferred, mockPayoutFailed]}
            total={2}
            page={1}
            pageSize={25}
            totalPages={1}
            onPageChange={vi.fn()}
            onInspect={vi.fn()}
            onRetry={vi.fn()}
          />
        ),
        renderToString(
          <IncompleteConnectAccountsTable
            items={[mockIncompleteAccount]}
            total={1}
            page={1}
            pageSize={25}
            totalPages={1}
            onPageChange={vi.fn()}
            onSync={vi.fn()}
            onRemind={vi.fn()}
          />
        ),
        renderToString(<PayoutsKpiCards kpis={mockKpis} />),
        renderToString(
          <PayoutsExportCard
            filters={{ status: 'ALL', period: 'all' }}
            totalCount={10}
            onExport={vi.fn()}
          />
        ),
        renderToString(
          <PayoutRetryModal
            isOpen={true}
            item={mockPayoutFailed}
            onClose={vi.fn()}
            onConfirm={vi.fn()}
          />
        ),
        renderToString(
          <ConnectRemindModal
            isOpen={true}
            account={mockIncompleteAccount}
            onClose={vi.fn()}
            onConfirm={vi.fn()}
          />
        ),
        renderToString(
          <PayoutDetailDrawer
            isOpen={true}
            item={mockPayoutFailed}
            onClose={vi.fn()}
            onRetry={vi.fn()}
          />
        ),
      ];

      for (const html of renderedComponents) {
        // Extract all button and link elements
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
        }
      }
    });
  });
});
