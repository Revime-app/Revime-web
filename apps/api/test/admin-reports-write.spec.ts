import { describe, expect, it, vi } from 'vitest';
import { ModerationAdminService } from '../src/admin/moderation-admin.service.js';
import { AdminController } from '../src/admin/admin.controller.js';
import { AppException } from '../src/common/app-exception.js';

function makePrismaMock(options: { updateManyCount?: number } = {}) {
  const { updateManyCount = 1 } = options;

  return {
    conversationReport: {
      updateMany: vi.fn().mockResolvedValue({ count: updateManyCount }),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
    },
    message: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    review: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: 'admin-1', name: 'Admin', profile: { deletedAt: null } }),
    },
  } as any;
}

const createService = (prisma: any) => new ModerationAdminService(prisma);

describe('ModerationAdminService.assignReport', () => {
  it('updates assigned fields with current actor and date', async () => {
    const prisma = makePrismaMock({ updateManyCount: 1 });
    const service = createService(prisma);

    const before = new Date();
    await service.assignReport('rep-1', 'moderator-123');
    const after = new Date();

    expect(prisma.conversationReport.updateMany).toHaveBeenCalledTimes(1);
    const callArg = prisma.conversationReport.updateMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({ id: 'rep-1' });
    expect(callArg.data.assignedToUserId).toBe('moderator-123');
    expect(callArg.data.assignedAt).toBeInstanceOf(Date);
    expect(callArg.data.assignedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(callArg.data.assignedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('throws 404 when report not found', async () => {
    const prisma = makePrismaMock({ updateManyCount: 0 });
    const service = createService(prisma);

    await expect(service.assignReport('missing-id', 'moderator-123')).rejects.toThrow(AppException);
    await expect(service.assignReport('missing-id', 'moderator-123')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Signalement introuvable.',
    });
  });
});

describe('ModerationAdminService.unassignReport', () => {
  it('clears assignment fields', async () => {
    const prisma = makePrismaMock({ updateManyCount: 1 });
    prisma.conversationReport.findUnique.mockResolvedValue({ id: 'rep-1', resolvedAt: null });
    const service = createService(prisma);

    await service.unassignReport('rep-1');

    expect(prisma.conversationReport.updateMany).toHaveBeenCalledTimes(1);
    const callArg = prisma.conversationReport.updateMany.mock.calls[0]![0];
    expect(callArg.where).toEqual({ id: 'rep-1' });
    expect(callArg.data).toEqual({
      assignedToUserId: null,
      assignedAt: null,
    });
  });

  it('throws 404 when report not found', async () => {
    const prisma = makePrismaMock({ updateManyCount: 0 });
    const service = createService(prisma);

    await expect(service.unassignReport('missing-id')).rejects.toThrow(AppException);
    await expect(service.unassignReport('missing-id')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Signalement introuvable.',
    });
  });
});

describe('ModerationAdminService.resolveReport', () => {
  it('records resolution timestamp, resolver ID, verdict, and note', async () => {
    const prisma = makePrismaMock({ updateManyCount: 1 });
    const service = createService(prisma);

    const before = new Date();
    await service.resolveReport('rep-1', 'moderator-456', {
      verdict: 'SANCTION_APPLIED',
      note: '  Utilisateur banni après avertissement  ',
    });
    const after = new Date();

    expect(prisma.conversationReport.updateMany).toHaveBeenCalledTimes(1);
    const callArg = prisma.conversationReport.updateMany.mock.calls[0]![0];
    // The first decision stands: only a report that is still open is stamped.
    expect(callArg.where).toEqual({ id: 'rep-1', resolvedAt: null });
    expect(callArg.data.resolvedAt).toBeInstanceOf(Date);
    expect(callArg.data.resolvedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(callArg.data.resolvedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(callArg.data.resolvedByUserId).toBe('moderator-456');
    expect(callArg.data.resolutionVerdict).toBe('SANCTION_APPLIED');
    expect(callArg.data.resolutionNote).toBe('Utilisateur banni après avertissement');
  });

  it('defaults verdict to RESOLVED_OTHER when body is omitted or missing verdict', async () => {
    const prisma = makePrismaMock({ updateManyCount: 1 });
    const service = createService(prisma);

    // Omitted body
    await service.resolveReport('rep-1', 'moderator-456');
    expect(prisma.conversationReport.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.conversationReport.updateMany.mock.calls[0]![0].data.resolutionVerdict).toBe('RESOLVED_OTHER');
    expect(prisma.conversationReport.updateMany.mock.calls[0]![0].data.resolutionNote).toBeNull();

    // Empty body
    await service.resolveReport('rep-2', 'moderator-456', {});
    expect(prisma.conversationReport.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.conversationReport.updateMany.mock.calls[1]![0].data.resolutionVerdict).toBe('RESOLVED_OTHER');
    expect(prisma.conversationReport.updateMany.mock.calls[1]![0].data.resolutionNote).toBeNull();

    // Body with whitespace-only note
    await service.resolveReport('rep-3', 'moderator-456', { note: '    ' });
    expect(prisma.conversationReport.updateMany).toHaveBeenCalledTimes(3);
    expect(prisma.conversationReport.updateMany.mock.calls[2]![0].data.resolutionVerdict).toBe('RESOLVED_OTHER');
    expect(prisma.conversationReport.updateMany.mock.calls[2]![0].data.resolutionNote).toBeNull();

    // Body with note but omitted verdict
    await service.resolveReport('rep-4', 'moderator-456', { note: 'Motif particulier' });
    expect(prisma.conversationReport.updateMany).toHaveBeenCalledTimes(4);
    expect(prisma.conversationReport.updateMany.mock.calls[3]![0].data.resolutionVerdict).toBe('RESOLVED_OTHER');
    expect(prisma.conversationReport.updateMany.mock.calls[3]![0].data.resolutionNote).toBe('Motif particulier');
  });

  it('throws 404 when report not found', async () => {
    const prisma = makePrismaMock({ updateManyCount: 0 });
    const service = createService(prisma);

    await expect(service.resolveReport('missing-id', 'moderator-456')).rejects.toThrow(AppException);
    await expect(service.resolveReport('missing-id', 'moderator-456')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Signalement introuvable.',
    });
  });
});

describe('AdminController write endpoints', () => {
  function makeController(moderationAdmin: Partial<ModerationAdminService>) {
    return new AdminController(
      {} as any, // prisma
      {} as any, // refunds
      {} as any, // cron
      {} as any, // catalog
      moderationAdmin as ModerationAdminService,
      {} as any, // overviewService
      {} as any, // auditService
      {} as any, // users
      {} as any, // usersWrite
      {} as any, // repairers
      {} as any, // repairersWrite
      {} as any, // demandes
      {} as any, // demandesWrite
      {} as any, // offres
      {} as any, // shipments
    );
  }

  it('assignReport delegates to service with session user ID and returns { ok: true }', async () => {
    const assignReport = vi.fn().mockResolvedValue(undefined);
    const controller = makeController({ assignReport } as any);

    const session = { user: { id: 'admin-1' } } as any;
    const res = await controller.assignReport(session, 'rep-10');

    expect(assignReport).toHaveBeenCalledWith('rep-10', 'admin-1');
    expect(res).toEqual({ ok: true });
  });

  it('assignReport falls back to "admin" if session is missing', async () => {
    const assignReport = vi.fn().mockResolvedValue(undefined);
    const controller = makeController({ assignReport } as any);

    const res = await controller.assignReport(undefined as any, 'rep-10');

    expect(assignReport).toHaveBeenCalledWith('rep-10', 'admin');
    expect(res).toEqual({ ok: true });
  });

  it('unassignReport delegates to service and returns { ok: true }', async () => {
    const unassignReport = vi.fn().mockResolvedValue(undefined);
    const controller = makeController({ unassignReport } as any);

    const res = await controller.unassignReport('rep-10');

    expect(unassignReport).toHaveBeenCalledWith('rep-10');
    expect(res).toEqual({ ok: true });
  });

  it('resolveReport parses valid body, delegates to service, and returns { ok: true }', async () => {
    const resolveReport = vi.fn().mockResolvedValue(undefined);
    const controller = makeController({ resolveReport } as any);

    const session = { user: { id: 'admin-2' } } as any;
    const res = await controller.resolveReport(session, 'rep-20', {
      verdict: 'DISMISSED_UNFOUNDED',
      note: 'Signalement infondé.',
    });

    expect(resolveReport).toHaveBeenCalledWith('rep-20', 'admin-2', {
      verdict: 'DISMISSED_UNFOUNDED',
      note: 'Signalement infondé.',
    });
    expect(res).toEqual({ ok: true });
  });

  it('resolveReport defaults invalid/empty body to RESOLVED_OTHER', async () => {
    const resolveReport = vi.fn().mockResolvedValue(undefined);
    const controller = makeController({ resolveReport } as any);

    const session = { user: { id: 'admin-2' } } as any;
    const res = await controller.resolveReport(session, 'rep-20', { note: 'Just a note' });

    expect(resolveReport).toHaveBeenCalledWith('rep-20', 'admin-2', {
      verdict: 'RESOLVED_OTHER',
      note: 'Just a note',
    });
    expect(res).toEqual({ ok: true });
  });
});
