import { describe, expect, it } from 'vitest';
import {
  autoReleaseDueFrom,
  canAdvance,
  canRequestReleaseAfterTimeout,
  canValidate,
  computeAmounts,
  createCheckoutSchema,
  DELIVERY_OPTIONS,
  labelReady,
  nextStepFor,
  PARCEL_SHIPPING_CENTS,
  parcelStage,
  PROTECTION_FIXED_CENTS,
  PROTECTION_RATE_BP,
  protectionCentsFor,
  protectionRateLabel,
  releaseRequestAvailableAt,
  shippingAddressSchema,
  STEP_CLAIMANT,
  STEP_LABEL,
  stepsFor,
  trackingNumberSchema,
  type CommandeStep,
  type ReturnTimeoutState,
} from '@revime/shared';

describe('protectionCentsFor', () => {
  it("matches the client's own worked example: a 100 € repair gives 7,40 €", () => {
    // Thread log 2026-09-04: « a 100 € repair gives 7,40 €, total 107,40 € before delivery ».
    expect(protectionCentsFor(10_000)).toBe(740);
  });

  it('pins the spec §3.6 examples across the live basket', () => {
    const cases: Array<[repairCents: number, protectionCents: number]> = [
      [10_000, 740], // 100 € - his example
      [8_900, 691], // 89 € - live median offer; 400,5 rounds UP to 401
      [8_000, 650], // 80 € - live median paid repair
      [100, 295], // 1 € - 4,5 rounds UP to 5
      [20_000, 1_190], // 200 € - largest live offer
      [0, 290], // the app's preview before the offer has loaded
    ];
    for (const [repair, expected] of cases) {
      expect(protectionCentsFor(repair)).toBe(expected);
    }
  });

  it('rounds an exact half-cent UP - the commercial rule - in integer arithmetic', () => {
    // 8900 × 450 / 10000 = 400.5 → 401, never 400 (banker's rounding would give 400).
    expect(protectionCentsFor(8_900) - PROTECTION_FIXED_CENTS).toBe(401);
    // 100 × 450 / 10000 = 4.5 → 5.
    expect(protectionCentsFor(100) - PROTECTION_FIXED_CENTS).toBe(5);
  });

  it("stays exact at the schema's price cap, so no input the API accepts can overflow", () => {
    // createOfferSchema caps priceCents at 10 000 000; 10 000 000 × 450 is far inside 2^53.
    expect(protectionCentsFor(10_000_000)).toBe(PROTECTION_FIXED_CENTS + 450_000);
  });

  it('never goes below the fixed part and never decreases as the price rises', () => {
    let previous = protectionCentsFor(0);
    expect(previous).toBe(PROTECTION_FIXED_CENTS);
    for (let repair = 1; repair <= 50_000; repair += 7) {
      const current = protectionCentsFor(repair);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('refuses anything but a non-negative integer, because a wrong fee is money', () => {
    expect(() => protectionCentsFor(-1)).toThrow();
    expect(() => protectionCentsFor(12.5)).toThrow();
    expect(() => protectionCentsFor(Number.NaN)).toThrow();
  });
});

describe('protectionRateLabel', () => {
  it('reads « 4,5 % » - French comma, plain space before the sign, like euros()', () => {
    expect(protectionRateLabel()).toBe('4,5 %');
  });

  it('is derived from PROTECTION_RATE_BP rather than typed beside it', () => {
    expect(protectionRateLabel()).toBe(`${String(PROTECTION_RATE_BP / 100).replace('.', ',')} %`);
  });
});

describe('computeAmounts', () => {
  it('adds the protection fee and no shipping for a home visit', () => {
    expect(computeAmounts(8900, 'HOME')).toEqual({
      repairCents: 8900,
      shippingCents: 0,
      protectionCents: protectionCentsFor(8900),
      insuranceCents: 0,
      totalCents: 8900 + protectionCentsFor(8900),
    });
  });

  it('adds the protection fee and no shipping for a workshop drop-off', () => {
    expect(computeAmounts(8900, 'WORKSHOP')).toEqual({
      repairCents: 8900,
      shippingCents: 0,
      protectionCents: protectionCentsFor(8900),
      insuranceCents: 0,
      totalCents: 8900 + protectionCentsFor(8900),
    });
  });

  it('is the only mode that charges shipping - and shipping is NOT in the protection base', () => {
    expect(computeAmounts(8900, 'PARCEL')).toEqual({
      repairCents: 8900,
      shippingCents: 1900,
      protectionCents: protectionCentsFor(8900),
      insuranceCents: 0,
      totalCents: 8900 + 1900 + protectionCentsFor(8900),
    });
    expect(computeAmounts(8900, 'PARCEL').protectionCents).toBe(
      computeAmounts(8900, 'HOME').protectionCents,
    );
  });

  it('scales the protection fee with the price - since 2026-09-04 it is proportional, not fixed', () => {
    // This test used to assert the OPPOSITE (« fixed not proportional »). The client changed
    // the model on 2026-09-04; the old assertion is now the defect.
    const cheap = computeAmounts(100, 'HOME').protectionCents;
    const median = computeAmounts(8900, 'HOME').protectionCents;
    const dear = computeAmounts(250_000, 'HOME').protectionCents;
    expect(cheap).toBeLessThan(median);
    expect(median).toBeLessThan(dear);
  });

  it('always totals the sum of its own three lines, so a breakdown can never disagree with a charge', () => {
    for (const delivery of ['HOME', 'WORKSHOP', 'PARCEL'] as const) {
      const a = computeAmounts(12_345, delivery);
      expect(a.totalCents).toBe(a.repairCents + a.shippingCents + a.protectionCents);
    }
  });
});

describe('DELIVERY_OPTIONS', () => {
  it('covers every delivery mode exactly once, so the picker can never omit one', () => {
    expect(DELIVERY_OPTIONS.map((o) => o.id)).toEqual(['HOME', 'WORKSHOP', 'PARCEL']);
  });

  it('agrees with computeAmounts on every fee, so the label cannot lie about the total', () => {
    for (const option of DELIVERY_OPTIONS) {
      expect(computeAmounts(8900, option.id).shippingCents).toBe(option.feeCents);
    }
  });

  it('prices colis at the prototype figure', () => {
    const parcel = DELIVERY_OPTIONS.find((o) => o.id === 'PARCEL');
    expect(parcel?.feeCents).toBe(PARCEL_SHIPPING_CENTS);
  });
});

describe('createCheckoutSchema', () => {
  it('accepts a valid delivery mode', () => {
    expect(createCheckoutSchema.safeParse({ delivery: 'PARCEL' }).success).toBe(true);
  });

  it('rejects an unknown mode with a French message', () => {
    const result = createCheckoutSchema.safeParse({ delivery: 'DRONE' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Mode de livraison invalide.');
    }
  });

  it('rejects a missing mode, so a malformed client cannot default to free shipping', () => {
    expect(createCheckoutSchema.safeParse({}).success).toBe(false);
  });
});

describe('commande lifecycle', () => {
  it('keeps the parcel steps out of every local sequence', () => {
    for (const delivery of ['HOME', 'WORKSHOP'] as const) {
      expect(stepsFor(delivery)).not.toContain('PARCEL_SENT');
      expect(stepsFor(delivery)).not.toContain('PARCEL_RECEIVED');
    }
  });

  it('walks a parcel commande one step at a time', () => {
    expect(nextStepFor('PAID', 'PARCEL')).toBe('PARCEL_SENT');
    expect(nextStepFor('PARCEL_SENT', 'PARCEL')).toBe('PARCEL_RECEIVED');
    expect(nextStepFor('PARCEL_RECEIVED', 'PARCEL')).toBe('REPAIR_STARTED');
    expect(nextStepFor('AWAITING_VALIDATION', 'PARCEL')).toBe('RELEASED');
  });

  it('skips the parcel steps for a workshop commande', () => {
    expect(nextStepFor('PAID', 'WORKSHOP')).toBe('REPAIR_STARTED');
  });

  it('returns null past the end and for a step outside the sequence', () => {
    expect(nextStepFor('RELEASED', 'PARCEL')).toBeNull();
    // PARCEL_SENT is not in a workshop sequence at all, so there is no "next".
    expect(nextStepFor('PARCEL_SENT', 'WORKSHOP')).toBeNull();
  });

  it('makes the client send the parcel and the réparateur receive it', () => {
    expect(STEP_CLAIMANT.PARCEL_SENT).toBe('CLIENT');
    expect(STEP_CLAIMANT.PARCEL_RECEIVED).toBe('REPAIRER');
  });

  it('lets nobody claim PAID or RELEASED through the tracking route', () => {
    // PAID is written by P1's charge webhook; RELEASED by the release route.
    // These two nulls are what stop the tracking route moving money.
    expect(STEP_CLAIMANT.PAID).toBeNull();
    expect(STEP_CLAIMANT.RELEASED).toBeNull();
  });

  it('labels every step in French', () => {
    const steps: CommandeStep[] = stepsFor('PARCEL');
    for (const s of steps) {
      expect(STEP_LABEL[s]).toBeTruthy();
    }
    expect(STEP_LABEL.PAID).toBe('Paiement effectué');
    expect(STEP_LABEL.PARCEL_SENT).toBe('Colis envoyé');
    expect(STEP_LABEL.AWAITING_VALIDATION).toBe('Validation client');
    expect(STEP_LABEL.RELEASED).toBe('Fonds débloqués');
  });

  it('lets only the claimant of the NEXT step advance', () => {
    expect(canAdvance('PAID', 'PARCEL', 'CLIENT')).toBe(true);
    expect(canAdvance('PAID', 'PARCEL', 'REPAIRER')).toBe(false);
    expect(canAdvance('PARCEL_SENT', 'PARCEL', 'REPAIRER')).toBe(true);
    expect(canAdvance('PARCEL_SENT', 'PARCEL', 'CLIENT')).toBe(false);
    expect(canAdvance('PAID', 'WORKSHOP', 'REPAIRER')).toBe(true);
    expect(canAdvance('PAID', 'WORKSHOP', 'CLIENT')).toBe(false);
  });

  it('refuses to advance INTO release from the tracking route, for either role', () => {
    expect(canAdvance('AWAITING_VALIDATION', 'PARCEL', 'CLIENT')).toBe(false);
    expect(canAdvance('AWAITING_VALIDATION', 'PARCEL', 'REPAIRER')).toBe(false);
    expect(canAdvance('RELEASED', 'PARCEL', 'CLIENT')).toBe(false);
  });

  it('lets only the client validate, and only when the work is awaiting him', () => {
    expect(canValidate('AWAITING_VALIDATION', 'CLIENT')).toBe(true);
    expect(canValidate('AWAITING_VALIDATION', 'REPAIRER')).toBe(false);
    expect(canValidate('REPAIR_DONE', 'CLIENT')).toBe(false);
    expect(canValidate('RELEASED', 'CLIENT')).toBe(false);
  });
});

describe('the parcel round trip', () => {
  it('gives a parcel nine steps, with the return legs before validation', () => {
    expect(stepsFor('PARCEL')).toEqual([
      'PAID',
      'PARCEL_SENT',
      'PARCEL_RECEIVED',
      'REPAIR_STARTED',
      'REPAIR_DONE',
      'RETURN_SENT',
      'RETURN_RECEIVED',
      'AWAITING_VALIDATION',
      'RELEASED',
    ]);
  });

  // The regression that matters most. Two new enum members are exactly the kind
  // of change that leaks into a sequence they do not belong to.
  it('leaves both local sequences at the same five steps', () => {
    const five = ['PAID', 'REPAIR_STARTED', 'REPAIR_DONE', 'AWAITING_VALIDATION', 'RELEASED'];
    expect(stepsFor('HOME')).toEqual(five);
    expect(stepsFor('WORKSHOP')).toEqual(five);
  });

  // Both directions in one test. This pair is the whole proof that inserting two
  // members needed no change to nextStepFor itself.
  it('routes REPAIR_DONE to the return leg for a parcel and to validation locally', () => {
    expect(nextStepFor('REPAIR_DONE', 'PARCEL')).toBe('RETURN_SENT');
    expect(nextStepFor('REPAIR_DONE', 'HOME')).toBe('AWAITING_VALIDATION');
    expect(nextStepFor('RETURN_SENT', 'PARCEL')).toBe('RETURN_RECEIVED');
    expect(nextStepFor('RETURN_RECEIVED', 'PARCEL')).toBe('AWAITING_VALIDATION');
  });

  it('gives the return legs to the party that performs them', () => {
    // The reparateur ships back; the client confirms he has it. A trail whose
    // purpose is to justify holding money cannot have one party attesting to the
    // other's act.
    expect(canAdvance('REPAIR_DONE', 'PARCEL', 'REPAIRER')).toBe(true);
    expect(canAdvance('REPAIR_DONE', 'PARCEL', 'CLIENT')).toBe(false);
    expect(canAdvance('RETURN_SENT', 'PARCEL', 'CLIENT')).toBe(true);
    expect(canAdvance('RETURN_SENT', 'PARCEL', 'REPAIRER')).toBe(false);
  });

  it('never offers a return leg on a local commande', () => {
    expect(nextStepFor('RETURN_SENT', 'HOME')).toBeNull();
    expect(canAdvance('RETURN_SENT', 'WORKSHOP', 'CLIENT')).toBe(false);
  });

  it('names both new steps in French', () => {
    expect(STEP_LABEL.RETURN_SENT).toBe('Colis retour envoyé');
    expect(STEP_LABEL.RETURN_RECEIVED).toBe('Colis retour reçu');
  });
});

describe('the colis fee covers both legs', () => {
  it('charges 1900 cents of shipping on a parcel', () => {
    const a = computeAmounts(8000, 'PARCEL');
    expect(a.shippingCents).toBe(1900);
    expect(a.totalCents).toBe(8000 + 1900 + protectionCentsFor(8000));
  });

  it('charges no shipping on either local mode', () => {
    expect(computeAmounts(8000, 'HOME').shippingCents).toBe(0);
    expect(computeAmounts(8000, 'WORKSHOP').shippingCents).toBe(0);
  });

  it('says both legs in the picker, and no longer a weight cap (Livraison Boxtal, 2026-09-04)', () => {
    // Until 2026-09-04 this line promised « jusqu'à 2 kg ». The delivery spec removes that promise
    // from its three sites: Boxtal's per-carrier limits decide what ships, and the price now
    // depends on the object. The manual driver's flat fee is unchanged and still pinned here.
    const parcel = DELIVERY_OPTIONS.find((o) => o.id === 'PARCEL');
    expect(parcel?.sub).toBe('Aller-retour, prix selon l’objet');
    expect(parcel?.sub).not.toContain('kg');
    expect(parcel?.feeCents).toBe(1900);
  });
});

describe('labelReady', () => {
  const none = { outboundTrackingNumber: null, returnTrackingNumber: null };
  const both = { outboundTrackingNumber: '6C11112222', returnTrackingNumber: '6C33334444' };

  it('refuses the two shipping steps when their label is absent', () => {
    expect(labelReady('PARCEL_SENT', none)).toBe(false);
    expect(labelReady('RETURN_SENT', none)).toBe(false);
  });

  it('allows them once their own label exists', () => {
    expect(labelReady('PARCEL_SENT', both)).toBe(true);
    expect(labelReady('RETURN_SENT', both)).toBe(true);
  });

  // Each leg reads ITS OWN number. Sharing one would let a missing return label
  // pass on the strength of the outbound one.
  it('reads each leg from its own number', () => {
    const outboundOnly = { outboundTrackingNumber: '6C11112222', returnTrackingNumber: null };
    expect(labelReady('PARCEL_SENT', outboundOnly)).toBe(true);
    expect(labelReady('RETURN_SENT', outboundOnly)).toBe(false);
  });

  it('needs no label for any other step', () => {
    for (const step of ['PAID', 'PARCEL_RECEIVED', 'REPAIR_STARTED', 'REPAIR_DONE',
                        'RETURN_RECEIVED', 'AWAITING_VALIDATION', 'RELEASED'] as const) {
      expect(labelReady(step, none)).toBe(true);
    }
  });
});

describe('parcelStage', () => {
  const base = {
    delivery: 'PARCEL' as const,
    myAddressSubmitted: false,
    counterpartyAddressSubmitted: false,
    outboundTrackingNumber: null as string | null,
  };

  it('is NOT_PARCEL for both local modes', () => {
    expect(parcelStage({ ...base, delivery: 'HOME' })).toBe('NOT_PARCEL');
    expect(parcelStage({ ...base, delivery: 'WORKSHOP' })).toBe('NOT_PARCEL');
  });

  it('asks the viewer first', () => {
    expect(parcelStage(base)).toBe('AWAITING_YOUR_ADDRESS');
    // Still yours even when the other party has already answered.
    expect(parcelStage({ ...base, counterpartyAddressSubmitted: true }))
      .toBe('AWAITING_YOUR_ADDRESS');
  });

  it('waits on the other party once the viewer has answered', () => {
    expect(parcelStage({ ...base, myAddressSubmitted: true }))
      .toBe('AWAITING_OTHER_ADDRESS');
  });

  it('waits on the labels once both addresses are in', () => {
    expect(parcelStage({ ...base, myAddressSubmitted: true, counterpartyAddressSubmitted: true }))
      .toBe('AWAITING_LABELS');
  });

  it('is issued once the outbound number exists', () => {
    expect(parcelStage({
      delivery: 'PARCEL',
      myAddressSubmitted: true,
      counterpartyAddressSubmitted: true,
      outboundTrackingNumber: '6C11112222',
    })).toBe('LABELS_ISSUED');
  });
});

describe('shippingAddressSchema', () => {
  const valid = {
    line1: '12 rue de la Paix',
    postalCode: '75002',
    city: 'Paris',
    phone: '0612345678',
  };

  it('accepts an address with no complement and normalises the phone', () => {
    const parsed = shippingAddressSchema.parse(valid);
    expect(parsed.phone).toBe('+33612345678');
    expect(parsed.line2).toBeUndefined();
  });

  it('trims and refuses an empty street', () => {
    const r = shippingAddressSchema.safeParse({ ...valid, line1: '   ' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Adresse requise.');
  });

  it('refuses a four-digit postal code with the shared message', () => {
    const r = shippingAddressSchema.safeParse({ ...valid, postalCode: '7500' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Code postal invalide.');
  });

  it('refuses an empty city', () => {
    expect(shippingAddressSchema.safeParse({ ...valid, city: '' }).success).toBe(false);
  });
});

describe('trackingNumberSchema', () => {
  it('accepts a Colissimo number with and without spaces', () => {
    expect(trackingNumberSchema.parse('6C 1234 5678')).toBe('6C 1234 5678');
    expect(trackingNumberSchema.parse('6C12345678901')).toBe('6C12345678901');
  });

  it('refuses too short, too long and punctuated', () => {
    for (const bad of ['6C1', 'x'.repeat(41), '6C-1234-5678']) {
      const r = trackingNumberSchema.safeParse(bad);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe('Numéro de suivi invalide.');
    }
  });
});

describe('canRequestReleaseAfterTimeout', () => {
  const base = { delivery: 'PARCEL', step: 'RETURN_SENT' } as const;
  const posted = new Date('2026-08-01T10:00:00.000Z');
  const state = (over: Partial<ReturnTimeoutState> = {}): ReturnTimeoutState => ({
    ...base,
    returnSentAt: posted.toISOString(),
    ...over,
  });

  it('opens at exactly seven days', () => {
    const at = new Date(posted.getTime() + 7 * 86_400_000);
    expect(canRequestReleaseAfterTimeout(state(), at)).toBe(true);
  });

  it('is still closed at six days', () => {
    const at = new Date(posted.getTime() + 6 * 86_400_000);
    expect(canRequestReleaseAfterTimeout(state(), at)).toBe(false);
  });

  it('is closed for a local delivery, which has no return leg to wait on', () => {
    const at = new Date(posted.getTime() + 30 * 86_400_000);
    expect(canRequestReleaseAfterTimeout(state({ delivery: 'WORKSHOP' }), at)).toBe(false);
    expect(canRequestReleaseAfterTimeout(state({ delivery: 'HOME' }), at)).toBe(false);
  });

  it('is closed at every other step', () => {
    const at = new Date(posted.getTime() + 30 * 86_400_000);
    for (const step of [
      'PAID',
      'PARCEL_SENT',
      'PARCEL_RECEIVED',
      'REPAIR_STARTED',
      'REPAIR_DONE',
      'RETURN_RECEIVED',
      'AWAITING_VALIDATION',
      'RELEASED',
    ] as CommandeStep[]) {
      expect(canRequestReleaseAfterTimeout(state({ step }), at), step).toBe(false);
    }
  });

  it('is closed with no stamp, which is what an un-posted parcel looks like', () => {
    const at = new Date(posted.getTime() + 30 * 86_400_000);
    expect(canRequestReleaseAfterTimeout(state({ returnSentAt: null }), at)).toBe(false);
  });

  it('is closed when the step is null, which means the commande is unpaid', () => {
    const at = new Date(posted.getTime() + 30 * 86_400_000);
    expect(canRequestReleaseAfterTimeout(state({ step: null }), at)).toBe(false);
  });
});

describe('releaseRequestAvailableAt', () => {
  it('is seven days after the parcel was posted', () => {
    const posted = '2026-08-01T10:00:00.000Z';
    expect(
      releaseRequestAvailableAt({ delivery: 'PARCEL', step: 'RETURN_SENT', returnSentAt: posted }),
    ).toBe('2026-08-08T10:00:00.000Z');
  });

  it('is null when there is nothing to show', () => {
    expect(
      releaseRequestAvailableAt({ delivery: 'PARCEL', step: 'RETURN_SENT', returnSentAt: null }),
    ).toBeNull();
    expect(
      releaseRequestAvailableAt({
        delivery: 'WORKSHOP',
        step: 'RETURN_SENT',
        returnSentAt: '2026-08-01T10:00:00.000Z',
      }),
    ).toBeNull();
  });

  // The windows are computed in milliseconds, exactly as payments.service.ts's
  // AUTO_RELEASE_DAYS already is. The implementation uses only UTC-safe
  // operations - new Date(iso).getTime() and .toISOString() - with no
  // local-time methods (setDate/getDate/getMonth) that would shift by an hour
  // across a DST boundary. This guard cannot distinguish duration arithmetic
  // from calendar arithmetic on a runner whose timezone observes no DST (this
  // dev machine is Asia/Calcutta, CI is UTC by default). The real protection is
  // the UTC-only operations and that CI pins TZ=Europe/Paris. This test
  // strengthens its assertion by checking the exact elapsed duration in
  // milliseconds, not only the ISO string.
  it('does not drift across a Paris DST boundary', () => {
    const from = '2026-10-22T23:30:00.000Z';
    const due = releaseRequestAvailableAt({
      delivery: 'PARCEL',
      step: 'RETURN_SENT',
      returnSentAt: from,
    });
    expect(due).toBe('2026-10-29T23:30:00.000Z');
    expect(new Date(due!).getTime() - new Date(from).getTime()).toBe(7 * 86_400_000);
  });
});

describe('autoReleaseDueFrom', () => {
  it('is seven days after release was requested', () => {
    expect(autoReleaseDueFrom('2026-08-01T10:00:00.000Z')).toBe('2026-08-08T10:00:00.000Z');
  });

  it('is null when release has not been requested', () => {
    expect(autoReleaseDueFrom(null)).toBeNull();
  });
});

describe('computeAmounts with a quote (Livraison Boxtal)', () => {
  it('replaces the flat fee with the quoted shipping and adds the insurance line', () => {
    const a = computeAmounts(10_000, 'PARCEL', { shippingCents: 780, insuranceCents: 1520 });
    expect(a).toEqual({
      repairCents: 10_000,
      shippingCents: 780,
      protectionCents: 740,
      insuranceCents: 1520,
      totalCents: 10_000 + 780 + 740 + 1520,
    });
  });

  it('without a quote a parcel still costs the flat 1900 and 0 insurance - the manual driver, pinned', () => {
    expect(computeAmounts(10_000, 'PARCEL')).toEqual({
      repairCents: 10_000,
      shippingCents: PARCEL_SHIPPING_CENTS,
      protectionCents: 740,
      insuranceCents: 0,
      totalCents: 10_000 + PARCEL_SHIPPING_CENTS + 740,
    });
  });

  it('HOME and WORKSHOP carry 0 shipping and 0 insurance whether or not a quote is passed', () => {
    expect(computeAmounts(8_000, 'HOME').insuranceCents).toBe(0);
    expect(computeAmounts(8_000, 'WORKSHOP', { shippingCents: 780, insuranceCents: 1520 }).shippingCents).toBe(0);
  });

  it('throws on a quote with a negative or non-integer amount', () => {
    expect(() => computeAmounts(8_000, 'PARCEL', { shippingCents: -1, insuranceCents: 0 })).toThrow();
    expect(() => computeAmounts(8_000, 'PARCEL', { shippingCents: 780, insuranceCents: 1.5 })).toThrow();
  });

  it('createCheckoutSchema accepts the one-field body and the four-field body, and refuses a non-uuid quote id', () => {
    expect(createCheckoutSchema.parse({ delivery: 'PARCEL' })).toEqual({
      delivery: 'PARCEL',
      delayPreference: 'IMMEDIATE',
    });
    const full = { delivery: 'PARCEL', quoteId: '11111111-1111-4111-8111-111111111111', parcelOption: 'RELAY', insured: true } as const;
    expect(createCheckoutSchema.parse(full)).toEqual({
      ...full,
      delayPreference: 'IMMEDIATE',
    });
    expect(createCheckoutSchema.safeParse({ delivery: 'PARCEL', quoteId: 'nope' }).success).toBe(false);
  });

  it('DELIVERY_OPTIONS no longer promises 2 kg', () => {
    const parcel = DELIVERY_OPTIONS.find((o) => o.id === 'PARCEL');
    expect(parcel?.sub).toBe('Aller-retour, prix selon l’objet');
    expect(JSON.stringify(DELIVERY_OPTIONS)).not.toContain('2 kg');
  });
});
