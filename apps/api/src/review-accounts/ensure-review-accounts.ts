import { hashPassword } from 'better-auth/crypto';
import { CURRENT_CGU_VERSION, CURRENT_PRIVACY_VERSION } from '@revime/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import { REVIEW_EMAIL_SUFFIX } from './review-account.js';

/**
 * The self-healing job for the two store-review accounts (REVIME_APP_PUBLICATION_PREPARATION.md PUB-33,
 * DECP-23). A guarded line of the 6-hourly cron (`cron.service.ts`), so nobody has to remember it
 * before a submission, and it survives the handover: the client publishes updates on his own.
 *
 * Each run brings the accounts back to a known starting point:
 * - recreated if a reviewer deleted them (Apple's reviewers routinely test account deletion);
 * - password reset to the value on Render (`REVIEW_CLIENT_PASSWORD`, `REVIEW_REPAIRER_PASSWORD`), only
 *   ever stored here as a hash. An account whose password is not set is NOT created, and counts as failed;
 * - e-mail, phone, CGU, privacy and onboarding re-set, because the app sends an account missing any of
 *   them to « Confirmez votre compte », which needs an SMS to a French mobile no reviewer has;
 * - the sample content restored by fixed ids, so twice is the same as once;
 * - reviewer-made content older than 7 days cleared, never a sample row, and never a demande that
 *   carries an order: deleting a demande cascades to its commandes, and a reviewer may have paid for real.
 *
 * `REVIEW_ACCOUNTS_ENABLED=false` turns the job off and changes nothing else.
 *
 * The finished order is PAID, released and transferred, with every Stripe id set, so none of the cron's
 * money jobs (autoRelease, backfillChargeIds, heldPayouts) ever selects it: the ids are not real and a
 * call to Stripe with them would fail.
 */

export const REVIEW_ACCOUNTS = {
  client: {
    id: 'review-account-client',
    email: `review-client${REVIEW_EMAIL_SUFFIX}`,
    // ARCEP's numbering plan reserves 06 39 98 for fiction and never assigns it (FNDP-39).
    phone: '+33639980001',
    firstName: 'Camille',
    lastName: '(test Revime)',
    username: 'camille_test_revime',
    passwordEnv: 'REVIEW_CLIENT_PASSWORD',
  },
  repairer: {
    id: 'review-account-repairer',
    email: `review-repairer${REVIEW_EMAIL_SUFFIX}`,
    phone: '+33639980002',
    firstName: 'Atelier',
    lastName: 'test Revime',
    username: 'atelier_test_revime',
    passwordEnv: 'REVIEW_REPAIRER_PASSWORD',
  },
} as const;

export const REVIEW_SAMPLE_IDS = {
  openDemande: 'review-sample-demande-open',
  openOffer: 'review-sample-offer-open',
  conversation: 'review-sample-conversation',
  messageFromClient: 'review-sample-message-1',
  messageFromRepairer: 'review-sample-message-2',
  doneDemande: 'review-sample-demande-done',
  doneOffer: 'review-sample-offer-done',
  commande: 'review-sample-commande-done',
  review: 'review-sample-review-done',
} as const;

const CLEANUP_AFTER_MS = 7 * 24 * 3600 * 1000;
/** Fixed in the past, so the finished order reads as an old one and never moves. */
const SAMPLE_PAID_AT = new Date('2026-11-02T10:00:00Z');
const SAMPLE_RELEASED_AT = new Date('2026-11-06T10:00:00Z');
/** The conversation's two messages, fixed so their order never changes. */
const SAMPLE_MESSAGE_AT = [new Date('2026-11-20T09:00:00Z'), new Date('2026-11-20T09:20:00Z')] as const;
const SAMPLE_IDENTITY_VERIFIED_AT = new Date('2026-10-30T10:00:00Z');

type Env = Record<string, string | undefined>;
type Result = { scanned: number; acted: number; failed: number };

export async function ensureReviewAccounts(
  prisma: PrismaService,
  env: Env = process.env,
  now: Date = new Date(),
): Promise<Result> {
  if (env.REVIEW_ACCOUNTS_ENABLED === 'false') return { scanned: 0, acted: 0, failed: 0 };

  const result: Result = { scanned: 2, acted: 0, failed: 0 };
  const client = REVIEW_ACCOUNTS.client;
  const repairer = REVIEW_ACCOUNTS.repairer;

  const ready: string[] = [];
  for (const a of [client, repairer]) {
    const password = env[a.passwordEnv];
    if (!password) {
      console.error('[review-accounts] %s is not set; %s not ensured', a.passwordEnv, a.id);
      result.failed += 1;
      continue;
    }
    await ensureAccount(prisma, a, password, a === repairer, now);
    ready.push(a.id);
    result.acted += 1;
  }
  if (ready.length < 2) return result;

  await ensureSamples(prisma);
  await clearOldReviewerContent(prisma, now);
  return result;
}

async function ensureAccount(
  prisma: PrismaService,
  a: (typeof REVIEW_ACCOUNTS)[keyof typeof REVIEW_ACCOUNTS],
  password: string,
  isRepairer: boolean,
  now: Date,
): Promise<void> {
  const identity = {
    email: a.email,
    name: `${a.firstName} ${a.lastName}`,
    firstName: a.firstName,
    lastName: a.lastName,
    username: a.username,
    phone: a.phone,
    emailVerified: true,
    phoneVerifiedAt: now,
    cguAccepted: true,
    cguAcceptedAt: now,
    cguVersion: CURRENT_CGU_VERSION,
    privacyAccepted: true,
    privacyAcceptedAt: now,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    marketingConsent: false,
  };
  await prisma.user.upsert({ where: { id: a.id }, create: { id: a.id, ...identity }, update: identity });

  const hash = await hashPassword(password);
  const credential = { accountId: a.id, providerId: 'credential', userId: a.id, password: hash };
  await prisma.account.upsert({
    where: { id: `${a.id}-credential` },
    create: { id: `${a.id}-credential`, ...credential },
    update: credential,
  });

  const profile = {
    clientEnabled: true,
    repairerEnabled: isRepairer,
    activeMode: isRepairer ? ('REPAIRER' as const) : ('CLIENT' as const),
    // The repairer's IDENTITY is an operator decision recorded here, not a Stripe Identity check (DECP-23).
    verificationLevel: isRepairer ? ('IDENTITY' as const) : ('BASIC' as const),
    onboardingCompletedAt: now,
    deletedAt: null,
  };
  await prisma.profile.upsert({ where: { userId: a.id }, create: { userId: a.id, ...profile }, update: profile });

  if (isRepairer) {
    const shop = {
      displayName: 'Atelier test Revime',
      kind: 'INDIVIDUAL' as const,
      bio: "Compte de démonstration pour la revue de l'application. Réparations de smartphones et d'ordinateurs.",
      postalCode: '75017',
      lat: 48.8835,
      lng: 2.3219,
    };
    await prisma.repairerProfile.upsert({ where: { userId: a.id }, create: { userId: a.id, ...shop }, update: shop });

    // The profile's « MON IDENTITÉ » card reads this record, not the level: without it the card says
    // « Vérifiez votre identité » and offers « Vérifier », which mints a billed Stripe Identity session.
    // The session id is not a real one. Only the erasure job calls Stripe with it, and only for rows in
    // PROCESSING; a deletion's redaction is best-effort and logs a failure without blocking.
    const identity = {
      stripeSessionId: `vs_review_${a.id}`,
      status: 'VERIFIED' as const,
      verifiedAt: SAMPLE_IDENTITY_VERIFIED_AT,
      lastErrorCode: null,
      decision: null,
      redactionStatus: null,
      erasureRequestedAt: null,
    };
    await prisma.identityVerification.upsert({
      where: { userId: a.id },
      create: { userId: a.id, ...identity },
      update: identity,
    });
  }
}

async function ensureSamples(prisma: PrismaService): Promise<void> {
  const client = REVIEW_ACCOUNTS.client.id;
  const repairer = REVIEW_ACCOUNTS.repairer.id;
  const ids = REVIEW_SAMPLE_IDS;
  const categories = await prisma.category.findMany({
    where: { slug: { in: ['smartphone', 'ordinateur'] } },
    select: { id: true, slug: true },
  });
  const phone = categories.find((c) => c.slug === 'smartphone')?.id;
  const laptop = categories.find((c) => c.slug === 'ordinateur')?.id;
  if (!phone || !laptop) throw new Error('review samples: categories « smartphone » and « ordinateur » are missing');

  const place = { locationLabel: 'Paris 17e', postalCode: '75017', lat: 48.8835, lng: 2.3219 };

  const open = {
    authorUserId: client,
    categoryId: phone,
    title: 'Écran cassé, iPhone 13',
    description: "L'écran est fissuré après une chute et le tactile ne répond plus en bas. Le téléphone s'allume normalement.",
    model: 'iPhone 13',
    status: 'OPEN' as const,
    deletedAt: null,
    hiddenAt: null,
    targetRepairerUserId: null,
    ...place,
  };
  await prisma.demande.upsert({ where: { id: ids.openDemande }, create: { id: ids.openDemande, ...open }, update: open });

  const openOffer = {
    demandeId: ids.openDemande,
    repairerUserId: repairer,
    priceCents: 8900,
    delayHours: 48,
    warrantyLabel: 'Aucune',
    partsLabel: 'Écran compatible neuf',
    status: 'SENT' as const,
  };
  await prisma.offer.upsert({ where: { id: ids.openOffer }, create: { id: ids.openOffer, ...openOffer }, update: openOffer });

  // `lastMessageAt` is what the Messages inbox filters on (`listInbox`); without it the conversation
  // exists but is never listed. The real send path sets it; a seed has to set it itself.
  const conversation = {
    clientUserId: client,
    repairerUserId: repairer,
    demandeId: ids.openDemande,
    lastMessageAt: SAMPLE_MESSAGE_AT[1],
  };
  await prisma.conversation.upsert({
    where: { id: ids.conversation },
    create: { id: ids.conversation, ...conversation },
    update: conversation,
  });
  const messages = [
    { id: ids.messageFromClient, senderUserId: client, body: 'Bonjour, la réparation peut-elle se faire en atelier cette semaine ?' },
    { id: ids.messageFromRepairer, senderUserId: repairer, body: "Bonjour, oui, l'écran est en stock. Comptez 48 heures." },
  ];
  for (const [i, m] of messages.entries()) {
    const row = {
      conversationId: ids.conversation,
      senderUserId: m.senderUserId,
      body: m.body,
      kind: 'USER' as const,
      createdAt: SAMPLE_MESSAGE_AT[i],
    };
    await prisma.message.upsert({ where: { id: m.id }, create: { id: m.id, ...row }, update: row });
  }

  const done = {
    authorUserId: client,
    categoryId: laptop,
    title: 'Batterie MacBook Air',
    description: "La batterie ne tient plus qu'une heure et l'ordinateur s'éteint à 30 %.",
    model: 'MacBook Air M1',
    status: 'DONE' as const,
    deletedAt: null,
    hiddenAt: null,
    targetRepairerUserId: null,
    ...place,
  };
  await prisma.demande.upsert({ where: { id: ids.doneDemande }, create: { id: ids.doneDemande, ...done }, update: done });

  const doneOffer = {
    demandeId: ids.doneDemande,
    repairerUserId: repairer,
    priceCents: 12900,
    delayHours: 72,
    warrantyLabel: 'Aucune',
    partsLabel: 'Batterie compatible neuve',
    status: 'ACCEPTED' as const,
  };
  await prisma.offer.upsert({ where: { id: ids.doneOffer }, create: { id: ids.doneOffer, ...doneOffer }, update: doneOffer });

  const commande = {
    demandeId: ids.doneDemande,
    offerId: ids.doneOffer,
    clientUserId: client,
    repairerUserId: repairer,
    delivery: 'WORKSHOP' as const,
    repairCents: 12900,
    shippingCents: 0,
    protectionCents: 500,
    totalCents: 13400,
    status: 'PAID' as const,
    // The order screen reads `step`, not `status`: a null step shows « en attente de paiement ».
    // RELEASED is not selected by autoRelease (AWAITING_VALIDATION) nor heldPayouts (no transfer).
    step: 'RELEASED' as const,
    // Not real Stripe objects. Every one is set so no money job selects this row (see the header).
    stripePaymentIntentId: 'pi_review_sample_done',
    stripeChargeId: 'ch_review_sample_done',
    stripeTransferId: 'tr_review_sample_done',
    transferredCents: 12900,
    paidAt: SAMPLE_PAID_AT,
    releasedAt: SAMPLE_RELEASED_AT,
    transferredAt: SAMPLE_RELEASED_AT,
  };
  await prisma.commande.upsert({ where: { id: ids.commande }, create: { id: ids.commande, ...commande }, update: commande });

  const review = {
    commandeId: ids.commande,
    authorUserId: client,
    repairerUserId: repairer,
    rating: 5,
    comment: 'Réparation rapide et soignée, je recommande.',
  };
  await prisma.review.upsert({ where: { id: ids.review }, create: { id: ids.review, ...review }, update: review });
}

async function clearOldReviewerContent(prisma: PrismaService, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - CLEANUP_AFTER_MS);
  const accounts = [REVIEW_ACCOUNTS.client.id, REVIEW_ACCOUNTS.repairer.id];
  const ids = REVIEW_SAMPLE_IDS;
  await prisma.demande.deleteMany({
    where: {
      author: { email: { endsWith: REVIEW_EMAIL_SUFFIX, mode: 'insensitive' } },
      id: { notIn: [ids.openDemande, ids.doneDemande] },
      createdAt: { lt: cutoff },
      // A cascade would take its orders with it, and a reviewer may have paid for real.
      commandes: { none: {} },
    },
  });
  await prisma.offer.deleteMany({
    where: {
      repairerUserId: { in: accounts },
      id: { notIn: [ids.openOffer, ids.doneOffer] },
      createdAt: { lt: cutoff },
      commandes: { none: {} },
    },
  });
  await prisma.message.deleteMany({
    where: {
      senderUserId: { in: accounts },
      id: { notIn: [ids.messageFromClient, ids.messageFromRepairer] },
      createdAt: { lt: cutoff },
    },
  });
}
