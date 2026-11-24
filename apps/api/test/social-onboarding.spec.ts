import { describe, expect, it } from 'vitest';
import { needsModeChoice } from '@revime/shared';

const profile = (onboardingCompletedAt: string | null) =>
  ({
    profile: {
      clientEnabled: true,
      repairerEnabled: false,
      activeMode: 'CLIENT' as const,
      verificationLevel: 'NONE' as const,
      onboardingCompletedAt,
      notifyOffers: true,
      notifyMessages: true,
      notifyCommandes: true,
      tour: null,
    },
  });

describe('needsModeChoice', () => {
  it('is true only when no mode choice has ever been recorded', () => {
    expect(needsModeChoice(profile(null))).toBe(true);
    expect(needsModeChoice(profile('2026-08-20T10:00:00.000Z'))).toBe(false);
  });

  it('FAILS CLOSED to the tabs when the session is not loaded', () => {
    // Showing the chooser to an unknown state is worse than not showing it: a
    // returning user would be asked to pick a mode they already have. null here
    // means « we do not know yet », never « new account ».
    expect(needsModeChoice(null)).toBe(false);
    expect(needsModeChoice(undefined)).toBe(false);
  });

  it('treats an absent field the same as null', () => {
    // A field can arrive `undefined` from an API older than the client -- the
    // recorded crash class in apps/mobile/AGENTS.md. `undefined !== null` is
    // true, so a raw !== null check would silently invert this decision.
    expect(needsModeChoice({ profile: {} } as never)).toBe(true);
  });
});
