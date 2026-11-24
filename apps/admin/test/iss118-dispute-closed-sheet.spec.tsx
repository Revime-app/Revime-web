import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminDisputeDossierDto } from '@revime/shared';
import { DisputeDossierDrawer } from '../app/litiges/DisputeDossierDrawer';
import { DisputeChronologyTimeline } from '../components/DisputeChronologyTimeline';
import { processingAgeLabel } from '../lib/dispute-status-label';

const text = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/&#x27;/g, "'");

function dossier(over: Partial<AdminDisputeDossierDto['dispute']> = {}): AdminDisputeDossierDto {
  return {
    dispute: {
      id: 'disp-2',
      commandeId: 'cmd-2',
      number: 2,
      motif: 'REPAIR_NON_CONFORMING',
      status: 'RESOLVED_RELEASED',
      initiator: 'CLIENT',
      reason: 'Écran',
      description: null,
      evidencePhotos: [],
      assignedToUserId: null,
      assignedToName: null,
      assignedAt: null,
      resolvedByUserId: 'qwL4hd7heReuSjMAhSVovv7V3mf0xhKt',
      resolvedByName: 'Sarah Arbitre',
      resolvedAt: '2026-09-24T12:00:00.000Z',
      verdict: 'RELEASE_REPAIRER',
      resolutionNote: null,
      adminNotes: [],
      createdAt: '2026-09-24T10:00:00.000Z',
      updatedAt: '2026-09-24T12:00:00.000Z',
      ...over,
    },
    commande: {
      id: 'cmd-2', status: 'COMPLETED', step: 'COMPLETED', delivery: 'PARCEL', repairCents: 4000, shippingCents: 1000,
      protectionCents: 500, insuranceCents: 0, totalCents: 5500, paidAt: '2026-09-23T10:00:00.000Z',
      stripeSessionId: null, stripePaymentIntentId: null, stripeChargeId: 'ch_1', stripeTransferId: null, stripeRefundId: null,
    },
    client: { id: 'c1', name: 'Alice', email: 'alice@test.fr', phone: null, city: null },
    repairer: { id: 'r1', name: 'Bob', email: 'bob@test.fr', phone: null, kind: 'PRO', city: null, verificationLevel: 'BASIC' },
    shipments: [],
    demande: { id: 'd1', title: 'Réparation', description: '', photos: [] },
    conversation: { id: null, messages: [] },
    timeline: [],
    processingTimeDays: 0,
  } as AdminDisputeDossierDto;
}

const render = (d: AdminDisputeDossierDto) =>
  text(
    renderToString(
      <DisputeDossierDrawer disputeId="disp-2" isOpen onClose={vi.fn()} onDisputeUpdated={vi.fn()} initialDossier={d} />,
    ),
  );

describe('ISS-118 / FND-632: the sheet of a closed dispute', () => {
  it('does not offer to take charge of a closed dispute', () => {
    const html = render(dossier());
    expect(html).not.toContain("M'assigner ce litige");
  });

  it('still offers it on an open, unassigned dispute', () => {
    const html = render(dossier({ status: 'OPEN', resolvedAt: null, resolvedByUserId: null, resolvedByName: null, verdict: null }));
    expect(html).toContain("M'assigner ce litige");
  });

  it('names the resolver, never the raw id', () => {
    const html = render(dossier());
    expect(html).toContain('Sarah Arbitre');
    expect(html).not.toContain('qwL4hd7heReuSjMAhSVovv7V3mf0xhKt');
  });

  it('leaves the resolver out, rather than printing an id, when the name is unknown', () => {
    const html = render(dossier({ resolvedByName: null }));
    expect(html).not.toContain('qwL4hd7heReuSjMAhSVovv7V3mf0xhKt');
    expect(html).toContain('Résolu le');
  });

  it('words the status, not the enum, on the timeline tab', () => {
    const html = text(
      renderToString(<DisputeChronologyTimeline timeline={[]} processingTimeDays={0} disputeStatus="RESOLVED_RELEASED" />),
    );
    expect(html).not.toContain('RESOLVED_RELEASED');
    expect(html).toContain('Fonds débloqués');
  });

  it('does not say a closed dispute is « ouvert depuis 0 jour »', () => {
    expect(processingAgeLabel(0, true)).toBe("Dossier clôturé en moins d'un jour");
    expect(processingAgeLabel(1, true)).toBe('Dossier clôturé en 1 jour');
    expect(processingAgeLabel(5, true)).toBe('Dossier clôturé en 5 jours');
    expect(processingAgeLabel(0, false)).toBe("Dossier ouvert depuis moins d'un jour");
    expect(processingAgeLabel(1, false)).toBe('Dossier ouvert depuis 1 jour');
    expect(processingAgeLabel(9, false)).toBe('Dossier ouvert depuis 9 jours');
  });

  it('uses that wording on the timeline', () => {
    const html = text(
      renderToString(<DisputeChronologyTimeline timeline={[]} processingTimeDays={0} disputeStatus="RESOLVED_RELEASED" />),
    );
    expect(html).toContain("Dossier clôturé en moins d'un jour");
    expect(html).not.toContain('0 jour');
  });
});
