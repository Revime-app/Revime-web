import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminIncompleteConnectAccount } from '@revime/shared';
import { CommandeStepper } from '../components/CommandeStepper';
import { ConnectRemindModal } from '../components/ConnectRemindModal';
import { UserDetailTabs } from '../components/UserDetailTabs';
import {
  cancellationStatusLabel,
  commandeStatusLabel,
  commandeStepLabel,
  deliveryModeLabel,
  requesterRoleLabel,
  shipmentLegLabel,
  shipmentStatusLabel,
  storedDisputeStatusLabel,
} from '../lib/status-labels';

describe('RU-16 UI5: no raw enum value reaches an operator', () => {
  it('words every value of the enums the sheets used to print raw', () => {
    expect(commandeStatusLabel('PENDING_PAYMENT')).toBe('En attente de paiement');
    expect(commandeStepLabel('PARCEL_SENT')).toBe('Colis envoyé');
    expect(shipmentStatusLabel('IN_TRANSIT')).toBe('En transit');
    expect(shipmentStatusLabel('FAILED')).toBe('Échec');
    expect(shipmentLegLabel('OUTBOUND')).toBe('Aller');
    expect(deliveryModeLabel('WORKSHOP')).toBe('Atelier');
    expect(deliveryModeLabel('PARCEL')).toBe('Colis');
    expect(cancellationStatusLabel('PENDING')).toBe('en attente');
    expect(requesterRoleLabel('ADMIN')).toBe("l'équipe Revime");
    expect(storedDisputeStatusLabel('RESOLVED_DISMISSED')).toBe('Réparation reprise');
  });

  it('a value from a newer API than this build reads as itself', () => {
    expect(shipmentStatusLabel('LOST')).toBe('LOST');
  });

  it('the user sheet tabs word the order, payment and dispute statuses', () => {
    const tabsData = {
      orders: [{ id: 'o1', role: 'CLIENT' as const, title: 'Écran', totalCents: 100, status: 'PENDING_PAYMENT', createdAt: '2026-10-01T10:00:00.000Z' }],
      payments: [{ id: 'p1', commandeId: 'o1', amountCents: 100, status: 'REFUNDED', createdAt: '2026-10-01T10:00:00.000Z' }],
      disputes: [{ id: 'd1', number: 1, commandeId: 'o1', status: 'IN_REVIEW', reason: 'Écran', createdAt: '2026-10-01T10:00:00.000Z' }],
      reviews: [],
      reports: [],
      sessions: [],
    };
    const orders = renderToString(<UserDetailTabs history={[]} tabsData={tabsData} initialTab="commandes" />);
    expect(orders).toContain('En attente de paiement');
    expect(orders).not.toContain('PENDING_PAYMENT');
    const payments = renderToString(<UserDetailTabs history={[]} tabsData={tabsData} initialTab="paiements" />);
    expect(payments).toContain('Remboursée');
    expect(payments).not.toContain('>REFUNDED<');
    const disputes = renderToString(<UserDetailTabs history={[]} tabsData={tabsData} initialTab="litiges" />);
    expect(disputes).toContain("En cours d&#x27;examen");
    expect(disputes).not.toContain('IN_REVIEW');
  });

  it('the order stepper words the cancellation request', () => {
    const html = renderToString(
      <CommandeStepper
        timeline={[]}
        cancellation={{ id: 'c1', requesterRole: 'REPAIRER', reason: null, status: 'PENDING', createdAt: '2026-10-01T10:00:00.000Z' }}
      />,
    );
    const text = html.replace(/<!-- -->/g, '');
    expect(text).toContain('Demande d’annulation (en attente)');
    expect(text).toContain('Signalée par le réparateur');
    expect(text).not.toContain('PENDING');
    expect(text).not.toContain('REPAIRER');
  });

  it('the Connect reminder modal words the account status', () => {
    const account: AdminIncompleteConnectAccount = {
      id: 'acc_1',
      userId: 'u1',
      repairerName: 'Docteur Smartphone',
      repairerEmail: 'doc@smartphone.fr',
      stripeAccountId: 'acct_1',
      status: 'RESTRICTED',
      transfersActive: false,
      disabledReason: null,
      pendingPayoutsCount: 1,
      pendingPayoutsTotalCents: 100,
      createdAt: '2026-09-01T09:00:00.000Z',
      lastSyncedAt: null,
    };
    const html = renderToString(<ConnectRemindModal isOpen account={account} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(html).toContain('Restreint');
    expect(html).not.toContain('RESTRICTED');
  });
});
