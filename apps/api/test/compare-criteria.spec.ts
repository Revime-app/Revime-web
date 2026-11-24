import { describe, expect, it } from 'vitest';
import type { OfferDto } from '@revime/shared';
import { liveOffers, normalisePriceInput, visibleCriteria } from '@revime/shared';

const offer = (over: Partial<OfferDto> = {}): OfferDto => ({
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

describe('visibleCriteria', () => {
  it('shows a criterion whose values differ', () => {
    const rows = visibleCriteria([offer({ priceCents: 8900 }), offer({ priceCents: 7500 })]);
    expect(rows.map((r) => r.key)).toContain('Prix');
  });

  it('hides a criterion where every offer has the same value', () => {
    const rows = visibleCriteria([offer({ priceCents: 8900 }), offer({ priceCents: 8900 })]);
    expect(rows.map((r) => r.key)).not.toContain('Prix');
  });

  it('hides Vérifié while nobody is verified, which is the 3b case', () => {
    const rows = visibleCriteria([offer({ verifiedBadge: null }), offer({ verifiedBadge: null })]);
    expect(rows.map((r) => r.key)).not.toContain('Vérifié');
  });

  it('shows Vérifié as soon as one réparateur is verified', () => {
    const rows = visibleCriteria([
      offer({ verifiedBadge: 'IDENTITY' }),
      offer({ verifiedBadge: null }),
    ]);
    expect(rows.map((r) => r.key)).toContain('Vérifié');
  });

  it('hides Vérifié when the two badges merely differ, and never ranks one above the other', () => {
    // The client requires that level 3 never be a requirement, so
    // « Professionnel vérifié » and « Réparateur vérifié » are equal. This row
    // therefore reads « Oui » for both, which ties, which hides it - rather than
    // showing two distinct strings a client would read as one being better.
    const pro = offer({ verifiedBadge: 'BUSINESS' });
    const individual = offer({ verifiedBadge: 'IDENTITY' });
    expect(visibleCriteria([pro, individual]).map((r) => r.key)).not.toContain('Vérifié');

    // And on a list where the row IS visible, the two still rank equal.
    const rows = visibleCriteria([pro, individual, offer({ verifiedBadge: null })]);
    const verif = rows.find((r) => r.key === 'Vérifié');
    expect(verif).toBeDefined();
    expect(verif!.rank(pro)).toBe(verif!.rank(individual));
    expect(verif!.get(pro)).toBe(verif!.get(individual));
  });

  it('hides Distance when no offer has coordinates', () => {
    const rows = visibleCriteria([offer({ distanceKm: null }), offer({ distanceKm: null })]);
    expect(rows.map((r) => r.key)).not.toContain('Distance');
  });

  it('hides Distance when only one offer has a distance, since nothing can be compared', () => {
    const rows = visibleCriteria([offer({ distanceKm: 1.2 }), offer({ distanceKm: null })]);
    expect(rows.map((r) => r.key)).not.toContain('Distance');
  });

  it('shows Déplacement when the modes differ, even though it cannot be ranked', () => {
    const rows = visibleCriteria([offer({ travel: 'HOME' }), offer({ travel: 'WORKSHOP' })]);
    const dep = rows.find((r) => r.key === 'Déplacement');
    expect(dep).toBeDefined();
    // Every offer ranks equal, so Comparaison must never crown a winner here.
    expect(dep?.rank(offer({ travel: 'HOME' }))).toBe(dep?.rank(offer({ travel: 'WORKSHOP' })));
  });

  it('returns nothing for fewer than two offers, because there is nothing to compare', () => {
    expect(visibleCriteria([offer()])).toEqual([]);
    expect(visibleCriteria([])).toEqual([]);
  });

  it('ranks delay by hours, so 3 days never beats 24 hours', () => {
    const rows = visibleCriteria([offer({ delayHours: 24 }), offer({ delayHours: 72 })]);
    const delai = rows.find((r) => r.key === 'Délai');
    expect(delai).toBeDefined();
    expect(delai!.rank(offer({ delayHours: 24 }))).toBeLessThan(
      delai!.rank(offer({ delayHours: 72 })),
    );
    // And the displayed label is French, derived from the hours.
    expect(delai!.get(offer({ delayHours: 168 }))).toBe('1 semaine');
  });

  it('formats price in euros with a French comma and no fractional cents', () => {
    const rows = visibleCriteria([offer({ priceCents: 8950 }), offer({ priceCents: 7500 })]);
    const prix = rows.find((r) => r.key === 'Prix');
    expect(prix!.get(offer({ priceCents: 8950 }))).toBe('89,50 €');
    expect(prix!.get(offer({ priceCents: 7500 }))).toBe('75 €');
  });
});

describe('visibleCriteria over liveOffers, which is what Comparaison renders', () => {
  it('never crowns a withdrawn offer, even when it was the cheapest', () => {
    // The whole reason Comparaison filters. Two live offers tie on price, so
    // the Prix row must drop out; if the withdrawn 50 € offer reached
    // visibleCriteria the row would appear and highlight an offer nobody will
    // honour as the best price.
    const offers = [
      offer({ priceCents: 8900 }),
      offer({ priceCents: 8900 }),
      offer({ priceCents: 5000, status: 'WITHDRAWN' }),
    ];
    expect(visibleCriteria(liveOffers(offers)).map((r) => r.key)).not.toContain('Prix');
  });

  it('has nothing to compare when only one offer is still live', () => {
    const offers = [offer(), offer({ priceCents: 7500, status: 'WITHDRAWN' })];
    expect(visibleCriteria(liveOffers(offers))).toEqual([]);
  });
});

describe('the Note row', () => {
  // 🛑 READ THIS BEFORE EDITING ANY FIXTURE BELOW. `visibleCriteria` returns a row only
  // when at least TWO offers pass `has` AND their `get` values differ. So every test
  // that needs the Note row to EXIST must carry two offers with two DIFFERENT ratings,
  // on top of whatever unrated offers the case is actually about. Shrinking these
  // fixtures makes the row vanish and the test fail on `.find(...)` rather than on the
  // property it names.
  it('renders one decimal with a French comma, and « - » when unrated', () => {
    const offers = [
      offer({ id: 'a', rating: 4.8, reviewCount: 12 }),
      offer({ id: 'b', rating: 3.2 }),
      offer({ id: 'c', rating: null }),
    ];
    const note = visibleCriteria(offers).find((c) => c.key === 'Note');
    expect(note).toBeDefined();
    expect(note!.get(offers[0]!)).toBe('4,8');
    expect(note!.get(offers[1]!)).toBe('3,2');
    // `get` is callable on an offer that `has` excluded -- the two are independent.
    expect(note!.get(offers[2]!)).toBe('-');
  });

  it('does not appear when only ONE offer is rated, which is what `has` protects', () => {
    // Added after a deliberate break PASSED, which means this property was untested.
    // With two UNRATED offers the row already drops out on the distinctness rule alone --
    // both cells read « - », so `new Set(values).size > 1` is false and `has: () => true`
    // survives that test unnoticed. Here `has` is the ONLY thing standing between the
    // client and a « 4,8 » column sitting beside a « - » column, which is a Note row that
    // cannot separate the two offers on its own criterion.
    const offers = [offer({ id: 'rated', rating: 4.8 }), offer({ id: 'unrated', rating: null })];
    expect(visibleCriteria(offers).some((c) => c.key === 'Note')).toBe(false);
  });

  it('does not appear when nobody is rated', () => {
    // The state of production on the day this ships: `has` is false for every offer,
    // so fewer than two have a value and the row drops out rather than showing a
    // column of « - ».
    const offers = [offer({ id: 'a' }), offer({ id: 'b' })];
    expect(visibleCriteria(offers).some((c) => c.key === 'Note')).toBe(false);
  });

  it('ranks a higher rating better and sorts an unrated réparateur LAST', () => {
    const offers = [
      offer({ id: 'unrated', rating: null }),
      offer({ id: 'good', rating: 4.9 }),
      offer({ id: 'ok', rating: 3.1 }),
    ];
    const note = visibleCriteria(offers).find((c) => c.key === 'Note')!;
    const order = [...offers].sort((a, b) => note.rank(a) - note.rank(b)).map((o) => o.id);
    expect(order).toEqual(['good', 'ok', 'unrated']);
  });

  it('gives TWO unrated offers a stable order, which POSITIVE_INFINITY cannot', () => {
    // The bug this pins: `Infinity - Infinity` is NaN, and a comparator returning NaN
    // lets Array.prototype.sort produce ANY order. One unrated offer cannot see it -
    // it takes two, and a defined expected order.
    //
    // FOUR offers, not three: two rated with DIFFERENT ratings are what make the row
    // visible at all, and the two unrated ones are the case under test.
    const offers = [
      offer({ id: 'x', rating: null }),
      offer({ id: 'y', rating: null }),
      offer({ id: 'best', rating: 5 }),
      offer({ id: 'ok', rating: 4 }),
    ];
    const note = visibleCriteria(offers).find((c) => c.key === 'Note')!;
    // This assertion is the load-bearing one. It CANNOT pass with POSITIVE_INFINITY,
    // whereas the order assertion below can pass by luck, since NaN permits any
    // order including the correct one.
    expect(note.rank(offers[0]!) - note.rank(offers[1]!)).toBe(0);
    const order = [...offers].sort((a, b) => note.rank(a) - note.rank(b)).map((o) => o.id);
    expect(order).toEqual(['best', 'ok', 'x', 'y']);
  });
});

describe('the Distance row, whose NaN bug is pre-existing', () => {
  it('gives two offers with no distance a stable order', () => {
    // Same fixture shape and the same reason: two DIFFERENT distances make the row
    // visible, and the two nulls are the case under test.
    const offers = [
      offer({ id: 'p', distanceKm: null }),
      offer({ id: 'q', distanceKm: null }),
      offer({ id: 'near', distanceKm: 2.5 }),
      offer({ id: 'far', distanceKm: 9 }),
    ];
    const distance = visibleCriteria(offers).find((c) => c.key === 'Distance')!;
    expect(distance.rank(offers[0]!) - distance.rank(offers[1]!)).toBe(0);
    const order = [...offers].sort((a, b) => distance.rank(a) - distance.rank(b)).map((o) => o.id);
    expect(order).toEqual(['near', 'far', 'p', 'q']);
  });
});

describe('the « Nb de réparations » row', () => {
  it('ranks a higher count better and needs no null case', () => {
    const offers = [
      offer({ id: 'novice', repairCount: 0 }),
      offer({ id: 'veteran', repairCount: 37 }),
    ];
    const row = visibleCriteria(offers).find((c) => c.key === 'Nb de réparations')!;
    expect(row.get(offers[0]!)).toBe('0');
    expect(row.get(offers[1]!)).toBe('37');
    const order = [...offers].sort((a, b) => row.rank(a) - row.rank(b)).map((o) => o.id);
    expect(order).toEqual(['veteran', 'novice']);
  });

  it('does not appear when every count ties at zero', () => {
    // Also the state of production on the day this ships, and by a DIFFERENT mechanism
    // from Note's: `has` is true for everyone, and the row drops out because the values
    // are identical. Both mechanisms need their own case.
    const offers = [offer({ id: 'a' }), offer({ id: 'b' })];
    expect(visibleCriteria(offers).some((c) => c.key === 'Nb de réparations')).toBe(false);
  });
});

describe('normalisePriceInput', () => {
  it('normalises French comma to dot', () => {
    expect(normalisePriceInput('89,50')).toBe('89.50');
  });

  it('collapses multiple dots to keep only the first', () => {
    expect(normalisePriceInput('89.5.5')).toBe('89.55');
  });

  it('truncates to at most two decimals, not rounding', () => {
    expect(normalisePriceInput('89.999')).toBe('89.99');
  });

  it('strips non-numeric junk', () => {
    expect(normalisePriceInput('abc')).toBe('');
  });

  it('leaves clean integers unchanged', () => {
    expect(normalisePriceInput('89')).toBe('89');
  });
});
