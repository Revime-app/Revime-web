import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminIncompleteConnectAccount, AdminPayoutKpis } from '@revime/shared';
import { PayoutsKpiCards } from '../components/PayoutsKpiCards';
import { PayoutsFilterToolbar } from '../components/PayoutsFilterToolbar';
import { getPayoutStatusBadge } from '../components/PayoutsTable';
import { IncompleteConnectAccountsTable } from '../components/IncompleteConnectAccountsTable';
import { ConnectRemindModal } from '../components/ConnectRemindModal';
import { PayoutDetailDrawer } from '../components/PayoutDetailDrawer';

/**
 * V8 `ISS8-013` (`DEC8-11` (3), `FND8-029`): on « Versements », a payout waiting on the réparateur's
 * setup reads as held, not as a failed transfer.
 */

const kpis: AdminPayoutKpis = {
  totalTransferredCents: 0,
  pendingEscrowCents: 0,
  failedTransfersCount: 0,
  heldPayoutsCount: 3,
  heldPayoutsCents: 15000,
  incompleteAccountsCount: 2,
};

const noAccount: AdminIncompleteConnectAccount = {
  id: 'no-account-u-none',
  userId: 'u-none',
  repairerName: 'Sans compte',
  repairerEmail: 'none@rep.fr',
  stripeAccountId: null,
  status: null,
  transfersActive: false,
  disabledReason: null,
  pendingPayoutsCount: 2,
  pendingPayoutsTotalCents: 10500,
  createdAt: '2026-11-12T10:00:00.000Z',
  lastSyncedAt: null,
};

describe('PayoutsKpiCards', () => {
  it('shows held payouts in their own tile, not as failures', () => {
    const html = renderToString(<PayoutsKpiCards kpis={kpis} />);
    expect(html).toContain('data-testid="kpi-held-payouts"');
    expect(html).toContain('En attente de configuration du réparateur');
    expect(html).toContain('150,00 € versés dès la configuration terminée');
    expect(html).not.toContain('Action requise');
    expect(html).toContain('Aucun échec de virement à ce jour');
  });

  it('reads « Non disponible » against an API older than the held figures', () => {
    const { heldPayoutsCount: _c, heldPayoutsCents: _s, ...older } = kpis;
    const html = renderToString(<PayoutsKpiCards kpis={older} />);
    expect(html).toContain('data-testid="kpi-held-payouts"');
    expect(html).toContain('Non disponible');
  });
});

describe('the list', () => {
  it('offers a « En attente du réparateur » filter', () => {
    const html = renderToString(
      <PayoutsFilterToolbar filters={{ q: '', status: 'HELD', period: 'all' }} onChange={vi.fn()} onReset={vi.fn()} />,
    );
    expect(html).toContain('data-testid="payouts-status-pill-held"');
    expect(html).toContain('En attente du réparateur');
  });

  it('badges a held payout as waiting on the réparateur, not in the danger colour', () => {
    const badge = getPayoutStatusBadge('HELD');
    expect(badge.label).toBe('En attente du réparateur');
    expect(badge.bg).toBe('var(--badge-warning-bg)');
  });
});

describe('a réparateur with held payouts and no Connect account', () => {
  it('appears in « Comptes Stripe incomplets » with no account and no sync button', () => {
    const html = renderToString(
      <IncompleteConnectAccountsTable
        items={[noAccount]}
        total={1}
        page={1}
        pageSize={25}
        totalPages={1}
        onPageChange={vi.fn()}
        onSync={vi.fn()}
        onRemind={vi.fn()}
      />,
    );
    expect(html).toContain('Sans compte');
    expect(html).toContain('Aucun compte');
    expect(html).toContain('Non créé');
    expect(html).not.toContain('data-testid="incomplete-sync-btn-no-account-u-none"');
    expect(html).toContain('data-testid="incomplete-remind-btn-no-account-u-none"');
  });

  it('can be reminded, the modal naming the missing account', () => {
    const html = renderToString(<ConnectRemindModal isOpen account={noAccount} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(html).toContain('Aucun compte');
    expect(html).toContain('Non créé');
  });
});

describe('V8 ISS8-014: the payout details drawer', () => {
  const base = {
    id: 'cmd-1',
    orderNumber: '#CMD-D6A31660',
    createdAt: '2026-09-24T09:59:08.000Z',
    paidAt: '2026-09-24T09:59:08.000Z',
    releasedAt: '2026-09-24T09:59:08.000Z',
    amountCents: 4500,
    totalOrderCents: 4993,
    commissionCents: 493,
    repairerId: 'u1',
    repairerName: 'Réparateur',
    repairerEmail: 'r@rep.fr',
    stripeAccountId: 'acct_1',
    transfersActive: false,
    stripeTransferId: null,
    stripeChargeId: 'ch_1',
    canRetry: false,
  } as const;

  it('shows a held payout reason as waiting on the réparateur, never as a transfer failure', () => {
    const html = renderToString(
      <PayoutDetailDrawer isOpen item={{ ...base, status: 'HELD', failureReason: 'Compte Stripe Connect inactif' }} onClose={vi.fn()} />,
    );
    expect(html).toContain('data-testid="payout-held-banner"');
    expect(html).toContain('Compte Stripe Connect inactif');
    expect(html).toContain('versé automatiquement dès que sa configuration est terminée');
    expect(html).not.toContain('Échec du transfert de fonds');
  });

  it('keeps the red failure box for a real failure', () => {
    const html = renderToString(
      <PayoutDetailDrawer isOpen item={{ ...base, status: 'FAILED', failureReason: 'Échec du versement Stripe' }} onClose={vi.fn()} />,
    );
    expect(html).toContain('Échec du transfert de fonds');
    expect(html).not.toContain('data-testid="payout-held-banner"');
  });
});
