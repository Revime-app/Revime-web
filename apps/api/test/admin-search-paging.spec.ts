import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_ATTENTION } from './no-attention.js';
import { BadRequestException } from '@nestjs/common';
import { AdminOverviewService } from '../src/admin/admin-overview.service.js';

/**
 * RU-25 / F8. `category: 'all'` merges four lists and slices one page out of the merge, so a page N
 * needs the newest N * limit rows of EACH list. The first version fetched min(N * limit, 100), which
 * made every page past the 100th row come back empty while `total` still said there were more.
 */
describe('F8 searchDetailed, category "all": deep pages', () => {
  let prisma: Record<'commande' | 'user' | 'demande' | 'dispute', { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }>;
  let service: AdminOverviewService;

  // 130 commandes, newest first, one per minute: the only list with rows, so page 3 of 50 must hold rows 101-130.
  const commandes = Array.from({ length: 130 }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    status: 'PAID',
    totalCents: 1000,
    createdAt: new Date(Date.UTC(2026, 9, 15, 12, 0) - i * 60_000),
    client: { name: 'Alice', email: 'a@a.fr' },
    repairer: { name: 'Bob', email: 'b@b.fr' },
  }));

  beforeEach(() => {
    const empty = () => ({ findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) });
    prisma = { commande: empty(), user: empty(), demande: empty(), dispute: empty() };
    prisma.commande.findMany.mockImplementation(async (args: { take: number }) => commandes.slice(0, args.take));
    prisma.commande.count.mockResolvedValue(commandes.length);
    service = new AdminOverviewService(prisma as never, NO_ATTENTION as never);
  });

  it('page 3 of 50 returns rows 101 to 130, not an empty page', async () => {
    const res = await service.searchDetailed({ q: 'alice', category: 'all', page: 3, limit: 50 });

    expect(res.items).toHaveLength(30);
    expect(res.items[0]!.id).toBe(commandes[100]!.id);
    expect(res.items.at(-1)!.id).toBe(commandes[129]!.id);
    expect(prisma.commande.findMany.mock.calls[0]![0].take).toBe(150);
  });

  it('refuses a window too deep to merge instead of answering a wrong page', async () => {
    await expect(service.searchDetailed({ q: 'alice', category: 'all', page: 100, limit: 50 })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.commande.findMany).not.toHaveBeenCalled();
  });
});
