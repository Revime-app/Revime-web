import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { ConversationsService } from '../src/conversations/conversations.service.js';
import type { ConsentProofsService } from '../src/compliance/consent-proofs.service.js';
import {
  CURRENT_WITHDRAWAL_WAIVER_VERSION,
  LEGAL_WITHDRAWAL_WAIVER_TEXT,
} from '@revime/shared';
import { __resetPaymentsGateway } from '../src/payments/gateway.js';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const REPAIRER = '22222222-2222-4222-8222-222222222222';
const OFFER = '44444444-4444-4444-8444-444444444444';
const DEMANDE = '55555555-5555-4555-8555-555555555555';
const COMMANDE = '66666666-6666-4666-8666-666666666666';

const KEYS = [
  'PAYMENTS_ENABLED',
  'STRIPE_DRIVER',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PUBLIC_API_URL',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.PUBLIC_API_URL = 'http://localhost:3002';
  __resetPaymentsGateway();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __resetPaymentsGateway();
});

function setupMocks(options: { isPro?: boolean } = {}) {
  const isPro = options.isPro ?? true;
  const offerFindFirst = vi.fn().mockResolvedValue({
    id: OFFER,
    status: 'SENT',
    priceCents: 5000,
    acceptsParcel: false,
    repairerUserId: REPAIRER,
    demandeId: DEMANDE,
    demande: { status: 'OPEN', author: { email: 'client@example.test' } },
    repairer: {
      profile: {
        verificationLevel: isPro ? 'BUSINESS' : 'NONE',
        repairerSuspendedAt: null,
      },
    },
  });

  const commandeCreate = vi.fn().mockResolvedValue({ id: COMMANDE });
  const commandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    offer: { findFirst: offerFindFirst },
    commande: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: commandeCreate,
      updateMany: commandeUpdateMany,
    },
  } as unknown as PrismaService;

  const notifications = { emit: vi.fn() } as unknown as NotificationsService;
  const conversations = { openForPayment: vi.fn() } as unknown as ConversationsService;
  const consentProofs = {
    recordProof: vi.fn().mockResolvedValue({ id: 'proof-123' }),
  } as unknown as ConsentProofsService;

  return { prisma, notifications, conversations, consentProofs, commandeCreate, commandeUpdateMany };
}

describe('PaymentsService Consent Proof Integration', () => {
  it('records WITHDRAWAL_WAIVER_IMMEDIATE when paying a pro repairer with IMMEDIATE delay preference', async () => {
    const { prisma, notifications, conversations, consentProofs } = setupMocks({ isPro: true });
    const service = new PaymentsService(prisma, notifications, conversations, consentProofs);

    const acceptedAtStr = '2026-10-11T10:00:00.000Z';
    const result = await service.createCheckout(CLIENT, OFFER, {
      delivery: 'WORKSHOP',
      delayPreference: 'IMMEDIATE',
      withdrawalWaiver: {
        accepted: true,
        acceptedAt: acceptedAtStr,
        acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
      },
    });

    expect(result.commandeId).toBe(COMMANDE);
    expect(consentProofs.recordProof).toHaveBeenCalledTimes(1);
    expect(consentProofs.recordProof).toHaveBeenCalledWith({
      userId: CLIENT,
      kind: 'WITHDRAWAL_WAIVER_IMMEDIATE',
      commandeId: COMMANDE,
      waiverTextVersion: CURRENT_WITHDRAWAL_WAIVER_VERSION,
      legalTextSnapshot: LEGAL_WITHDRAWAL_WAIVER_TEXT,
      actionProof: 'CHECKBOX_TICKED_AND_CHECKOUT_SUBMITTED',
      // No `timestamp`: the proof is stamped with the SERVER's clock. The device's claim is kept
      // as data, not used as the evidence time.
      metadata: {
        offerId: OFFER,
        priceCents: 5000,
        delivery: 'WORKSHOP',
        isPro: true,
        clientAcceptedAt: acceptedAtStr,
      },
    });
  });

  it('abandons the commande at once when the proof cannot be recorded, so a retry is not locked out', async () => {
    const { prisma, notifications, conversations, consentProofs, commandeUpdateMany } = setupMocks({ isPro: true });
    (consentProofs.recordProof as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    const service = new PaymentsService(prisma, notifications, conversations, consentProofs);

    await expect(
      service.createCheckout(CLIENT, OFFER, {
        delivery: 'WORKSHOP',
        delayPreference: 'IMMEDIATE',
        withdrawalWaiver: {
          accepted: true,
          acceptedAt: '2026-10-11T10:00:00.000Z',
          acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
        },
      }),
    ).rejects.toThrow('db down');

    expect(commandeUpdateMany).toHaveBeenCalledWith({
      where: { id: COMMANDE, status: 'PENDING_PAYMENT' },
      data: { status: 'ABANDONED' },
    });
  });

  it('records WITHDRAWAL_WAIVER_WAIT_14_DAYS when choosing WAIT_14_DAYS delay preference', async () => {
    const { prisma, notifications, conversations, consentProofs } = setupMocks({ isPro: true });
    const service = new PaymentsService(prisma, notifications, conversations, consentProofs);

    const result = await service.createCheckout(CLIENT, OFFER, {
      delivery: 'WORKSHOP',
      delayPreference: 'WAIT_14_DAYS',
      withdrawalWaiver: null,
    });

    expect(result.commandeId).toBe(COMMANDE);
    expect(consentProofs.recordProof).toHaveBeenCalledTimes(1);
    expect(consentProofs.recordProof).toHaveBeenCalledWith({
      userId: CLIENT,
      kind: 'WITHDRAWAL_WAIVER_WAIT_14_DAYS',
      commandeId: COMMANDE,
      waiverTextVersion: CURRENT_WITHDRAWAL_WAIVER_VERSION,
      legalTextSnapshot:
        "L'utilisateur a choisi d'attendre l'expiration du délai légal de rétractation de 14 jours avant le début de la prestation.",
      actionProof: 'TOGGLE_WAIT_14_DAYS_SELECTED',
      metadata: {
        offerId: OFFER,
        priceCents: 5000,
        delivery: 'WORKSHOP',
        isPro: true,
      },
    });
  });

  it('does not record a withdrawal waiver when paying an individual (non-pro) repairer with IMMEDIATE delay preference', async () => {
    const { prisma, notifications, conversations, consentProofs } = setupMocks({ isPro: false });
    const service = new PaymentsService(prisma, notifications, conversations, consentProofs);

    const result = await service.createCheckout(CLIENT, OFFER, {
      delivery: 'WORKSHOP',
      delayPreference: 'IMMEDIATE',
    });

    expect(result.commandeId).toBe(COMMANDE);
    expect(consentProofs.recordProof).not.toHaveBeenCalled();
  });
});
