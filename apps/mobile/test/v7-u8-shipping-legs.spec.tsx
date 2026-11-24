import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { euros, type CommandeDto, type ShippingLegPrices } from '@revime/shared';
import { createHookHarness } from './hook-harness';
import { findNodesByType, findTextNodes } from './render-tree';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: { ink: '#141414', muted: '#6b7280', line: '#e4e7ec', paper: '#ffffff', greenDeep: '#1f7a3f', greenSoft: '#e8f6ec' },
    accent: { accent: '#3554d1' },
    radii: { card: 20, field: 12 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
  }),
}));
vi.mock('../src/icons', () => ({
  IconInfo: () => React.createElement('IconInfo'),
}));
vi.mock('expo-web-browser', () => ({ openBrowserAsync: vi.fn() }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));

import { deliveryCardLegRows, deliveryRows, optionLegLines } from '../src/lib/shipping-legs-view';
import { CommandePaymentCard } from '../src/components/commande/CommandePaymentCard';
import { CommandeDeliveryCard } from '../src/components/commande/CommandeDeliveryCard';

/**
 * V7 A9 (U8, `DEC7-23`). The client sees the outbound and the return price, each with its carrier,
 * so he understands the delivery total. The split comes from the server; an order or a quote
 * without it keeps the single line it had (Q6), on all five surfaces (Q3).
 */

// Production's home pair (§4 A9): Chronopost out, Mondial Relay back, 12,60 € split 5,70 € + 6,90 €.
const LEGS: ShippingLegPrices = {
  OUTBOUND: { carrierLabel: 'Chronopost', cents: 570 },
  RETURN: { carrierLabel: 'Mondial Relay', cents: 690 },
};

/** One string per `<Text>`, its pieces joined. */
function lines(element: unknown): string[] {
  return findNodesByType(element, 'Text').map((node) => findTextNodes(node).join(''));
}

function order(overrides: Partial<CommandeDto> = {}): CommandeDto {
  return {
    status: 'PAID',
    step: 'PARCEL_SENT',
    delivery: 'PARCEL',
    viewerRole: 'CLIENT',
    repairCents: 6000,
    protectionCents: 560,
    shippingCents: 1260,
    insuranceCents: 0,
    totalCents: 7820,
    payoutCents: 6000,
    paymentUnderReview: false,
    refund: null,
    partialRefund: false,
    dispute: null,
    parcelOption: 'HOME',
    shippingLegs: LEGS,
    shipments: [],
    stepEvents: [],
    outboundTrackingNumber: null,
    returnTrackingNumber: null,
    ...overrides,
  } as CommandeDto;
}

const reset = createHookHarness();

describe('V7 A9: the delivery rows of a receipt (payment summary, receipt, Détails du paiement)', () => {
  it('names each leg with its carrier and price, adding up to the total (Q4)', () => {
    expect(deliveryRows(1260, LEGS, 'Livraison aller-retour')).toEqual([
      { label: 'Livraison aller · Chronopost', value: euros(570) },
      { label: 'Livraison retour · Mondial Relay', value: euros(690) },
    ]);
  });

  it('keeps the single line it had when there is no split (Q6)', () => {
    expect(deliveryRows(1900, null, 'Livraison aller-retour')).toEqual([{ label: 'Livraison aller-retour', value: euros(1900) }]);
    expect(deliveryRows(1900, undefined, 'Livraison')).toEqual([{ label: 'Livraison', value: euros(1900) }]);
  });

  it('never shows two legs that do not add up to the total it is beside', () => {
    expect(deliveryRows(1300, LEGS, 'Livraison')).toEqual([{ label: 'Livraison', value: euros(1300) }]);
  });
});

describe('V7 A9: the payment step option rows', () => {
  it('turn the « aller-retour » line into one line per leg (Q4)', () => {
    expect(optionLegLines({ shippingCents: 1260, legPrices: LEGS })).toEqual([
      `Aller · Chronopost · ${euros(570)}`,
      `Retour · Mondial Relay · ${euros(690)}`,
    ]);
  });

  it('give nothing back for an API older than U8, so the row keeps its old line', () => {
    expect(optionLegLines({ shippingCents: 1260 })).toBeNull();
  });
});

describe('V7 A9: the order details', () => {
  it('Détails du paiement shows the two legs in place of « Livraison », to the client and the repairer (Q5)', () => {
    for (const viewerRole of ['CLIENT', 'REPAIRER'] as const) {
      reset();
      const text = lines(CommandePaymentCard({ data: order({ viewerRole }) }));
      expect(text).toContain('Livraison aller · Chronopost');
      expect(text).toContain('Livraison retour · Mondial Relay');
      expect(text).toContain(euros(570));
      expect(text).toContain(euros(690));
      expect(text).not.toContain('Livraison');
    }
  });

  it('Détails du paiement keeps « Livraison » for an order with no quote, such as the flat 19 € (Q6)', () => {
    reset();
    const text = lines(CommandePaymentCard({ data: order({ shippingCents: 1900, shippingLegs: null, parcelOption: null }) }));
    expect(text).toContain('Livraison');
    expect(text).toContain(euros(1900));
    expect(text.some((l) => l.startsWith('Livraison aller'))).toBe(false);
  });

  it('the Livraison card lists « Aller » and « Retour », each with carrier and price (Q4)', () => {
    expect(deliveryCardLegRows(LEGS)).toEqual([
      { label: 'Aller', value: `Chronopost · ${euros(570)}` },
      { label: 'Retour', value: `Mondial Relay · ${euros(690)}` },
    ]);
    for (const viewerRole of ['CLIENT', 'REPAIRER'] as const) {
      reset();
      const text = lines(CommandeDeliveryCard({ data: order({ viewerRole }) }));
      expect(text).toEqual(expect.arrayContaining(['Mode de livraison', 'Aller', `Chronopost · ${euros(570)}`, 'Retour', `Mondial Relay · ${euros(690)}`]));
    }
  });

  it('the Livraison card adds nothing without a split (Q6)', () => {
    expect(deliveryCardLegRows(null)).toEqual([]);
    reset();
    const text = lines(CommandeDeliveryCard({ data: order({ shippingLegs: null }) }));
    expect(text).not.toContain('Aller');
    expect(text).not.toContain('Retour');
  });
});

describe('V7 A9: the screens use the helpers', () => {
  const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

  it('ParcelStep draws the leg lines and hands the chosen pair\'s split to the payment screen', () => {
    const source = read('src/components/ParcelStep.tsx');
    expect(source).toMatch(/optionLegLines\(pair\)/);
    expect(source).toMatch(/legPrices: pair\.legPrices/);
  });

  it('the payment summary splits only a parcel delivery, from the chosen quote', () => {
    const source = read('app/demande/[id]/paiement.tsx');
    expect(source).toMatch(/deliveryRows\(\s*amounts\.shippingCents,\s*chosen === 'PARCEL' \? parcelQuote\?\.legPrices : null/);
  });

  it('the receipt splits from the order', () => {
    expect(read('app/demande/[id]/acceptee.tsx')).toMatch(/deliveryRows\(\s*commande\.data\.shippingCents,\s*commande\.data\.shippingLegs/);
  });
});
