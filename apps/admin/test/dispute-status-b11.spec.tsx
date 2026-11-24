import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DisputeQueueTable } from '../app/litiges/DisputeQueueTable';
import { getVerdictLabel } from '../lib/dispute-status-label';
import { RefundDetailDrawer } from '../app/remboursements/RefundDetailDrawer';
import { CancellationDrawer } from '../app/annulations/CancellationDrawer';
import type { AdminDisputeListItem } from '@revime/shared';

describe('Bug B11 - Dispute UI Status Consistency', () => {
  it('DisputeQueueTable: renders "Remboursé au client" and "Commande remboursée" for a dispute on a REFUNDED commande, never "Réparation reprise"', () => {
    const item: AdminDisputeListItem & { commandeStatus?: string } = {
      id: 'disp-6',
      commandeId: 'a9db011e-1234-4567-8901-234567890123',
      number: 6,
      motif: 'REPAIR_NON_CONFORMING',
      status: 'RESOLVED_REFUNDED',
      initiator: 'CLIENT',
      reason: 'Écran cassé',
      clientName: 'Client Test',
      clientEmail: 'client@test.invalid',
      repairerName: 'Réparateur Test',
      repairerEmail: 'repairer@test.invalid',
      totalCents: 10636,
      repairCents: 8500,
      assignedToUserId: null,
      createdAt: '2026-10-01T10:00:00.000Z',
      resolvedAt: '2026-10-02T10:00:00.000Z',
      verdict: 'REFUND_CLIENT',
      commandeStatus: 'REFUNDED',
    };

    const html = renderToString(<DisputeQueueTable items={[item as any]} onOpenDossier={vi.fn()} />);

    // Must show Remboursé au client
    expect(html).toContain('Remboursé au client');
    // Must NOT show Réparation reprise
    expect(html).not.toContain('Réparation reprise');
    // Must show badge indicating commande is remboursée
    expect(html).toContain('Commande remboursée');
  });

  it('getVerdictLabel: returns authoritative French labels and never resumes a refunded order', () => {
    expect(getVerdictLabel('REFUND_CLIENT')).toBe('Client intégralement remboursé');
    expect(getVerdictLabel('PARTIAL_REFUND')).toBe('Client partiellement remboursé');
    expect(getVerdictLabel('RELEASE_REPAIRER')).toBe('Paiement au réparateur');
    expect(getVerdictLabel('DISMISSED')).toBe('La réparation reprend');
  });

  it('RefundDetailDrawer: renders accessible dialog when open', () => {
    const html = renderToString(
      <RefundDetailDrawer commandeId="cmd-a9db011e" isOpen={true} onClose={vi.fn()} />,
    );
    expect(html).toContain('aria-label="Fermer le détail du remboursement"');
    expect(html).toContain('role="dialog"');
  });

  it('CancellationDrawer: renders accessible cancellation dialog when open', () => {
    const html = renderToString(
      <CancellationDrawer id="req-1" isOpen={true} onClose={vi.fn()} onDecided={vi.fn()} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Demande d&#x27;annulation');
  });
});
