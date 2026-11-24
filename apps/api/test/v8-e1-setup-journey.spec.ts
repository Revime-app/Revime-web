import { describe, expect, it } from 'vitest';
import { repairerJourney } from '@revime/shared';
import { journeyInputFromRow, type JourneyRow } from '../src/setup/setup-journey.js';

/**
 * V8 E1. The server's twin of the app's `useRepairerJourney`: the same `repairerJourney` inputs, read from the
 * database instead of three API responses, so the reminders and the admin count agree with the app's card.
 */
function row(over: Partial<JourneyRow> = {}, user: Partial<JourneyRow['user']> = {}): JourneyRow {
  return {
    userId: 'u1',
    kind: 'INDIVIDUAL',
    createdAt: new Date('2026-11-10T10:00:00Z'),
    lat: null,
    lng: null,
    bannerPath: null,
    bio: null,
    postalCode: null,
    fiscalCompletedAt: null,
    setupReminder3dAt: null,
    setupReminder8dAt: null,
    ...over,
    user: {
      image: null,
      profile: { verificationLevel: 'BASIC', avatarPath: null },
      identityVerification: null,
      connectAccount: null,
      businessVerification: null,
      repairerCategories: [],
      repairerAvailability: [],
      ...user,
    },
  } as JourneyRow;
}

const DONE_USER: Partial<JourneyRow['user']> = {
  image: null,
  profile: { verificationLevel: 'IDENTITY', avatarPath: 'avatars/u1.jpg' },
  identityVerification: { status: 'VERIFIED', lastErrorCode: null, decision: null },
  connectAccount: { status: 'VERIFIED' },
  repairerCategories: [{ categoryId: 'c1' }],
  repairerAvailability: [{ dayOfWeek: 1 }],
};
const DONE_ROW: Partial<JourneyRow> = {
  bannerPath: 'banners/u1.jpg',
  bio: 'Réparateur de pianos',
  postalCode: '75012',
  fiscalCompletedAt: new Date('2026-11-11T10:00:00Z'),
};

describe('V8 E1 journeyInputFromRow', () => {
  it('a fully set-up repairer reads complete', () => {
    const journey = repairerJourney(journeyInputFromRow(row(DONE_ROW, DONE_USER), true));
    expect(journey.complete).toBe(true);
  });

  it('a fresh repairer reads 1/5 with ≈ 9 min left', () => {
    const journey = repairerJourney(journeyInputFromRow(row(), true));
    expect([journey.completed, journey.total, journey.minutesLeft]).toEqual([1, 5, 9]);
  });

  it("an ACCEPTED operator decision is not a withdrawal (identity.service's status() reports it as null)", () => {
    const input = journeyInputFromRow(
      row({}, { identityVerification: { status: 'VERIFIED', lastErrorCode: null, decision: 'ACCEPTED' } }),
      true,
    );
    expect(input.decision).toBeNull();
    const refused = journeyInputFromRow(
      row({}, { identityVerification: { status: 'VERIFIED', lastErrorCode: null, decision: 'REFUSED' } }),
      true,
    );
    expect(refused.decision).toBe('REFUSED');
  });

  it('an OAuth image with no uploaded avatar counts the photo item, as the app does', () => {
    const input = journeyInputFromRow(row({}, { image: 'https://lh3.example/photo.jpg' }), true);
    expect(input.completion?.items.photo).toBe(true);
  });

  it("review I1: carries the business verification status (a Pro's check under review is waiting)", () => {
    const input = journeyInputFromRow(
      row({ kind: 'PRO' }, { businessVerification: { status: 'PENDING' } } as Partial<JourneyRow['user']>),
      true,
    );
    expect(input.businessStatus).toBe('PENDING');
    expect(journeyInputFromRow(row(), true).businessStatus).toBeNull();
  });

  it('carries the connect flag and the fiscal flag', () => {
    const input = journeyInputFromRow(row(DONE_ROW, DONE_USER), false);
    expect(input.connectEnabled).toBe(false);
    expect(input.fiscalCompleted).toBe(true);
    expect(input.connectStatus).toBe('VERIFIED');
  });
});
