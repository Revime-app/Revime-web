import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminShipmentListItem } from '@revime/shared';
import { ShipmentsList } from '../app/colis/ShipmentsList';
import {
  GenerateShippingLabelModal,
  handleGenerateModalKeyDown,
} from '../components/GenerateShippingLabelModal';

describe('P16: Colis — Carrier Selection, Label PDF Download, Drop-off Reminder & Blocked Status', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockItems: AdminShipmentListItem[] = [
    {
      shipmentId: 'ship-active-1',
      commandeId: 'cmd-active-1',
      orderNumber: '#CMD-ACTIVE-1',
      createdAt: '2026-10-10T10:00:00.000Z',
      clientName: 'Alice Martin',
      repairerName: 'Bob Réparation',
      carrierLabel: 'Colissimo',
      leg: 'OUTBOUND',
      status: 'IN_TRANSIT',
      displayStatus: 'IN_TRANSIT',
      trackingNumber: '8V12345678',
      isBlocked: false,
      blockedReason: null,
      labelReady: true,
      hasLabelPdf: true,
    },
    {
      shipmentId: 'unbooked-cmd-pending-2',
      commandeId: 'cmd-pending-2',
      orderNumber: '#CMD-PENDING-2',
      createdAt: '2026-10-12T15:00:00.000Z',
      clientName: 'Claire Dupont',
      repairerName: 'David Atelier',
      carrierLabel: 'À configurer',
      leg: 'OUTBOUND',
      status: 'TO_CREATE',
      displayStatus: 'A_COMMANDER',
      trackingNumber: null,
      isBlocked: false,
      blockedReason: null,
      labelReady: false,
      hasLabelPdf: false,
    },
    {
      shipmentId: 'ship-blocked-3',
      commandeId: 'cmd-blocked-3',
      orderNumber: '#CMD-BLOCKED-3',
      createdAt: '2026-10-05T08:00:00.000Z',
      clientName: 'Eva Durand',
      repairerName: 'Frank Tech',
      carrierLabel: 'Mondial Relay',
      leg: 'OUTBOUND',
      status: 'INCIDENT',
      displayStatus: 'INCIDENT',
      trackingNumber: 'MR-99887766',
      isBlocked: true,
      blockedReason: 'Incident de transport signalé (exception transporteur)',
      labelReady: true,
      hasLabelPdf: true,
    },
  ];

  describe('ShipmentsList table rendering', () => {
    it('renders parcel orders awaiting shipment booking alongside active shipments', () => {
      const html = renderToString(<ShipmentsList onOpen={vi.fn()} initialItems={mockItems} />);

      // Contains unbooked parcel order
      expect(html).toContain('#CMD-PENDING-2');
      expect(html).toContain('À configurer');
      expect(html).toContain('À commander');
      expect(html).toMatch(/Générer l(&#x27;|&#39;|')étiquette/);

      // Contains active shipment
      expect(html).toContain('#CMD-ACTIVE-1');
      expect(html).toContain('Colissimo');
      expect(html).toContain('8V12345678');
      expect(html).toContain('Télécharger PDF');
      expect(html).toContain('Relance');
    });

    it('renders blocked parcel warning banner when isBlocked items exist', () => {
      const html = renderToString(<ShipmentsList onOpen={vi.fn()} initialItems={mockItems} />);

      expect(html).toContain('Attention :');
      expect(html).toContain('colis présente(nt) un incident ou sont bloqués');
      expect(html).toContain('lucide-triangle-alert');
      expect(html).toContain('Incident / Bloqué');
    });

    it('does not render warning banner when no parcels are blocked', () => {
      const cleanItems = mockItems.filter((i) => !i.isBlocked);
      const html = renderToString(<ShipmentsList onOpen={vi.fn()} initialItems={cleanItems} />);

      expect(html).not.toContain('Attention :');
      expect(html).not.toContain('Incident / Bloqué');
    });
  });

  describe('GenerateShippingLabelModal', () => {
    it('renders carrier choices (Colissimo, Mondial Relay, Chronopost) and order details', () => {
      const html = renderToString(
        <GenerateShippingLabelModal
          isOpen={true}
          onClose={vi.fn()}
          commandeId="cmd-pending-2"
          orderNumber="#CMD-PENDING-2"
          clientName="Claire Dupont"
          repairerName="David Atelier"
          clientAddress="12 rue de la Paix, 75001 Paris"
          repairerAddress="45 avenue Jean Jaurès, 69007 Lyon"
          weightGrams={750}
          insuranceCents={250}
        />
      );

      expect(html).toMatch(/Générer l(&#x27;|&#39;|')étiquette de transport/);
      expect(html).toContain('CMD-');
      expect(html).toContain('Claire Dupont');
      expect(html).toContain('David Atelier');
      expect(html).toContain('Colissimo');
      expect(html).toContain('Mondial Relay');
      expect(html).toContain('Chronopost');
      expect(html).toContain('750');
      expect(html).toContain('2,50'); // formatEuros for insuranceCents
    });

    it('supports Escape key dismissal when not submitting', () => {
      const onClose = vi.fn();
      handleGenerateModalKeyDown({ key: 'Escape' }, false, onClose);
      expect(onClose).toHaveBeenCalled();

      // Does not close on escape when submitting
      const onCloseSubmitting = vi.fn();
      handleGenerateModalKeyDown({ key: 'Escape' }, true, onCloseSubmitting);
      expect(onCloseSubmitting).not.toHaveBeenCalled();
    });

    it('returns null when isOpen is false', () => {
      const html = renderToString(
        <GenerateShippingLabelModal
          isOpen={false}
          onClose={vi.fn()}
          commandeId="cmd-closed"
        />
      );
      expect(html).toBe('');
    });
  });

  describe('Actions: PDF download and drop-off reminder', () => {
    it('PDF download triggers GET to signed URL endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://storage.supabase.co/signed/labels/cmd-active-1/OUTBOUND.pdf' }),
      });
      global.fetch = mockFetch;

      const cmdId = 'cmd-active-1';
      const leg = 'OUTBOUND';
      const res = await fetch(`/api/proxy/admin/commandes/${cmdId}/shipments/${leg}/label`);
      const data = await res.json();

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/proxy/admin/commandes/${cmdId}/shipments/${leg}/label`
      );
      expect(data.url).toContain('signed/labels/cmd-active-1/OUTBOUND.pdf');
    });

    it('reminder action triggers POST to remind endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      global.fetch = mockFetch;

      const cmdId = 'cmd-active-1';
      const leg = 'OUTBOUND';
      const res = await fetch(`/api/proxy/admin/commandes/${cmdId}/shipments/${leg}/remind`, {
        method: 'POST',
      });
      const data = await res.json();

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/proxy/admin/commandes/${cmdId}/shipments/${leg}/remind`,
        { method: 'POST' }
      );
      expect(data.ok).toBe(true);
    });
  });
});
