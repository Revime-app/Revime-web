import { describe, expect, it } from 'vitest';
import {
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  createBlockSchema,
  reportConversationSchema,
} from '@revime/shared';

describe('moderation schemas', () => {
  it('accepts every reason in the published list', () => {
    for (const reason of REPORT_REASONS) {
      expect(reportConversationSchema.safeParse({ reason }).success).toBe(true);
    }
  });

  it('refuses an unlisted reason with the authored French', () => {
    const parsed = reportConversationSchema.safeParse({ reason: 'WHATEVER' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Motif invalide.');
  });

  it('refuses a missing reason rather than defaulting one', () => {
    expect(reportConversationSchema.safeParse({}).success).toBe(false);
  });

  /**
   * The label map is what both the mobile sheet and the admin queue read. A reason
   * with no label would render as a raw enum to an operator, which is the exact
   * defect ATTENTION_REASON_LABEL was moved to fix.
   */
  it('labels every reason, with no extra keys', () => {
    expect(Object.keys(REPORT_REASON_LABEL).sort()).toEqual([...REPORT_REASONS].sort());
    for (const label of Object.values(REPORT_REASON_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('strips unknown keys from a block body, so a hostile blockerUserId never arrives', () => {
    const parsed = createBlockSchema.parse({ userId: 'u1', blockerUserId: 'someone-else' });
    expect(parsed).toEqual({ userId: 'u1' });
  });

  it('refuses an empty target', () => {
    const parsed = createBlockSchema.safeParse({ userId: '' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Utilisateur invalide.');
  });
});
