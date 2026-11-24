import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LIVE_OFFER_WHERE,
  ACCEPTABLE_OFFER_WHERE,
  UNSUSPENDED_REPAIRER_WHERE,
} from '../src/offers/offer-predicates.js';

// Named rather than counted: round 1 added `UNSUSPENDED_REPAIRER_WHERE`, which made a title
// reading « the two predicates » false without touching a single assertion.
describe('LIVE, UNSUSPENDED and ACCEPTABLE say different things', () => {
  it('LIVE_OFFER_WHERE is what exists', () => {
    expect(LIVE_OFFER_WHERE).toEqual({ status: 'SENT', deletedAt: null });
  });

  /**
   * The suspension is reached through Offer.repairer (a User) and User.profile - NOT
   * User.repairerProfile, which is an OPTIONAL to-one relation where Prisma would read
   * `{ repairerProfile: { repairerSuspendedAt: null } }` as "the row exists AND the field is
   * null" and silently drop any réparateur without that row. Spec §4.1.
   */
  it('ACCEPTABLE_OFFER_WHERE adds the suspension through profile, not repairerProfile', () => {
    expect(ACCEPTABLE_OFFER_WHERE).toEqual({
      status: 'SENT',
      deletedAt: null,
      repairer: { profile: { repairerSuspendedAt: null } },
    });
    expect(JSON.stringify(ACCEPTABLE_OFFER_WHERE)).not.toContain('repairerProfile');
  });

  /**
   * The suspension clause on its own, for `listForDemande` - the one read that keeps withdrawn
   * offers, so `ACCEPTABLE_OFFER_WHERE` does not fit it and spelling the traversal out a second
   * time would be the drift this module exists to remove.
   *
   * 🛑 NO `status` AND NO `deletedAt`, asserted rather than assumed: adding either would silently
   * delete the withdrawn trail from that screen, which the client explicitly asked to keep.
   */
  it('UNSUSPENDED_REPAIRER_WHERE is the suspension clause and nothing else', () => {
    expect(UNSUSPENDED_REPAIRER_WHERE).toEqual({
      repairer: { profile: { repairerSuspendedAt: null } },
    });
    expect(UNSUSPENDED_REPAIRER_WHERE.status).toBeUndefined();
    expect(UNSUSPENDED_REPAIRER_WHERE.deletedAt).toBeUndefined();
    expect(JSON.stringify(UNSUSPENDED_REPAIRER_WHERE)).not.toContain('repairerProfile');
  });

  it('ACCEPTABLE is a superset of LIVE, so nothing acceptable is not live', () => {
    for (const [k, v] of Object.entries(LIVE_OFFER_WHERE)) {
      expect(ACCEPTABLE_OFFER_WHERE[k as keyof typeof ACCEPTABLE_OFFER_WHERE]).toEqual(v);
    }
  });

  /**
   * 🛑 RULING 27. A suspension does not self-expire - only an operator clearing
   * `repairerSuspendedAt` ends it, which is the rule `offers.service.ts`'s guard 6 already
   * records at length. `repairerSuspendedUntil` is the operator's recorded intent for display,
   * not an authoritative expiry, and consulting it here would additionally force this constant
   * to become a function of `new Date()`.
   */
  it('neither predicate consults repairerSuspendedUntil', () => {
    expect(JSON.stringify(ACCEPTABLE_OFFER_WHERE)).not.toContain('repairerSuspendedUntil');
    expect(JSON.stringify(LIVE_OFFER_WHERE)).not.toContain('repairerSuspendedUntil');
  });
});

const FILES = [
  'src/demandes/demandes.service.ts',
  'src/favorites/favorites.service.ts',
  'src/offers/offers.service.ts',
  'src/payments/payments.service.ts',
];

function read(f: string): string {
  return readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
}

/**
 * 🛑 SOURCE-LEVEL ASSERTIONS, AND THEY ARE DELIBERATE.
 *
 * The classification of each call site is the whole risk of this task, and no unit test with a
 * mocked Prisma can see which predicate a service passed at a site whose harness does not
 * capture the args. So these read the source and assert PROPERTIES of it. The three sites whose
 * harness DOES capture the args get runtime assertions instead, in `received-offers.spec.ts`,
 * `demandes-delete.spec.ts` and `favorites-demandes.spec.ts` - those are stronger and are
 * preferred wherever they are available.
 *
 * 🛑 What these deliberately do NOT do is count occurrences of an identifier. The plan's own
 * draft asserted `{ acceptable: 4, live: 2 }` over `demandes.service.ts`; that number proxies
 * for the classification instead of checking it, it is the third instance of an anti-pattern
 * this branch has already removed twice, and it goes red on a pure rename. Each assertion below
 * names the property it is about.
 */
describe('no service re-expresses the live-offer predicate as a literal', () => {
  it("has no remaining `status: 'SENT', deletedAt: null` literal in a where clause", () => {
    for (const f of FILES) {
      const src = read(f);
      // The create path at offers.service.ts writes `status: 'SENT' as const` as DATA, not
      // as a filter, and is deliberately untouched - hence the `deletedAt` in the pattern.
      // `payments.service.ts` keeps a bare `status: 'SENT'` with NO `deletedAt` on purpose;
      // see the two comments there and B2 spec §5.2.
      expect(src, `${f} still holds a literal copy`).not.toMatch(/status: 'SENT',\s*deletedAt: null/);
    }
  });
});

/**
 * 🛑 THE CLASSIFICATION ITSELF, ASSERTED AS PROPERTIES rather than as a count.
 *
 * The rule in one sentence: a suspended réparateur's offer is invisible and non-binding, but he
 * is still told what happens to it. Each half of that sentence gets an assertion.
 */
describe('every offer read is on the side its role puts it on', () => {
  /**
   * HALF ONE - he is still told. Every TOP-LEVEL read of the `Offer` delegate in
   * `demandes.service.ts` is a notification list, and `prisma.offer.findMany` is what
   * discriminates them: the four FILTERED sites in this file and its sibling reach offers
   * through a nested `offers:` or `_count:` select on `Demande`, never through the Offer
   * delegate. Filtering one of these would strand a suspended réparateur with no notice that
   * the demande he quoted changed or was deleted - which is what makes the suspension
   * self-healing on reactivation.
   */
  it('both notification lists select repairerUserId through LIVE_OFFER_WHERE', () => {
    const lines = read('src/demandes/demandes.service.ts').split('\n');
    // The whole call, to its own closing `});` - NOT a fixed line count, which silently
    // truncated the block the moment these sites gained their explanatory comments.
    const blocks = lines.flatMap((line, i) => {
      if (!line.includes('this.prisma.offer.findMany({')) return [];
      const end = lines.findIndex((l, j) => j > i && l.trim() === '});');
      return [lines.slice(i, end + 1).join('\n')];
    });

    // Not a proxy for the classification - a guard against the scan silently matching nothing,
    // because a broken check reports "missing", never "fine".
    expect(blocks.length, 'found no top-level offer read to classify').toBeGreaterThan(0);

    for (const block of blocks) {
      expect(block, 'a top-level offer read is not a notification list').toContain('select: { repairerUserId: true }');
      expect(block, 'a notification list is not on LIVE_OFFER_WHERE').toContain('...LIVE_OFFER_WHERE');
      expect(block, 'a notification list is filtered by suspension').not.toContain('ACCEPTABLE_OFFER_WHERE');
    }
  });

  /**
   * HALF TWO - the offer is invisible and non-binding. Every `offers:` select reached through a
   * demande read is a number or a list somebody relies on: the `_count` on `DEMANDE_INCLUDE`
   * (which `update`'s edit guard reads), on `listMine`, and on `softDelete`'s delete guard; and
   * the nested arrays `feed` and the favourites list hand to `assembleFeedItems`.
   *
   * 🛑 IT ASSERTS THE PRESENCE OF THE PREDICATE, NOT MERELY THE ABSENCE OF THE WRONG ONE, and
   * that distinction is the whole point of this rewrite. The previous version matched
   * `offers: { where: X }` and checked `X` - so an `offers` select with **no `where` at all**
   * matched nothing and passed. A reviewer deleted `where: ACCEPTABLE_OFFER_WHERE` from `feed()`'s
   * nested select, putting a suspended réparateur's offers back into both `offerCount` and
   * `hasMyOffer`, and the **entire unit suite stayed green at 116 / 1369 / 1**. The comment there
   * claimed « every offers select is ACCEPTABLE » while the code checked nothing of the kind.
   *
   * That was the THIRD instance of one class - a scan that only sees the shape it expects - so
   * this targets the class: it enumerates every `offers:` select, requires each to be MATCHED,
   * and requires its FIRST key to be `where` and that key's value to be the named constant. A
   * missing `where`, an empty object, a re-expanded literal and `offers: true` all redden.
   *
   * Deliberately excluded, and stated so nobody widens the scan by accident: the two `offers:`
   * that are TYPE annotations rather than selects - `_count: { offers: number }` on `present`'s
   * parameter and `offers: Array<{ repairerUserId: string }>` on `assembleFeedItems`'. Neither is
   * followed by `{`, which is what `OFFERS_SELECT_OPEN` keys off.
   */
  it('every offers select carries the ACCEPTABLE predicate as its first key', () => {
    // Every `offers:` whose value is an object - i.e. every select or `_count` entry, and none of
    // the type annotations.
    const OFFERS_SELECT_OPEN = /offers:\s*\{/g;
    // The same, plus its first key and that key's value. `\s*` crosses newlines, so the one-line
    // `_count` selects and the multi-line nested arrays are both seen.
    const OFFERS_FIRST_KEY = /offers:\s*\{\s*([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*|\{)/g;

    for (const f of ['src/demandes/demandes.service.ts', 'src/favorites/favorites.service.ts']) {
      const src = read(f);

      const opens = [...src.matchAll(OFFERS_SELECT_OPEN)];
      const keyed = [...src.matchAll(OFFERS_FIRST_KEY)];

      // Vacuity guard, and not a proxy for the classification: if the scan finds nothing it has
      // broken, because a broken check reports "missing", never "fine".
      expect(opens.length, `${f} has no offers select to classify`).toBeGreaterThan(0);
      // TOTALITY, expressed as agreement between two scans rather than as a hand-maintained
      // number. Every select that opens must also present a first key - which is what refuses
      // `offers: {}`, the one shape the second regex alone would skip in silence.
      expect(keyed.length, `${f} has an offers select this scan could not read`).toBe(opens.length);

      for (const m of keyed) {
        expect(m[1], `${f}: an offers select does not lead with its where clause`).toBe('where');
        expect(m[2], `${f}: an offers select is not on ACCEPTABLE_OFFER_WHERE`).toBe(
          'ACCEPTABLE_OFFER_WHERE',
        );
      }

      // `offers: true` counts every offer including withdrawn ones. It never opens a brace, so
      // the scans above cannot see it, and it is the one remaining way to express an unfiltered
      // count.
      expect(src, `${f} counts offers with no where clause`).not.toMatch(/offers:\s*true/);
    }
  });

  /**
   * 🛑 THE DEFECT MOST LIKELY TO SHIP HERE. `ACCEPTABLE_OFFER_WHERE` carries a `repairer:` key,
   * and object spread is not a deep merge: a site that spreads it and then writes its own
   * `repairer:` key REPLACES the suspension clause entirely, silently, and `tsc` cannot see it
   * because two structurally different `Prisma.OfferWhereInput` values are both valid types. The
   * same shape in Task 5's plan would have stripped every listability clause from the
   * category-filtered directory, and only the implementer refusing to write it caught that.
   *
   * The runtime counterpart, for the two sites that actually spread today, is in
   * `received-offers.spec.ts` and `offers-for-demande.spec.ts` - those read the composed `where`
   * back off the Prisma stub, which is strictly stronger. This assertion exists to generalise to
   * a FUTURE spread site that has no such harness.
   *
   * 🛑 REWRITTEN AFTER IT PASSED ON A REAL DEFECT. The first version scanned from the line AFTER
   * the spread and stopped on an indentation guess, so `...ACCEPTABLE_OFFER_WHERE, repairer: {…}`
   * written on the spread's OWN line was invisible - a reviewer injected exactly that and the file
   * still reported 8 passed. Two changes: the scan starts immediately after the spread token on
   * its own line, and the object's end is found by COUNTING BRACES rather than guessing indent.
   */
  it('no site writes its own repairer key beside a spread of a repairer-bearing predicate', () => {
    // Only these two carry a `repairer:` key, so only these two can be clobbered this way.
    // `LIVE_OFFER_WHERE` cannot, which is why it is absent.
    const SPREADS = ['...ACCEPTABLE_OFFER_WHERE', '...UNSUSPENDED_REPAIRER_WHERE'];
    let scanned = 0;

    for (const f of FILES) {
      // Comments stripped FIRST, for two independent reasons: a brace inside prose would close
      // the object early, and `offers.service.ts`'s own comments discuss `repairer:` in backticks,
      // which would be a false positive.
      const src = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');

      for (const token of SPREADS) {
        let at = src.indexOf(token);
        while (at !== -1) {
          scanned += 1;
          const from = at + token.length;
          // The remainder of the object literal the spread sits in: from just past the token to
          // the brace that closes that object, whatever the indentation.
          let depth = 0;
          let end = src.length;
          for (let k = from; k < src.length; k += 1) {
            const ch = src[k];
            if (ch === '{') depth += 1;
            else if (ch === '}') {
              if (depth === 0) {
                end = k;
                break;
              }
              depth -= 1;
            }
          }
          expect(src.slice(from, end), `${f} spreads ${token} beside its own repairer key`).not.toMatch(/\brepairer:/);
          at = src.indexOf(token, from);
        }
      }
    }

    // Not a proxy for anything - a guard against a renamed constant turning this into a loop that
    // runs zero times and reports success. A broken check reports "missing", never "fine".
    expect(scanned, 'found no spread of a repairer-bearing predicate to scan').toBeGreaterThan(0);
  });
});
