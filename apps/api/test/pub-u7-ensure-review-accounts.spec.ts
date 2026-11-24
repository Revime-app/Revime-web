import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { verifyPassword } from 'better-auth/crypto';
import { CURRENT_CGU_VERSION, CURRENT_PRIVACY_VERSION } from '@revime/shared';
import {
  REVIEW_ACCOUNTS,
  REVIEW_SAMPLE_IDS,
  ensureReviewAccounts,
} from '../src/review-accounts/ensure-review-accounts.js';
import { isReviewEmail } from '../src/review-accounts/review-account.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * REVIME_APP_PUBLICATION_PREPARATION.md PUB-33, DECP-23 (unit U7): the self-healing job.
 *
 * Every 6 hours the cron brings the two store-review accounts back to a known starting point: recreated
 * if a reviewer deleted them, password reset to the value on Render, every verification re-set so a
 * reviewer never meets an SMS, the sample content restored by fixed ids, and reviewer-made content
 * older than 7 days cleared. Run against a fake Prisma that keeps rows by id, so « twice is the same as
 * once » is checked on the stored rows, not on the calls.
 */

type Row = Record<string, unknown> & { id: string };

function fakePrisma() {
  const tables = new Map<string, Map<string, Row>>();
  const deletes: { model: string; where: unknown }[] = [];
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  const model = (name: string) => ({
    upsert: async ({ where, create, update }: { where: { id?: string; userId?: string }; create: Row; update: Row }) => {
      const key = String(where.id ?? where.userId);
      const t = table(name);
      const row = t.has(key) ? { ...t.get(key)!, ...update } : { ...create };
      t.set(key, row as Row);
      return row;
    },
    deleteMany: async ({ where }: { where: unknown }) => {
      deletes.push({ model: name, where });
      return { count: 0 };
    },
  });
  const prisma = {
    user: model('user'),
    account: model('account'),
    profile: model('profile'),
    repairerProfile: model('repairerProfile'),
    demande: model('demande'),
    offer: model('offer'),
    conversation: model('conversation'),
    message: model('message'),
    commande: model('commande'),
    review: model('review'),
    identityVerification: model('identityVerification'),
    category: {
      findMany: async () => [
        { id: 'cat-phone', slug: 'smartphone' },
        { id: 'cat-laptop', slug: 'ordinateur' },
      ],
    },
  } as unknown as PrismaService;
  return { prisma, tables, deletes, row: (t: string, id: string) => table(t).get(id) };
}

const ENV = {
  REVIEW_CLIENT_PASSWORD: 'client-password-long-enough-1',
  REVIEW_REPAIRER_PASSWORD: 'repairer-password-long-enough-2',
};
const NOW = new Date('2026-12-01T10:00:00Z');

describe('the two accounts', () => {
  it('are on the review domain, with phones from ARCEP fiction range', () => {
    expect(isReviewEmail(REVIEW_ACCOUNTS.client.email)).toBe(true);
    expect(isReviewEmail(REVIEW_ACCOUNTS.repairer.email)).toBe(true);
    expect(REVIEW_ACCOUNTS.client.phone).toBe('+33639980001');
    expect(REVIEW_ACCOUNTS.repairer.phone).toBe('+33639980002');
  });

  it('are created fully verified, so the app never asks a reviewer for an SMS', async () => {
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    for (const a of [REVIEW_ACCOUNTS.client, REVIEW_ACCOUNTS.repairer]) {
      const u = f.row('user', a.id)!;
      expect(u).toMatchObject({ email: a.email, phone: a.phone, emailVerified: true, cguAccepted: true, privacyAccepted: true });
      expect(u.phoneVerifiedAt).toEqual(NOW);
      expect(u.cguVersion).toBe(CURRENT_CGU_VERSION);
      expect(u.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
      expect(f.row('profile', a.id)).toMatchObject({ onboardingCompletedAt: NOW, deletedAt: null });
    }
  });

  it('gives the client BASIC and the repairer IDENTITY as an individual in réparateur mode', async () => {
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    expect(f.row('profile', REVIEW_ACCOUNTS.client.id)).toMatchObject({ verificationLevel: 'BASIC', repairerEnabled: false });
    expect(f.row('profile', REVIEW_ACCOUNTS.repairer.id)).toMatchObject({ verificationLevel: 'IDENTITY', repairerEnabled: true });
    expect(f.row('repairerProfile', REVIEW_ACCOUNTS.repairer.id)).toMatchObject({ kind: 'INDIVIDUAL', displayName: 'Atelier test Revime' });
  });

  it('stores a password hash of the value on Render, never the value itself', async () => {
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    const acc = f.row('account', `${REVIEW_ACCOUNTS.client.id}-credential`)!;
    expect(acc).toMatchObject({ providerId: 'credential', userId: REVIEW_ACCOUNTS.client.id });
    expect(acc.password).not.toBe(ENV.REVIEW_CLIENT_PASSWORD);
    expect(await verifyPassword({ hash: String(acc.password), password: ENV.REVIEW_CLIENT_PASSWORD })).toBe(true);
  });
});

describe('self-healing', () => {
  it('resets a changed password and lost verifications on the next run', async () => {
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    f.row('user', REVIEW_ACCOUNTS.client.id)!.phoneVerifiedAt = null;
    f.row('account', `${REVIEW_ACCOUNTS.client.id}-credential`)!.password = 'changed-by-a-reviewer';
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    expect(f.row('user', REVIEW_ACCOUNTS.client.id)!.phoneVerifiedAt).toEqual(NOW);
    const acc = f.row('account', `${REVIEW_ACCOUNTS.client.id}-credential`)!;
    expect(await verifyPassword({ hash: String(acc.password), password: ENV.REVIEW_CLIENT_PASSWORD })).toBe(true);
  });

  it('twice is the same as once: fixed ids, no duplicate sample rows', async () => {
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    const counts = () => Object.fromEntries([...f.tables].map(([k, v]) => [k, v.size]));
    const first = counts();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    expect(counts()).toEqual(first);
  });

  it('clears reviewer-made content older than 7 days, and never a sample row', async () => {
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    const demandeDelete = f.deletes.find((d) => d.model === 'demande');
    expect(demandeDelete).toBeTruthy();
    const json = JSON.stringify(demandeDelete!.where);
    expect(json).toContain(REVIEW_SAMPLE_IDS.openDemande);
    expect(json).toContain(REVIEW_SAMPLE_IDS.doneDemande);
    expect(json).toContain(new Date(NOW.getTime() - 7 * 24 * 3600 * 1000).toISOString());
    expect(json).toContain('@review.revime.fr');
  });
});

describe('the sample content', () => {
  it('holds an open demande with an offer ready to pay', async () => {
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    expect(f.row('demande', REVIEW_SAMPLE_IDS.openDemande)).toMatchObject({
      authorUserId: REVIEW_ACCOUNTS.client.id, status: 'OPEN', categoryId: 'cat-phone', title: 'Écran cassé, iPhone 13', deletedAt: null, hiddenAt: null,
    });
    expect(f.row('offer', REVIEW_SAMPLE_IDS.openOffer)).toMatchObject({
      demandeId: REVIEW_SAMPLE_IDS.openDemande, repairerUserId: REVIEW_ACCOUNTS.repairer.id, status: 'SENT', warrantyLabel: 'Aucune',
    });
  });

  it('holds a two-message conversation between the two accounts', async () => {
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    expect(f.row('conversation', REVIEW_SAMPLE_IDS.conversation)).toMatchObject({
      clientUserId: REVIEW_ACCOUNTS.client.id, repairerUserId: REVIEW_ACCOUNTS.repairer.id, demandeId: REVIEW_SAMPLE_IDS.openDemande,
    });
    expect(f.tables.get('message')!.size).toBe(2);
  });

  it('is listed in the Messages inbox, which only shows conversations with a lastMessageAt', async () => {
    // Found on the emulator 2026-11-23: « Aucune conversation » because the seed wrote the messages
    // directly and never set what `listInbox` filters on (`lastMessageAt: { not: null }`).
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    const conv = f.row('conversation', REVIEW_SAMPLE_IDS.conversation)!;
    const last = f.row('message', 'review-sample-message-2')!;
    expect(conv.lastMessageAt).toBeInstanceOf(Date);
    expect(last.createdAt).toEqual(conv.lastMessageAt);
    expect((f.row('message', 'review-sample-message-1')!.createdAt as Date).getTime()).toBeLessThan((conv.lastMessageAt as Date).getTime());
  });

  it('holds a finished order no money job will ever pick up', async () => {
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    const c = f.row('commande', REVIEW_SAMPLE_IDS.commande)!;
    // PAID, released and transferred: autoRelease, heldPayouts and backfillChargeIds all skip it.
    // `step: 'RELEASED'`: the order screen shows « en attente de paiement » for any order whose step
    // is null (found on the emulator 2026-11-23), whatever its status.
    expect(c).toMatchObject({ status: 'PAID', step: 'RELEASED', demandeId: REVIEW_SAMPLE_IDS.doneDemande, offerId: REVIEW_SAMPLE_IDS.doneOffer });
    expect(c.releasedAt).toBeInstanceOf(Date);
    for (const k of ['stripePaymentIntentId', 'stripeChargeId', 'stripeTransferId']) expect(c[k]).toEqual(expect.any(String));
    expect(f.row('demande', REVIEW_SAMPLE_IDS.doneDemande)).toMatchObject({ status: 'DONE', categoryId: 'cat-laptop' });
    expect(f.row('review', REVIEW_SAMPLE_IDS.review)).toMatchObject({ commandeId: REVIEW_SAMPLE_IDS.commande, rating: 5 });
  });
});

describe('the repairer identity card', () => {
  it('reads « Identité vérifiée », with no button that would start a real Stripe Identity session', async () => {
    // Found on the emulator 2026-11-23: the profile's « MON IDENTITÉ » card reads the Stripe
    // Identity record, not the level, so with none it said « Vérifiez votre identité » and offered
    // « Vérifier », which mints a billed Stripe session. The session id is not a real one: only the
    // erasure job calls Stripe with it, and only for rows in PROCESSING.
    const f = fakePrisma();
    await ensureReviewAccounts(f.prisma, ENV, NOW);
    const idv = f.row('identityVerification', REVIEW_ACCOUNTS.repairer.id)!;
    expect(idv).toMatchObject({ userId: REVIEW_ACCOUNTS.repairer.id, status: 'VERIFIED', decision: null, redactionStatus: null });
    expect(idv.verifiedAt).toBeInstanceOf(Date);
    expect(String(idv.stripeSessionId)).toMatch(/^vs_review_/);
    expect(f.row('identityVerification', REVIEW_ACCOUNTS.client.id)).toBeUndefined();
  });
});

describe('the switch and missing settings', () => {
  it('does nothing when REVIEW_ACCOUNTS_ENABLED is false', async () => {
    const f = fakePrisma();
    const r = await ensureReviewAccounts(f.prisma, { ...ENV, REVIEW_ACCOUNTS_ENABLED: 'false' }, NOW);
    expect(r).toEqual({ scanned: 0, acted: 0, failed: 0 });
    expect(f.tables.size).toBe(0);
  });

  it('never creates an account without its password, and says so', async () => {
    const f = fakePrisma();
    const r = await ensureReviewAccounts(f.prisma, { REVIEW_CLIENT_PASSWORD: ENV.REVIEW_CLIENT_PASSWORD }, NOW);
    expect(r.failed).toBeGreaterThan(0);
    expect(f.row('user', REVIEW_ACCOUNTS.repairer.id)).toBeUndefined();
  });
});

describe('wiring', () => {
  it('runs as a guarded job in the 6-hourly cron', () => {
    const cron = readFileSync(fileURLToPath(new URL('../src/cron/cron.service.ts', import.meta.url)), 'utf8');
    expect(cron).toMatch(/this\.guard\('ensureReviewAccounts', \(\) => ensureReviewAccounts\(this\.prisma\)\)/);
  });
});
