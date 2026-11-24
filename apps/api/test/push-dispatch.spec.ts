import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PushService,
  type PushDispatchInput,
} from '../src/push/push.service.js';
import { __resetPushSender, fakePush } from '../src/push/sender.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Spec §5 and §11. `dispatch` is called DETACHED by `emit`, so the property that matters most
 * is « never rejects », tested with a sender that throws and one that rejects.
 */
const input: PushDispatchInput = {
  userId: 'u1',
  notificationId: 'n1',
  mode: 'CLIENT',
  type: 'OFFER_RECEIVED',
  actorName: 'FixLab',
  subject: 'Écran iPhone',
  amountCents: 6500,
  step: null,
  messagePreview: null,
  demandeId: 'd1',
  commandeId: null,
  conversationId: null,
};

function harness(
  tokens: { id: string; token: string }[] = [
    { id: 't1', token: 'ExponentPushToken[aaa]' },
  ],
) {
  const findMany = vi.fn().mockResolvedValue(tokens);
  const createMany = vi.fn().mockResolvedValue({ count: tokens.length });
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    pushToken: { findMany, updateMany },
    pushTicket: { createMany },
  } as unknown as PrismaService;
  return { service: new PushService(prisma), findMany, createMany, updateMany };
}

describe('PushService.dispatch', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.PUSH_DRIVER = 'fake';
    __resetPushSender();
    fakePush.reset();
  });

  afterEach(() => {
    process.env = { ...saved };
    __resetPushSender();
  });

  it('sends one message per ENABLED token and asks only for enabled ones', async () => {
    const { service, findMany, createMany } = harness([
      { id: 't1', token: 'ExponentPushToken[aaa]' },
      { id: 't2', token: 'ExponentPushToken[bbb]' },
    ]);
    // The number of tickets Expo accepted, which the admin broadcast reports as « sent ».
    await expect(service.dispatch(input)).resolves.toBe(2);

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0]![0].where).toEqual({
      userId: 'u1',
      disabledAt: null,
      // PUB-33 (DECP-23): never a store-review account's tokens.
      user: { email: { not: { endsWith: '@review.revime.fr' }, mode: 'insensitive' } },
    });
    expect(fakePush.calls).toHaveLength(1);
    expect(fakePush.calls[0]!.map((m) => m.to)).toEqual([
      'ExponentPushToken[aaa]',
      'ExponentPushToken[bbb]',
    ]);
    expect(fakePush.calls[0]![0]).toMatchObject({
      title: 'Nouvelle offre reçue',
      body: 'FixLab a proposé 65 € pour « Écran iPhone »',
      data: {
        notificationId: 'n1',
        type: 'OFFER_RECEIVED',
        mode: 'CLIENT',
        demandeId: 'd1',
        commandeId: null,
        conversationId: null,
      },
    });
    // One ticket row per ok ticket, keyed by Expo's id and the token's row id.
    expect(createMany.mock.calls[0]![0].data).toEqual([
      { id: 'fake:0:ExponentPushToken[aaa]', tokenId: 't1' },
      { id: 'fake:1:ExponentPushToken[bbb]', tokenId: 't2' },
    ]);
  });

  it('sends nothing and touches no table when the user has no enabled token', async () => {
    const { service, createMany } = harness([]);
    await service.dispatch(input);
    expect(fakePush.calls).toHaveLength(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('disables a token immediately on a DeviceNotRegistered TICKET, and stores no ticket for it', async () => {
    const { service, createMany, updateMany } = harness([
      { id: 't1', token: 'ExponentPushToken[aaa]' },
      { id: 't2', token: 'ExponentPushToken[bbb]' },
    ]);
    fakePush.tickets = (_m, i) =>
      i === 0
        ? { status: 'error', error: 'DeviceNotRegistered', message: 'gone' }
        : { status: 'ok', id: 'ok-2' };
    await service.dispatch(input);

    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany.mock.calls[0]![0].where).toEqual({ id: { in: ['t1'] } });
    expect(updateMany.mock.calls[0]![0].data.disabledAt).toBeInstanceOf(Date);
    expect(createMany.mock.calls[0]![0].data).toEqual([
      { id: 'ok-2', tokenId: 't2' },
    ]);
  });

  it('logs any other ticket error and keeps going', async () => {
    const { service, updateMany } = harness();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    fakePush.tickets = () => ({
      status: 'error',
      error: 'MessageTooBig',
      message: 'too big',
    });
    await service.dispatch(input);
    expect(err).toHaveBeenCalledOnce();
    expect(updateMany).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('carries a null notificationId through untouched (the fold path)', async () => {
    const { service } = harness();
    await service.dispatch({
      ...input,
      type: 'MESSAGE_RECEIVED',
      notificationId: null,
      conversationId: 'c1',
      messagePreview: 'Salut',
    });
    expect(fakePush.calls[0]![0]!.data.notificationId).toBeNull();
    expect(fakePush.calls[0]![0]!.body).toBe('Salut');
  });

  it('RESOLVES when the sender rejects the whole request, and says so loudly', async () => {
    const { service } = harness();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    fakePush.rejectWith = new Error('expo down');
    // 0 = no ticket accepted: the admin broadcast counts a push as sent only above 0.
    await expect(service.dispatch(input)).resolves.toBe(0);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('RESOLVES when the token read throws synchronously inside the try', async () => {
    const prisma = {
      pushToken: {
        findMany: () => {
          throw new Error('db down');
        },
        updateMany: vi.fn(),
      },
      pushTicket: { createMany: vi.fn() },
    } as unknown as PrismaService;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      new PushService(prisma).dispatch(input),
    ).resolves.toBe(0);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
