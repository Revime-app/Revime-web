import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { PushService } from '../src/push/push.service.js';

/** Just the two methods `emit` uses, typed loosely and cast at the boundary. */
function fakePrisma(over: Record<string, unknown> = {}) {
  const create = (
    'create' in over ? over.create : vi.fn().mockResolvedValue({ id: 'n1' })
  ) as ReturnType<typeof vi.fn>;
  const updateMany = (
    'updateMany' in over
      ? over.updateMany
      : vi.fn().mockResolvedValue({ count: 0 })
  ) as ReturnType<typeof vi.fn>;
  return {
    double: {
      notification: { create, updateMany },
    } as unknown as PrismaService,
    create,
    updateMany,
  };
}

/** `dispatch` is detached and never throws; the stub records what emit handed it. */
function fakePush(over: { dispatch?: ReturnType<typeof vi.fn> } = {}) {
  const dispatch = over.dispatch ?? vi.fn().mockResolvedValue(undefined);
  return { double: { dispatch } as unknown as PushService, dispatch };
}

/** A Prisma P2002, as `isUniqueViolation` recognises it. */
const uniqueViolation = Object.assign(new Error('Unique constraint failed'), {
  code: 'P2002',
});

describe('NotificationsService.emit - never throws', () => {
  it('inserts one row for a non-message type', async () => {
    const { double, create } = fakePrisma();
    const service = new NotificationsService(double, fakePush().double);

    await service.emit({
      userId: 'u1',
      mode: 'CLIENT',
      type: 'OFFER_RECEIVED',
      actorName: 'FixLab',
      amountCents: 6500,
      demandeId: 'd1',
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0].data).toMatchObject({
      userId: 'u1',
      mode: 'CLIENT',
      type: 'OFFER_RECEIVED',
      actorName: 'FixLab',
      amountCents: 6500,
      demandeId: 'd1',
    });
  });

  it('normalises every absent optional column to null, never undefined', async () => {
    const { double, create } = fakePrisma();
    await new NotificationsService(double, fakePush().double).emit({
      userId: 'u1',
      mode: 'REPAIRER',
      type: 'OFFER_DECLINED',
    });

    // « Give absence a single representation, and make it null, never undefined » -
    // AGENTS.md, load-bearing twice already in this repo.
    const { data } = create.mock.calls[0]![0];
    for (const key of [
      'actorName',
      'subject',
      'amountCents',
      'step',
      'demandeId',
      'commandeId',
      'conversationId',
      'messageId',
    ]) {
      expect(data[key]).toBeNull();
    }
  });

  it('RESOLVES when the insert rejects, and says so loudly', async () => {
    // The property that makes emit safe to call from the Stripe webhook: a throw there
    // releases Stripe's claim and re-enters the compensation path. Enforced, not documented.
    const { double } = fakePrisma({
      create: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      new NotificationsService(double, fakePush().double).emit({
        userId: 'u1',
        mode: 'CLIENT',
        type: 'FUNDS_RELEASED',
      }),
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('NotificationsService.emit - the message collapse', () => {
  const message = {
    userId: 'u1',
    mode: 'CLIENT' as const,
    type: 'MESSAGE_RECEIVED' as const,
    conversationId: 'c1',
    messageId: 'm2',
    actorName: 'Sophie',
  };

  it('UPDATES the existing unread row rather than inserting a second', async () => {
    const { double, create, updateMany } = fakePrisma({
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    });

    await new NotificationsService(double, fakePush().double).emit(message);

    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany.mock.calls[0]![0].where).toMatchObject({
      userId: 'u1',
      conversationId: 'c1',
      type: 'MESSAGE_RECEIVED',
      readAt: null,
    });
    expect(updateMany.mock.calls[0]![0].data).toMatchObject({
      messageId: 'm2',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('inserts when there is no unread row to fold into', async () => {
    const { double, create, updateMany } = fakePrisma();
    await new NotificationsService(double, fakePush().double).emit(message);
    expect(updateMany).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it('folds into the winner when a concurrent send inserted between the update and the create', async () => {
    // The P2002 arm. Étape 5 piece 1 shipped getOrCreate as a check-then-insert against a
    // PARTIAL index with no such branch, and that omission is recorded as the cause.
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 0 }) // nothing to fold into
      .mockResolvedValueOnce({ count: 1 }); // the retry after P2002
    const { double, create } = fakePrisma({
      updateMany,
      create: vi.fn().mockRejectedValue(uniqueViolation),
    });

    await expect(
      new NotificationsService(double, fakePush().double).emit(message),
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('NotificationsService.emit - the push dispatch (CF-44)', () => {
  it('dispatches ONCE after a plain insert, with the created row id and the routing ids', async () => {
    const { double } = fakePrisma();
    const push = fakePush();
    await new NotificationsService(double, push.double).emit({
      userId: 'u1',
      mode: 'CLIENT',
      type: 'OFFER_RECEIVED',
      actorName: 'FixLab',
      amountCents: 6500,
      demandeId: 'd1',
    });

    expect(push.dispatch).toHaveBeenCalledOnce();
    expect(push.dispatch.mock.calls[0]![0]).toMatchObject({
      userId: 'u1',
      notificationId: 'n1',
      mode: 'CLIENT',
      type: 'OFFER_RECEIVED',
      actorName: 'FixLab',
      amountCents: 6500,
      demandeId: 'd1',
      commandeId: null,
      conversationId: null,
      messagePreview: null,
    });
  });

  it('dispatches with a NULL id when the message folds into an existing unread row', async () => {
    const { double } = fakePrisma({
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    });
    const push = fakePush();
    await new NotificationsService(double, push.double).emit({
      userId: 'u1',
      mode: 'CLIENT',
      type: 'MESSAGE_RECEIVED',
      conversationId: 'c1',
      messageId: 'm2',
      messagePreview: 'Deuxième message',
    });

    expect(push.dispatch).toHaveBeenCalledOnce();
    expect(push.dispatch.mock.calls[0]![0]).toMatchObject({
      notificationId: null,
      type: 'MESSAGE_RECEIVED',
      conversationId: 'c1',
      messagePreview: 'Deuxième message',
    });
  });

  it('does NOT dispatch when the insert rejects', async () => {
    const { double } = fakePrisma({
      create: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const push = fakePush();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await new NotificationsService(double, push.double).emit({
      userId: 'u1',
      mode: 'CLIENT',
      type: 'FUNDS_RELEASED',
    });
    expect(push.dispatch).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('resolves BEFORE the dispatch settles - the detached contract', async () => {
    // emit must not wait on the network. The other half of the contract - that the promise it
    // detaches can never reject - is PushService.dispatch's property and is pinned twice in
    // push-dispatch.spec.ts (« RESOLVES when … »); it is deliberately NOT re-tested here with a
    // rejecting stub, because a stub that rejects through `void` IS an unhandled rejection and
    // vitest would report it as a run-level error.
    let settle!: () => void;
    const dispatch = vi
      .fn()
      .mockImplementation(
        () => new Promise<void>((resolve) => (settle = resolve)),
      );
    const { double } = fakePrisma();
    const service = new NotificationsService(
      double,
      fakePush({ dispatch }).double,
    );

    let emitted = false;
    await service
      .emit({ userId: 'u1', mode: 'CLIENT', type: 'OFFER_RECEIVED' })
      .then(() => (emitted = true));
    expect(emitted).toBe(true);
    expect(dispatch).toHaveBeenCalledOnce();
    settle();
  });
});
