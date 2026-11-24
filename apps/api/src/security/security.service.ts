import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { isAPIError } from 'better-auth/api';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import {
  deletionRule,
  isStaffRole,
  STEP_UP_COPY,
  STEP_UP_REQUIRED_MESSAGE_FR,
  type StepUpAppleInput,
  type StepUpMethod,
  type StepUpMethodResponse,
  type StepUpProvider,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminAlertsService, type CreateAdminAlertInput } from '../admin/admin-alerts.service.js';
import { mailSender, type MailSender } from '../mail/mail.service.js';
import { renderStaffSecuredAlertEmail } from '../mail/security-email.template.js';
import { createAuthThrottleDeps, recordCodeFailure, throttleKey, type LockedAccount, type ThrottleDeps } from '../auth/throttle/index.js';
import { THROTTLE_RULES } from '../auth/throttle/policy.js';
import { adminLinkOrigin } from '../auth/admin-origins.js';
import { createNotMeUrl, createResetUrl, NOT_ME_PREFIX, prismaVerificationWriter, RESET_CALLBACK_URL } from '../auth/throttle/links.js';
import { buildAppleIdTokenVerifier } from '../auth/social-providers.js';
import { GOOGLE_LINKED_PREFIX } from './google-step-up-link.js';
import type { ProviderConfirmation } from '../auth/provider-revocation/provider-revocation.service.js';

/** How long a confirmed password (or code) opens the sensitive actions, on that session only (Q7). */
export const STEP_UP_WINDOW_MS = 10 * 60 * 1000;
const STEP_UP_CODE_TTL_MS = 10 * 60 * 1000;
const STEP_UP_CODE_PREFIX = 'step-up:';
/** V9 U3. The session's Apple / Google confirmation, read (and consumed) by the deletion. */
const PROVIDER_CONFIRMATION_PREFIX = 'step-up-provider:';
/** V9 U3. When this session started a Google confirmation; Better Auth's row refresh must come after. */
const GOOGLE_START_PREFIX = 'step-up-google-start:';

export type SecurityDeps = {
  throttle: ThrottleDeps;
  alerts: { raise(input: CreateAdminAlertInput): Promise<void> };
  mailer: () => MailSender;
  /** Better Auth's own reset request, so the e-mail and the link are the ones « Mot de passe oublié » sends. */
  requestPasswordReset: (email: string) => Promise<void>;
  clock: () => Date;
  /** `https://<host>`, for the « Ce n'est pas moi » page. */
  apiOrigin: string;
  /** `https://<host>/api/auth`, for reset links. */
  authBaseURL: string;
  /** V9 U3. Better Auth's Apple id-token check (signature, issuer, audience, age); null without Apple. */
  appleVerifier?: ((token: string) => Promise<boolean>) | null;
};

export const SECURITY_DEPS = 'SECURITY_DEPS';

type StepUpSession = { userId: string; sessionId: string; email: string };

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * V7 A11 (U2b). « Ce n'est pas moi » and the step-up (CLIENT_FEEDBACK_V7.md §4 A11, U2b round):
 * - `notMe` signs out every session, forgets devices and push tokens, voids the password and sends
 *   the standard reset e-mail; a Google / Apple-only account is only signed out (Q4, Q13);
 * - the step-up stamps `Session.stepUpAt` after the password, or an e-mailed code for an account
 *   with none; it opens IBAN change, account deletion and e-mail change for 10 minutes (Q6, Q7).
 * Wrong passwords count on the U2 login lock, wrong codes on the code lock.
 */
@Injectable()
export class SecurityService {
  private readonly deps: SecurityDeps;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(SECURITY_DEPS) deps?: SecurityDeps,
  ) {
    this.deps = deps ?? defaultDeps(prisma);
  }

  // ---- « Ce n'est pas moi » ----------------------------------------------------------------

  /** For the confirmation page: reads, never consumes, so a mail scanner opening the link is harmless (Q5). */
  async checkNotMeToken(token: string): Promise<boolean> {
    return (await this.validNotMeRow(token)) !== null;
  }

  async notMe(token: string): Promise<{ ok: false } | { ok: true; hadPassword: boolean }> {
    const row = await this.validNotMeRow(token);
    if (!row) return { ok: false };
    // Single use, and the delete is the claim: of two clicks at once only one counts a row.
    const claimed = await this.prisma.verification.deleteMany({ where: { identifier: `${NOT_ME_PREFIX}${token}` } });
    if (claimed.count === 0) return { ok: false };

    const user = await this.prisma.user.findUnique({
      where: { id: row.value },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) return { ok: false };

    const now = this.deps.clock();
    const voided = await hashPassword(randomBytes(32).toString('hex'));
    const [, , , accounts] = await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
      this.prisma.knownDevice.deleteMany({ where: { userId: user.id } }),
      this.prisma.pushToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.account.updateMany({ where: { userId: user.id, providerId: 'credential' }, data: { password: voided } }),
    ]);
    const hadPassword = (accounts as { count: number }).count > 0;

    await step('history row', () =>
      this.prisma.authLockEvent.create({
        data: { kind: 'SECURED', scope: 'LOGIN_ACCOUNT', key: throttleKey(user.email), userId: user.id, level: 0, lockedUntil: now },
      }),
    );
    if (hadPassword) await step('reset e-mail', () => this.deps.requestPasswordReset(user.email));

    const staff = isStaffRole(user.role);
    await step('alert', () =>
      this.deps.alerts.raise({
        type: 'ACCOUNT_SECURED',
        severity: staff ? 'CRITICAL' : 'HIGH',
        title: 'Compte sécurisé par l’utilisateur',
        message: `${user.email}${staff ? ` (équipe, ${user.role})` : ''} a répondu « Ce n'est pas moi » : tous ses appareils sont déconnectés${
          hadPassword ? ' et son mot de passe doit être changé' : ''
        }.`,
        targetType: 'User',
        targetId: user.id,
        link: `/utilisateurs/${user.id}`,
        metadata: { hadPassword },
      }),
    );
    if (staff) {
      await step('super admin e-mails', async () => {
        const superAdmins = await this.prisma.user.findMany({
          where: { role: 'super_admin', OR: [{ banned: false }, { banned: null }] },
          select: { email: true, name: true },
        });
        const { subject, html, text } = renderStaffSecuredAlertEmail({
          staffEmail: user.email,
          staffName: user.name,
          role: user.role!,
          at: now,
          sheetUrl: `${adminLinkOrigin()}/utilisateurs/${user.id}`,
        });
        for (const admin of superAdmins) {
          await step(`super admin e-mail to ${admin.email}`, () => this.deps.mailer().send({ to: admin.email, subject, html, text }));
        }
      });
    }
    return { ok: true, hadPassword };
  }

  private async validNotMeRow(token: string) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
    const row = await this.prisma.verification.findFirst({ where: { identifier: `${NOT_ME_PREFIX}${token}` } });
    if (!row || row.expiresAt.getTime() <= this.deps.clock().getTime()) return null;
    return row;
  }

  // ---- step-up -----------------------------------------------------------------------------

  async method(userId: string): Promise<StepUpMethod> {
    return (await this.passwordHash(userId)) ? 'PASSWORD' : 'EMAIL_CODE';
  }

  /** V9 U3. `method` unchanged for installed builds; the new sheet reads `providers` and `hasPassword`. */
  async methodResponse(userId: string): Promise<StepUpMethodResponse> {
    const { providers, hasPassword } = await this.links(userId);
    return { method: hasPassword ? 'PASSWORD' : 'EMAIL_CODE', providers, hasPassword };
  }

  /**
   * V9 U3 (`DEC9-09` (1), (8)). The native Apple sheet's token, checked by Better Auth's own verifier, must
   * be this account's Apple id. The authorization code is kept with the confirmation, for the deletion's
   * revocation (single use, valid minutes).
   */
  async withApple(session: StepUpSession, input: StepUpAppleInput): Promise<void> {
    const verify = this.deps.appleVerifier ?? null;
    if (!verify) throw new AppException('UNPROCESSABLE_ENTITY', 'La connexion avec Apple n’est pas disponible.');
    if (!(await verify(input.identityToken))) throw new AppException('UNPROCESSABLE_ENTITY', 'La confirmation avec Apple a échoué.');
    const row = await this.prisma.account.findFirst({ where: { userId: session.userId, providerId: 'apple' }, select: { accountId: true } });
    if (!row || row.accountId !== idTokenSubject(input.identityToken)) {
      throw new AppException('UNPROCESSABLE_ENTITY', STEP_UP_COPY.appleMismatch);
    }
    await this.stamp(session.sessionId);
    await this.writeConfirmation(session.sessionId, {
      provider: 'APPLE',
      ...(input.authorizationCode ? { appleAuthorizationCode: input.authorizationCode } : {}),
    });
  }

  /**
   * V9 U3. Before the app opens Better Auth's `linkSocial` for Google: a random nonce for THIS session,
   * which the app passes as `additionalData` and the account update hook records (`google-step-up-link.ts`).
   */
  async startGoogle(session: StepUpSession): Promise<{ nonce: string }> {
    const row = await this.prisma.account.findFirst({ where: { userId: session.userId, providerId: 'google' }, select: { id: true } });
    if (!row) throw new AppException('UNPROCESSABLE_ENTITY', STEP_UP_COPY.googleNotConfirmed);
    const now = this.deps.clock();
    const nonce = randomBytes(24).toString('base64url');
    await this.replaceVerification(`${GOOGLE_START_PREFIX}${session.sessionId}`, JSON.stringify({ at: now.toISOString(), nonce }), now);
    return { nonce };
  }

  /**
   * V9 U3. Confirmed only when Better Auth's link callback refreshed this user's Google row with THIS
   * session's nonce (the record `google-step-up-link.ts` writes). Another Google e-mail is refused by
   * Better Auth and records nothing (`FND9-024`); a closed page records nothing either, hence one
   * sentence for both. A Google sign-in elsewhere records nothing (final review, Important 1).
   */
  async confirmGoogle(session: StepUpSession): Promise<void> {
    const identifier = `${GOOGLE_START_PREFIX}${session.sessionId}`;
    const start = await this.prisma.verification.findFirst({ where: { identifier } });
    const now = this.deps.clock();
    const nonce = start && start.expiresAt.getTime() > now.getTime() ? startNonce(start.value) : null;
    const linkedId = nonce ? `${GOOGLE_LINKED_PREFIX}${nonce}` : null;
    const linked = linkedId ? await this.prisma.verification.findFirst({ where: { identifier: linkedId } }) : null;
    if (!linked || linked.value !== session.userId || linked.expiresAt.getTime() <= now.getTime()) {
      throw new AppException('UNPROCESSABLE_ENTITY', STEP_UP_COPY.googleNotConfirmed);
    }
    await this.prisma.verification.deleteMany({ where: { identifier } });
    await this.prisma.verification.deleteMany({ where: { identifier: linkedId! } });
    await this.stamp(session.sessionId);
    await this.writeConfirmation(session.sessionId, { provider: 'GOOGLE' });
  }

  /**
   * V9 U3 (`DEC9-09` (4), (7), `DEC9-10` (1)). What a self-deletion needs, and the confirmation it
   * revokes with (consumed: one deletion per confirmation). Switch off: today's step-up, so installed
   * builds keep the e-mailed code. Switch on: a provider confirmation for a linked account, except an
   * Apple-only link with a password, which may use the password (its revocation is then skipped).
   */
  async assertDeletionConfirmed(session: { userId: string; sessionId: string }): Promise<ProviderConfirmation | null> {
    const confirmation = await this.consumeConfirmation(session.sessionId);
    const rule = stepUpProviderEnforced() ? deletionRule(await this.links(session.userId)) : 'STEP_UP';
    if (rule === 'STEP_UP') {
      if (appStepUpEnforced()) await this.assertSteppedUp(session.sessionId);
      return confirmation;
    }
    if (confirmation) return confirmation;
    if (rule === 'PROVIDER_OR_PASSWORD') {
      await this.assertSteppedUp(session.sessionId);
      return null;
    }
    throw new AppException('STEP_UP_REQUIRED', STEP_UP_REQUIRED_MESSAGE_FR);
  }

  async withPassword(session: StepUpSession, password: string): Promise<void> {
    const key = throttleKey(session.email);
    await asAppException(() => this.deps.throttle.throttle.assertOpen('LOGIN_ACCOUNT', key));
    const hash = await this.passwordHash(session.userId);
    if (!hash) throw new AppException('UNPROCESSABLE_ENTITY', 'Ce compte n’a pas de mot de passe : confirmez avec un code.');
    if (await verifyPassword({ hash, password })) return this.stamp(session.sessionId);

    const user = await this.account(session.userId);
    const rule = isStaffRole(user.role) ? THROTTLE_RULES.LOGIN_STAFF : THROTTLE_RULES.LOGIN_ACCOUNT;
    const outcome = await this.deps.throttle.throttle.fail('LOGIN_ACCOUNT', key, rule);
    if (outcome.lockedNow) {
      const write = prismaVerificationWriter(this.prisma);
      const resetUrl = await step('reset link', () => createResetUrl(write, this.deps.authBaseURL, user.id));
      const notMeUrl = await step('not-me link', () => createNotMeUrl(write, this.deps.apiOrigin, user.id));
      await step('lock effects', () =>
        this.deps.throttle.effects.accountLocked({
          scope: 'LOGIN_ACCOUNT',
          user,
          level: outcome.level,
          lockedUntil: outcome.lockedUntil!,
          resetUrl: resetUrl ?? null,
          notMeUrl: notMeUrl ?? null,
        }),
      );
      await asAppException(() => this.deps.throttle.throttle.assertOpen('LOGIN_ACCOUNT', key));
    }
    throw new AppException('UNPROCESSABLE_ENTITY', 'Mot de passe incorrect.');
  }

  async sendCode(session: StepUpSession): Promise<void> {
    await this.refuseCodeForLinkedAccount(session.userId);
    const sendKey = `${STEP_UP_CODE_PREFIX}${throttleKey(session.email)}`;
    // V9 U1 (V9 B2 (3), (4)): the send limit has its own sentence with the real wait. It used to answer
    // with the login lock's « Votre compte est temporairement bloqué … réinitialisez votre mot de passe »,
    // which a passwordless (Apple / Google) account read after three requests and no wrong code.
    const sendsUntil = await this.deps.throttle.throttle.lockedUntil('RESET_ACCOUNT', sendKey);
    if (sendsUntil) throw new AppException('TOO_MANY_REQUESTS', codeSendLimitMessage(sendsUntil, this.deps.clock()));
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const identifier = `${STEP_UP_CODE_PREFIX}${session.userId}`;
    await this.prisma.verification.deleteMany({ where: { identifier } });
    await this.prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier,
        value: sha256(code),
        expiresAt: new Date(this.deps.clock().getTime() + STEP_UP_CODE_TTL_MS),
      },
    });
    await this.deps.throttle.throttle.fail('RESET_ACCOUNT', sendKey, THROTTLE_RULES.CODE_SEND);
    await this.deps.mailer().send({
      to: session.email,
      subject: 'Votre code de confirmation REVIME',
      text: `Votre code de confirmation est ${code}. Il est valable 10 minutes.\n\nVous l'avez demandé pour confirmer une action sensible (coordonnées bancaires, suppression du compte). Si ce n'était pas vous, ignorez cet e-mail.\n\nL'équipe REVIME`,
    });
  }

  async withCode(session: StepUpSession, code: string): Promise<void> {
    await this.refuseCodeForLinkedAccount(session.userId);
    const key = throttleKey(session.email);
    await asAppException(() => this.deps.throttle.throttle.assertOpen('CODE_ACCOUNT', key));
    const identifier = `${STEP_UP_CODE_PREFIX}${session.userId}`;
    const row = await this.prisma.verification.findFirst({ where: { identifier } });
    if (!row || row.expiresAt.getTime() <= this.deps.clock().getTime()) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Ce code a expiré. Demandez un nouveau code.');
    }
    const given = Buffer.from(sha256(code));
    const stored = Buffer.from(row.value);
    if (given.length === stored.length && timingSafeEqual(given, stored)) {
      await this.prisma.verification.deleteMany({ where: { identifier } });
      return this.stamp(session.sessionId);
    }
    const lock = await recordCodeFailure(this.deps.throttle, { email: session.email, user: await this.account(session.userId), ip: null });
    if (lock) throw new AppException('TOO_MANY_REQUESTS', lock.message);
    throw new AppException('UNPROCESSABLE_ENTITY', 'Code incorrect.');
  }

  /** Throws `STEP_UP_REQUIRED` unless this session confirmed its password in the last 10 minutes. */
  async assertSteppedUp(sessionId: string): Promise<void> {
    if (!(await this.isSteppedUp(sessionId))) throw new AppException('STEP_UP_REQUIRED', STEP_UP_REQUIRED_MESSAGE_FR);
  }

  async isSteppedUp(sessionId: string): Promise<boolean> {
    const row = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { stepUpAt: true } });
    return isWithinStepUpWindow(row?.stepUpAt ?? null, this.deps.clock());
  }

  private async stamp(sessionId: string): Promise<void> {
    await this.prisma.session.update({ where: { id: sessionId }, data: { stepUpAt: this.deps.clock() } });
  }

  /** V9 U3 (`DEC9-09` (3)): once the new build is out, a linked account confirms with its provider. */
  private async refuseCodeForLinkedAccount(userId: string): Promise<void> {
    if (!stepUpProviderEnforced()) return;
    if ((await this.links(userId)).providers.length > 0) throw new AppException('UNPROCESSABLE_ENTITY', STEP_UP_COPY.codeRefused);
  }

  private async links(userId: string): Promise<{ providers: StepUpProvider[]; hasPassword: boolean }> {
    const rows = await this.prisma.account.findMany({
      where: { userId, providerId: { in: ['credential', 'apple', 'google'] } },
      select: { providerId: true, password: true },
    });
    const providers: StepUpProvider[] = [];
    if (rows.some((r) => r.providerId === 'apple')) providers.push('APPLE');
    if (rows.some((r) => r.providerId === 'google')) providers.push('GOOGLE');
    return { providers, hasPassword: rows.some((r) => r.providerId === 'credential' && !!r.password) };
  }

  private async writeConfirmation(sessionId: string, confirmation: ProviderConfirmation): Promise<void> {
    await this.replaceVerification(`${PROVIDER_CONFIRMATION_PREFIX}${sessionId}`, JSON.stringify(confirmation), this.deps.clock());
  }

  private async consumeConfirmation(sessionId: string): Promise<ProviderConfirmation | null> {
    const identifier = `${PROVIDER_CONFIRMATION_PREFIX}${sessionId}`;
    const row = await this.prisma.verification.findFirst({ where: { identifier } });
    if (!row) return null;
    await this.prisma.verification.deleteMany({ where: { identifier } });
    if (row.expiresAt.getTime() <= this.deps.clock().getTime()) return null;
    try {
      const parsed = JSON.parse(row.value) as ProviderConfirmation;
      return parsed.provider === 'APPLE' || parsed.provider === 'GOOGLE' ? parsed : null;
    } catch {
      return null;
    }
  }

  /** One row per identifier, valid for the step-up window. */
  private async replaceVerification(identifier: string, value: string, now: Date): Promise<void> {
    await this.prisma.verification.deleteMany({ where: { identifier } });
    await this.prisma.verification.create({
      data: { id: randomUUID(), identifier, value, expiresAt: new Date(now.getTime() + STEP_UP_WINDOW_MS) },
    });
  }

  private async passwordHash(userId: string): Promise<string | null> {
    const account = await this.prisma.account.findFirst({
      where: { userId, providerId: 'credential' },
      select: { password: true },
    });
    return account?.password ?? null;
  }

  private async account(userId: string): Promise<LockedAccount> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) throw new AppException('NOT_FOUND', 'Utilisateur introuvable.');
    return user;
  }
}

export function isWithinStepUpWindow(stepUpAt: Date | null, now: Date): boolean {
  return stepUpAt !== null && now.getTime() - stepUpAt.getTime() < STEP_UP_WINDOW_MS;
}

/** V7 U2b (Q8): the app's step-up checks wait for the end-of-round build; the dashboard's does not. */
export function appStepUpEnforced(): boolean {
  return process.env.STEP_UP_ENFORCED === 'true';
}

/**
 * V9 U3 (`DEC9-09` (7)). Off until the new build is delivered: installed builds (44, APK `a754d6d0`) know
 * only the password and the e-mailed code. Flipped on Render on the owner's word, with
 * `CGU_ACCEPTANCE_ENFORCED`.
 */
export function stepUpProviderEnforced(): boolean {
  return process.env.STEP_UP_PROVIDER_ENFORCED === 'true';
}

/** The nonce kept with a Google start, or null for anything else. */
function startNonce(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as { nonce?: unknown };
    return typeof parsed.nonce === 'string' && parsed.nonce.length >= 16 ? parsed.nonce : null;
  } catch {
    return null;
  }
}

/** The `sub` of a token the verifier has already accepted; never called on an unverified one. */
function idTokenSubject(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function defaultDeps(prisma: PrismaService): SecurityDeps {
  const apiOrigin = process.env.PUBLIC_API_URL ?? new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3002').origin;
  return {
    throttle: createAuthThrottleDeps(prisma),
    alerts: new AdminAlertsService(prisma),
    mailer: mailSender,
    requestPasswordReset: async (email) => {
      // Imported late: auth.ts builds Better Auth at load, and this service is constructed by Nest.
      const { auth } = await import('../auth/auth.js');
      await auth.api.requestPasswordReset({ body: { email, redirectTo: RESET_CALLBACK_URL } });
    },
    clock: () => new Date(),
    apiOrigin,
    authBaseURL: `${apiOrigin}/api/auth`,
    appleVerifier: buildAppleIdTokenVerifier(process.env),
  };
}

/** V9 U1 (V9 B2 (4)): the client's sentence, with whole minutes rounded up (never « 0 min »). */
export function codeSendLimitMessage(until: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  return `Trop de demandes de code, réessayez dans ${minutes} min.`;
}

async function asAppException(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (isAPIError(err) && err.statusCode === 429) throw new AppException('TOO_MANY_REQUESTS', err.message);
    throw err;
  }
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[security] ${name} failed`, err);
    return undefined;
  }
}
