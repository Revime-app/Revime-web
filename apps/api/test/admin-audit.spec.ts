import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuditService } from '../src/admin/admin-audit.service.js';

const makePrisma = () => ({
  adminAuditLog: {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  },
});

describe('AdminAuditService.record', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AdminAuditService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminAuditService(prisma as never);
  });

  it('writes one row with the actor, action, target and status', async () => {
    await service.record({
      actorUserId: 'u1',
      actorEmail: 'ops@revime.fr',
      action: 'commande.refund',
      targetType: 'Commande',
      targetId: 'c1',
      statusCode: 200,
    });

    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.adminAuditLog.create.mock.calls[0]![0].data).toMatchObject({
      actorUserId: 'u1',
      actorEmail: 'ops@revime.fr',
      action: 'commande.refund',
      targetType: 'Commande',
      targetId: 'c1',
      statusCode: 200,
    });
  });

  it('writes a FAILED action too, because a refused refund is what an audit trail is for', async () => {
    await service.record({
      actorUserId: 'u1',
      actorEmail: 'ops@revime.fr',
      action: 'commande.refund',
      statusCode: 422,
    });

    expect(prisma.adminAuditLog.create.mock.calls[0]![0].data.statusCode).toBe(422);
  });

  it('records an unknown actor rather than throwing, so a write is never lost to a missing session', async () => {
    await service.record({
      actorUserId: null,
      actorEmail: null,
      action: 'review.delete',
      statusCode: 200,
    });

    expect(prisma.adminAuditLog.create.mock.calls[0]![0].data.actorEmail).toBe('inconnu');
  });

  it('NEVER throws out of record: an audit failure must not fail the action it describes', async () => {
    prisma.adminAuditLog.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.record({ actorUserId: 'u1', actorEmail: 'a@b.fr', action: 'report.resolve', statusCode: 200 }),
    ).resolves.toBeUndefined();
  });

  it('rejects an action outside the shared enum, so a typo cannot reach the column', async () => {
    // NOTE: no @ts-expect-error here, deliberately. AuditRecordInput.action is typed
    // `string`, not AdminAuditAction, because the interceptor hands over a value read
    // from route metadata and the service is the validating boundary. So this line
    // COMPILES, and what is under test is the runtime guard. An earlier draft of this
    // plan had @ts-expect-error on it, which would itself have failed as TS2578
    // "unused directive" - caught in the pre-flight scan.
    await service.record({
      actorUserId: 'u1',
      actorEmail: 'a@b.fr',
      action: 'commande.refunded',
      statusCode: 200,
    });

    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

describe('AdminAuditService.list', () => {
  it('caps the limit at 100 and orders newest first', async () => {
    const prisma = makePrisma();
    const service = new AdminAuditService(prisma as never);

    await service.list(5000);

    const args = prisma.adminAuditLog.findMany.mock.calls[0]![0];
    expect(args.take).toBe(100);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('floors the limit at 1', async () => {
    const prisma = makePrisma();
    const service = new AdminAuditService(prisma as never);

    await service.list(0);

    expect(prisma.adminAuditLog.findMany.mock.calls[0]![0].take).toBe(1);
  });

  it('clamps NaN to 1, because the controller passes Number(query) and ?limit=abc arrives as NaN', async () => {
    const prisma = makePrisma();
    const service = new AdminAuditService(prisma as never);

    await service.list(Number('abc'));

    expect(prisma.adminAuditLog.findMany.mock.calls[0]![0].take).toBe(1);
  });

  it('clamps a negative to 1, which `|| 1` alone would not do', async () => {
    const prisma = makePrisma();
    const service = new AdminAuditService(prisma as never);

    await service.list(-5);

    expect(prisma.adminAuditLog.findMany.mock.calls[0]![0].take).toBe(1);
  });
});
