import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { RepairerJourney } from '@revime/shared';

vi.mock('expo-secure-store', () => ({ getItem: () => null, setItem: () => {} }));
import { payoutHoldView, payoutsDoneFrom } from '../src/lib/fiscal-hold';
import { payoutSheetContent } from '../src/lib/payout-sheet';

/**
 * V8 `ISS8-020` (owner: « Yes, fix all four »), seen on the emulator during the held-order run (2026-11-18).
 * (a) the payout sheet's title broke between the amount and « € »; (c) the réparateur's held card in « Mes
 * réparations » kept CMP-D3's green « Validée » instead of `Q8-08`'s amber « Paiement en attente »; (d) a
 * Particulier missing BOTH « Virements » and his fiscal information was told only about the fiscal step.
 * (b), the singular « 1 € débloqué », is in `packages/shared/test/v8-iss8-020-agreement.spec.ts`.
 */

const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const NBSP = ' ';
const journey = (payouts: 'done' | 'todo', fiscal: 'done' | 'todo') =>
  ({
    steps: [
      { key: 'payouts', status: payouts, minutes: 3 },
      { key: 'fiscal', status: fiscal, minutes: 2 },
    ],
  }) as unknown as RepairerJourney;

describe('(a) the payout sheet title keeps the amount and « € » together', () => {
  it('uses a non-breaking space before « € »', () => {
    const { title } = payoutSheetContent(journey('todo', 'todo'), 100);
    expect(title).toBe(`Une dernière étape pour recevoir vos 1${NBSP}€`);
    expect(title).not.toContain(' €');
  });

  it('also for a decimal amount', () => {
    expect(payoutSheetContent(journey('todo', 'todo'), 8950).title).toBe(`Une dernière étape pour recevoir vos 89,50${NBSP}€`);
  });
});

describe('(d) the fiscal card only when fiscal information is the ONLY thing missing', () => {
  const order = { step: 'RELEASED' as const, status: 'PAID' as const, hasStripeTransfer: false, payoutCents: 100 };
  const undeclared = { kind: 'INDIVIDUAL' as const, fiscalCompleted: false };

  it('payouts done: the fiscal card, as before (CMP-D3)', () => {
    expect(payoutHoldView(order, undeclared, true)).toMatchObject({ cta: 'Compléter mes informations fiscales', route: '/fiscalite' });
  });

  it('payouts missing too: the setup page, in the client’s words', () => {
    expect(payoutHoldView(order, undeclared, false)).toMatchObject({
      body: 'Votre paiement vous attend : terminez votre configuration pour le recevoir.',
      cta: 'Terminer ma configuration',
      route: '/statut-verification',
    });
  });

  it('payouts unknown (status still loading or failed): the setup page, which is true in every case', () => {
    expect(payoutHoldView(order, undeclared, undefined)).toMatchObject({ route: '/statut-verification' });
  });

  it('payoutsDoneFrom reads the journey, and knows nothing while it is missing or a status call failed', () => {
    expect(payoutsDoneFrom(journey('done', 'todo'), false)).toBe(true);
    expect(payoutsDoneFrom(journey('todo', 'todo'), false)).toBe(false);
    expect(payoutsDoneFrom(null, false)).toBeUndefined();
    expect(payoutsDoneFrom(journey('done', 'todo'), true)).toBeUndefined();
    // Connect off: no « Virements » step, so nothing but fiscal can be missing.
    expect(payoutsDoneFrom({ steps: [{ key: 'fiscal', status: 'todo', minutes: 2 }] } as unknown as RepairerJourney, false)).toBe(true);
  });

  it('both screens pass the payouts state', () => {
    expect(src('app/commandes.tsx')).toMatch(/payoutHoldView\(c, me\?\.repairer, payoutsDone\)/);
    expect(src('app/commande/[id]/index.tsx')).toMatch(/payoutHoldView\(data, me\?\.repairer, payoutsDone\)/);
  });
});

describe('(c) the held card in « Mes réparations » wears the same badge as the order page', () => {
  const held = () => {
    const file = src('app/commandes.tsx');
    const start = file.indexOf('const hold = payoutHoldView(');
    return file.slice(start, file.indexOf('{hold.title}', start));
  };

  it('renders the computed badge (« Paiement en attente », amber), not a hard-coded green « Validée »', () => {
    expect(held()).toMatch(/<Badge label=\{status\.label\} tone=\{status\.tone\} \/>/);
    expect(held()).not.toMatch(/>\s*Validée\s*</);
  });
});
