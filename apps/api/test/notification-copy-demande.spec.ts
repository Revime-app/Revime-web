import { describe, expect, it } from 'vitest';
import { NOTIFICATION_GROUP_BY_TYPE, notificationCopy } from '@revime/shared';

const BASE = {
  mode: 'REPAIRER' as const,
  actorName: null,
  amountCents: null,
  messagePreview: null,
  step: null,
};

describe('CF-16/CF-17 notification copy', () => {
  /**
   * 🛑 `notificationCopy` has a `default:` arm, deliberately, so an installed build that meets
   * a newer type renders a safe generic instead of throwing. The cost is that FORGETTING a
   * case does not fail typecheck - it ships « Notification » to a real user. This test is the
   * only gate on that, so it asserts the fallback is NOT what comes back.
   */
  it('gives DEMANDE_UPDATED its own copy, not the generic fallback', () => {
    const copy = notificationCopy({ ...BASE, type: 'DEMANDE_UPDATED', subject: 'Écran fissuré' });
    expect(copy.title).toBe('Demande modifiée');
    expect(copy.title).not.toBe('Notification');
    expect(copy.sub).toContain('Écran fissuré');
  });

  it('gives DEMANDE_WITHDRAWN its own copy, not the generic fallback', () => {
    const copy = notificationCopy({ ...BASE, type: 'DEMANDE_WITHDRAWN', subject: 'Écran fissuré' });
    expect(copy.title).toBe('Demande retirée');
    expect(copy.title).not.toBe('Notification');
    expect(copy.sub).toContain('Écran fissuré');
  });

  /** A null subject must drop its clause rather than leave a dangling « modifié ». */
  it('falls back to a subjectless sentence when there is no title', () => {
    const copy = notificationCopy({ ...BASE, type: 'DEMANDE_UPDATED', subject: null });
    expect(copy.sub).toBe('Le client a modifié une demande que vous avez chiffrée');
  });

  it('maps both new types to the offers preference group', () => {
    expect(NOTIFICATION_GROUP_BY_TYPE.DEMANDE_UPDATED).toBe('offers');
    expect(NOTIFICATION_GROUP_BY_TYPE.DEMANDE_WITHDRAWN).toBe('offers');
  });
});
