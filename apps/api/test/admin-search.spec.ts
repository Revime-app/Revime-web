import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_ATTENTION } from './no-attention.js';
import {
  adminSearchResultSchema,
  adminSearchDetailedResponseSchema,
  adminSearchQuerySchema,
} from '@revime/shared';
import { AdminOverviewService } from '../src/admin/admin-overview.service.js';
import { AdminController } from '../src/admin/admin.controller.js';

describe('UI4 & F8: Admin Global Search API', () => {
  let prismaMock: {
    commande: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
    user: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
    demande: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
    dispute: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  };
  let overviewService: AdminOverviewService;

  beforeEach(() => {
    prismaMock = {
      commande: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'a9db011e-1234-5678-90ab-cdef12345678',
            status: 'PAID',
            totalCents: 12500,
            createdAt: new Date('2026-10-15T12:00:00Z'),
            client: { name: 'Alice Martin', email: 'alice@example.com' },
            repairer: { name: 'Bob Réparateur', email: 'bob@example.com' },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'user-1',
            name: 'Alice Martin',
            email: 'alice@example.com',
            role: null,
            phone: '+33612345678',
            createdAt: new Date('2026-10-14T10:00:00Z'),
            repairerProfile: null,
          },
          {
            id: 'user-2',
            name: 'Bob Réparateur',
            email: 'bob@example.com',
            role: null,
            phone: null,
            createdAt: new Date('2026-10-13T10:00:00Z'),
            repairerProfile: { id: 'rep-profile-1' },
          },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
      demande: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'demande-1',
            title: 'Écran cassé iPhone 13',
            description: 'Vitre tactile fissurée suite à une chute',
            brand: 'Apple',
            model: 'iPhone 13',
            status: 'OPEN',
            locationLabel: 'Paris 11e',
            createdAt: new Date('2026-10-15T14:00:00Z'),
            category: { id: 'cat-1', labelFr: 'Smartphone' },
            author: { name: 'Alice Martin', email: 'alice@example.com' },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      dispute: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'disp-1',
            number: 14,
            commandeId: 'a9db011e-1234-5678-90ab-cdef12345678',
            status: 'OPEN',
            reason: 'Écran non fonctionnel après réparation',
            createdAt: new Date('2026-10-15T16:00:00Z'),
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    overviewService = new AdminOverviewService(prismaMock as never, NO_ATTENTION as never);
  });

  describe('AdminOverviewService.search', () => {
    it('never prints a deleted account tombstone e-mail (UI7: « Utilisateur supprimé » alone)', async () => {
      const tombstone = { name: 'Utilisateur supprimé', email: 'deleted+abc123@revime.invalid' };
      prismaMock.user.findMany.mockResolvedValueOnce([
        {
          id: 'user-gone',
          ...tombstone,
          role: null,
          phone: null,
          createdAt: new Date('2026-10-14T10:00:00Z'),
          repairerProfile: null,
        },
      ]);
      prismaMock.commande.findMany.mockResolvedValueOnce([
        {
          id: 'a9db011e-1234-5678-90ab-cdef12345678',
          status: 'PAID',
          totalCents: 100,
          createdAt: new Date('2026-10-15T12:00:00Z'),
          client: tombstone,
          repairer: { name: null, email: 'deleted+r@revime.invalid' },
        },
      ]);
      prismaMock.demande.findMany.mockResolvedValueOnce([
        {
          id: 'demande-gone',
          title: 'Ecran',
          description: null,
          brand: null,
          model: null,
          status: 'OPEN',
          locationLabel: null,
          createdAt: new Date('2026-10-15T14:00:00Z'),
          category: null,
          author: { name: null, email: 'deleted+d@revime.invalid' },
        },
      ]);

      const res = await overviewService.search('gone');
      expect(JSON.stringify(res)).not.toContain('revime.invalid');
      expect(res.users[0]).toMatchObject({ title: 'Utilisateur supprimé' });
      expect(res.users[0]?.subtitle).toBeUndefined();
      expect(res.commandes[0]?.subtitle).toBe(
        'Client : Utilisateur supprimé · Réparateur : Utilisateur supprimé',
      );
      expect(res.demandes[0]?.subtitle).toContain('Client : Utilisateur supprimé');
    });

    it('does not leak the tombstone through the detailed search either', async () => {
      prismaMock.user.findMany.mockResolvedValueOnce([
        {
          id: 'user-gone',
          name: 'Utilisateur supprimé',
          email: 'deleted+abc123@revime.invalid',
          role: null,
          phone: null,
          createdAt: new Date('2026-10-14T10:00:00Z'),
          repairerProfile: null,
        },
      ]);
      prismaMock.commande.findMany.mockResolvedValueOnce([
        {
          id: 'a9db011e-1234-5678-90ab-cdef12345678',
          status: 'PAID',
          totalCents: 100,
          createdAt: new Date('2026-10-15T12:00:00Z'),
          client: { name: null, email: 'deleted+c@revime.invalid' },
          repairer: { name: 'Utilisateur supprimé', email: 'deleted+r@revime.invalid' },
        },
      ]);
      prismaMock.demande.findMany.mockResolvedValueOnce([
        {
          id: 'demande-gone',
          title: 'Ecran',
          description: null,
          brand: null,
          model: null,
          status: 'OPEN',
          locationLabel: null,
          createdAt: new Date('2026-10-15T14:00:00Z'),
          category: null,
          author: { name: null, email: 'deleted+d@revime.invalid' },
        },
      ]);
      const res = await overviewService.searchDetailed({
        q: 'gone',
        category: 'all',
        page: 1,
        limit: 20,
      });
      expect(JSON.stringify(res)).not.toContain('revime.invalid');
      expect(res.items.find((i) => i.category === 'user')?.metadata).toMatchObject({ email: null });
      expect(res.items.find((i) => i.category === 'commande')?.metadata).toMatchObject({
        clientName: 'Utilisateur supprimé',
        clientEmail: null,
        repairerName: 'Utilisateur supprimé',
        repairerEmail: null,
      });
      expect(res.items.find((i) => i.category === 'demande')?.metadata).toMatchObject({
        clientName: 'Utilisateur supprimé',
        clientEmail: null,
      });
    });

    it('returns empty 4-category results for empty or whitespace query without hitting database', async () => {
      const res1 = await overviewService.search('');
      const res2 = await overviewService.search('   ');
      const res3 = await overviewService.search(undefined);

      expect(res1).toEqual({ commandes: [], users: [], demandes: [], disputes: [] });
      expect(res2).toEqual({ commandes: [], users: [], demandes: [], disputes: [] });
      expect(res3).toEqual({ commandes: [], users: [], demandes: [], disputes: [] });
      expect(prismaMock.commande.findMany).not.toHaveBeenCalled();
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      expect(prismaMock.demande.findMany).not.toHaveBeenCalled();
      expect(prismaMock.dispute.findMany).not.toHaveBeenCalled();
    });

    it('queries commandes, users, demandes, and disputes in parallel with take: 5 and formats response according to schema', async () => {
      const res = await overviewService.search('Alice');

      expect(prismaMock.commande.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.demande.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.dispute.findMany).toHaveBeenCalledTimes(1);

      // Verify take: 5 on all queries
      expect(prismaMock.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
      expect(prismaMock.demande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );
      expect(prismaMock.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 }),
      );

      // Validate schema compliance
      const parsed = adminSearchResultSchema.safeParse(res);
      expect(parsed.success).toBe(true);

      // Check commande mapping (must link to /commandes/:id, NOT /demandes/:id)
      expect(res.commandes).toHaveLength(1);
      expect(res.commandes[0]).toEqual({
        id: 'a9db011e-1234-5678-90ab-cdef12345678',
        title: 'Commande #CMD-A9DB011E',
        subtitle: 'Client : Alice Martin · Réparateur : Bob Réparateur',
        badge: 'PAID',
        href: '/commandes/a9db011e-1234-5678-90ab-cdef12345678',
      });

      // Check demande mapping
      expect(res.demandes).toHaveLength(1);
      expect(res.demandes[0]).toEqual({
        id: 'demande-1',
        title: 'Écran cassé iPhone 13',
        subtitle: 'Smartphone · Apple iPhone 13 · Client : Alice Martin',
        badge: 'OPEN',
        href: '/demandes/demande-1',
      });

      // Check user mapping
      expect(res.users).toHaveLength(2);
      expect(res.users[0]).toEqual({
        id: 'user-1',
        title: 'Alice Martin',
        subtitle: 'alice@example.com',
        badge: 'Client',
        href: '/utilisateurs/user-1',
      });
      expect(res.users[1]).toEqual({
        id: 'user-2',
        title: 'Bob Réparateur',
        subtitle: 'bob@example.com',
        badge: 'Réparateur',
        href: '/utilisateurs/user-2',
      });

      // Check dispute mapping
      expect(res.disputes).toHaveLength(1);
      expect(res.disputes[0]).toEqual({
        id: 'disp-1',
        title: 'Litige #LIT-0014',
        subtitle: 'Commande #CMD-A9DB011E · Écran non fonctionnel après réparation',
        badge: 'OPEN',
        href: '/litiges?disputeId=disp-1',
      });
    });

    it('expands accent variants so searching "ecran" produces accent-tolerant conditions', async () => {
      await overviewService.search('ecran');

      expect(prismaMock.demande.findMany).toHaveBeenCalledTimes(1);
      const callArgs = prismaMock.demande.findMany.mock.calls[0]![0];
      const orClauses = callArgs?.where?.OR || [];

      // Checks that OR conditions include unaccented and accented variants
      const hasUnaccentedTitle = orClauses.some(
        (c: any) => c.title && c.title.contains?.toLowerCase() === 'ecran',
      );
      const hasAccentedTitle = orClauses.some(
        (c: any) => c.title && c.title.contains?.includes('écran'),
      );
      expect(hasUnaccentedTitle).toBe(true);
      expect(hasAccentedTitle).toBe(true);
    });

    it('parses #LIT-0014 into numeric dispute number for dispute lookup', async () => {
      await overviewService.search('#LIT-0014');

      expect(prismaMock.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ number: 14 }]),
          }),
        }),
      );
    });

    it('guards against Postgres 32-bit integer overflow on large numeric searches', async () => {
      await overviewService.search('3000000000');

      const callArgs = prismaMock.dispute.findMany.mock.calls.at(-1)?.[0];
      const orClauses = callArgs?.where?.OR || [];
      const hasNumberClause = orClauses.some((clause: any) => typeof clause.number === 'number');

      expect(hasNumberClause).toBe(false);
    });

    it('caps search term to 100 characters', async () => {
      const veryLongQuery = 'a'.repeat(200);
      await overviewService.search(veryLongQuery);

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ id: { startsWith: 'a'.repeat(100) } }]),
          }),
        }),
      );
    });
  });

  describe('AdminOverviewService.searchDetailed', () => {
    it('returns empty response for empty search query without querying database', async () => {
      const res = await overviewService.searchDetailed({
        q: '',
        category: 'all',
        page: 1,
        limit: 20,
      });

      expect(res).toEqual({
        query: '',
        category: 'all',
        total: 0,
        counts: {
          all: 0,
          commandes: 0,
          users: 0,
          demandes: 0,
          disputes: 0,
        },
        items: [],
        page: 1,
        limit: 20,
      });

      expect(prismaMock.commande.count).not.toHaveBeenCalled();
      expect(prismaMock.user.count).not.toHaveBeenCalled();
      expect(prismaMock.demande.count).not.toHaveBeenCalled();
      expect(prismaMock.dispute.count).not.toHaveBeenCalled();
    });

    it('computes category counts and returns merged paginated items when category is "all"', async () => {
      const res = await overviewService.searchDetailed({
        q: 'Alice',
        category: 'all',
        page: 1,
        limit: 20,
      });

      // Verify count queries executed in parallel
      expect(prismaMock.commande.count).toHaveBeenCalledTimes(1);
      expect(prismaMock.user.count).toHaveBeenCalledTimes(1);
      expect(prismaMock.demande.count).toHaveBeenCalledTimes(1);
      expect(prismaMock.dispute.count).toHaveBeenCalledTimes(1);

      // Check counts structure
      expect(res.counts).toEqual({
        all: 5, // 1 cmd + 2 users + 1 dmd + 1 disp
        commandes: 1,
        users: 2,
        demandes: 1,
        disputes: 1,
      });
      expect(res.total).toBe(5);
      expect(res.query).toBe('Alice');
      expect(res.category).toBe('all');
      expect(res.page).toBe(1);
      expect(res.limit).toBe(20);

      // Verify schema validity
      const parsed = adminSearchDetailedResponseSchema.safeParse(res);
      expect(parsed.success).toBe(true);

      // Verify detailed item fields
      expect(res.items.length).toBeGreaterThan(0);
      const demandeItem = res.items.find((i) => i.category === 'demande');
      expect(demandeItem).toBeDefined();
      expect(demandeItem?.href).toBe('/demandes/demande-1');
      expect(demandeItem?.snippet).toContain('Vitre tactile fissurée');
      expect(demandeItem?.createdAt).toBe('2026-10-15T14:00:00.000Z');
      expect(demandeItem?.metadata).toEqual(
        expect.objectContaining({
          status: 'OPEN',
          brand: 'Apple',
          model: 'iPhone 13',
        }),
      );

      const commandeItem = res.items.find((i) => i.category === 'commande');
      expect(commandeItem).toBeDefined();
      expect(commandeItem?.href).toBe('/commandes/a9db011e-1234-5678-90ab-cdef12345678');
      expect(commandeItem?.metadata).toEqual(
        expect.objectContaining({
          totalCents: 12500,
          status: 'PAID',
        }),
      );
    });

    it('queries only the requested entity when category is targeted (e.g. "demandes")', async () => {
      const res = await overviewService.searchDetailed({
        q: 'iPhone',
        category: 'demandes',
        page: 2,
        limit: 10,
      });

      expect(prismaMock.demande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );

      // Does not run findMany for other categories
      expect(prismaMock.commande.findMany).not.toHaveBeenCalled();
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      expect(prismaMock.dispute.findMany).not.toHaveBeenCalled();

      // But still calculates counts across all categories
      expect(prismaMock.commande.count).toHaveBeenCalledTimes(1);
      expect(prismaMock.demande.count).toHaveBeenCalledTimes(1);

      expect(res.category).toBe('demandes');
      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]!.category).toBe('demande');
    });

    it('queries only "commandes" with pagination when category is "commandes"', async () => {
      const res = await overviewService.searchDetailed({
        q: 'Alice',
        category: 'commandes',
        page: 1,
        limit: 5,
      });

      expect(prismaMock.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 5,
        }),
      );
      expect(prismaMock.demande.findMany).not.toHaveBeenCalled();
      expect(res.category).toBe('commandes');
      expect(res.total).toBe(1);
    });

    it('queries only "users" with pagination when category is "users"', async () => {
      const res = await overviewService.searchDetailed({
        q: 'Alice',
        category: 'users',
        page: 1,
        limit: 5,
      });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 5,
        }),
      );
      expect(res.category).toBe('users');
      expect(res.total).toBe(2);
    });

    it('queries only "disputes" with pagination when category is "disputes"', async () => {
      const res = await overviewService.searchDetailed({
        q: 'Alice',
        category: 'disputes',
        page: 1,
        limit: 5,
      });

      expect(prismaMock.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 5,
        }),
      );
      expect(res.category).toBe('disputes');
      expect(res.total).toBe(1);
    });
  });

  describe('AdminController endpoints', () => {
    let controller: AdminController;

    beforeEach(() => {
      controller = new AdminController(
        {} as never, // prisma
        {} as never, // refunds
        {} as never, // cron
        {} as never, // catalog
        {} as never, // moderationAdmin
        overviewService, // overviewService
        {} as never, // auditService
        {} as never, // users
        {} as never, // usersWrite
        {} as never, // repairers
        {} as never, // repairersWrite
        {} as never, // demandes
        {} as never, // demandesWrite
        {} as never, // offres
        {} as never, // shipments
      );
    });

    it('delegates search to overviewService.search', async () => {
      const searchSpy = vi.spyOn(overviewService, 'search').mockResolvedValue({
        commandes: [],
        users: [],
        demandes: [],
        disputes: [],
      });

      const result = await controller.search('test');
      expect(searchSpy).toHaveBeenCalledWith('test');
      expect(result).toEqual({ commandes: [], users: [], demandes: [], disputes: [] });
    });

    it('delegates searchDetailed to overviewService.searchDetailed with validated query schema', async () => {
      const detailedSpy = vi.spyOn(overviewService, 'searchDetailed').mockResolvedValue({
        query: 'ecran',
        category: 'demandes',
        total: 1,
        counts: {
          all: 1,
          commandes: 0,
          users: 0,
          demandes: 1,
          disputes: 0,
        },
        items: [],
        page: 2,
        limit: 15,
      });

      const result = await controller.searchDetailed({
        q: '  ecran  ',
        category: 'demandes',
        page: '2',
        limit: '15',
      });

      expect(detailedSpy).toHaveBeenCalledWith({
        q: 'ecran',
        category: 'demandes',
        page: 2,
        limit: 15,
      });
      expect(result.category).toBe('demandes');
      expect(result.counts.demandes).toBe(1);
    });
  });
});
