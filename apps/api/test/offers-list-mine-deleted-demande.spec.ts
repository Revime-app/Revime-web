import { describe, expect, it, vi } from 'vitest';
import { OffersService } from '../src/offers/offers.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

const ME = '11111111-1111-4111-8111-111111111111';

function harness() {
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = { offer: { findMany } } as unknown as PrismaService;
  const notifications = { emit: vi.fn() } as unknown as NotificationsService;
  return { service: new OffersService(prisma, notifications), findMany };
}

describe('OffersService.listMine, demande soft-delete', () => {
  /**
   * `listReceived` states the rule in a comment: a removal on EITHER side must take the row
   * out, or the list offers a route to a demande that cannot be opened. `listMine` did not
   * filter it. Once CF-17 writes `Demande.deletedAt`, a réparateur would be left with a row
   * he can neither open (getForViewer filters deletedAt) nor withdraw (withdraw filters
   * `demande: { deletedAt: null }`) - permanently, with nothing on screen explaining it.
   *
   * Asserted on the WHERE rather than on rows, because the Prisma here is a stub: it returns
   * whatever the test declares, so it cannot demonstrate filtering. The query is the behaviour.
   */
  it('filters out offers whose demande is soft-deleted', async () => {
    const { service, findMany } = harness();

    await service.listMine(ME);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]?.where).toEqual({
      repairerUserId: ME,
      deletedAt: null,
      demande: { deletedAt: null, hiddenAt: null },
    });
  });
});
