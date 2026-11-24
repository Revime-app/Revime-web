// apps/api/test/seed-demo-shape.spec.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCommandeShape } from '../scripts/seed-demo/commande-shape.mjs';

const row = () =>
  buildCommandeShape({
    n: 7,
    demandeId: 'd-7',
    offerId: 'o-7',
    clientUserId: 'c-7',
    repairerUserId: 'r-7',
    delivery: 'WORKSHOP',
    repairCents: 8000,
    paidAt: new Date('2026-05-02T10:00:00Z'),
  });

describe('a seeded commande is invisible to every cron job', () => {
  // Each assertion names the query it dodges. All five cron jobs exist to find
  // STUCK rows, so a terminal-healthy commande is invisible to all of them.
  it('is PAID, which repairCount requires', () => {
    expect(row().status).toBe('PAID');
  });

  it('is at step RELEASED, dodging stalled, autoRelease and releaseFailing', () => {
    expect(row().step).toBe('RELEASED');
  });

  it('carries a charge id, dodging backfillChargeIds and chargeMissing', () => {
    expect(row().stripeChargeId).toBeTruthy();
  });

  it('carries a transfer id, dodging autoRelease', () => {
    expect(row().stripeTransferId).toBeTruthy();
  });

  it('carries neither refund id, dodging refundIncomplete and reversalFailed', () => {
    expect(row().stripeRefundId).toBeNull();
    expect(row().stripeTransferReversalId).toBeNull();
  });

  it('is not disputed, dodging the disputed query', () => {
    expect(row().disputedAt).toBeNull();
  });

  it('is never PENDING_PAYMENT, the only status settleOrphanSessions reads', () => {
    expect(row().status).not.toBe('PENDING_PAYMENT');
  });

  it('creates no Shipment rows, dodging the Livraison Boxtal attention query (shipments: { some: {} })', () => {
    expect('shipments' in row()).toBe(false);
  });
});

describe('amounts come from the shared helper, not from arithmetic typed here', () => {
  it('totals repair + shipping + protection', () => {
    const r = row();
    expect(r.totalCents).toBe(r.repairCents + r.shippingCents + r.protectionCents);
  });

  it('transfers exactly the repair price, because the reparateur receives 100% of his quote', () => {
    const r = row();
    expect(r.transferredCents).toBe(r.repairCents);
  });

  it('prices a parcel above a workshop drop-off', () => {
    const parcel = buildCommandeShape({ ...baseArgs(), delivery: 'PARCEL' });
    const workshop = buildCommandeShape({ ...baseArgs(), delivery: 'WORKSHOP' });
    expect(parcel.shippingCents).toBeGreaterThan(workshop.shippingCents);
  });
});

function baseArgs() {
  return {
    n: 1,
    demandeId: 'd',
    offerId: 'o',
    clientUserId: 'c',
    repairerUserId: 'r',
    repairCents: 8000,
    paidAt: new Date('2026-05-02T10:00:00Z'),
    // `as const` so the inferred type is the DeliveryMode member rather than `string`:
    // computeAmounts takes the union, and a widened `string` fails to assign.
    delivery: 'WORKSHOP' as const,
  };
}

describe('n uniqueness guard', () => {
  it('rejects non-positive integers with a message naming the uniqueness requirement', () => {
    expect(() => buildCommandeShape({ ...baseArgs(), n: 0 })).toThrow(
      'n must be a unique positive integer per seeding run (generates unique stripeSessionId, stripePaymentIntentId, stripeTransferId)',
    );
    expect(() => buildCommandeShape({ ...baseArgs(), n: -1 })).toThrow(
      'n must be a unique positive integer per seeding run',
    );
    expect(() => buildCommandeShape({ ...baseArgs(), n: 3.5 })).toThrow(
      'n must be a unique positive integer per seeding run',
    );
  });
});

describe('canary on the cron', () => {
  /**
   * If a new cron job is added, the invisibility argument above has to be
   * re-derived rather than assumed. This asserts the number of commande queries
   * so that adding one fails loudly here instead of silently picking up demo rows.
   */
  // 10 since Livraison Boxtal: the tenth is `attentionItems`' shipments query, re-derived above -
  // the seed writes no Shipment rows, so `shipments: { some: {} }` cannot match a seeded commande.
  // 11 since CF4-D (2026-09-29): the eleventh is `attentionItems`' SHARE_OWED query, which needs
  // `status: 'REFUNDED'` AND `stripeTransferId: null`. A seeded commande is `status: 'PAID'` with
  // `stripeTransferId: 'tr_DEMO_<n>'` (commande-shape.mjs), so it fails both conditions and stays
  // invisible. Re-derived against the query, not bumped.
  // 12 since CF4-I (2026-09-30): the twelfth is `attentionItems`' CANCELLATION_REQUESTED query,
  // `cancellationRequestedAt: { not: null }`. The column is additive and the seed never sets it,
  // so every seeded commande has it null and stays invisible. Re-derived against the query.
  it('finds exactly 13 commande.findMany calls in cron.service.ts', () => {
    const src = readFileSync(new URL('../src/cron/cron.service.ts', import.meta.url), 'utf8');
    const count = src.split('prisma.commande.findMany').length - 1;
    expect(
      count,
      'cron.service.ts changed its commande queries. Re-derive the seeded commande shape against the new query before changing this number -- see the design section 6.1.',
    ).toBe(13);
  });
});
