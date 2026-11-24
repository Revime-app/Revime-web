import { describe, expect, it, vi } from 'vitest';
import { DELETED_USER_NAME } from '@revime/shared';
import { AdminCancellationsService } from '../src/admin/admin-cancellations.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { RefundService } from '../src/commandes/refund.service.js';

function mockCancellationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    commandeId: 'cmd-1',
    requestedByUserId: 'user-client-1',
    reason: 'TOO_SLOW',
    comment: 'Trop long',
    status: 'PENDING',
    createdAt: new Date('2026-09-30T10:00:00.000Z'),
    decidedAt: null,
    decidedByUserId: null,
    refusalNote: null,
    commande: {
      id: 'cmd-1',
      clientUserId: 'user-client-1',
      repairerUserId: 'user-repairer-1',
      step: 'REPAIR_STARTED',
      delivery: 'HOME',
      totalCents: 10000,
      repairCents: 9000,
      shippingCents: 0,
      insuranceCents: 0,
      protectionCents: 1000,
      stripeTransferId: null,
      demande: { title: 'iPhone 13, écran cassé' },
      client: { name: 'Alice Client', profile: null },
      repairer: { name: 'Bob Réparateur', profile: null },
    },
    ...overrides,
  };
}

function harness(rows: any[] = [mockCancellationRow()], userLookup: Record<string, any> = {}) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const findFirst = vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
    const found = rows.find((r) => r.id === where.id);
    return Promise.resolve(found ?? null);
  });
  const userFindMany = vi.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) => {
    const ids = where?.id?.in ?? [];
    return Promise.resolve(ids.map((id: string) => userLookup[id] ?? { id, name: 'Admin User', profile: null }));
  });
  const userFindUnique = vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
    return Promise.resolve(userLookup[where.id] ?? { id: where.id, name: 'Admin User', profile: null });
  });

  const prisma = {
    cancellationRequest: { findMany, findFirst },
    user: { findMany: userFindMany, findUnique: userFindUnique },
  } as unknown as PrismaService;

  const notifications = { emit: vi.fn().mockResolvedValue(undefined) };
  const refunds = { refund: vi.fn().mockResolvedValue({ refundCents: 9000, totalCents: 10000 }) };

  const service = new AdminCancellationsService(
    prisma,
    notifications as never,
    refunds as unknown as RefundService,
  );

  return { service, findMany, findFirst, prisma };
}

describe('P14: AdminCancellationsService requester attribution & decision metadata', () => {
  it('list() identifies client requester with role CLIENT', async () => {
    const { service } = harness([
      mockCancellationRow({
        requestedByUserId: 'user-client-1',
      }),
    ]);

    const result = await service.list({ status: 'PENDING' });
    expect(result).toHaveLength(1);
    expect(result[0]!.requestedByName).toBe('Alice Client');
    expect(result[0]!.requestedByRole).toBe('CLIENT');
    expect(result[0]!.decidedByName).toBeNull();
    expect(result[0]!.decidedAt).toBeNull();
  });

  it('list() identifies repairer requester with role REPAIRER', async () => {
    const { service } = harness([
      mockCancellationRow({
        requestedByUserId: 'user-repairer-1',
      }),
    ]);

    const result = await service.list({ status: 'PENDING' });
    expect(result).toHaveLength(1);
    expect(result[0]!.requestedByName).toBe('Bob Réparateur');
    expect(result[0]!.requestedByRole).toBe('REPAIRER');
  });

  it('list() identifies admin requester with role ADMIN and resolves user name', async () => {
    const { service } = harness(
      [
        mockCancellationRow({
          requestedByUserId: 'admin-op-1',
        }),
      ],
      {
        'admin-op-1': { id: 'admin-op-1', name: 'Claire Admin', profile: null },
      },
    );

    const result = await service.list({ status: 'PENDING' });
    expect(result).toHaveLength(1);
    expect(result[0]!.requestedByName).toBe('Claire Admin');
    expect(result[0]!.requestedByRole).toBe('ADMIN');
  });

  it('list() returns decidedByName and decidedAt on resolved items in HISTORY tab', async () => {
    const decidedDate = new Date('2026-10-01T15:30:00.000Z');
    const { service } = harness(
      [
        mockCancellationRow({
          status: 'REFUSED',
          refusalNote: 'Pièce déjà commandée',
          decidedAt: decidedDate,
          decidedByUserId: 'admin-decider-1',
        }),
      ],
      {
        'admin-decider-1': { id: 'admin-decider-1', name: 'David Décideur', profile: null },
      },
    );

    const result = await service.list({ status: 'HISTORY' });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('REFUSED');
    expect(result[0]!.decidedByName).toBe('David Décideur');
    expect(result[0]!.decidedAt).toBe(decidedDate.toISOString());
  });

  it('getDetail() returns actor details and masks tombstoned / deleted users', async () => {
    const { service } = harness(
      [
        mockCancellationRow({
          id: 'req-tombstoned',
          requestedByUserId: 'user-client-1',
          status: 'APPROVED',
          decidedAt: new Date('2026-10-02T12:00:00.000Z'),
          decidedByUserId: 'admin-deleted-1',
          commande: {
            id: 'cmd-1',
            clientUserId: 'user-client-1',
            repairerUserId: 'user-repairer-1',
            step: 'REPAIR_STARTED',
            delivery: 'HOME',
            totalCents: 10000,
            repairCents: 9000,
            shippingCents: 0,
            insuranceCents: 0,
            protectionCents: 1000,
            stripeTransferId: null,
            demande: { title: 'iPhone 13, écran cassé' },
            client: { name: DELETED_USER_NAME, profile: { deletedAt: new Date() } },
            repairer: { name: 'Bob Réparateur', profile: null },
          },
        }),
      ],
      {
        'admin-deleted-1': {
          id: 'admin-deleted-1',
          name: 'supprime_admin',
          profile: { deletedAt: new Date() },
        },
      },
    );

    const detail = await service.getDetail('req-tombstoned');
    expect(detail.requestedByName).toBe(DELETED_USER_NAME);
    expect(detail.requestedByRole).toBe('CLIENT');
    expect(detail.decidedByName).toBe(DELETED_USER_NAME);
    expect(detail.decidedAt).toBe('2026-10-02T12:00:00.000Z');
  });
  it('shows a withdrawn request as closed by the client who asked, and leaves a decider-less approval empty', async () => {
    const { service } = harness([
      mockCancellationRow({ id: 'req-w', status: 'WITHDRAWN', decidedAt: new Date('2026-10-02T09:00:00.000Z') }),
      mockCancellationRow({ id: 'req-a', status: 'APPROVED', decidedAt: new Date('2026-10-02T10:00:00.000Z') }),
    ]);

    const result = await service.list({ status: 'HISTORY' });
    expect(result.find((r) => r.id === 'req-w')!.decidedByName).toBe('Alice Client');
    expect(result.find((r) => r.id === 'req-a')!.decidedByName).toBeNull();
  });

  it('looks the requester and the decider up in ONE user query for the whole list', async () => {
    const { service, prisma } = harness([
      mockCancellationRow({ id: 'r1', status: 'REFUSED', decidedByUserId: 'admin-1', requestedByUserId: 'staff-9' }),
      mockCancellationRow({ id: 'r2', status: 'REFUSED', decidedByUserId: 'admin-1' }),
    ]);
    await service.list({ status: 'HISTORY' });
    expect((prisma.user.findMany as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((prisma.user.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0].where.id.in.sort()).toEqual(['admin-1', 'staff-9', 'user-client-1']);
  });
});
