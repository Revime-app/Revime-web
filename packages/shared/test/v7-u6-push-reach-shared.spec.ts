import { describe, expect, it } from 'vitest';
import { adminBroadcastPreviewSchema } from '../src/index.js';

/** V7 D1 (U6): the audience preview says how many are reachable by push, per platform. */
describe('V7 U6 push reach, shared', () => {
  const base = {
    totalRecipients: 3,
    emailEligibleCount: 3,
    pushEligibleCount: 2,
    marketingEmailCount: 0,
    marketingPushCount: 1,
    sampleRecipients: [],
  };

  it('carries the iOS and Android split of push reach', () => {
    const parsed = adminBroadcastPreviewSchema.parse({
      ...base,
      pushIosCount: 2,
      pushAndroidCount: 1,
      marketingPushIosCount: 1,
      marketingPushAndroidCount: 0,
    });
    expect(parsed).toMatchObject({ pushIosCount: 2, pushAndroidCount: 1, marketingPushIosCount: 1, marketingPushAndroidCount: 0 });
  });

  it('reads an API that predates the split as zero, never undefined', () => {
    const parsed = adminBroadcastPreviewSchema.parse(base);
    expect(parsed).toMatchObject({ pushIosCount: 0, pushAndroidCount: 0, marketingPushIosCount: 0, marketingPushAndroidCount: 0 });
  });
});
