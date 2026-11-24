import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { PushService } from '../src/push/push.service.js';

/**
 * `CF-47`. The preference guard at `emit()`.
 *
 * Three properties are pinned here and each closes a different hole:
 *  1. each group suppresses EXACTLY its own types and nothing else;
 *  2. `MESSAGE_RECEIVED` suppression skips the fold path too, not just the insert;
 *  3. a FAILING preference read still sends. That last one is the one worth having:
 *     `emit()` is called inside the Stripe webhook, and a database hiccup must not
 *     silently mute a payment notification.
 */

const USER = '11111111-1111-4111-8111-111111111111';

type Prefs = {
  notifyOffers: boolean;
  notifyMessages: boolean;
  notifyCommandes: boolean;
};

const ALL_ON: Prefs = {
  notifyOffers: true,
  notifyMessages: true,
  notifyCommandes: true,
};

function harness(prefs: Prefs | 'throws' = ALL_ON) {
  const create = vi.fn().mockResolvedValue({ id: 'n1' });
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const findFirst = vi
    .fn()
    .mockImplementation(() =>
      prefs === 'throws'
        ? Promise.reject(new Error('connection lost'))
        : Promise.resolve(prefs),
    );

  const prisma = {
    profile: { findFirst },
    notification: { create, updateMany },
  };

  const dispatch = vi.fn().mockResolvedValue(undefined);
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    { dispatch } as unknown as PushService,
  );
  return { service, create, updateMany, findFirst, dispatch };
}

const OFFER_TYPES = [
  'OFFER_RECEIVED',
  'OFFER_ACCEPTED',
  'OFFER_DECLINED',
] as const;
const COMMANDE_TYPES = [
  'COMMANDE_STEP',
  'FUNDS_RELEASED',
  'COMMANDE_REFUNDED',
  'PAYMENT_ABANDONED',
  'PARCEL_LABEL_READY',
  'PARCEL_SHIPPED',
  'PARCEL_OUT_FOR_DELIVERY',
  'PARCEL_AT_PICKUP_POINT',
  'PARCEL_DELIVERED',
  'PARCEL_INCIDENT',
] as const;

describe('NotificationsService.emit - preference guard', () => {
  it('sends every type when all three groups are on', async () => {
    const { service, create } = harness();

    for (const type of [...OFFER_TYPES, ...COMMANDE_TYPES]) {
      await service.emit({ userId: USER, mode: 'CLIENT', type });
    }

    // Derived, not hardcoded: Livraison Boxtal added six commande-group types and the literal 7 hid it.
    expect(create).toHaveBeenCalledTimes(
      OFFER_TYPES.length + COMMANDE_TYPES.length,
    );
  });

  it('notifyOffers=false suppresses the three offer types and nothing else', async () => {
    const { service, create } = harness({ ...ALL_ON, notifyOffers: false });

    for (const type of OFFER_TYPES) {
      await service.emit({ userId: USER, mode: 'CLIENT', type });
    }
    expect(create).not.toHaveBeenCalled();

    for (const type of COMMANDE_TYPES) {
      await service.emit({ userId: USER, mode: 'CLIENT', type });
    }
    expect(create).toHaveBeenCalledTimes(COMMANDE_TYPES.length);
  });

  it('notifyCommandes=false suppresses every commande type and nothing else', async () => {
    const { service, create } = harness({ ...ALL_ON, notifyCommandes: false });

    for (const type of COMMANDE_TYPES) {
      await service.emit({ userId: USER, mode: 'CLIENT', type });
    }
    expect(create).not.toHaveBeenCalled();

    for (const type of OFFER_TYPES) {
      await service.emit({ userId: USER, mode: 'CLIENT', type });
    }
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('notifyMessages=false skips the FOLD path as well as the insert', async () => {
    const { service, create, updateMany } = harness({
      ...ALL_ON,
      notifyMessages: false,
    });

    await service.emit({
      userId: USER,
      mode: 'CLIENT',
      type: 'MESSAGE_RECEIVED',
      conversationId: 'c1',
      messageId: 'm1',
    });

    expect(create).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('FAILS OPEN: a preference read that throws still sends the notification', async () => {
    const { service, create } = harness('throws');

    await service.emit({
      userId: USER,
      mode: 'CLIENT',
      type: 'FUNDS_RELEASED',
    });

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('still never throws, whatever the preference read does', async () => {
    const { service } = harness('throws');

    await expect(
      service.emit({ userId: USER, mode: 'CLIENT', type: 'COMMANDE_STEP' }),
    ).resolves.toBeUndefined();
  });

  it('a muted group dispatches NO push either - the preference is checked once, before both', async () => {
    const { service, dispatch } = harness({
      notifyOffers: false,
      notifyMessages: true,
      notifyCommandes: true,
    });
    await service.emit({
      userId: USER,
      mode: 'CLIENT',
      type: 'OFFER_RECEIVED',
    });
    expect(dispatch).not.toHaveBeenCalled();
    await service.emit({
      userId: USER,
      mode: 'CLIENT',
      type: 'FUNDS_RELEASED',
    });
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
