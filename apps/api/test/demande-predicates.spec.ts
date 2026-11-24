import { describe, expect, it } from 'vitest';
import { VISIBLE_DEMANDE_WHERE } from '../src/demandes/demande-predicates.js';

describe('VISIBLE_DEMANDE_WHERE is the two-key visibility rule and nothing else', () => {
  it('is exactly deletedAt null and hiddenAt null', () => {
    expect(VISIBLE_DEMANDE_WHERE).toEqual({ deletedAt: null, hiddenAt: null });
  });

  /**
   * 🛑 Asserted rather than assumed. A `status` key here would silently narrow every
   * client-facing read to one lifecycle state, and the feed, listMine and the favourites
   * list all legitimately span several.
   */
  it('says nothing about status', () => {
    expect(VISIBLE_DEMANDE_WHERE.status).toBeUndefined();
  });

  /**
   * 🛑 It must not reach into a relation. Both keys are columns on Demande, so this
   * fragment can be spread beside any sibling key without the deep-merge hazard
   * ACCEPTABLE_OFFER_WHERE documents for `repairer:`.
   */
  it('is flat, so spreading it beside a sibling relation filter is safe', () => {
    for (const value of Object.values(VISIBLE_DEMANDE_WHERE)) {
      expect(value).toBeNull();
    }
  });
});

import { readFileSync } from 'node:fs';

/**
 * Source-level, following `offer-predicates.spec.ts`. A behavioural test cannot cover this:
 * `hiddenAt` is null on every row in production, so a site that forgot the filter returns
 * the same rows as one that has it, and no unit test with a stubbed Prisma sees the
 * difference either.
 */
describe('the ADD sites consume the predicate rather than a bare literal', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

  const ADD_FILES = [
    '../src/demandes/demandes.service.ts',
    '../src/conversations/conversations.service.ts',
    '../src/favorites/favorites.service.ts',
    '../src/offers/offers.service.ts',
    // 🛑 ADDED 2026-09-04. Its absence here, from this task's file list and from its `git add`
    // was how the money-path edit would have gone missing with every gate green. Only
    // `createCheckout`'s nested filter changes in this file; the three demande operations that
    // must stay bare (two demande.update calls and the completeBySessionId snapshot read) are
    // asserted BARE by the block below.
    '../src/payments/payments.service.ts',
  ] as const;

  /**
   * 🛑 LIMIT, stated because an undocumented limit inside a gate is a false assurance:
   * these assertions are per FILE. A file with two demande reads where only one consumes
   * the constant still passes. The per-SITE record is
   * `docs/superpowers/plans/2026-09-04-stage-6c1-read-site-inventory.md`, and the reviewer
   * is asked to walk it. This gate catches a whole file being missed, not a site.
   */
  /**
   * CF4-25 widened what counts as "the predicate": a non-author read now consumes
   * `PUBLIC_DEMANDE_WHERE` or `targetableByRepairerWhere`, both built on
   * `VISIBLE_DEMANDE_WHERE` in `demande-predicates.ts`. The rule is unchanged - a named
   * predicate, never a bare literal.
   */
  it.each(ADD_FILES)('%s imports a demande visibility predicate', (file) => {
    expect(read(file)).toMatch(/VISIBLE_DEMANDE_WHERE|PUBLIC_DEMANDE_WHERE|targetableByRepairerWhere/);
  });

  /**
   * 🛑 DEMANDE OPERATIONS THAT MUST STAY BARE, pinned by name. This is the assertion that
   * stops a future reader "completing the pattern" and converting a moderation act into a
   * stuck payment. Covers: payments.service.ts (two demande.update calls in payment completion
   * and refund sync, plus the completeBySessionId snapshot findFirst), and refund.service.ts
   * (one demande.update in the refund handler). Spec §4.3.
   */
  const MUST_STAY_BARE = [
    '../src/payments/payments.service.ts',
    '../src/commandes/refund.service.ts',
  ] as const;

  it.each(MUST_STAY_BARE)('%s never puts hiddenAt on demande writes or payment-side reads', (file) => {
    const src = read(file);
    // Find each `demande.update` and `demande.findFirst` call and assert the object literal
    // that follows carries no hiddenAt. The updates are payment/refund writes; the findFirst
    // is the completeBySessionId snapshot that feeds notification context.
    const operations = src.matchAll(/prisma\.demande\.(update|findFirst)\(\{[\s\S]{0,400}?\}\)/g);
    const found = [...operations];
    // 🛑 Vacuity guard 1: if the regex matches nothing, this test would pass while checking
    // nothing at all.
    expect(found.length).toBeGreaterThan(0);
    for (const [text] of found) {
      // 🛑 Vacuity guard 2, and it closes a hole guard 1 cannot see. The quantifier is LAZY,
      // so `[\s\S]{0,400}?\}\)` can close on a NESTED brace - matching `update({ where: { id }`
      // and stopping, while a `hiddenAt` sits in the `data:` block just beyond the match. That
      // is a match, so guard 1 is satisfied, and the assertion below then passes over a span
      // that never contained the thing being tested. Requiring `data:` OR `where:` inside the
      // span means a truncated match FAILS LOUDLY instead of passing quietly. Updates have
      // `data:`, findFirst has `where:`.
      const hasDataOrWhere = text.includes('data:') || text.includes('where:');
      if (!hasDataOrWhere) {
        throw new Error(`Match missing both data: and where: - truncated span: ${text.slice(0, 100)}`);
      }
      expect(text).not.toContain('hiddenAt');
    }
  });
});
