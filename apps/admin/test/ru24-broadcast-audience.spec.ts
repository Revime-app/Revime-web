import { describe, it, expect } from 'vitest';
import type { AdminBroadcastPreview, BroadcastTarget } from '@revime/shared';
import { isConsentRestricted, locationFieldsEnabled, reachCounts, segmentForRole } from '../lib/broadcast-audience';

const SEGMENT: BroadcastTarget = { type: 'SEGMENT', role: 'ALL', verifiedOnly: false, activeOnly: true };
const INDIVIDUAL: BroadcastTarget = { type: 'INDIVIDUAL', userId: '2c53de51-b157-430a-9d90-349f481a539b' };
const preview: AdminBroadcastPreview = {
  totalRecipients: 100,
  emailEligibleCount: 90,
  pushEligibleCount: 60,
  marketingEmailCount: 30,
  marketingPushCount: 10,
  pushIosCount: 0,
  pushAndroidCount: 0,
  marketingPushIosCount: 0,
  marketingPushAndroidCount: 0,
  sampleRecipients: [],
};

describe('broadcast audience (RU-24, F2 marketing consent)', () => {
  it('holds a campaign with a commercial template to the opt-in', () => {
    expect(isConsentRestricted(SEGMENT, 'ANNOUNCEMENT')).toBe(true);
    expect(isConsentRestricted(SEGMENT, 'REPAIRER_OPPORTUNITY')).toBe(true);
    expect(isConsentRestricted(SEGMENT, 'CUSTOM')).toBe(true);
  });

  it('does not hold a service message or a one-to-one message to it', () => {
    expect(isConsentRestricted(SEGMENT, 'MAINTENANCE')).toBe(false);
    expect(isConsentRestricted(SEGMENT, 'VERIFICATION_REMINDER')).toBe(false);
    expect(isConsentRestricted(INDIVIDUAL, 'ANNOUNCEMENT')).toBe(false);
  });

  it('reports the opted-in counts when restricted, the eligible counts otherwise', () => {
    expect(reachCounts(preview, true)).toEqual({ total: 100, email: 30, push: 10 });
    expect(reachCounts(preview, false)).toEqual({ total: 100, email: 90, push: 60 });
    expect(reachCounts(null, true)).toEqual({ total: 0, email: 0, push: 0 });
  });
});

describe('segment role and location (RU-24)', () => {
  const lyon = { ...(SEGMENT as Extract<BroadcastTarget, { type: 'SEGMENT' }>), role: 'REPAIRER' as const, city: 'Lyon', department: '69' };

  it('keeps the city and department for réparateurs only', () => {
    expect(locationFieldsEnabled(lyon)).toBe(true);
    expect(locationFieldsEnabled({ ...lyon, role: 'CLIENT' })).toBe(false);
    expect(locationFieldsEnabled({ ...lyon, role: 'ALL' })).toBe(false);
  });

  it('drops the city and department when the role stops being réparateur', () => {
    expect(segmentForRole(lyon, 'CLIENT')).toMatchObject({ role: 'CLIENT', city: '', department: '' });
    expect(segmentForRole(lyon, 'ALL')).toMatchObject({ role: 'ALL', city: '', department: '' });
  });

  it('keeps them when the role is réparateur', () => {
    expect(segmentForRole(lyon, 'REPAIRER')).toMatchObject({ role: 'REPAIRER', city: 'Lyon', department: '69' });
  });
});
