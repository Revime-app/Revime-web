import { describe, expect, it } from 'vitest';
import type { OfferDto } from '@revime/shared';
import {
  acceptedOffer,
  createOfferSchema,
  DELAY_HOURS_MAX,
  DELAY_OPTIONS,
  DELAY_UNITS,
  delayHoursFrom,
  delayInputFor,
  delayLabel,
  hasWarranty,
  isVerified,
  liveOffers,
  mayOfferWarranty,
  normaliseDelayInput,
  partitionOffers,
  pastSectionHeading,
  VERIFIED_BADGE_LABEL,
  WARRANTY_NONE,
  WARRANTY_OPTIONS,
  warrantyLabelFor,
} from '@revime/shared';

const anOffer = (over: Partial<OfferDto> = {}): OfferDto => ({
  id: Math.random().toString(36).slice(2),
  repairerName: 'Sophie',
  repairerUserId: '00000000-0000-0000-0000-000000000000',
  priceCents: 8900,
  delayHours: 24,
  warrantyLabel: '6 mois',
  partsLabel: "Pièce d'origine",
  travel: 'HOME',
  acceptsParcel: false,
  comment: null,
  distanceKm: 1.2,
  verifiedBadge: null,
  // Étape 5 piece 3 widened OfferDto. An unrated réparateur is `rating: null` and
  // never 0, and a count of 0 is a true value -- so these are the defaults every
  // existing case wants, and a case about ratings overrides them explicitly.
  rating: null,
  reviewCount: 0,
  repairCount: 0,
  status: 'SENT',
  createdAt: '2026-08-13T00:00:00.000Z',
  ...over,
});

const valid = {
  priceCents: 8900,
  delayHours: 24,
  warrantyLabel: '6 mois',
  partsLabel: "Pièce d'origine",
  travel: 'HOME' as const,
  acceptsParcel: false,
  comment: "Écran d'origine + batterie neuve.",
};

describe('createOfferSchema', () => {
  it('accepts a valid offer', () => {
    expect(createOfferSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an offer with no comment', () => {
    const { comment, ...rest } = valid;
    expect(createOfferSchema.safeParse(rest).success).toBe(true);
  });

  it('rejects a zero or negative price', () => {
    for (const priceCents of [0, -100]) {
      const r = createOfferSchema.safeParse({ ...valid, priceCents });
      expect(r.success).toBe(false);
      if (r.success) continue;
      expect(r.error.issues[0]?.message).toBe('Prix invalide.');
    }
  });

  it('rejects a non-integer price, so cents cannot be fractional', () => {
    expect(
      createOfferSchema.safeParse({ ...valid, priceCents: 89.5 }).success,
    ).toBe(false);
  });

  it('caps the price below int4 so the column cannot overflow', () => {
    const r = createOfferSchema.safeParse({
      ...valid,
      priceCents: 99_999_999_99,
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.message).toBe('Prix trop élevé.');
  });

  /**
   * CF-29 REVERSED THIS TEST, deliberately. It used to read « rejects a delay that is
   * not one of the offered options » and assert that `delayHours: 7` was a 422.
   *
   * The client asked for « le délai de réparation, avec la possibilité de
   * choisir/modifier lui-même le délai », so an allowlist of the five presets is
   * exactly the rule he asked us to remove. `DELAY_OPTIONS` survives as the form's
   * quick-fill row and no longer constrains what may be stored.
   */
  it('accepts a delay that is not one of the offered options', () => {
    expect(createOfferSchema.safeParse({ ...valid, delayHours: 7 }).success).toBe(true);
  });

  it('rejects a zero or negative delay', () => {
    for (const delayHours of [0, -24]) {
      const r = createOfferSchema.safeParse({ ...valid, delayHours });
      expect(r.success).toBe(false);
      if (r.success) continue;
      expect(r.error.issues[0]?.message).toBe('Délai invalide.');
    }
  });

  it('rejects a non-integer delay, so the Int column cannot be fractional', () => {
    expect(createOfferSchema.safeParse({ ...valid, delayHours: 7.5 }).success).toBe(false);
  });

  it('accepts the cap exactly and refuses one hour past it', () => {
    expect(
      createOfferSchema.safeParse({ ...valid, delayHours: DELAY_HOURS_MAX }).success,
    ).toBe(true);
    const r = createOfferSchema.safeParse({ ...valid, delayHours: DELAY_HOURS_MAX + 1 });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.message).toBe('Délai trop long.');
  });

  it('caps the delay at 90 days', () => {
    // Stated as the multiplication so the intent survives a change of mind, and so
    // nobody reads 2160 as an arbitrary magic number.
    expect(DELAY_HOURS_MAX).toBe(90 * 24);
  });

  it('no longer carries a postal code, which lives on the profile', () => {
    // Piece D made PATCH /users/me/repairer the single writer. An offer that
    // still sent one would silently mutate profile geography.
    expect(
      createOfferSchema.safeParse({ ...valid, postalCode: '69003' }).success,
    ).toBe(true);
    expect(
      createOfferSchema.parse({ ...valid, postalCode: '69003' }),
    ).not.toHaveProperty('postalCode');
  });

  it('every delay option has a French label and hours ascend', () => {
    const hours = DELAY_OPTIONS.map((o) => o.hours);
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
    for (const o of DELAY_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.label).not.toMatch(/hour|day|week/i);
    }
  });

  /**
   * CF-29's regression guard, and the reason `delayLabel` may stop consulting
   * `DELAY_OPTIONS` at all.
   *
   * `delayLabel` is now a FORMATTER rather than a lookup, because a réparateur may store
   * any hour count and the old `${hours} h` fallback would have shown a client « 120 h »
   * for five days - on the offer card, the payment summary, the conversation recap,
   * Comparaison and Mes propositions. That is CF-30's defect shape exactly.
   *
   * Measured before the change: all 47 live offers held one of the five presets
   * (24x4, 48x39, 72x2, 168x1, 336x1), so a formatter that reproduces those five labels
   * changes NOTHING any client can currently see and leaves nothing to migrate.
   * This test is what keeps that claim true: it fails the moment the formatter and the
   * quick-fill labels disagree.
   */
  it('delayLabel reproduces every DELAY_OPTIONS label exactly', () => {
    for (const o of DELAY_OPTIONS) expect(delayLabel(o.hours)).toBe(o.label);
  });

  it('delayLabel renders anything up to three days in hours', () => {
    expect(delayLabel(4)).toBe('4 h');
    expect(delayLabel(24)).toBe('24 h');
    expect(delayLabel(72)).toBe('72 h');
  });

  it('delayLabel renders whole days past three days in days', () => {
    expect(delayLabel(96)).toBe('4 jours');
    expect(delayLabel(120)).toBe('5 jours');
    expect(delayLabel(2160)).toBe('90 jours');
  });

  it('delayLabel renders whole weeks in weeks, singular at one', () => {
    expect(delayLabel(168)).toBe('1 semaine');
    expect(delayLabel(336)).toBe('2 semaines');
    expect(delayLabel(504)).toBe('3 semaines');
  });

  it('delayLabel is total: an odd hour count still renders French', () => {
    // Reachable by typing hours directly, and it must never print "undefined" on a
    // client's screen.
    expect(delayLabel(100)).toBe('100 h');
    expect(delayLabel(999)).toBe('999 h');
  });

  it('emits no English for missing fields', () => {
    const ZOD_ENGLISH =
      /expected|received|invalid input|invalid option|too small|too big|must contain/i;
    const r = createOfferSchema.safeParse({});
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.length).toBeGreaterThan(0);
    for (const issue of r.error.issues)
      expect(issue.message).not.toMatch(ZOD_ENGLISH);
  });

  it('requires acceptsParcel rather than defaulting it', () => {
    // `valid` is this file's existing fixture object - verified, do not rename it.
    const { acceptsParcel, ...without } = valid as typeof valid & { acceptsParcel?: boolean };
    expect(createOfferSchema.safeParse(without).success).toBe(false);
    expect(createOfferSchema.parse({ ...without, acceptsParcel: false }).acceptsParcel).toBe(false);
  });
});

describe('normaliseDelayInput - CF-29, keeping the free-entry field an integer', () => {
  it('keeps digits and drops everything else', () => {
    expect(normaliseDelayInput('5')).toBe('5');
    expect(normaliseDelayInput('4 jours')).toBe('4');
    expect(normaliseDelayInput('abc')).toBe('');
    expect(normaliseDelayInput('')).toBe('');
  });

  it('drops a decimal separator rather than accepting a fraction', () => {
    // `delayHours` is an Int column and the unit chips already let him express half a
    // day as « 12 heures », so a fraction has nothing to say that the control cannot.
    // Contrast normalisePriceInput, which keeps one dot on purpose.
    expect(normaliseDelayInput('1.5')).toBe('15');
    expect(normaliseDelayInput('1,5')).toBe('15');
  });

  it('strips leading zeros but never empties a field that holds a digit', () => {
    expect(normaliseDelayInput('007')).toBe('7');
    expect(normaliseDelayInput('000')).toBe('0');
  });

  it('caps the length so the field cannot accumulate an absurd number', () => {
    // Four digits covers DELAY_HOURS_MAX (2160); nothing longer is reachable.
    expect(normaliseDelayInput('12345')).toBe('1234');
  });
});

describe('delayHoursFrom - CF-29, the one place the unit arithmetic lives', () => {
  it('multiplies days by 24 and passes hours through', () => {
    expect(delayHoursFrom('5', 'jours')).toBe(120);
    expect(delayHoursFrom('5', 'heures')).toBe(5);
    expect(delayHoursFrom('90', 'jours')).toBe(DELAY_HOURS_MAX);
  });

  it('answers null for anything it cannot turn into a stored delay', () => {
    // null is the single representation of absence, per apps/mobile/AGENTS.md. It
    // matters here for a second reason: the form reads this for BOTH canSubmit and the
    // submitted value, so a merely-falsy sentinel like 0 would let an empty field
    // through the button and 422 at the server.
    expect(delayHoursFrom('', 'jours')).toBeNull();
    expect(delayHoursFrom('abc', 'heures')).toBeNull();
    expect(delayHoursFrom('0', 'jours')).toBeNull();
    expect(delayHoursFrom('0', 'heures')).toBeNull();
  });

  it('answers null past the cap, in either unit', () => {
    expect(delayHoursFrom('91', 'jours')).toBeNull();
    expect(delayHoursFrom(String(DELAY_HOURS_MAX + 1), 'heures')).toBeNull();
  });

  /**
   * The CF-31 habit pointed at a different rule: the form's notion of « valid » and the
   * server's must be ONE rule rather than two that happen to agree today. `delayHoursFrom`
   * states its bound independently of the schema on purpose, so this comparison is real
   * rather than tautological - it fails if either side moves.
   */
  it('agrees with createOfferSchema on every input, in both directions', () => {
    const inputs = ['', '0', '1', '5', '7', '48', '90', '91', '2160', '2161', 'abc'];
    for (const raw of inputs) {
      for (const unit of DELAY_UNITS) {
        const hours = delayHoursFrom(raw, unit);
        const accepted =
          hours !== null && createOfferSchema.safeParse({ ...valid, delayHours: hours }).success;
        expect(accepted).toBe(hours !== null);
      }
    }
  });
});

describe('delayInputFor - CF-29, what a quick-fill chip puts in the field', () => {
  it('fills the unit the chip LABEL implies, not the unit the maths prefers', () => {
    // 24 h is a whole day, so a purely arithmetic decomposition would fill « 1 jour »
    // after a tap on a chip reading « 24 h ». Sharing delayLabel's own threshold keeps
    // the chip, the field and the echo beneath them all saying the same thing.
    expect(delayInputFor(24)).toEqual({ value: '24', unit: 'heures' });
    expect(delayInputFor(72)).toEqual({ value: '72', unit: 'heures' });
    expect(delayInputFor(168)).toEqual({ value: '7', unit: 'jours' });
    expect(delayInputFor(336)).toEqual({ value: '14', unit: 'jours' });
  });

  it('falls back to hours for a value that is not a whole number of days', () => {
    expect(delayInputFor(100)).toEqual({ value: '100', unit: 'heures' });
  });

  it('round-trips every quick-fill option back to its own hours', () => {
    // Tapping a chip must store exactly the chip's value. This is the test that catches
    // a threshold moving in one function and not the other.
    for (const o of DELAY_OPTIONS) {
      const { value, unit } = delayInputFor(o.hours);
      expect(delayHoursFrom(value, unit)).toBe(o.hours);
    }
  });

  it('agrees with delayLabel about which unit a value belongs in', () => {
    for (const hours of [24, 48, 72, 96, 120, 168, 336, 504, 2160]) {
      const inDays = delayInputFor(hours).unit === 'jours';
      const readsInDays = /jours|semaine/.test(delayLabel(hours));
      expect(inDays).toBe(readsInDays);
    }
  });
});

describe('the two verified badges', () => {
  it('carries the exact French the client approved for each badge', () => {
    expect(VERIFIED_BADGE_LABEL.IDENTITY).toBe('Réparateur vérifié');
    expect(VERIFIED_BADGE_LABEL.BUSINESS).toBe('Professionnel vérifié');
  });

  it('has a label for the two badges and for nothing else', () => {
    // The deliberate break this guards: adding a BASIC or NONE key here would
    // give « Vérifié » to an account that verified only an email and a phone,
    // on the screen a client uses to decide who gets paid work.
    expect(Object.keys(VERIFIED_BADGE_LABEL).sort()).toEqual(['BUSINESS', 'IDENTITY']);
  });

  it('names the two badges differently, which is the whole point of the split', () => {
    expect(VERIFIED_BADGE_LABEL.IDENTITY).not.toBe(VERIFIED_BADGE_LABEL.BUSINESS);
  });

  it('treats either badge as verified, and no badge as not', () => {
    expect(isVerified(anOffer({ verifiedBadge: 'IDENTITY' }))).toBe(true);
    expect(isVerified(anOffer({ verifiedBadge: 'BUSINESS' }))).toBe(true);
    expect(isVerified(anOffer({ verifiedBadge: null }))).toBe(false);
  });
});

describe('mayOfferWarranty - « la garantie doit être réservée aux professionnels »', () => {
  it('grants a warranty to BUSINESS and to nothing else', () => {
    expect(mayOfferWarranty('BUSINESS')).toBe(true);
    for (const level of ['NONE', 'BASIC', 'IDENTITY']) {
      expect(mayOfferWarranty(level)).toBe(false);
    }
  });

  it('refuses IDENTITY, which is the case the whole rule turns on', () => {
    // « Réparateur vérifié » is a PARTICULIER who verified his ID; « Professionnel
    // vérifié » is a company checked against the registry. The client requires the
    // two badges to rank EQUAL, so IDENTITY is not "one rung short of pro" - it is a
    // different claim, and granting a warranty from it would be exactly the
    // « garantie professionnelle » he asked us to keep away from a particulier.
    expect(mayOfferWarranty('IDENTITY')).toBe(false);
  });

  it('fails CLOSED on an absent or unknown level', () => {
    // Callers reach the level through an optional relation, the same shape
    // verifiedBadgeFor documents. A réparateur with no Profile row must not be
    // handed a warranty by a `!== 'INDIVIDUAL'`-style test.
    expect(mayOfferWarranty(null)).toBe(false);
    expect(mayOfferWarranty(undefined)).toBe(false);
    expect(mayOfferWarranty('')).toBe(false);
    expect(mayOfferWarranty('PRO')).toBe(false);
  });

  it('is never derived from the self-declared kind, which has no representation here', () => {
    // RepairerProfile.kind is what the réparateur ticked about himself, and design
    // §4.4 / spec §6.2 forbid it from driving a claim a client reads. A warranty IS
    // such a claim, so the discriminator is the checked level. This asserts the
    // signature cannot express kind at all: 'PRO' is just an unknown level above.
    expect(mayOfferWarranty('INDIVIDUAL')).toBe(false);
  });
});

describe('WARRANTY_NONE', () => {
  it('is the exact « no warranty » member of WARRANTY_OPTIONS, so the two cannot drift', () => {
    expect(WARRANTY_NONE).toBe('Aucune');
    expect(WARRANTY_OPTIONS).toContain(WARRANTY_NONE);
  });

  it('is the value everyone may send, so the schema still accepts it', () => {
    // The rule lives in the service, never in the schema: refusing a warranty needs
    // the caller's identity, which a Zod parse does not have. So `Aucune` must stay
    // a valid parse for a réparateur of any level.
    expect(
      createOfferSchema.safeParse({ ...valid, warrantyLabel: WARRANTY_NONE }).success,
    ).toBe(true);
  });
});

describe('hasWarranty - whether a surface should say the word « Garantie » at all', () => {
  it('is false for « Aucune », so no card renders « Garantie Aucune »', () => {
    // Not cosmetic. CF-31 suppresses the label to « Aucune » for every réparateur
    // below BUSINESS, which is 44 of the 47 offers in production - so the three
    // surfaces that interpolate it after the word « Garantie » would ALL read
    // « Garantie Aucune » as their normal state.
    expect(hasWarranty(WARRANTY_NONE)).toBe(false);
  });

  it('is true for every real warranty in WARRANTY_OPTIONS', () => {
    for (const w of WARRANTY_OPTIONS.filter((o) => o !== WARRANTY_NONE)) {
      expect(hasWarranty(w)).toBe(true);
    }
  });

  it('accounts for every option, so a new one cannot be silently unhandled', () => {
    expect(WARRANTY_OPTIONS.filter(hasWarranty)).toHaveLength(WARRANTY_OPTIONS.length - 1);
  });
});

describe('warrantyLabelFor - the same rule on the READ path', () => {
  it('shows a BUSINESS réparateur exactly what he stored', () => {
    expect(warrantyLabelFor('BUSINESS', '12 mois')).toBe('12 mois');
    expect(warrantyLabelFor('BUSINESS', '3 mois')).toBe('3 mois');
  });

  it('suppresses a stored warranty for everyone else, which is what fixes the legacy rows', () => {
    // 44 of the 47 offers in production were written before this rule existed, by
    // réparateurs at NONE. A write-only rule would leave the client reading
    // « Garantie 3 mois » from a particulier - the exact thing CF-31 asks us to stop -
    // so the suppression happens on presentation and no row has to be migrated.
    for (const level of ['NONE', 'BASIC', 'IDENTITY']) {
      expect(warrantyLabelFor(level, '12 mois')).toBe(WARRANTY_NONE);
    }
  });

  it('never invents a warranty upward', () => {
    expect(warrantyLabelFor('BUSINESS', WARRANTY_NONE)).toBe(WARRANTY_NONE);
  });

  it('fails CLOSED on an absent level', () => {
    expect(warrantyLabelFor(null, '6 mois')).toBe(WARRANTY_NONE);
    expect(warrantyLabelFor(undefined, '6 mois')).toBe(WARRANTY_NONE);
  });

  it('is idempotent, which is what lets the WRITE check be « would we display this? »', () => {
    // offers.service refuses a create when warrantyLabelFor(level, sent) !== sent.
    // That only expresses "refuse what we would not show" if a second application
    // changes nothing - otherwise an already-suppressed value could still be refused.
    for (const level of ['NONE', 'IDENTITY', 'BUSINESS', null]) {
      for (const stored of WARRANTY_OPTIONS) {
        const once = warrantyLabelFor(level, stored);
        expect(warrantyLabelFor(level, once)).toBe(once);
      }
    }
  });

  it('agrees with mayOfferWarranty, so the predicate and the derivation cannot drift', () => {
    for (const level of ['NONE', 'BASIC', 'IDENTITY', 'BUSINESS', 'PRO', null, undefined]) {
      const passesThrough = warrantyLabelFor(level, '6 mois') === '6 mois';
      expect(passesThrough).toBe(mayOfferWarranty(level));
    }
  });
});

describe('liveOffers', () => {
  it('drops a withdrawn offer', () => {
    const kept = anOffer({ status: 'SENT' });
    const gone = anOffer({ status: 'WITHDRAWN' });
    expect(liveOffers([kept, gone]).map((o) => o.id)).toEqual([kept.id]);
  });

  it('keeps every sent offer, in the order given', () => {
    const a = anOffer();
    const b = anOffer();
    expect(liveOffers([a, b]).map((o) => o.id)).toEqual([a.id, b.id]);
  });

  it('counts only SENT, so the tally agrees with the server offerCount', () => {
    // DemandesService counts `status: 'SENT'` and nothing else. If this helper
    // admitted ACCEPTED or REJECTED, the home tab would say "1 offre reçue"
    // while this screen said 2, the moment the accept étape makes them
    // reachable.
    const offers = [
      anOffer({ status: 'SENT' }),
      anOffer({ status: 'ACCEPTED' }),
      anOffer({ status: 'REJECTED' }),
      anOffer({ status: 'WITHDRAWN' }),
    ];
    expect(liveOffers(offers)).toHaveLength(1);
  });

  it('returns an empty list when every offer was withdrawn', () => {
    expect(liveOffers([anOffer({ status: 'WITHDRAWN' })])).toEqual([]);
  });
});

describe('partitionOffers', () => {
  it('pulls the accepted offer out, so it is never filed under a past section', () => {
    const chosen = anOffer({ status: 'ACCEPTED' });
    const loser = anOffer({ status: 'REJECTED' });
    const result = partitionOffers([chosen, loser]);

    expect(result.accepted?.id).toBe(chosen.id);
    expect(result.live).toEqual([]);
    expect(result.past.map((o) => o.id)).toEqual([loser.id]);
  });

  it('returns a null accepted before anyone has been chosen', () => {
    const result = partitionOffers([
      anOffer({ status: 'SENT' }),
      anOffer({ status: 'WITHDRAWN' }),
    ]);
    expect(result.accepted).toBeNull();
  });

  it('is exhaustive: every input offer lands in exactly one bucket', () => {
    const offers = [
      anOffer({ status: 'SENT' }),
      anOffer({ status: 'SENT' }),
      anOffer({ status: 'ACCEPTED' }),
      anOffer({ status: 'REJECTED' }),
      anOffer({ status: 'WITHDRAWN' }),
    ];
    const { accepted, live, past } = partitionOffers(offers);

    const placed = [...(accepted ? [accepted] : []), ...live, ...past].map(
      (o) => o.id,
    );
    expect(placed.sort()).toEqual(offers.map((o) => o.id).sort());
    expect(new Set(placed).size).toBe(offers.length);
  });

  it('agrees with liveOffers, so the section and the count cannot disagree', () => {
    const offers = [
      anOffer({ status: 'SENT' }),
      anOffer({ status: 'ACCEPTED' }),
    ];
    expect(partitionOffers(offers).live).toEqual(liveOffers(offers));
  });

  it('handles an empty list', () => {
    expect(partitionOffers([])).toEqual({ accepted: null, live: [], past: [] });
  });
});

describe('pastSectionHeading', () => {
  it('says « Offres retirées » when nothing was rejected', () => {
    expect(pastSectionHeading([anOffer({ status: 'WITHDRAWN' })])).toBe(
      'Offres retirées',
    );
  });

  it('says « Autres offres » once anything was rejected, because a rejected offer was not retirée', () => {
    expect(
      pastSectionHeading([
        anOffer({ status: 'WITHDRAWN' }),
        anOffer({ status: 'REJECTED' }),
      ]),
    ).toBe('Autres offres');
  });

  it('says « Offres retirées » for an empty list, which is the heading that never renders', () => {
    expect(pastSectionHeading([])).toBe('Offres retirées');
  });
});

describe('acceptedOffer', () => {
  it('returns the accepted offer when one exists', () => {
    const accepted = anOffer({ status: 'ACCEPTED' });
    const sent = anOffer({ status: 'SENT' });
    const rejected = anOffer({ status: 'REJECTED' });
    expect(acceptedOffer([sent, accepted, rejected])).toEqual(accepted);
  });

  it('returns null when no offer is accepted', () => {
    const sent = anOffer({ status: 'SENT' });
    const withdrawn = anOffer({ status: 'WITHDRAWN' });
    expect(acceptedOffer([sent, withdrawn])).toBeNull();
  });

  it('returns the first accepted offer when the list somehow holds two', () => {
    // The invariant is at-most-one, stated by using find() not filter(). If
    // that invariant is somehow violated, this is what the caller receives.
    const first = anOffer({ status: 'ACCEPTED' });
    const second = anOffer({ status: 'ACCEPTED' });
    expect(acceptedOffer([first, second])).toEqual(first);
  });

  it('returns null for an empty list', () => {
    expect(acceptedOffer([])).toBeNull();
  });
});
