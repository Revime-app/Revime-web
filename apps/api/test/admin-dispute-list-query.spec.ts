import { describe, expect, it } from 'vitest';
import { adminDisputeListQuerySchema } from '@revime/shared';

/**
 * The dashboard's « Résolus » tab sends `status=RESOLVED` (all three terminal states), and
 * AdminDisputesService.list already expands it. The query schema used to reject it with a 400,
 * so the tab always showed « Impossible de charger la file des litiges ».
 */
describe('adminDisputeListQuerySchema', () => {
  it('accepts the RESOLVED group used by the « Résolus » tab', () => {
    expect(adminDisputeListQuerySchema.parse({ status: 'RESOLVED' }).status).toBe('RESOLVED');
  });

  it.each(['ALL', 'OPEN', 'IN_REVIEW', 'RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'])(
    'still accepts %s',
    (status) => {
      expect(adminDisputeListQuerySchema.parse({ status }).status).toBe(status);
    },
  );

  it('rejects an unknown status', () => {
    expect(adminDisputeListQuerySchema.safeParse({ status: 'CLOSED' }).success).toBe(false);
  });
});
