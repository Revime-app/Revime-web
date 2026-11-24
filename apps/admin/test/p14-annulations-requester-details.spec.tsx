import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminCancellationListItem, AdminCancellationDetail } from '@revime/shared';
import { DELETED_USER_NAME, CANCELLATION_REASON_LABEL } from '@revime/shared';
import AnnulationsPage from '../app/annulations/page';
import { CancellationDrawer } from '../app/annulations/CancellationDrawer';

describe('P14: Annulations Requester Attribution & CancellationDrawer Enriched Detail', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockItems: AdminCancellationListItem[] = [
    {
      id: 'req-1',
      commandeId: 'cmd-client-req',
      demandeTitle: 'Écran iPhone 13 cassé',
      clientName: 'Alice Martin',
      repairerName: 'Bob Réparateur',
      totalCents: 12000,
      step: 'REPAIR_STARTED',
      transferred: false,
      reason: 'TOO_SLOW',
      createdAt: '2026-09-30T10:00:00.000Z',
      status: 'PENDING',
      requestedByName: 'Alice Martin',
      requestedByRole: 'CLIENT',
      decidedByName: null,
      decidedAt: null,
    },
    {
      id: 'req-2',
      commandeId: 'cmd-repairer-req',
      demandeTitle: 'Batterie MacBook Pro',
      clientName: 'Claire Client',
      repairerName: 'Denise Atelier',
      totalCents: 20000,
      step: 'PAID',
      transferred: false,
      reason: 'REPAIRER_UNRESPONSIVE',
      createdAt: '2026-10-01T14:00:00.000Z',
      status: 'REFUSED',
      requestedByName: 'Denise Atelier',
      requestedByRole: 'REPAIRER',
      decidedByName: 'Admin Operator',
      decidedAt: '2026-10-02T09:00:00.000Z',
    },
    {
      id: 'req-3',
      commandeId: 'cmd-tombstoned',
      demandeTitle: 'Console PS5 HDMI',
      clientName: DELETED_USER_NAME,
      repairerName: 'Eric Réparateur',
      totalCents: 8500,
      step: 'DELIVERED',
      transferred: true,
      reason: 'OTHER',
      createdAt: '2026-10-03T11:00:00.000Z',
      status: 'APPROVED',
      requestedByName: 'supprime_client',
      requestedByRole: 'CLIENT',
      decidedByName: DELETED_USER_NAME,
      decidedAt: '2026-10-03T16:00:00.000Z',
    },
  ];

  describe('1. AnnulationsPage Table Structure & Attribution Columns', () => {
    it('renders table headers and rows for Demandé par and Motif', () => {
      const html = renderToString(<AnnulationsPage initialItems={mockItems} />);
      expect(html).toContain('Annulations');
      expect(html).toContain('En attente');
      expect(html).toContain('Historique');
      expect(html).toContain('Demandé par');
      expect(html).toContain('Motif');
      expect(html).toContain('Alice Martin');
      expect(html).toContain('Délai trop long');
    });

    it('displays human-readable reason labels from CANCELLATION_REASON_LABEL', () => {
      expect(CANCELLATION_REASON_LABEL['TOO_SLOW']).toBe('Délai trop long');
      expect(CANCELLATION_REASON_LABEL['REPAIRER_UNRESPONSIVE']).toBe('Le réparateur ne répond pas');
      expect(CANCELLATION_REASON_LABEL['NO_LONGER_NEEDED']).toBe("Je n'ai plus besoin de la réparation");
      expect(CANCELLATION_REASON_LABEL['OTHER_SOLUTION']).toBe("J'ai trouvé une autre solution");
      expect(CANCELLATION_REASON_LABEL['OTHER']).toBe('Autre');
    });
  });

  describe('2. CancellationDrawer Details, Comment, & Decision Metadata', () => {
    it('renders dedicated Requester info box with requester name and role badge', () => {
      const detail: AdminCancellationDetail = {
        ...mockItems[0],
        comment: 'Délai beaucoup trop long, impossible d’attendre.',
        refusalNote: null,
        delivery: 'HAND_DELIVERY',
        conversationId: null,
        disputeNumber: null,
        disputeStatus: null,
        refund: {
          repairCents: 10000,
          shippingCents: 0,
          protectionCents: 2000,
          insuranceCents: 0,
        },
      };

      const html = renderToString(
        <CancellationDrawer
          id="req-1"
          isOpen={true}
          onClose={() => {}}
          onDecided={() => {}}
          initialDetail={detail}
        />,
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('Demande d&#x27;annulation');
      expect(html).toContain('Demandée par :');
      expect(html).toContain('Alice Martin');
      expect(html).toContain('Client');
      expect(html).toContain('Délai beaucoup trop long, impossible d’attendre.');
    });

    it('renders decision metadata and refusal note when status is REFUSED', () => {
      const detailRefused: AdminCancellationDetail = {
        ...mockItems[1],
        comment: null,
        refusalNote: 'La commande a déjà été expédiée.',
        delivery: 'PARCEL',
        conversationId: null,
        disputeNumber: null,
        disputeStatus: null,
        refund: {
          repairCents: 18000,
          shippingCents: 1000,
          protectionCents: 1000,
          insuranceCents: 0,
        },
      };

      const html = renderToString(
        <CancellationDrawer
          id="req-2"
          isOpen={true}
          onClose={() => {}}
          onDecided={() => {}}
          initialDetail={detailRefused}
        />,
      );

      expect(html).toContain('Décidée par :');
      expect(html).toContain('Admin Operator');
      expect(html).toContain('La commande a déjà été expédiée.');
    });

    it('renders itemized refund breakdown when status is APPROVED', () => {
      const detailApproved: AdminCancellationDetail = {
        ...mockItems[2],
        comment: 'Autre solution trouvée.',
        refusalNote: null,
        delivery: 'PARCEL',
        conversationId: null,
        disputeNumber: null,
        disputeStatus: null,
        refund: {
          repairCents: 7000,
          shippingCents: 500,
          protectionCents: 1000,
          insuranceCents: 0,
        },
      };

      const html = renderToString(
        <CancellationDrawer
          id="req-3"
          isOpen={true}
          onClose={() => {}}
          onDecided={() => {}}
          initialDetail={detailApproved}
        />,
      );

      expect(html).toContain('Décidée par :');
      expect(html).toContain('Détail du remboursement :');
      expect(html).toContain('70,00');
      expect(html).toContain('5,00');
      expect(html).toContain('10,00');
    });

    it('masks tombstoned users with DELETED_USER_NAME', () => {
      const detailTombstoned: AdminCancellationDetail = {
        ...mockItems[2],
        clientName: DELETED_USER_NAME,
        requestedByName: DELETED_USER_NAME,
        decidedByName: DELETED_USER_NAME,
        comment: null,
        refusalNote: null,
        delivery: 'PARCEL',
        conversationId: null,
        disputeNumber: null,
        disputeStatus: null,
        refund: {
          repairCents: 7000,
          shippingCents: 500,
          protectionCents: 1000,
          insuranceCents: 0,
        },
      };

      const html = renderToString(
        <CancellationDrawer
          id="req-3"
          isOpen={true}
          onClose={() => {}}
          onDecided={() => {}}
          initialDetail={detailTombstoned}
        />,
      );

      expect(html).toContain(DELETED_USER_NAME);
    });

    it('ensures zero pitch-black buttons in drawer action controls', () => {
      const html = renderToString(
        <CancellationDrawer
          id="req-1"
          isOpen={true}
          onClose={() => {}}
          onDecided={() => {}}
        />,
      );

      expect(html).not.toMatch(/backgroundColor:\s*['"]#(?:000000|141414)['"]/);
    });
  });
});
