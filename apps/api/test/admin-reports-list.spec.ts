import { describe, expect, it, vi } from 'vitest';
import { ModerationAdminService } from '../src/admin/moderation-admin.service.js';
import { AppException } from '../src/common/app-exception.js';

function makePrismaMock(options: {
  reportRows?: any[];
  reportTotal?: number;
  openCount?: number;
  resolvedCount?: number;
  userRows?: any[];
  singleReport?: any | null;
  reporterCount?: number;
  reportedCount?: number;
} = {}) {
  const {
    reportRows = [],
    reportTotal = reportRows.length,
    openCount = 5,
    resolvedCount = 10,
    userRows = [],
    singleReport = null,
    reporterCount = 2,
    reportedCount = 3,
  } = options;

  const prisma = {
    conversationReport: {
      findMany: vi.fn().mockResolvedValue(reportRows),
      findUnique: vi.fn().mockResolvedValue(singleReport),
      count: vi.fn().mockImplementation(async (args: any) => {
        if (args?.where?.resolvedAt === null && Object.keys(args.where).length === 1) {
          return openCount;
        }
        if (args?.where?.resolvedAt?.not === null && Object.keys(args.where).length === 1) {
          return resolvedCount;
        }
        if (args?.where?.reporterUserId) {
          return reporterCount;
        }
        if (args?.where?.reportedUserId) {
          return reportedCount;
        }
        return reportTotal;
      }),
      updateMany: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    message: {
      updateMany: vi.fn(),
    },
    review: {
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockImplementation(async (args: any) => {
        const ids = args?.where?.id?.in ?? [];
        return userRows.filter((u: any) => ids.includes(u.id));
      }),
    },
  };

  return prisma;
}

const createService = (prisma: any) => new ModerationAdminService(prisma);

describe('ModerationAdminService.listReports', () => {
  it('filters by status OPEN by default', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({});

    expect(prisma.conversationReport.findMany).toHaveBeenCalledTimes(1);
    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({
      AND: [{ resolvedAt: null }],
    });
  });

  it('filters by status RESOLVED', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({ status: 'RESOLVED' });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({
      AND: [{ resolvedAt: { not: null } }],
    });
  });

  it('filters by status ALL (no resolvedAt filter)', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({ status: 'ALL' });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({});
  });

  it('filters by gravity HIGH (SCAM, HARASSMENT)', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({ gravity: 'HIGH' });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({
      AND: [
        { resolvedAt: null },
        { reason: { in: ['SCAM', 'HARASSMENT'] } },
      ],
    });
  });

  it('filters by gravity MEDIUM (OFF_PLATFORM, SPAM)', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({ gravity: 'MEDIUM' });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({
      AND: [
        { resolvedAt: null },
        { reason: { in: ['OFF_PLATFORM', 'SPAM'] } },
      ],
    });
  });

  it('filters by gravity LOW (OTHER)', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({ gravity: 'LOW' });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({
      AND: [
        { resolvedAt: null },
        { reason: { in: ['OTHER'] } },
      ],
    });
  });

  it('filters by assignment MINE with actorUserId', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({ assignment: 'MINE', actorUserId: 'admin-42' });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({
      AND: [
        { resolvedAt: null },
        { assignedToUserId: 'admin-42' },
      ],
    });
  });

  it('filters by assignment MINE without actorUserId using fallback', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({ assignment: 'MINE' });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({
      AND: [
        { resolvedAt: null },
        { assignedToUserId: '__none__' },
      ],
    });
  });

  it('filters by assignment UNASSIGNED', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({ assignment: 'UNASSIGNED' });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({
      AND: [
        { resolvedAt: null },
        { assignedToUserId: null },
      ],
    });
  });

  it('searches q across reporter, reported, and demande title', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({ q: '  Jean Dupont  ' });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({
      AND: [
        { resolvedAt: null },
        {
          OR: [
            { reporter: { name: { contains: 'Jean Dupont', mode: 'insensitive' } } },
            { reporter: { email: { contains: 'Jean Dupont', mode: 'insensitive' } } },
            { reported: { name: { contains: 'Jean Dupont', mode: 'insensitive' } } },
            { reported: { email: { contains: 'Jean Dupont', mode: 'insensitive' } } },
            { conversation: { demande: { is: { title: { contains: 'Jean Dupont', mode: 'insensitive' } } } } },
          ],
        },
      ],
    });
  });

  it('ignores empty search query q', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({ q: '   ' });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({
      AND: [{ resolvedAt: null }],
    });
  });

  it('computes global open, resolved, and total counts', async () => {
    const prisma = makePrismaMock({ openCount: 12, resolvedCount: 38, reportTotal: 5 });
    const service = createService(prisma);

    const res = await service.listReports({});

    expect(res.counts).toEqual({
      open: 12,
      resolved: 38,
      total: 50,
    });
    expect(res.total).toBe(5);
  });

  it('handles pagination clamping and page calculation', async () => {
    const prisma = makePrismaMock({ reportTotal: 45 });
    const service = createService(prisma);

    const res = await service.listReports({ page: 2, pageSize: 20 });

    const callArg = prisma.conversationReport.findMany.mock.calls[0]![0];
    expect(callArg.skip).toBe(20);
    expect(callArg.take).toBe(20);
    expect(res.page).toBe(2);
    expect(res.pageSize).toBe(20);
    expect(res.total).toBe(45);
    expect(res.totalPages).toBe(3);

    // Negative page and excessive pageSize clamping
    await service.listReports({ page: -3, pageSize: 500 });
    const clampedArg = prisma.conversationReport.findMany.mock.calls[1]![0];
    expect(clampedArg.skip).toBe(0);
    expect(clampedArg.take).toBe(100);
  });

  it('orders by created_asc by default and supports created_desc', async () => {
    const prisma = makePrismaMock();
    const service = createService(prisma);

    await service.listReports({});
    expect(prisma.conversationReport.findMany.mock.calls[0]![0].orderBy).toEqual({ createdAt: 'asc' });

    await service.listReports({ sortBy: 'created_desc' });
    expect(prisma.conversationReport.findMany.mock.calls[1]![0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('sorts by gravity_desc prioritizing HIGH > MEDIUM > LOW then createdAt asc', async () => {
    const rowLow = {
      id: 'r-low',
      conversationId: 'c-1',
      reason: 'OTHER',
      createdAt: new Date('2026-09-01T10:00:00Z'),
      resolvedAt: null,
      resolutionVerdict: null,
      assignedToUserId: null,
      reporter: { id: 'u-1', name: 'Alice', email: 'alice@test.fr' },
      reported: { id: 'u-2', name: 'Bob', email: 'bob@test.fr' },
      conversation: { deletedAt: null, demande: null },
    };
    const rowHighOld = {
      id: 'r-high-old',
      conversationId: 'c-2',
      reason: 'SCAM',
      createdAt: new Date('2026-09-01T09:00:00Z'),
      resolvedAt: null,
      resolutionVerdict: null,
      assignedToUserId: null,
      reporter: { id: 'u-1', name: 'Alice', email: 'alice@test.fr' },
      reported: { id: 'u-3', name: 'Charlie', email: 'charlie@test.fr' },
      conversation: { deletedAt: null, demande: null },
    };
    const rowHighNew = {
      id: 'r-high-new',
      conversationId: 'c-3',
      reason: 'HARASSMENT',
      createdAt: new Date('2026-09-01T11:00:00Z'),
      resolvedAt: null,
      resolutionVerdict: null,
      assignedToUserId: null,
      reporter: { id: 'u-1', name: 'Alice', email: 'alice@test.fr' },
      reported: { id: 'u-4', name: 'David', email: 'david@test.fr' },
      conversation: { deletedAt: null, demande: null },
    };
    const rowMed = {
      id: 'r-med',
      conversationId: 'c-4',
      reason: 'SPAM',
      createdAt: new Date('2026-09-01T08:00:00Z'),
      resolvedAt: null,
      resolutionVerdict: null,
      assignedToUserId: null,
      reporter: { id: 'u-1', name: 'Alice', email: 'alice@test.fr' },
      reported: { id: 'u-5', name: 'Eve', email: 'eve@test.fr' },
      conversation: { deletedAt: null, demande: null },
    };

    // Passed in arbitrary order from DB
    const prisma = makePrismaMock({ reportRows: [rowLow, rowHighNew, rowMed, rowHighOld] });
    const service = createService(prisma);

    const res = await service.listReports({ sortBy: 'gravity_desc' });

    expect(res.items.map((i) => i.id)).toEqual([
      'r-high-old', // HIGH and older
      'r-high-new', // HIGH and newer
      'r-med',      // MEDIUM
      'r-low',      // LOW
    ]);
  });

  it('maps DTO fields with gravity label, reason label, and looks up operator attribution', async () => {
    const reportRow = {
      id: 'rep-1',
      conversationId: 'conv-1',
      reason: 'SCAM',
      createdAt: new Date('2026-09-15T12:00:00Z'),
      resolvedAt: new Date('2026-09-16T15:00:00Z'),
      resolutionVerdict: 'SANCTION_APPLIED',
      assignedToUserId: 'op-1',
      reporter: { id: 'user-client', name: 'Claire', email: 'claire@test.fr' },
      reported: { id: 'user-repairer', name: 'Reparateur Pro', email: 'pro@test.fr' },
      conversation: {
        deletedAt: new Date('2026-09-16T15:00:00Z'),
        demande: { id: 'dem-1', title: 'Réparation MacBook Pro' },
      },
    };

    const userRows = [
      { id: 'op-1', name: 'Moderator Dave', email: 'dave@revime.fr' },
    ];

    const prisma = makePrismaMock({ reportRows: [reportRow], userRows });
    const service = createService(prisma);

    const res = await service.listReports({});
    expect(res.items).toHaveLength(1);
    const item = res.items[0]!;

    expect(item.id).toBe('rep-1');
    expect(item.conversationId).toBe('conv-1');
    expect(item.reason).toBe('SCAM');
    expect(item.gravity).toBe('HIGH');
    expect(item.gravityLabel).toBe('Élevée');
    expect(item.reasonLabel).toBe("Tentative d'arnaque");
    expect(item.createdAt).toBe('2026-09-15T12:00:00.000Z');
    expect(item.resolvedAt).toBe('2026-09-16T15:00:00.000Z');
    expect(item.resolutionVerdict).toBe('SANCTION_APPLIED');
    expect(item.reporter).toEqual({ id: 'user-client', name: 'Claire', email: 'claire@test.fr' });
    expect(item.reported).toEqual({ id: 'user-repairer', name: 'Reparateur Pro', email: 'pro@test.fr' });
    expect(item.demande).toEqual({ id: 'dem-1', title: 'Réparation MacBook Pro' });
    expect(item.assignedTo).toEqual({ id: 'op-1', name: 'Moderator Dave', email: 'dave@revime.fr' });
    expect(item.conversationClosed).toBe(true);
  });
});

describe('ModerationAdminService.getReportDetail', () => {
  it('throws AppException 404 when report ID is not found', async () => {
    const prisma = makePrismaMock({ singleReport: null });
    const service = createService(prisma);

    await expect(service.getReportDetail('missing-id')).rejects.toThrow(AppException);
    await expect(service.getReportDetail('missing-id')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Signalement introuvable.',
    });
  });

  it('returns complete dossier with user statistics, messages, and labels', async () => {
    const singleReport = {
      id: 'rep-100',
      conversationId: 'conv-100',
      reporterUserId: 'u-reporter',
      reportedUserId: 'u-reported',
      reason: 'HARASSMENT',
      createdAt: new Date('2026-09-10T08:00:00Z'),
      resolvedAt: new Date('2026-09-10T18:00:00Z'),
      assignedToUserId: 'op-assignee',
      assignedAt: new Date('2026-09-10T10:00:00Z'),
      resolvedByUserId: 'op-resolver',
      resolutionVerdict: 'RESOLVED_WARNED',
      resolutionNote: 'Avertissement formel notifié par email.',
      reporter: {
        id: 'u-reporter',
        name: 'Sophie Client',
        email: 'sophie@client.fr',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      reported: {
        id: 'u-reported',
        name: 'Alexandre Bricole',
        email: 'alex@repairer.fr',
        createdAt: new Date('2025-06-01T00:00:00Z'),
        role: 'repairer',
        banned: true,
        profile: {
          repairerSuspendedAt: new Date('2026-09-10T17:50:00Z'),
        },
      },
      conversation: {
        id: 'conv-100',
        deletedAt: null,
        demande: {
          id: 'dem-99',
          title: 'Changement batterie iPhone',
        },
        messages: [
          {
            id: 'msg-1',
            body: 'Bonjour, avez-vous la pièce ?',
            createdAt: new Date('2026-09-10T08:05:00Z'),
            deletedAt: null,
            senderUserId: 'u-reporter',
            sender: { name: 'Sophie Client' },
          },
          {
            id: 'msg-2',
            body: 'Message déplacé supprimé',
            createdAt: new Date('2026-09-10T08:10:00Z'),
            deletedAt: new Date('2026-09-10T09:00:00Z'),
            senderUserId: 'u-reported',
            sender: { name: 'Alexandre Bricole' },
          },
          {
            id: 'msg-3',
            body: 'Notification système',
            createdAt: new Date('2026-09-10T08:15:00Z'),
            deletedAt: null,
            senderUserId: null,
            sender: null,
          },
        ],
      },
    };

    const userRows = [
      { id: 'op-assignee', name: 'Agent Paul', email: 'paul@revime.fr' },
      { id: 'op-resolver', name: 'Agent Sarah', email: 'sarah@revime.fr' },
    ];

    const prisma = makePrismaMock({
      singleReport,
      userRows,
      reporterCount: 4,
      reportedCount: 7,
    });
    const service = createService(prisma);

    const detail = await service.getReportDetail('rep-100');

    expect(detail.id).toBe('rep-100');
    expect(detail.conversationId).toBe('conv-100');
    expect(detail.reason).toBe('HARASSMENT');
    expect(detail.reasonLabel).toBe('Propos agressifs ou harcèlement');
    expect(detail.gravity).toBe('HIGH');
    expect(detail.gravityLabel).toBe('Élevée');
    expect(detail.createdAt).toBe('2026-09-10T08:00:00.000Z');
    expect(detail.resolvedAt).toBe('2026-09-10T18:00:00.000Z');
    expect(detail.resolutionVerdict).toBe('RESOLVED_WARNED');
    expect(detail.resolutionVerdictLabel).toBe('Avertissement envoyé');
    expect(detail.resolutionNote).toBe('Avertissement formel notifié par email.');

    // Operators
    expect(detail.assignedTo).toEqual({
      id: 'op-assignee',
      name: 'Agent Paul',
      email: 'paul@revime.fr',
      assignedAt: '2026-09-10T10:00:00.000Z',
    });
    expect(detail.resolvedBy).toEqual({
      id: 'op-resolver',
      name: 'Agent Sarah',
      email: 'sarah@revime.fr',
    });

    // Reporter stats
    expect(detail.reporter).toEqual({
      id: 'u-reporter',
      name: 'Sophie Client',
      email: 'sophie@client.fr',
      createdAt: '2026-01-01T00:00:00.000Z',
      reportsCount: 4,
    });

    // Reported stats & flags
    expect(detail.reported).toEqual({
      id: 'u-reported',
      name: 'Alexandre Bricole',
      email: 'alex@repairer.fr',
      createdAt: '2025-06-01T00:00:00.000Z',
      role: 'repairer',
      banned: true,
      repairerSuspended: true,
      reportsReceivedCount: 7,
    });

    // Conversation & messages
    expect(detail.conversation.id).toBe('conv-100');
    expect(detail.conversation.closed).toBe(false);
    expect(detail.conversation.demande).toEqual({
      id: 'dem-99',
      title: 'Changement batterie iPhone',
    });
    expect(detail.conversation.messages).toHaveLength(3);
    expect(detail.conversation.messages[0]).toEqual({
      id: 'msg-1',
      body: 'Bonjour, avez-vous la pièce ?',
      createdAt: '2026-09-10T08:05:00.000Z',
      deleted: false,
      senderId: 'u-reporter',
      senderName: 'Sophie Client',
    });
    expect(detail.conversation.messages[1]).toEqual({
      id: 'msg-2',
      body: 'Message déplacé supprimé',
      createdAt: '2026-09-10T08:10:00.000Z',
      deleted: true,
      senderId: 'u-reported',
      senderName: 'Alexandre Bricole',
    });
    expect(detail.conversation.messages[2]).toEqual({
      id: 'msg-3',
      body: 'Notification système',
      createdAt: '2026-09-10T08:15:00.000Z',
      deleted: false,
      senderId: null,
      senderName: 'Revime (message automatique)',
    });
  });
});
