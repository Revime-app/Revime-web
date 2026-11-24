import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { euros, type CommandeDto } from '@revime/shared';
import { createHookHarness } from './hook-harness';
import { findNodesByType, findTextNodes } from './render-tree';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: { ink: '#141414', muted: '#6b7280', line: '#e4e7ec', greenDeep: '#1f7a3f', greenSoft: '#e8f6ec' },
    spacing: { xs: 4, sm: 8, md: 16 },
  }),
}));
vi.mock('../src/icons', () => ({
  IconInfo: () => React.createElement('IconInfo'),
}));

import { CommandePaymentCard } from '../src/components/commande/CommandePaymentCard';
import { CommandeBanner } from '../src/components/commande/CommandeBanner';

/**
 * V7 U4. A7: after a refund or a dispute decision, only the party who receives the money reads
 * « Remboursé »; the repairer reads « Montant non versé — remboursé au client », and the client of
 * an order released by REVIME reads « Versé au réparateur après décision REVIME » (the client's
 * own wording, `DEC7-05`). A8: the cancelled block's device line follows the delivery mode.
 */

function order(overrides: Partial<CommandeDto> = {}): CommandeDto {
  return {
    status: 'PAID',
    step: 'RELEASED',
    delivery: 'WORKSHOP',
    viewerRole: 'CLIENT',
    repairCents: 6000,
    protectionCents: 560,
    shippingCents: 0,
    insuranceCents: 0,
    totalCents: 6560,
    payoutCents: 6000,
    paymentUnderReview: false,
    refund: null,
    partialRefund: false,
    dispute: null,
    ...overrides,
  } as CommandeDto;
}

const FULL_REFUND = { repairCents: 6000, shippingCents: 0, protectionCents: 560, totalCents: 6560 };
const PARTIAL_REFUND = { repairCents: 3000, shippingCents: 0, protectionCents: 560, totalCents: 3560 };

function resolvedDispute(status: 'RESOLVED_RELEASED' | 'RESOLVED_REFUNDED' | 'RESOLVED_DISMISSED', verdict: string) {
  return {
    number: 1,
    status,
    motifLabel: null,
    openedAt: '2026-10-20T10:00:00.000Z',
    resolvedAt: '2026-10-22T10:00:00.000Z',
    verdict,
    openedBySide: 'CLIENT' as const,
    unread: false,
  };
}

/** One string per `<Text>`, its pieces joined, so `Remboursé : {euros(x)}` reads as one line. */
function lines(element: unknown): string[] {
  return findNodesByType(element, 'Text').map((node) => findTextNodes(node).join(''));
}

const reset = createHookHarness();

function paymentLines(data: CommandeDto): string[] {
  reset();
  return lines(CommandePaymentCard({ data }));
}

function bannerLines(data: CommandeDto): string[] {
  return lines(CommandeBanner({ data }));
}

describe('V7 A7: the payment card names the refund only to the party who received it', () => {
  beforeEach(() => reset());

  it('the client of a refunded order still reads « Remboursé » and « Total remboursé »', () => {
    const text = paymentLines(order({ status: 'REFUNDED', refund: FULL_REFUND, payoutCents: 0 }));
    expect(text).toContain(`Remboursé : ${euros(6000)}`);
    expect(text).toContain(`Remboursé : ${euros(560)}`);
    expect(text).toContain('Total remboursé');
    expect(text.some((t) => t.startsWith('Montant non versé'))).toBe(false);
  });

  it('the repairer of a fully refunded order reads « Montant non versé — remboursé au client » and never « Remboursé »', () => {
    const text = paymentLines(
      order({ status: 'REFUNDED', viewerRole: 'REPAIRER', refund: FULL_REFUND, payoutCents: 0 }),
    );
    expect(text).toContain(`Montant non versé — remboursé au client : ${euros(6000)}`);
    expect(text.filter((t) => t.startsWith('Remboursé'))).toEqual([]);
    expect(text).not.toContain('Total remboursé');
    expect(text.some((t) => t.startsWith('Livraison et assurance remboursées'))).toBe(false);
    expect(text).toContain('Vous recevez');
    expect(text).toContain(euros(0));
  });

  it('the repairer of a partially refunded order reads the part kept from him and what he receives', () => {
    const text = paymentLines(
      order({ status: 'REFUNDED', viewerRole: 'REPAIRER', refund: PARTIAL_REFUND, partialRefund: true, payoutCents: 3000 }),
    );
    expect(text).toContain(`Montant non versé — remboursé au client : ${euros(3000)}`);
    expect(text.filter((t) => t.startsWith('Remboursé'))).toEqual([]);
    expect(text).not.toContain('Total remboursé');
    expect(text).toContain(euros(3000));
  });

  it('the client of an order REVIME released to the repairer reads « Versé au réparateur après décision REVIME »', () => {
    const text = paymentLines(order({ dispute: resolvedDispute('RESOLVED_RELEASED', 'RELEASE_REPAIRER') }));
    expect(text).toContain(`Versé au réparateur après décision REVIME : ${euros(6000)}`);
    expect(text.filter((t) => /rembours/i.test(t))).toEqual([]);
  });

  it('the repairer of that released order does not read the client line', () => {
    const text = paymentLines(
      order({ viewerRole: 'REPAIRER', dispute: resolvedDispute('RESOLVED_RELEASED', 'RELEASE_REPAIRER') }),
    );
    expect(text.some((t) => t.startsWith('Versé au réparateur'))).toBe(false);
  });

  it('ISS7-018: an order REVIME released and refunded afterwards shows the refund, not the release line', () => {
    const text = paymentLines(
      order({
        status: 'REFUNDED',
        refund: FULL_REFUND,
        payoutCents: 0,
        dispute: resolvedDispute('RESOLVED_RELEASED', 'RELEASE_REPAIRER'),
      }),
    );
    expect(text.some((t) => t.startsWith('Versé au réparateur'))).toBe(false);
    expect(text).toContain(`Remboursé : ${euros(6000)}`);
  });

  it('no « Versé au réparateur » line without a REVIME release: an ordinary release, or a dismissed dispute', () => {
    expect(paymentLines(order()).some((t) => t.startsWith('Versé au réparateur'))).toBe(false);
    expect(
      paymentLines(order({ dispute: resolvedDispute('RESOLVED_DISMISSED', 'DISMISSED') })).some((t) =>
        t.startsWith('Versé au réparateur'),
      ),
    ).toBe(false);
  });
});

describe('V7 A7: the « Commande annulée » block names the refund to each party', () => {
  it('client, full refund: unchanged', () => {
    expect(bannerLines(order({ status: 'REFUNDED', step: 'PAID' }))).toContain(
      'Le paiement a été remboursé intégralement.',
    );
  });

  it('client, partial refund: no longer claims « intégralement »', () => {
    const text = bannerLines(order({ status: 'REFUNDED', step: 'PAID', partialRefund: true }));
    expect(text).toContain('Le paiement a été remboursé partiellement.');
    expect(text).not.toContain('Le paiement a été remboursé intégralement.');
  });

  it('repairer: the refund went to the client', () => {
    expect(bannerLines(order({ status: 'REFUNDED', step: 'PAID', viewerRole: 'REPAIRER' }))).toContain(
      'Le paiement a été remboursé au client.',
    );
    expect(
      bannerLines(order({ status: 'REFUNDED', step: 'PAID', viewerRole: 'REPAIRER', partialRefund: true })),
    ).toContain('Le paiement a été remboursé partiellement au client.');
  });
});

describe('V7 A8: the cancelled block\'s device line follows the delivery mode', () => {
  const TRANSIT = "Votre appareil est en cours d'acheminement. Notre équipe vous contacte pour organiser son retour.";
  const WORKSHOP = "Récupérez votre appareil à l'atelier.";

  it('workshop order cancelled during the repair: the client is told to collect his device, never « en cours d\'acheminement »', () => {
    for (const step of ['REPAIR_STARTED', 'REPAIR_DONE'] as const) {
      const text = bannerLines(order({ status: 'REFUNDED', delivery: 'WORKSHOP', step }));
      expect(text).toContain(WORKSHOP);
      expect(text).not.toContain(TRANSIT);
    }
  });

  it('workshop order: the repairer, who holds the device, gets no device line', () => {
    const text = bannerLines(order({ status: 'REFUNDED', delivery: 'WORKSHOP', step: 'REPAIR_STARTED', viewerRole: 'REPAIRER' }));
    expect(text).not.toContain(WORKSHOP);
    expect(text).not.toContain(TRANSIT);
  });

  it('workshop order cancelled before the repair started: no device line', () => {
    const text = bannerLines(order({ status: 'REFUNDED', delivery: 'WORKSHOP', step: 'PAID' }));
    expect(text).not.toContain(WORKSHOP);
    expect(text).not.toContain(TRANSIT);
  });

  it('home repair: no device line, whatever the step and the viewer', () => {
    for (const viewerRole of ['CLIENT', 'REPAIRER'] as const) {
      for (const step of ['PAID', 'REPAIR_STARTED', 'REPAIR_DONE'] as const) {
        const text = bannerLines(order({ status: 'REFUNDED', delivery: 'HOME', step, viewerRole }));
        expect(text).not.toContain(WORKSHOP);
        expect(text).not.toContain(TRANSIT);
      }
    }
  });

  it('parcel order: the transit sentence is kept, at every step it was shown at before', () => {
    for (const step of ['PARCEL_SENT', 'PARCEL_RECEIVED', 'REPAIR_STARTED', 'REPAIR_DONE', 'RETURN_SENT'] as const) {
      expect(bannerLines(order({ status: 'REFUNDED', delivery: 'PARCEL', step }))).toContain(TRANSIT);
    }
    expect(bannerLines(order({ status: 'REFUNDED', delivery: 'PARCEL', step: 'PAID' }))).not.toContain(TRANSIT);
  });
});
