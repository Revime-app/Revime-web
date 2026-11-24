import { describe, expect, it, vi } from 'vitest';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';
import { ModerationAdminService } from '../src/admin/moderation-admin.service.js';

// RU-22 review: the rules the P17-P20 specs did not pin.

function disputesPrisma(over: { dispute?: any; target?: any } = {}) {
  return {
    dispute: {
      findUnique: vi.fn().mockResolvedValue(over.dispute ?? { id: 'd1', status: 'OPEN' }),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(
        over.target === undefined
          ? { id: 'u2', name: 'Alice', role: 'support', profile: { deletedAt: null } }
          : over.target,
      ),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

const disputes = (prisma: any) => new AdminDisputesService(prisma, {} as any, { announce: vi.fn() } as any);

describe('RU-22 · P17 assignment rules', () => {
  it('refuses an id that is not an account', async () => {
    const prisma = disputesPrisma({ target: null });
    await expect(disputes(prisma).assign('admin', 'd1', 'ghost')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
    });
    expect(prisma.dispute.update).not.toHaveBeenCalled();
  });

  it('refuses a customer account', async () => {
    const prisma = disputesPrisma({
      target: { id: 'c1', name: 'Client', role: null, profile: { deletedAt: null } },
    });
    await expect(disputes(prisma).assign('admin', 'd1', 'c1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
    });
  });

  it('refuses a staff role that cannot handle disputes (moderation)', async () => {
    const prisma = disputesPrisma({
      target: { id: 'm1', name: 'Mod', role: 'moderation', profile: { deletedAt: null } },
    });
    await expect(disputes(prisma).assign('admin', 'd1', 'm1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
    });
  });

  it('accepts finance, which holds disputes.handle', async () => {
    const prisma = disputesPrisma({
      target: { id: 'f1', name: 'Fin', role: 'finance', profile: { deletedAt: null } },
    });
    await expect(disputes(prisma).assign('admin', 'd1', 'f1')).resolves.toEqual({ ok: true });
  });

  it('refuses to reassign a resolved dispute', async () => {
    const prisma = disputesPrisma({ dispute: { id: 'd1', status: 'RESOLVED_REFUNDED' } });
    await expect(disputes(prisma).assign('admin', 'd1', 'u2')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
    });
    expect(prisma.dispute.update).not.toHaveBeenCalled();
  });

  it('refuses to release a resolved dispute', async () => {
    const prisma = disputesPrisma({ dispute: { id: 'd1', status: 'RESOLVED_RELEASED' } });
    await expect(disputes(prisma).unassign('d1')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
    expect(prisma.dispute.update).not.toHaveBeenCalled();
  });

  it('puts an IN_REVIEW dispute back to OPEN when it is released', async () => {
    const prisma = disputesPrisma({ dispute: { id: 'd1', status: 'IN_REVIEW' } });
    await disputes(prisma).unassign('d1');
    expect(prisma.dispute.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { assignedToUserId: null, assignedAt: null, status: 'OPEN' },
    });
  });

  it('offers exactly the roles that hold disputes.handle', async () => {
    const prisma = disputesPrisma();
    await disputes(prisma).listAssignees();
    const roles = prisma.user.findMany.mock.calls[0][0].where.role.in as string[];
    expect([...roles].sort()).toEqual(['admin', 'finance', 'super_admin', 'support']);
  });
});

describe('RU-22 · P17 queue filters', () => {
  it('refuses « Mes dossiers » without a user instead of listing everything', async () => {
    const prisma = disputesPrisma();
    await expect(disputes(prisma).list({ onlyMine: true })).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
    });
  });

  it('keeps a dispute on a refunded order out of the open and in-review filters', async () => {
    for (const status of ['OPEN', 'IN_REVIEW'] as const) {
      const prisma = disputesPrisma();
      await disputes(prisma).list({ status });
      const where = prisma.dispute.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(status);
      expect(where.commande).toEqual({ status: { not: 'REFUNDED' } });
    }
  });

  it('lists a dispute on a refunded order under « Résolus »', async () => {
    const prisma = disputesPrisma();
    await disputes(prisma).list({ status: 'RESOLVED' });
    const where = prisma.dispute.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      {
        OR: [
          { status: { in: ['RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'] } },
          { commande: { status: 'REFUNDED' } },
        ],
      },
    ]);
  });
});

function moderationPrisma(over: { report?: any; updateCount?: number } = {}) {
  return {
    conversationReport: {
      findUnique: vi.fn().mockResolvedValue(over.report ?? null),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: over.updateCount ?? 1 }),
    },
    conversation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  } as any;
}

describe('RU-22 · P20 resolved-dossier rules', () => {
  it('does not swallow a database error while checking a report is still open', async () => {
    const prisma = moderationPrisma();
    prisma.conversationReport.findUnique.mockRejectedValue(new Error('P1001'));
    await expect(new ModerationAdminService(prisma).unassignReport('r1')).rejects.toThrow('P1001');
    expect(prisma.conversationReport.updateMany).not.toHaveBeenCalled();
  });

  it('answers 404 when releasing a report that does not exist', async () => {
    const prisma = moderationPrisma({ report: null });
    await expect(new ModerationAdminService(prisma).unassignReport('nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('closes a conversation whose earlier report was resolved (a reopened channel can be closed again)', async () => {
    const prisma = moderationPrisma();
    await new ModerationAdminService(prisma).closeConversation('c1');
    expect(prisma.conversationReport.findFirst).not.toHaveBeenCalled();
    expect(prisma.conversation.updateMany).toHaveBeenCalled();
  });

  it('resolving twice keeps the first decision', async () => {
    const prisma = moderationPrisma({ updateCount: 0, report: { id: 'r1' } });
    await expect(
      new ModerationAdminService(prisma).resolveReport('r1', 'admin', { verdict: 'RESOLVED_OTHER' }),
    ).resolves.toBeUndefined();
    expect(prisma.conversationReport.updateMany.mock.calls[0][0].where).toEqual({ id: 'r1', resolvedAt: null });
  });

  it('answers 404 when resolving a report that does not exist', async () => {
    const prisma = moderationPrisma({ updateCount: 0, report: null });
    await expect(new ModerationAdminService(prisma).resolveReport('nope', 'admin')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('RU-22 · P20 report detail never invents its target', () => {
  const at = (iso: string) => new Date(iso);
  const report = (extra: Record<string, unknown>, messages: any[]) => ({
    id: 'r1',
    conversationId: 'c1',
    reporterUserId: 'rep',
    reportedUserId: 'bad',
    reason: 'SPAM',
    createdAt: at('2026-10-14T12:00:00Z'),
    resolvedAt: null,
    assignedToUserId: null,
    assignedAt: null,
    resolvedByUserId: null,
    resolutionVerdict: null,
    resolutionNote: null,
    reporter: { id: 'rep', name: 'Alice', email: 'a@x.fr', createdAt: at('2026-01-01T00:00:00Z') },
    reported: {
      id: 'bad',
      name: 'Bob',
      email: 'b@x.fr',
      createdAt: at('2026-01-01T00:00:00Z'),
      role: 'repairer',
      banned: false,
      profile: { repairerSuspendedAt: null },
    },
    conversation: { id: 'c1', deletedAt: null, demande: { id: 'd', title: 'T' }, messages },
    ...extra,
  });
  const msg = (id: string, from: string, iso: string) => ({
    id,
    body: id,
    createdAt: at(iso),
    deletedAt: null,
    senderUserId: from,
    sender: { name: from },
  });
  const detail = async (r: any) => {
    const prisma = {
      conversationReport: { findUnique: vi.fn().mockResolvedValue(r), count: vi.fn().mockResolvedValue(0) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    return new ModerationAdminService(prisma).getReportDetail('r1');
  };

  it('ignores a target type a row does not carry in the schema', async () => {
    const d = await detail(report({ targetType: 'REVIEW', reviewRating: 1 }, [msg('m1', 'bad', '2026-10-14T11:00:00Z')]));
    expect(d.targetType).toBe('MESSAGE');
    expect(d.targetEntitySummary.targetType).toBe('MESSAGE');
    expect(d.targetEntitySummary.rating).toBeUndefined();
  });

  it('estimates the reported user’s last message before the report, not their first', async () => {
    const d = await detail(
      report({}, [
        msg('old', 'bad', '2026-10-10T09:00:00Z'),
        msg('last-before', 'bad', '2026-10-14T11:00:00Z'),
        msg('after', 'bad', '2026-10-14T13:00:00Z'),
      ]),
    );
    expect(d.likelyReportedMessageId).toBe('last-before');
  });

  it('falls back to the reported user’s first message when all came after the report', async () => {
    const d = await detail(report({}, [msg('a', 'rep', '2026-10-14T11:00:00Z'), msg('b', 'bad', '2026-10-14T13:00:00Z')]));
    expect(d.likelyReportedMessageId).toBe('b');
  });
});
