import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from '../src/admin/admin-users.service.js';

const USER = {
  id: 'u1',
  name: 'Camille Dupont',
  firstName: 'Camille',
  lastName: 'Dupont',
  username: 'camille',
  email: 'camille@example.fr',
  emailVerified: true,
  phone: '+33600000000',
  phoneVerifiedAt: new Date('2026-08-02T00:00:00.000Z'),
  role: 'user',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  banned: false,
  banReason: null,
  banExpires: null,
  profile: {
    deletedAt: null,
    clientEnabled: true,
    repairerEnabled: true,
    activeMode: 'REPAIRER',
    verificationLevel: 'IDENTITY',
  },
};

/**
 * Each counted model returns a value in its OWN numeric range, so swapping two entries
 * in the $transaction array yields a number in the wrong range and fails an assertion.
 * Same technique, and the same reason, as admin-overview.spec.ts.
 */
const makePrisma = (over: Record<string, unknown> = {}) => ({
  $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
  user: { findUnique: vi.fn().mockResolvedValue(USER) },
  demande: {
    count: vi.fn().mockResolvedValue(11),
    findMany: vi.fn().mockResolvedValue([
      { id: 'd1', title: 'Écran cassé', createdAt: new Date('2026-08-10T00:00:00.000Z') },
    ]),
  },
  commande: {
    aggregate: vi.fn().mockResolvedValue({ _sum: { totalCents: null, repairCents: null } }),
    count: vi.fn().mockResolvedValueOnce(21).mockResolvedValueOnce(22),
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'c1',
        demande: { title: 'Batterie défectueuse' },
        createdAt: new Date('2026-08-12T00:00:00.000Z'),
      },
    ]),
  },
  review: {
    aggregate: vi.fn().mockResolvedValue({ _avg: { rating: null }, _count: { id: 31 } }),
    count: vi.fn().mockResolvedValueOnce(31).mockResolvedValueOnce(32),
    findMany: vi.fn().mockResolvedValue([
      { id: 'r1', rating: 5, createdAt: new Date('2026-08-13T00:00:00.000Z') },
    ]),
  },
  conversationReport: {
    count: vi.fn().mockResolvedValueOnce(41).mockResolvedValueOnce(42),
    findMany: vi.fn().mockResolvedValue([
      { id: 's1', reason: 'SPAM', createdAt: new Date('2026-08-14T00:00:00.000Z') },
    ]),
  },
  dispute: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
  session: { findMany: vi.fn().mockResolvedValue([]) },
  // V7 U2: the « Blocage de connexion » block.
  authThrottle: { findMany: vi.fn().mockResolvedValue([]) },
  authLockEvent: { findMany: vi.fn().mockResolvedValue([]) },
  offer: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'o1',
        demande: { title: 'Appareil photo cassé' },
        createdAt: new Date('2026-08-11T00:00:00.000Z'),
      },
    ]),
  },
  adminAuditLog: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 'a1',
        action: 'user.suspend',
        statusCode: 200,
        actorEmail: 'ops@revime.fr',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]),
  },
  ...over,
});

describe('AdminUsersService.detail', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminUsersService;
  let repairers: { repairerBlock: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = makePrisma();
    // Mock AdminRepairersService with repairerBlock returning null by default
    repairers = { repairerBlock: vi.fn().mockResolvedValue(null) };
    service = new AdminUsersService(prisma as never, repairers as never, {} as never);
  });

  it('carries staffRole: null for a non-staff role, the role for staff (CF4-40)', async () => {
    expect((await service.detail('u1')).staffRole).toBeNull();
    prisma.user.findUnique.mockResolvedValueOnce({ ...USER, role: 'finance' });
    prisma.commande.count.mockResolvedValueOnce(21).mockResolvedValueOnce(22);
    prisma.review.count.mockResolvedValueOnce(31).mockResolvedValueOnce(32);
    prisma.conversationReport.count.mockResolvedValueOnce(41).mockResolvedValueOnce(42);
    expect((await service.detail('u1')).staffRole).toBe('finance');
  });

  it('returns all four identity fields and both contact verification flags', async () => {
    const d = await service.detail('u1');
    expect(d.identity).toEqual({
      name: 'Camille Dupont',
      firstName: 'Camille',
      lastName: 'Dupont',
      username: 'camille',
    });
    expect(d.contact.emailVerified).toBe(true);
    expect(d.contact.phoneVerified).toBe(true);
  });

  it('reports both modes and the active one, because one account has two', async () => {
    const d = await service.detail('u1');
    expect(d.account).toEqual({
      clientEnabled: true,
      repairerEnabled: true,
      activeMode: 'REPAIRER',
      role: 'user',
    });
  });

  // 🛑 The judged definition. Réparations = PAID and step RELEASED - the TERMINAL step,
  // so it counts finished work rather than money taken. `status: PAID` alone would count
  // a repair still in escrow. Design §5.
  it('counts réparations as PAID and step RELEASED, on both sides separately', async () => {
    await service.detail('u1');
    const wheres = prisma.commande.count.mock.calls.map((c) => JSON.stringify(c[0].where));
    expect(wheres).toHaveLength(2);
    for (const w of wheres) {
      expect(w).toContain('PAID');
      expect(w).toContain('RELEASED');
    }
    expect(wheres.some((w) => w.includes('repairerUserId'))).toBe(true);
    expect(wheres.some((w) => w.includes('clientUserId'))).toBe(true);
  });

  it('returns the three two-sided counts as separate figures in their own ranges', async () => {
    const d = await service.detail('u1');
    expect(d.counts.repairsPerformed).toBe(21);
    expect(d.counts.repairsReceived).toBe(22);
    expect(d.counts.reviewsReceived).toBe(31);
    expect(d.counts.reviewsWritten).toBe(32);
    expect(d.counts.reportsAgainst).toBe(41);
    expect(d.counts.reportsMade).toBe(42);
    expect(d.counts.demandes).toBe(11);
  });

  it('filters soft deletes on every model that has the column', async () => {
    await service.detail('u1');
    expect(JSON.stringify(prisma.demande.count.mock.calls[0]?.[0]?.where)).toContain('"deletedAt":null');
    for (const c of prisma.review.count.mock.calls) {
      expect(JSON.stringify(c[0]?.where)).toContain('"deletedAt":null');
    }
  });

  it('reads the admin history off targetType and targetId, not off the actor', async () => {
    await service.detail('u1');
    const w = JSON.stringify(prisma.adminAuditLog.findMany.mock.calls[0]?.[0]?.where);
    expect(w).toContain('User');
    expect(w).toContain('u1');
  });

  it('merges all six activity kinds into one timeline, newest first', async () => {
    const d = await service.detail('u1');
    expect(d.history.length).toBeGreaterThanOrEqual(6);
    expect(d.history.some((h) => h.kind === 'admin')).toBe(true);
    expect(d.history.some((h) => h.kind === 'demande')).toBe(true);
    expect(d.history.some((h) => h.kind === 'offre')).toBe(true);
    expect(d.history.some((h) => h.kind === 'commande')).toBe(true);
    expect(d.history.some((h) => h.kind === 'avis')).toBe(true);
    expect(d.history.some((h) => h.kind === 'signalement')).toBe(true);
    const times = d.history.map((h) => Date.parse(h.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // Guard against positional swap in $transaction
    expect(d.history.some((h) => h.kind === 'commande' && h.label.includes('Batterie défectueuse'))).toBe(true);
    expect(d.history.some((h) => h.kind === 'offre' && h.label.includes('Appareil photo cassé'))).toBe(true);
  });

  it('throws NOT_FOUND for an unknown id rather than returning an empty fiche', async () => {
    prisma.user.findUnique = vi.fn().mockResolvedValue(null);
    await expect(service.detail('nope')).rejects.toThrow();
  });
});

/** CF4-39 (sub-project M, spec §4.6): the fiche shows the current identity decision. */
describe('AdminUsersService.detail identityDecision', () => {
  const svc = (identityVerification: unknown) => {
    const prisma = makePrisma({
      user: { findUnique: vi.fn().mockResolvedValue({ ...USER, identityVerification }) },
    });
    return {
      prisma,
      service: new AdminUsersService(prisma as never, { repairerBlock: vi.fn().mockResolvedValue(null) } as never, {} as never),
    };
  };

  it('returns the decision of the identity row', async () => {
    const { service, prisma } = svc({
      decision: 'REFUSED',
      decisionMotif: 'EXPIRED',
      decisionNote: null,
      decidedAt: new Date('2026-09-30T08:00:00.000Z'),
    });
    const d = await service.detail('u1');
    expect(d.identityDecision).toEqual({
      decision: 'REFUSED',
      motif: 'EXPIRED',
      note: null,
      decidedAt: '2026-09-30T08:00:00.000Z',
    });
    expect(prisma.user.findUnique.mock.calls[0]![0].select.identityVerification).toEqual({
      select: { decision: true, decisionMotif: true, decisionNote: true, decidedAt: true },
    });
  });

  it('is null when undecided', async () => {
    const { service } = svc({ decision: null, decisionMotif: null, decisionNote: null, decidedAt: null });
    expect((await service.detail('u1')).identityDecision).toBeNull();
  });

  it('is null without an identity row', async () => {
    const { service } = svc(null);
    expect((await service.detail('u1')).identityDecision).toBeNull();
  });
});
