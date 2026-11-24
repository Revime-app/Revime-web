import { describe, expect, it } from 'vitest';
import { demandeShareText, type DemandeDto } from '@revime/shared';

/**
 * `CF-53`. The one place this slice can actually be TESTED.
 *
 * `apps/mobile` has no test harness - `tsc` is its only gate - so the share message was put in
 * `packages/shared` specifically to bring it under `test:unit`, following the precedent of
 * `demande-edit-policy.spec.ts` and `demande-progress.spec.ts` in this directory.
 *
 * Every assertion is a WHOLE-STRING equality rather than a `toContain`. A `toContain` on a
 * multi-line template passes while the lines are in the wrong order, carry a doubled blank line,
 * or trail whitespace - none of which any other gate here would see either.
 */

/** The narrow input the helper accepts. Deliberately NOT a whole `DemandeDto` - see the helper. */
type ShareInput = Parameters<typeof demandeShareText>[0];

const URL = 'revime:///demande/dem_123';

const base: ShareInput = {
  title: 'Remplacement écran iPhone 13',
  brand: 'Apple',
  model: 'iPhone 13',
  category: { id: 'cat_1', slug: 'smartphone', labelFr: 'Smartphone' },
  locationLabel: '75011 Paris',
  mode: 'BUDGET',
  budgetCents: 8000,
};

describe('demandeShareText', () => {
  it('renders title, device, category · location, budget, then the link last', () => {
    expect(demandeShareText(base, URL)).toBe(
      [
        'Remplacement écran iPhone 13',
        'Apple iPhone 13',
        'Smartphone · 75011 Paris',
        'Budget 80 €',
        '',
        'Voir cette demande dans Revime :',
        'revime:///demande/dem_123',
      ].join('\n'),
    );
  });

  /**
   * Both device columns are nullable. The line is DROPPED rather than rendered empty - the same
   * rule `demande/[id]/index.tsx` applies to its own subtitle, and the reason the assertion is a
   * whole string: an omitted line must not leave a doubled `\n` behind.
   */
  it('drops the device line entirely when brand and model are both null', () => {
    expect(demandeShareText({ ...base, brand: null, model: null }, URL)).toBe(
      [
        'Remplacement écran iPhone 13',
        'Smartphone · 75011 Paris',
        'Budget 80 €',
        '',
        'Voir cette demande dans Revime :',
        'revime:///demande/dem_123',
      ].join('\n'),
    );
  });

  it('renders a lone brand with no trailing space when model is null', () => {
    expect(demandeShareText({ ...base, model: null }, URL)).toBe(
      [
        'Remplacement écran iPhone 13',
        'Apple',
        'Smartphone · 75011 Paris',
        'Budget 80 €',
        '',
        'Voir cette demande dans Revime :',
        'revime:///demande/dem_123',
      ].join('\n'),
    );
  });

  it('renders a lone model when brand is null', () => {
    expect(demandeShareText({ ...base, brand: null }, URL)).toBe(
      [
        'Remplacement écran iPhone 13',
        'iPhone 13',
        'Smartphone · 75011 Paris',
        'Budget 80 €',
        '',
        'Voir cette demande dans Revime :',
        'revime:///demande/dem_123',
      ].join('\n'),
    );
  });

  /**
   * 🛑 « Recherche d’offres » and NOT « 0 € ». An OFFERS-mode demande has no price yet, which is
   * an invitation to quote - a zero would read to the recipient as the client's ceiling. This
   * mirrors the badge on `demande/[id]/index.tsx` and `DemandeCard.tsx` verbatim, INCLUDING the
   * U+2019 apostrophe, so the shared message and the screen cannot disagree.
   */
  it('says Recherche d’offres for an OFFERS-mode demande', () => {
    expect(demandeShareText({ ...base, mode: 'OFFERS', budgetCents: null }, URL)).toBe(
      [
        'Remplacement écran iPhone 13',
        'Apple iPhone 13',
        'Smartphone · 75011 Paris',
        'Recherche d’offres',
        '',
        'Voir cette demande dans Revime :',
        'revime:///demande/dem_123',
      ].join('\n'),
    );
  });

  /**
   * The screen's own posture expression is `mode === 'BUDGET' && budgetCents !== null`, so a
   * BUDGET demande whose budget is somehow absent falls back rather than printing « Budget  € ».
   * Asserted because the two halves are independent and only one of them is obvious.
   */
  it('falls back to Recherche d’offres for BUDGET mode with a null budget', () => {
    expect(demandeShareText({ ...base, mode: 'BUDGET', budgetCents: null }, URL)).toContain(
      'Recherche d’offres',
    );
  });

  /** Money goes through `euros()`, so a non-whole amount carries the French comma. */
  it('formats a non-whole budget with a French comma', () => {
    expect(demandeShareText({ ...base, budgetCents: 8050 }, URL)).toContain('Budget 80,50 €');
  });

  /**
   * The link is what the recipient acts on, so it must be the LAST line and appear exactly once.
   * A duplicated URL is the shape a careless template edit produces, and it renders as a
   * double-tap trap in most messaging apps.
   */
  it('puts the url on the final line, exactly once', () => {
    const out = demandeShareText(base, URL);
    const lines = out.split('\n');
    expect(lines[lines.length - 1]).toBe(URL);
    expect(out.split(URL).length - 1).toBe(1);
  });

  /**
   * 🛑 THE PRIVACY ASSERTION, and the reason the parameter is a narrow `Pick` rather than a whole
   * `DemandeDto`. `distanceKm` is VIEWER-RELATIVE - « à 2,4 km de vous » is simply false for
   * whoever receives the message - and `author`, `photoUrls` and `description` have their own
   * reasons to stay out (a user handle in outbound text, signed URLs that expire in an hour, and
   * unbounded length).
   *
   * The `Pick` makes passing one a COMPILE error, which is the stronger gate. This test covers
   * what the type cannot: the helper is handed those fields ANYWAY, at runtime, and must not emit
   * them. A screen passes a whole `DemandeDto` - structurally legal, and it carries every one of
   * these - so this is the real call shape, not a contrived one.
   *
   * 🛑 An earlier draft of this test asserted `widened.distanceKm` was `undefined` on the FIXTURE.
   * That passed before the helper existed at all, and would have kept passing if the helper
   * started printing a distance. It was a test of the fixture wearing a privacy test's name.
   */
  it('emits no viewer-relative or author-identifying field even when handed them', () => {
    const out = demandeShareText(
      {
        ...base,
        distanceKm: 2.4,
        description: 'DESCRIPTION-SENTINEL',
        author: { username: 'thomas-sentinel', memberSince: '2026-01-01' },
        photoUrls: ['https://signed.example/PHOTO-SENTINEL'],
        offerCount: 7,
        status: 'OPEN',
      } as unknown as ShareInput,
      URL,
    );
    expect(out).not.toContain('2,4');
    expect(out).not.toContain('2.4');
    expect(out).not.toContain('km');
    expect(out).not.toContain('DESCRIPTION-SENTINEL');
    expect(out).not.toContain('thomas-sentinel');
    expect(out).not.toContain('PHOTO-SENTINEL');
    /**
     * The exact form, and it subsumes every assertion above: the extra fields must change the
     * output by NOTHING. `offerCount` and `status` are covered here rather than by a
     * `not.toContain` on their values, because a bare digit assertion is a false gate - the
     * fixture's own « 75011 Paris » and « Budget 80 € » contain most of them.
     */
    expect(out).toBe(demandeShareText(base, URL));
  });

  /**
   * A whole `DemandeDto` must satisfy the narrow parameter structurally, because that is what
   * every real call site passes. The ASSIGNMENT is the assertion - this fails `typecheck` if the
   * `Pick` and `DemandeDto` ever drift - so no fixture is built and nothing is cast.
   */
  it('accepts a full DemandeDto structurally', () => {
    const accepts = (d: DemandeDto): string => demandeShareText(d, URL);
    expect(typeof accepts).toBe('function');
  });
});
