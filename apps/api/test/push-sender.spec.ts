import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetPushSender,
  fakePush,
  pushDriver,
  pushSender,
} from '../src/push/sender.js';
import type { PushMessage } from '../src/push/sender.js';

const message: PushMessage = {
  to: 'ExponentPushToken[abc]',
  title: 'Nouvelle offre reçue',
  body: 'FixLab a proposé 65 €',
  data: {
    notificationId: null,
    type: 'OFFER_RECEIVED',
    mode: 'CLIENT',
    demandeId: 'd1',
    commandeId: null,
    conversationId: null,
  },
};

describe('pushSender driver selection', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    __resetPushSender();
    fakePush.reset();
  });

  afterEach(() => {
    process.env = { ...saved };
    __resetPushSender();
  });

  it('defaults to console when PUSH_DRIVER is unset, and logs instead of sending', async () => {
    delete process.env.PUSH_DRIVER;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(pushDriver()).toBe('console');
    const tickets = await pushSender().send([message]);

    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ status: 'ok' });
    expect((tickets[0] as { id: string }).id).toMatch(/^console:/);
    expect(log).toHaveBeenCalledOnce();
    expect(await pushSender().receipts(['console:x'])).toEqual({});
    log.mockRestore();
  });

  it('treats an unknown value as console', () => {
    process.env.PUSH_DRIVER = 'firebase';
    expect(pushDriver()).toBe('console');
  });

  it('selects the fake, which records the call SYNCHRONOUSLY before any await', () => {
    process.env.PUSH_DRIVER = 'fake';
    const pending = pushSender().send([message]);
    // No await yet - the recorder must already hold the call, or a detached caller could
    // not be asserted without flushing the event loop.
    expect(fakePush.calls).toHaveLength(1);
    expect(fakePush.calls[0]![0]!.to).toBe('ExponentPushToken[abc]');
    return pending.then((tickets) => {
      expect(tickets[0]).toEqual({
        status: 'ok',
        id: 'fake:0:ExponentPushToken[abc]',
      });
    });
  });

  it('the fake answers scripted tickets and scripted receipts, and can reject the whole request', async () => {
    process.env.PUSH_DRIVER = 'fake';
    fakePush.tickets = () => ({
      status: 'error',
      error: 'DeviceNotRegistered',
      message: 'gone',
    });
    expect((await pushSender().send([message]))[0]).toEqual({
      status: 'error',
      error: 'DeviceNotRegistered',
      message: 'gone',
    });

    fakePush.receipts = { t1: { status: 'ok' } };
    expect(await pushSender().receipts(['t1', 't2'])).toEqual({
      t1: { status: 'ok' },
    });

    fakePush.rejectWith = new Error('expo down');
    await expect(pushSender().send([message])).rejects.toThrow('expo down');
  });

  it('selects the Expo sender when PUSH_DRIVER=expo, without needing any credential', () => {
    process.env.PUSH_DRIVER = 'expo';
    delete process.env.EXPO_ACCESS_TOKEN;
    // Constructed, never sent: the key lives on Expo's side, so there is nothing to
    // presence-check here (unlike SMS_DRIVER, which needs four Twilio values).
    expect(pushSender().constructor.name).toBe('ExpoPushSender');
  });

  it('memoises until reset', () => {
    process.env.PUSH_DRIVER = 'fake';
    const a = pushSender();
    process.env.PUSH_DRIVER = 'expo';
    expect(pushSender()).toBe(a);
    __resetPushSender();
    expect(pushSender()).not.toBe(a);
  });
});
