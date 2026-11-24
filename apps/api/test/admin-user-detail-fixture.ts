import { vi } from 'vitest';
import { AdminUsersService, type DetailUser } from '../src/admin/admin-users.service.js';

/** What `AdminUsersService.detail` reads of the account, typed from its select. */
export type DetailUserFixture = DetailUser;

export function detailUser(over: Partial<DetailUserFixture> = {}): DetailUserFixture {
  return {
    id: 'usr-1',
    name: 'Camille Martin',
    firstName: 'Camille',
    lastName: 'Martin',
    username: 'camillemartin',
    email: 'camille@example.com',
    emailVerified: true,
    phone: null,
    phoneVerifiedAt: null,
    role: 'user',
    createdAt: new Date('2026-09-02T10:00:00Z'),
    banned: false,
    banReason: null,
    banExpires: null,
    birthDate: new Date('1995-03-14T12:00:00Z'),
    profile: {
      deletedAt: null,
      clientEnabled: false,
      repairerEnabled: true,
      activeMode: 'REPAIRER',
      verificationLevel: 'IDENTITY',
    },
    identityVerification: null,
    repairerProfile: {
      id: 'rp-1',
      kind: 'INDIVIDUAL',
      fiscalCompletedAt: null,
      fiscalReminderCount: 0,
      lastFiscalReminderAt: null,
    },
    fiscalDeclaration: null,
    businessVerification: null,
    connectAccount: null,
    ...over,
  };
}

/** The delegates `detail()` touches, all answering « nothing » until a test says otherwise. */
export function makeDetailPrisma() {
  const prisma = {
    user: { findUnique: vi.fn(), count: vi.fn().mockResolvedValue(1) },
    demande: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    offer: { findMany: vi.fn().mockResolvedValue([]) },
    commande: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { repairCents: null } }),
    },
    review: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _avg: { rating: null }, _count: { id: 0 } }),
    },
    conversationReport: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    adminAuditLog: { findMany: vi.fn().mockResolvedValue([]) },
    // The fiche's KPIs and tab lists (P6): real delegates, because the service no longer skips a
    // model its mock forgot.
    dispute: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    session: { findMany: vi.fn().mockResolvedValue([]) },
    repairerFiscalAuditLog: { findMany: vi.fn().mockResolvedValue([]) },
    // V7 U2: the « Blocage de connexion » block.
    authThrottle: { findMany: vi.fn().mockResolvedValue([]) },
    authLockEvent: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((args: unknown) =>
    Array.isArray(args) ? Promise.all(args) : (args as (tx: typeof prisma) => unknown)(prisma),
  );
  return prisma;
}

/** The service over those delegates, with a reminder collaborator the spec can watch. */
export function makeUsersService(prisma = makeDetailPrisma()) {
  const repairers = { repairerBlock: vi.fn().mockResolvedValue(null) };
  const fiscal = { remindOne: vi.fn() };
  const service = new AdminUsersService(prisma as never, repairers as never, fiscal as never);
  return { service, prisma, repairers, fiscal };
}
