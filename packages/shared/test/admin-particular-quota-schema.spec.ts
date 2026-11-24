import { describe, it, expect } from 'vitest';
import {
  adminParticularQuotaSchema,
  PARTICULAR_QUOTA_MAX_MISSIONS,
  PARTICULAR_QUOTA_MAX_CENTS,
} from '../src/admin.schemas.js';

describe('Admin Particular Quota Schema (A-2)', () => {
  const valid = {
    missionsCount: 8,
    missionsMax: PARTICULAR_QUOTA_MAX_MISSIONS,
    amountCollectedCents: 114000,
    amountMaxCents: PARTICULAR_QUOTA_MAX_CENTS,
    nextMissionReleaseAt: '2026-11-14T00:00:00.000Z',
    pendingPayoutCents: 8500,
    isBlockedFiscal: true,
  };

  it('exports correct constants matching CGU article 53', () => {
    expect(PARTICULAR_QUOTA_MAX_MISSIONS).toBe(10);
    expect(PARTICULAR_QUOTA_MAX_CENTS).toBe(150000); // 1 500 € in cents
  });

  it('validates a valid particular quota object', () => {
    const parsed = adminParticularQuotaSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  it('validates a quota object with 0 missions and null release date', () => {
    const parsed = adminParticularQuotaSchema.parse({
      ...valid,
      missionsCount: 0,
      amountCollectedCents: 0,
      nextMissionReleaseAt: null,
      pendingPayoutCents: 0,
      isBlockedFiscal: false,
    });
    expect(parsed.missionsCount).toBe(0);
    expect(parsed.nextMissionReleaseAt).toBeNull();
    expect(parsed.isBlockedFiscal).toBe(false);
  });

  it('requires the maxima: the server always sends them, so a response without them is wrong', () => {
    const { missionsMax: _missionsMax, ...withoutMax } = valid;
    expect(() => adminParticularQuotaSchema.parse(withoutMax)).toThrow();
  });

  it('rejects negative numbers or malformed types', () => {
    expect(() => adminParticularQuotaSchema.parse({ ...valid, missionsCount: -1 })).toThrow();
    expect(() => adminParticularQuotaSchema.parse({ ...valid, amountCollectedCents: -500 })).toThrow();
  });
});
