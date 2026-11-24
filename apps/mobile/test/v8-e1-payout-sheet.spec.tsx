import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accents, palette, radii, spacing } from '@revime/tokens';
import { euros, repairerJourney, type ProfileCompletion, type RepairerJourneyInput } from '@revime/shared';
import { findNodesByType, findTextNodes } from './render-tree';

/** V8 E1, mockup 4 (`DEC8-08` (7)): « Une dernière étape pour recevoir vos X », once per accepted order. */

const mockPush = vi.fn();
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock('../src/theme', () => ({
  useTheme: () => ({ palette, accent: accents.pro, radii, spacing }),
}));
vi.mock('../src/icons', () => ({
  IconTick: (props: any) => React.createElement('IconTick', props),
}));
const store = new Map<string, string>();
let storeFails = false;
vi.mock('expo-secure-store', () => ({
  getItem: (k: string) => {
    if (storeFails) throw new Error('keychain locked');
    return store.get(k) ?? null;
  },
  setItem: (k: string, v: string) => {
    if (storeFails) throw new Error('keychain locked');
    store.set(k, v);
  },
}));

import {
  hasSeenPayoutSheet,
  markPayoutSheetSeen,
  payoutSheetContent,
  payoutSheetDue,
} from '../src/lib/payout-sheet';
import { PayoutSetupSheet } from '../src/components/PayoutSetupSheet';

function completion(completed: number): ProfileCompletion {
  const keys = ['photo', 'banner', 'description', 'categories', 'zone', 'availability'] as const;
  return { completed, total: 6, items: Object.fromEntries(keys.map((k, i) => [k, i < completed])) as ProfileCompletion['items'] };
}
const journeyOf = (over: Partial<RepairerJourneyInput>) =>
  repairerJourney({
    kind: 'INDIVIDUAL',
    level: 'IDENTITY',
    identityStatus: 'VERIFIED',
    lastErrorCode: null,
    completion: completion(2),
    connectStatus: 'VERIFIED',
    connectEnabled: true,
    fiscalCompleted: false,
    ...over,
  });
const PAID = { status: 'PAID' as const, step: 'PAID' as const, hasStripeTransfer: false, refundedCents: null };

beforeEach(() => {
  store.clear();
  storeFails = false;
  mockPush.mockClear();
});

describe('V8 E1 payoutSheetDue', () => {
  it('an accepted, paid order with fiscal information missing', () => {
    expect(payoutSheetDue(PAID, journeyOf({}))).toBe(true);
  });
  it('payouts missing', () => {
    expect(payoutSheetDue(PAID, journeyOf({ connectStatus: null, fiscalCompleted: true }))).toBe(true);
  });
  it('nothing missing for the payout (the profile does not count)', () => {
    expect(payoutSheetDue(PAID, journeyOf({ fiscalCompleted: true }))).toBe(false);
  });
  it('a Pro with payouts done has no fiscal step: nothing missing', () => {
    expect(payoutSheetDue(PAID, journeyOf({ kind: 'PRO', level: 'BUSINESS' }))).toBe(false);
  });
  it('an order not paid, abandoned, refunded or already paid out', () => {
    const j = journeyOf({});
    expect(payoutSheetDue({ ...PAID, status: 'PENDING_PAYMENT', step: null }, j)).toBe(false);
    expect(payoutSheetDue({ ...PAID, status: 'ABANDONED', step: null }, j)).toBe(false);
    expect(payoutSheetDue({ ...PAID, refundedCents: 8900 }, j)).toBe(false);
    expect(payoutSheetDue({ ...PAID, step: 'RELEASED', hasStripeTransfer: true }, j)).toBe(false);
  });
  it('no journey yet', () => {
    expect(payoutSheetDue(PAID, null)).toBe(false);
  });
  it('review I3: not due while a status source failed (a Connect blip would read Virements as to do)', () => {
    expect(payoutSheetDue(PAID, journeyOf({ connectStatus: null, fiscalCompleted: true }), true)).toBe(false);
  });
});

describe('V8 E1 payoutSheetContent', () => {
  it('mockup 4: payouts done, fiscal missing', () => {
    const c = payoutSheetContent(journeyOf({}), 8900);
    // Amended 2026-11-18, V8 `ISS8-020` (a): a non-breaking space before « € », so the amount never wraps alone.
    expect(c.title).toBe(`Une dernière étape pour recevoir vos ${euros(8900).replace(' €', ' €')}`);
    expect(c.body).toBe("Vos informations fiscales sont obligatoires pour être payé. Ça ne se fait qu'une fois.");
    expect(c.rows).toEqual([
      { label: 'Virements activés', done: true },
      { label: 'Informations fiscales · 2 min', done: false },
    ]);
    expect(c.action).toEqual({ label: 'Renseigner mes informations', route: '/fiscalite' });
  });
  it('payouts missing first: its own sentence and the setup page', () => {
    const c = payoutSheetContent(journeyOf({ connectStatus: null, fiscalCompleted: true }), 12050);
    expect(c.body).toBe("Vos virements doivent être activés pour être payé. Ça ne se fait qu'une fois.");
    expect(c.rows).toEqual([
      { label: 'Virements · 3 min', done: false },
      { label: 'Informations fiscales renseignées', done: true },
    ]);
    expect(c.action).toEqual({ label: 'Configurer', route: '/statut-verification' });
  });
});

describe('V8 E1 seen once per order', () => {
  it('is unseen until marked, per order', () => {
    expect(hasSeenPayoutSheet('c1')).toBe(false);
    markPayoutSheetSeen('c1');
    expect(hasSeenPayoutSheet('c1')).toBe(true);
    expect(hasSeenPayoutSheet('c2')).toBe(false);
  });
  it('a storage error reads as unseen and never throws', () => {
    storeFails = true;
    expect(hasSeenPayoutSheet('c1')).toBe(false);
    expect(() => markPayoutSheetSeen('c1')).not.toThrow();
  });
});

describe('V8 E1 PayoutSetupSheet', () => {
  it('renders the content, the button goes to the missing step, « Plus tard » dismisses', () => {
    const onDismiss = vi.fn();
    const tree = PayoutSetupSheet({ visible: true, content: payoutSheetContent(journeyOf({}), 8900), onDismiss });
    const texts = findTextNodes(tree);
    expect(texts).toContain(`Une dernière étape pour recevoir vos ${euros(8900).replace(' €', ' €')}`); // ISS8-020 (a)
    expect(texts).toContain('Virements activés');
    expect(texts).toContain('Informations fiscales · 2 min');
    expect(texts).toContain('Paiement sécurisé par Stripe');
    const buttons = findNodesByType(tree, 'Button');
    expect(buttons.map((b) => b.props.label)).toEqual(['Renseigner mes informations', 'Plus tard']);
    buttons[0].props.onPress();
    expect(onDismiss).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/fiscalite');
  });
});

describe('V8 E1 order page wiring', () => {
  it('renders PayoutSetupGate for the repairer only', () => {
    const page = readFileSync(resolve(__dirname, '../app/commande/[id]/index.tsx'), 'utf8');
    expect(page).toContain("from '../../../src/components/PayoutSetupGate'");
    expect(page).toMatch(/role === 'REPAIRER' && <PayoutSetupGate commande=\{data\} \/>/);
  });
  it('review I3: the gate passes the status errors to payoutSheetDue', () => {
    const gate = readFileSync(resolve(__dirname, '../src/components/PayoutSetupGate.tsx'), 'utf8');
    expect(gate).toMatch(/payoutSheetDue\(commande, journey, identityError \|\| connectError\)/);
  });
});
