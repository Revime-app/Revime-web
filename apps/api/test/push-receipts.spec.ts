import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushService } from '../src/push/push.service.js';
import { __resetPushSender, fakePush } from '../src/push/sender.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Spec §8's table, one case per row. `now` is injected so « older than 24 h » is a fact of the
 * fixture rather than of the wall clock.
 */
const NOW = new Date('2026-09-07T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function harness(tickets: { id: string; tokenId: string; createdAt: Date }[]) {
  const findMany = vi.fn().mockResolvedValue(tickets);
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    pushTicket: { findMany, deleteMany },
    pushToken: { updateMany },
  } as unknown as PrismaService;
  return { service: new PushService(prisma), findMany, deleteMany, updateMany };
}

const deletedIds = (deleteMany: ReturnType<typeof vi.fn>) =>
  deleteMany.mock.calls.length === 0
    ? []
    : deleteMany.mock.calls[0]![0].where.id.in;

describe('PushService.receipts', () => {
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

  it('selects only tickets older than 15 minutes, oldest first, at most 1000', async () => {
    const { service, findMany } = harness([]);
    const out = await service.receipts(NOW);
    expect(out).toEqual({ scanned: 0, acted: 0, failed: 0 });
    const arg = findMany.mock.calls[0]![0];
    expect(arg.where.createdAt.lt.getTime()).toBe(
      NOW.getTime() - PushService.RECEIPT_DELAY_MS,
    );
    expect(arg.orderBy).toEqual({ createdAt: 'asc' });
    expect(arg.take).toBe(1000);
    expect(fakePush.calls).toHaveLength(0);
  });

  it('ok → ticket deleted, acted', async () => {
    const { service, deleteMany, updateMany } = harness([
      { id: 'a', tokenId: 't1', createdAt: minutesAgo(20) },
    ]);
    fakePush.receipts = { a: { status: 'ok' } };
    expect(await service.receipts(NOW)).toEqual({
      scanned: 1,
      acted: 1,
      failed: 0,
    });
    expect(deletedIds(deleteMany)).toEqual(['a']);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('DeviceNotRegistered → token disabled, ticket deleted, acted', async () => {
    const { service, deleteMany, updateMany } = harness([
      { id: 'a', tokenId: 't1', createdAt: minutesAgo(20) },
    ]);
    fakePush.receipts = {
      a: { status: 'error', error: 'DeviceNotRegistered', message: 'gone' },
    };
    expect(await service.receipts(NOW)).toEqual({
      scanned: 1,
      acted: 1,
      failed: 0,
    });
    expect(updateMany.mock.calls[0]![0]).toEqual({
      where: { id: { in: ['t1'] } },
      data: { disabledAt: NOW },
    });
    expect(deletedIds(deleteMany)).toEqual(['a']);
  });

  it('InvalidCredentials → counted as failed, logged ONCE for the run, tickets deleted', async () => {
    const { service, deleteMany } = harness([
      { id: 'a', tokenId: 't1', createdAt: minutesAgo(20) },
      { id: 'b', tokenId: 't2', createdAt: minutesAgo(21) },
    ]);
    fakePush.receipts = {
      a: { status: 'error', error: 'InvalidCredentials', message: 'no key' },
      b: { status: 'error', error: 'InvalidCredentials', message: 'no key' },
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await service.receipts(NOW)).toEqual({
      scanned: 2,
      acted: 0,
      failed: 2,
    });
    expect(err).toHaveBeenCalledOnce();
    expect(String(err.mock.calls[0]![0])).toContain('InvalidCredentials');
    expect(deletedIds(deleteMany).sort()).toEqual(['a', 'b']);
    err.mockRestore();
  });

  it('any other error → failed, logged with its message, ticket deleted', async () => {
    const { service, deleteMany } = harness([
      { id: 'a', tokenId: 't1', createdAt: minutesAgo(20) },
    ]);
    fakePush.receipts = {
      a: {
        status: 'error',
        error: 'MessageTooBig',
        message: 'payload 5000 bytes',
      },
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await service.receipts(NOW)).toEqual({
      scanned: 1,
      acted: 0,
      failed: 1,
    });
    expect(err).toHaveBeenCalledOnce();
    expect(deletedIds(deleteMany)).toEqual(['a']);
    err.mockRestore();
  });

  it('absent and younger than 24 h → left for the next run', async () => {
    const { service, deleteMany } = harness([
      { id: 'a', tokenId: 't1', createdAt: minutesAgo(60) },
    ]);
    fakePush.receipts = {};
    expect(await service.receipts(NOW)).toEqual({
      scanned: 1,
      acted: 0,
      failed: 0,
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('absent and older than 24 h → deleted, acted (Expo has cleared it)', async () => {
    const { service, deleteMany } = harness([
      { id: 'a', tokenId: 't1', createdAt: minutesAgo(24 * 60 + 1) },
    ]);
    fakePush.receipts = {};
    expect(await service.receipts(NOW)).toEqual({
      scanned: 1,
      acted: 1,
      failed: 0,
    });
    expect(deletedIds(deleteMany)).toEqual(['a']);
  });
});
