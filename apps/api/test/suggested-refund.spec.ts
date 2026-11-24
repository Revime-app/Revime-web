import { describe, expect, it } from 'vitest';
import { suggestedRefund, refundBreakdownInputSchema } from '@revime/shared';
import type { CommandeStep } from '@revime/shared';

// CF4-D, task 1 (spec §2). Base amounts shared by every case below: repair 80,00 €,
// shipping 17,00 €, insurance 2,00 € (rolled into shipping when the client never
// shipped anything back to lose), protection 6,50 €.
const base = { repairCents: 8000, shippingCents: 1700, insuranceCents: 200, protectionCents: 650 };

describe('suggestedRefund', () => {
  it('step PAID: shipping is not yet spent, so it folds in the insurance and refunds everything', () => {
    expect(suggestedRefund({ step: 'PAID', ...base })).toEqual({
      repairCents: 8000,
      shippingCents: 1900,
      protectionCents: 650,
    });
  });

  it('step null reads the same as PAID: no lifecycle has started yet', () => {
    expect(suggestedRefund({ step: null, ...base })).toEqual({
      repairCents: 8000,
      shippingCents: 1900,
      protectionCents: 650,
    });
  });

  it.each(['PARCEL_SENT', 'REPAIR_STARTED', 'AWAITING_VALIDATION', 'RELEASED'] as CommandeStep[])(
    'step %s: the parcel already moved, so shipping and protection default to 0',
    (step) => {
      expect(suggestedRefund({ step, ...base })).toEqual({
        repairCents: 8000,
        shippingCents: 0,
        protectionCents: 0,
      });
    },
  );
});

describe('refundBreakdownInputSchema', () => {
  const valid = { motif: 'OTHER' as const, note: 'Motif suffisant', repairCents: 100, shippingCents: 0, protectionCents: 0 };

  it('rejects a non-integer cents amount', () => {
    expect(refundBreakdownInputSchema.safeParse({ ...valid, repairCents: 1.5 }).success).toBe(false);
  });

  it('rejects a negative cents amount', () => {
    expect(refundBreakdownInputSchema.safeParse({ ...valid, repairCents: -1 }).success).toBe(false);
  });

  it('rejects a note shorter than 3 characters', () => {
    expect(refundBreakdownInputSchema.safeParse({ ...valid, note: 'ab' }).success).toBe(false);
  });

  it('accepts every amount at 0', () => {
    const r = refundBreakdownInputSchema.safeParse({ ...valid, repairCents: 0, shippingCents: 0, protectionCents: 0 });
    expect(r.success).toBe(true);
  });
});
