import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REVIEW_EMAIL_SUFFIX,
  assertSameSide,
  isReviewEmail,
  refuseReviewEmailChange,
  sideUserWhere,
} from '../src/review-accounts/review-account.js';
import { __setMailSender, mailSender, type Mail, type MailSender } from '../src/mail/mail.service.js';
import { PushService } from '../src/push/push.service.js';
import { __resetPushSender, fakePush } from '../src/push/sender.js';
import { GENUINE_USER_WHERE } from '../src/admin/admin-constants.js';
import { markerOf } from '../src/admin/admin-users.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * REVIME_APP_PUBLICATION_PREPARATION.md PUB-33, DECP-23 (unit U7): the two store-review accounts.
 *
 * They live in the LIVE database because Apple's and Google's reviewers use the real app. So they are
 * sealed from real accounts both ways, never e-mailed or pushed, kept out of every operator figure,
 * and their e-mail (the only thing that marks them) cannot be changed.
 */

const src = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');

describe('isReviewEmail', () => {
  it('is true only for the review domain, whatever the case', () => {
    expect(REVIEW_EMAIL_SUFFIX).toBe('@review.revime.fr');
    expect(isReviewEmail('review-client@review.revime.fr')).toBe(true);
    expect(isReviewEmail('Review-Repairer@REVIEW.Revime.FR')).toBe(true);
  });

  it('is false for real, demo and look-alike addresses, and for no address', () => {
    for (const e of ['a@revime.fr', 'x@demo.revime.fr', 'x@notreview.revime.fr', 'x@review.revime.fr.evil.com', '', null, undefined]) {
      expect(isReviewEmail(e)).toBe(false);
    }
  });
});

describe('sideUserWhere', () => {
  it('matches only review accounts for a review viewer, and only the rest for a real one', () => {
    expect(sideUserWhere(true)).toEqual({ email: { endsWith: REVIEW_EMAIL_SUFFIX, mode: 'insensitive' } });
    expect(sideUserWhere(false)).toEqual({ email: { not: { endsWith: REVIEW_EMAIL_SUFFIX }, mode: 'insensitive' } });
  });
});

describe('assertSameSide', () => {
  const prismaWith = (emails: Record<string, string>) =>
    ({
      user: {
        findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.filter((id) => id in emails).map((id) => ({ id, email: emails[id] })),
        ),
      },
    }) as unknown as PrismaService;

  it('passes for two real accounts and for two review accounts', async () => {
    const p = prismaWith({ a: 'a@x.fr', b: 'b@x.fr', r1: 'r1@review.revime.fr', r2: 'r2@review.revime.fr' });
    await expect(assertSameSide(p, 'a', 'b')).resolves.toBeUndefined();
    await expect(assertSameSide(p, 'r1', 'r2')).resolves.toBeUndefined();
  });

  it('answers « not found » across the seal, in both directions', async () => {
    const p = prismaWith({ a: 'a@x.fr', r1: 'r1@review.revime.fr' });
    await expect(assertSameSide(p, 'a', 'r1')).rejects.toMatchObject({ status: 404 });
    await expect(assertSameSide(p, 'r1', 'a')).rejects.toMatchObject({ status: 404 });
  });
});

describe('refuseReviewEmailChange', () => {
  it('refuses an e-mail change for a review account and lets any other through', () => {
    expect(() => refuseReviewEmailChange('review-client@review.revime.fr')).toThrow();
    expect(() => refuseReviewEmailChange('a@revime.fr')).not.toThrow();
    expect(() => refuseReviewEmailChange(undefined)).not.toThrow();
  });

  it('is called by the change-email before hook', () => {
    const auth = src('auth/auth.ts');
    const hook = auth.slice(auth.indexOf("ctx.path === '/change-email'"));
    expect(hook.slice(0, 600)).toContain('refuseReviewEmailChange(');
  });
});

describe('mail: never to a review account', () => {
  const sent: Mail[] = [];
  const capture: MailSender = { send: async (m) => void sent.push(m) };
  beforeEach(() => {
    sent.length = 0;
    __setMailSender(capture);
  });
  afterEach(() => __setMailSender(undefined));

  it('drops a mail to a review address and sends any other', async () => {
    await mailSender().send({ to: 'review-client@review.revime.fr', subject: 's', text: 't' });
    await mailSender().send({ to: 'a@revime.fr', subject: 's', text: 't' });
    expect(sent.map((m) => m.to)).toEqual(['a@revime.fr']);
  });
});

describe('push: never to a review account', () => {
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

  it('asks only for tokens whose owner is not a review account', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { pushToken: { findMany } } as unknown as PrismaService;
    await new PushService(prisma).dispatch({
      userId: 'u1', notificationId: null, mode: 'CLIENT', type: 'OFFER_RECEIVED', actorName: 'X',
      subject: 'Y', amountCents: 100, step: null, messagePreview: null, demandeId: 'd', commandeId: null, conversationId: null,
    });
    expect(findMany.mock.calls[0]![0].where).toMatchObject({ userId: 'u1', disabledAt: null, user: sideUserWhere(false) });
  });
});

describe('operator figures and labels', () => {
  it('GENUINE_USER_WHERE leaves review accounts out', () => {
    expect(GENUINE_USER_WHERE.AND).toContainEqual(sideUserWhere(false));
  });

  it('the dashboard labels a review account « review »', () => {
    expect(markerOf('review-client@review.revime.fr')).toBe('review');
    expect(markerOf('a@revime.fr')).toBeNull();
  });
});

/**
 * The seal, site by site. Every read that lists or opens another account's content filters by the
 * viewer's side (`viewerSideWhere`); every write that links two accounts checks both are on the same
 * side (`assertSameSide`). Messages, reports and the payment conversation are not listed: each hangs off
 * a conversation or an offer that one of these sites already sealed.
 */
function body(rel: string, fn: string): string {
  const s = src(rel);
  const start = s.indexOf(`  async ${fn}(`);
  if (start < 0) throw new Error(`${fn} not found in ${rel}`);
  const rest = s.slice(start + 1);
  const next = rest.search(/\n  (?:async |private |public |protected |get |static |[a-zA-Z_]+\()/);
  return next < 0 ? rest : rest.slice(0, next);
}

const SEALED: [file: string, fn: string, helper: 'viewerSideWhere' | 'assertSameSide'][] = [
  ['demandes/demandes.service.ts', 'feed', 'viewerSideWhere'],
  ['demandes/demandes.service.ts', 'browse', 'viewerSideWhere'],
  ['demandes/demandes.service.ts', 'getForViewer', 'viewerSideWhere'],
  ['repairers/repairers.service.ts', 'list', 'viewerSideWhere'],
  ['repairers/repairers.service.ts', 'getPublicProfile', 'assertSameSide'],
  ['offers/offers.service.ts', 'create', 'assertSameSide'],
  ['conversations/conversations.service.ts', 'getOrCreate', 'assertSameSide'],
  ['quote-requests/quote-requests.service.ts', 'create', 'assertSameSide'],
  ['conversations/moderation.service.ts', 'block', 'assertSameSide'],
  ['favorites/favorites.service.ts', 'addRepairer', 'assertSameSide'],
  ['favorites/favorites.service.ts', 'addDemande', 'assertSameSide'],
];

describe('the seal covers every cross-account site', () => {
  for (const [file, fn, helper] of SEALED) {
    it(`${file} ${fn} calls ${helper}`, () => {
      expect(body(file, fn)).toContain(`${helper}(`);
    });
  }

  it('the public profile route passes the viewer, so the seal has someone to compare', () => {
    expect(src('repairers/repairers.controller.ts')).toMatch(/getPublicProfile\(userId, session\.user\.id\)/);
  });
});
