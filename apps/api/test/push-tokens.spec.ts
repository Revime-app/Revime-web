import { describe, expect, it, vi } from 'vitest';
import { PushService } from '../src/push/push.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/** Spec §3.1 and §7: the token is unique alone, so registration REASSIGNS; unregister is scoped. */
describe('PushService.register / unregister', () => {
  function harness() {
    const upsert = vi.fn().mockResolvedValue({});
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      pushToken: { upsert, deleteMany },
    } as unknown as PrismaService;
    return { service: new PushService(prisma), upsert, deleteMany };
  }

  it('upserts on the TOKEN, creating for this user or reassigning to him, and re-enables', async () => {
    const { service, upsert } = harness();
    await service.register('bob', {
      token: 'ExponentPushToken[abc]',
      platform: 'IOS',
    });

    expect(upsert).toHaveBeenCalledOnce();
    const arg = upsert.mock.calls[0]![0];
    expect(arg.where).toEqual({ token: 'ExponentPushToken[abc]' });
    expect(arg.create).toEqual({
      userId: 'bob',
      token: 'ExponentPushToken[abc]',
      platform: 'IOS',
      soundChannel: null,
    });
    expect(arg.update).toMatchObject({
      userId: 'bob',
      platform: 'IOS',
      disabledAt: null,
    });
    expect(arg.update.lastSeenAt).toBeInstanceOf(Date);
  });

  it("unregister deletes ONLY the caller's row for that token, and zero rows is not an error", async () => {
    const { service, deleteMany } = harness();
    await expect(
      service.unregister('alice', 'ExponentPushToken[abc]'),
    ).resolves.toBeUndefined();
    expect(deleteMany).toHaveBeenCalledOnce();
    expect(deleteMany.mock.calls[0]![0].where).toEqual({
      token: 'ExponentPushToken[abc]',
      userId: 'alice',
    });
  });
});
