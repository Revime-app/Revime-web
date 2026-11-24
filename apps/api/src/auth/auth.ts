import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin, emailOTP, twoFactor } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { expo } from '@better-auth/expo';
import { createAuthMiddleware, APIError, getOAuthState, getSessionFromCtx } from 'better-auth/api';
import { googleStepUpAccountUpdateHooks } from '../security/google-step-up-link.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { ensureProfileForUser } from './ensure-profile.js';
import { normalisePhoneForWrite } from './normalise-phone.js';
import { normaliseUsernameForWrite } from './normalise-username.js';
import { mailSender } from '../mail/mail.service.js';
import {
  renderConfirmationEmail,
  renderActivationEmail,
  renderResetPasswordEmail,
} from '../mail/confirmation-email.template.js';
import { promoteToBasicIfEligible } from '../verification/promote-basic.js';
import { buildSocialProviders } from './social-providers.js';
import { AUTH_DISABLED_ADMIN_PATHS, recordAuthAdminAction } from '../admin/admin-audit-bridge.js';
import {
  clearLockAfterPasswordReset,
  createAuthThrottleDeps,
  throttleAfter,
  throttleBefore,
  UNUSED_EMAIL_OTP_PATHS,
} from './throttle/index.js';
import { AUTH_IP_ADDRESS_OPTIONS } from './client-ip.js';
import { ConsentProofsService } from '../compliance/consent-proofs.service.js';
import { resolveAuthBaseURL } from './base-url.js';
import {
  assertImpersonationHasSecondFactor,
  assertStaffMayDisableTwoFactor,
  stampTwoFactorSession,
  withoutAppSignInChallenge,
} from './staff-two-factor.js';
import { assertChangeEmailSteppedUp } from '../security/step-up-hook.js';
import { refuseReviewEmailChange } from '../review-accounts/review-account.js';
import { isWithinStepUpWindow } from '../security/security.service.js';
import { activeCguVersion } from '../legal/legal-documents.service.js';
import { activePrivacyVersion } from '../legal/privacy-version.js';
import { applySignupMethod, recordUserPrivacyConsentProof, signupConsentFields } from './signup-consent.js';
import { adminOrigins } from './admin-origins.js';
import { siteOrigins } from './site-origins.js';
import {
  CANONICAL_CGU_ACCEPTANCE_TEXT,
  CURRENT_CGU_VERSION,
  computeConsentChecksum,
} from '@revime/shared';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * V7 A11 / D3 (U2): the login lock-out (per account with a doubling ladder, per IP, staff after 3,
 * reset requests and codes). Replaces CF3-14's in-memory limiter, which every deploy emptied. The
 * rules are in throttle/policy.ts, what each route does in throttle/hooks.ts.
 */
const throttleDeps = createAuthThrottleDeps(prisma);

/**
 * Writes the EMAIL half of the verification ledger.
 *
 * The email flow runs entirely through Better Auth's own endpoints, which know
 * nothing about our table. Without these two writes `channel` would be a
 * two-value enum that only ever held SMS, and the ledger would silently be an
 * SMS log wearing a general name.
 *
 * Audit trail only. The limiter never reads EMAIL rows: emailOTP enforces its own
 * rate limit and email costs nothing, so a second limiter over a free channel
 * would only add a way to lock a user out with nothing saved.
 */
async function recordEmailAttempt(email: string, outcome: 'SENT' | 'APPROVED'): Promise<void> {
  try {
    const user = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (!user) return;
    await prisma.verificationAttempt.create({
      data: { userId: user.id, target: email, channel: 'EMAIL', outcome },
    });
  } catch (error) {
    // An audit row must never fail a verification the user completed correctly.
    console.error(`[verification] failed to record EMAIL ${outcome} for ${email}`, error);
  }
}

/**
 * CF6-18: records the immutable CGU acceptance proof when an account is created with
 * `cguAccepted === true` (the email sign-up form; a social sign-up carries no such field and gets
 * no proof, see the `before` hook).
 *
 * The IP is `cf-connecting-ip` ONLY. Evidence must not be a value the client typed: Render appends
 * to a client-supplied `X-Forwarded-For`, so its left-most entry is attacker-controlled (the
 * reasoning in `client-ip.ts`). With no Cloudflare header the IP is stored as null rather than as
 * a guess.
 */
export async function recordUserCguConsentProof(
  prismaClient: ConstructorParameters<typeof ConsentProofsService>[0],
  user: { id: string; email: string; cguAccepted?: boolean | null; cguAcceptedAt?: Date | null; cguVersion?: string | null; createdAt?: Date },
  context?: unknown,
): Promise<void> {
  if (user.cguAccepted !== true) return;

  const headers = requestHeaders(context);
  await new ConsentProofsService(prismaClient).recordProof({
    userId: user.id,
    kind: 'CGU_ACCEPTANCE',
    // V7 D5 (U9b): the version the `before` hook stamped on the account (the dashboard's active one),
    // so the proof and the user row agree. The compiled constant is only a fallback for a row without it.
    cguVersion: user.cguVersion ?? CURRENT_CGU_VERSION,
    legalTextSnapshot: CANONICAL_CGU_ACCEPTANCE_TEXT,
    actionProof: 'CHECKBOX_TICKED_AND_REGISTRATION_SUBMITTED',
    ipAddress: headerValue(headers, 'cf-connecting-ip'),
    userAgent: headerValue(headers, 'user-agent'),
    metadata: { email: user.email },
    timestamp: user.cguAcceptedAt ?? user.createdAt ?? new Date(),
  });
}

type HeaderBag = { get?: (name: string) => unknown } & Record<string, unknown>;

/** Better Auth hands hooks a context whose request headers sit at one of three depths. */
function requestHeaders(context: unknown): HeaderBag | null {
  const c = context as {
    headers?: HeaderBag;
    request?: { headers?: HeaderBag };
    context?: { request?: { headers?: HeaderBag } };
  } | null | undefined;
  return c?.headers ?? c?.request?.headers ?? c?.context?.request?.headers ?? null;
}

/** One header as a trimmed string: a `Headers` instance or a plain (possibly array-valued) object. */
function headerValue(headers: HeaderBag | null, name: string): string | null {
  if (!headers) return null;
  const raw = typeof headers.get === 'function' ? headers.get(name) : headers[name];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === 'string' && first.trim() !== '' ? first.trim() : null;
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  // CF6-09: the brand host AND the legacy Render host, so a build that still calls the old host
  // keeps a working Google sign-in. Why, and when an entry can go: auth/base-url.ts.
  baseURL: resolveAuthBaseURL(process.env.BETTER_AUTH_URL),
  secret: process.env.BETTER_AUTH_SECRET,
  // V7 U10: every dashboard host, since its proxy forwards the browser's Origin (admin-origins.ts).
  // 24/11/2026: and the public site's hosts, whose /api proxy does the same (site-origins.ts).
  trustedOrigins: ['revime://', ...adminOrigins(), ...siteOrigins()],
  /**
   * CF4-02: resolve the real client IP behind Render/Cloudflare so the rate limiter keys
   * per user instead of one shared bucket per path. Rationale and source citations in
   * client-ip.ts.
   */
  advanced: {
    ipAddress: AUTH_IP_ADDRESS_OPTIONS,
  },
  /**
   * S1: Better Auth's own rate limiter, which guards `/api/auth/*` ONLY. The Nest routes
   * (`/commandes`, `/users/me`, ...) call `auth.api.getSession` directly and never reach it, so
   * this cannot be what limits them.
   *
   * Its default is 100 requests per 10 s per IP and path (`create-context.mjs:172-173`), with a
   * stricter 3 per 10 s on `/sign-in/*` and `/sign-up/*` that is deliberately left alone. The
   * count resets only after a gap of a full `window` with no allowed request, so a larger `max`
   * is what gives a busy session room. Here: 600 per 60 s, and 1200 on `/get-session`, which the
   * app calls on launch, on sign-in and from `useSession`. The store is in memory, per process,
   * and empties on every deploy.
   */
  rateLimit: {
    window: 60,
    max: 600,
    customRules: {
      '/get-session': {
        window: 60,
        max: 1200,
      },
    },
  },

  /**
   * 🛑 WITHOUT THIS, GOOGLE AND APPLE SIGN-IN FAIL FOR ANYONE WHO ALREADY HAS A PASSWORD
   * ACCOUNT, which on this project is every real user.
   *
   * Measured 2026-08-21 from the API's own logs, not guessed: the owner's Google and Apple
   * attempts on build 6 both logged `ERROR [Better Auth]: account_not_linked` - one cause, two
   * symptoms (a browser error page for Google, « Sign Up Not Completed » on Apple's native
   * sheet). The e-mail he chose already existed with provider
   * `credential` from 2026-08-14, and `accountLinking` defaults to DISABLED, so Better Auth
   * refused to attach a second provider to it rather than creating a duplicate.
   *
   * `trustedProviders` is REQUIRED here, not belt-and-braces. With linking merely enabled,
   * Better Auth still wants the emails to be verified before it will link - and two of the
   * three real accounts have `emailVerified: false`, because `requireEmailVerification` is
   * false above. Listing the providers is what makes linking work for those rows.
   *
   * Why this is safe rather than an account-takeover risk: linking keys on the email, so it is
   * only sound when the provider VERIFIES the email it asserts. Google and Apple both do, which
   * is exactly the population `trustedProviders` exists for. `allowDifferentEmails` is left at
   * its default of `false` - Better Auth's own docs warn it "might lead to account takeovers"
   * - so a provider can only ever link to the address it proved.
   */
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'apple'],
    },
  },
  /**
   * 🛑 Where an OAuth failure SENDS the user, which is a separate defect from why it failed.
   *
   * The default is `/api/auth/error`, and that route redirects to `/` ON THE API HOST, which
   * has no route - so any failed social sign-in dumped the user on
   * `{"error":{"code":"NOT_FOUND","message":"Ressource introuvable."}}` in a browser. Traced
   * the whole chain live rather than inferring it:
   *
   *   /api/auth/callback/google -> 302 /api/auth/error?error=… -> 302 /?error=… -> 404
   *
   * Redirecting to the app's scheme instead closes the in-app browser and hands control back,
   * which is the difference between "that did not work" and a raw API error page. Better Auth
   * appends the reason as a query parameter, so the app can read it later without another
   * server change.
   *
   * NOTE the honest limit: the mobile side does not parse that parameter yet, so a failure
   * currently reads as a cancelled sign-in - `social-sign-in.ts` checks for a session cookie
   * and reports cancellation when there is none. That is a mobile change and therefore costs a
   * build, so it is deliberately not bundled in here.
   */
  onAPIError: {
    errorURL: 'revime://auth-error',
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // flipped on once a mail domain exists - see spec §4.5
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      const { html, text } = renderResetPasswordEmail({ url, name: user.name });
      await mailSender().send({
        to: user.email,
        subject: 'Réinitialisez votre mot de passe REVIME',
        text,
        html,
      });
    },
    // V7 A11 (U2, Q3): a completed reset proves the mailbox, so it lifts the login lock and its ladder.
    onPasswordReset: async ({ user }) => {
      await clearLockAfterPasswordReset(user, throttleDeps);
    },
  },
  socialProviders: buildSocialProviders(process.env),
  session: {
    expiresIn: 60 * 60 * 24 * 60,
    updateAge: 60 * 60 * 24 * 7,
    additionalFields: {
      // CF4-41, decision N5. Server-written only, by staff-two-factor.ts. Without input: false a
      // client could claim a verified second factor, which is AdminRoleGuard's whole proof.
      twoFactorVerifiedAt: { type: 'date', required: false, input: false },
      // V7 U2b. Server-written only, by security.service.ts: a client must never claim a step-up.
      stepUpAt: { type: 'date', required: false, input: false },
    },
  },
  emailVerification: {
    sendOnSignUp: false,
    sendVerificationEmail: async ({ user, url }) => {
      const { html, text } = renderActivationEmail({ url, name: user.name });
      await mailSender().send({
        to: user.email,
        subject: 'Activez votre compte REVIME',
        text,
        html,
      });
      await recordEmailAttempt(user.email, 'SENT');
    },
    // Better Auth's dedicated post-verification hook, and it fires for the
    // email-otp endpoint as well as the link one. This is where the email half
    // hands over to the writer of level 1, promote-basic.ts.
    afterEmailVerification: async (user) => {
      await recordEmailAttempt(user.email, 'APPROVED');
      await promoteToBasicIfEligible(prisma, user.id);
    },
  },
  plugins: [
    expo(),
    // CF4-40: only a Super Admin reaches Better Auth's surviving admin endpoints (impersonation).
    // The plugin refuses an adminRoles entry absent from `roles`. The other five staff roles are
    // deliberately NOT declared here: undeclared, they hold no Better Auth permission at all -
    // their rights come from AdminRoleGuard and the shared matrix, never from this plugin.
    admin({ adminRoles: ['super_admin'], roles: { super_admin: adminAc, user: userAc } }),
    // CF4-41: TOTP + backup codes, mandatory for staff. Proven per SESSION - staff-two-factor.ts.
    // CF4-51: the sign-in challenge is skipped for the mobile app (dashboard-only 2FA); the
    // per-session proof that AdminRoleGuard checks is unchanged.
    withoutAppSignInChallenge(twoFactor({ issuer: 'REVIME Admin' })),
    emailOTP({
      // 10 minutes rather than the 5 minute default, to match the Verify session
      // TTL. The two codes sit side by side on one screen, so two different
      // expiries would be arbitrary from the user's point of view.
      expiresIn: 600,
      // REQUIRED, not preferred. The default is plain, which would park the six
      // digits in the `verification` table in cleartext for the code's whole
      // life. Twilio holds the phone code and we hold nothing, so a plaintext
      // email code would make the two channels asymmetric for no reason.
      // Verified in better-auth/dist/plugins/email-otp/otp-token.mjs: hashed
      // makes retrieveOTP return null by design, including for us. The cost is
      // that a test cannot read the code back from the row, which is what
      // __setMailSender in mail.service.ts exists for.
      storeOTP: 'hashed',
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== 'email-verification') {
          // Sign-in and password reset are not wired to OTP; password reset keeps
          // its existing link. Nothing should reach this branch today.
          return;
        }
        const { html, text } = renderConfirmationEmail(otp);
        await mailSender().send({
          to: email,
          subject: 'Votre code de confirmation Revime',
          text,
          html,
        });
        await recordEmailAttempt(email, 'SENT');
      },
    }),
  ],
  /**
   * 🛑 CLOSES A LIVE HOLE. admin() with no options shipped fifteen endpoints, including
   * a hard delete reachable from the deployed dashboard's own origin and audited by
   * nothing. See admin-audit-bridge.ts for why each entry is here, and design §3.1.
   */
  // UNUSED_EMAIL_OTP_PATHS: V7 FND7-034, the code-based sign-in, reset and e-mail change we never
  // wired, whose codes could be guessed (throttle/hooks.ts says how).
  disabledPaths: [...AUTH_DISABLED_ADMIN_PATHS, ...UNUSED_EMAIL_OTP_PATHS],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/two-factor/disable') {
        // hooks.before runs ahead of the endpoint's sessionMiddleware, so resolve it here.
        const session = await getSessionFromCtx(ctx);
        await assertStaffMayDisableTwoFactor(prisma, {
          path: ctx.path,
          context: { session: session as { user: { role?: string | null } } | null },
        });
      }
      if (ctx.path === '/admin/impersonate-user') {
        // CF4-51: impersonation needs a code-verified session, like every dashboard route.
        const session = await getSessionFromCtx(ctx);
        await assertImpersonationHasSecondFactor({
          path: ctx.path,
          session: session as { session: { twoFactorVerifiedAt?: Date | string | null } } | null,
        });
      }
      // CF4-44: a `/forget-password` check used to sit here, refusing unknown addresses with
      // « Aucun compte associé à cette adresse e-mail. ». Better Auth 1.6 has no such route, so it
      // never ran. Deliberately NOT moved to `/request-password-reset`: that would tell anyone
      // whether an e-mail has an account, which the app's reset screen is written to avoid.

      // V7 A11 (U2b, Q6): the dashboard's e-mail change needs a password confirmed in the last 10 min.
      if (ctx.path === '/change-email') {
        const session = await getSessionFromCtx(ctx);
        // PUB-33 (DECP-23): the e-mail is a store-review account's only marker; it cannot be moved.
        refuseReviewEmailChange(session?.user.email);
        await assertChangeEmailSteppedUp(ctx, session?.session.id ?? null, async (id) => {
          const row = await prisma.session.findUnique({ where: { id }, select: { stepUpAt: true } });
          return isWithinStepUpWindow(row?.stepUpAt ?? null, new Date());
        });
      }

      // V7 A11 / D3 (U2). Throws while locked; returns Better Auth's own answer to drop a reset
      // request over its limit, which a before hook's return value does.
      return throttleBefore(ctx, throttleDeps);
    }),
    /**
     * The tripwire over whatever admin surface survives disabledPaths. Nothing we build
     * writes through here - AdminController's @Audit does - so this exists to make an
     * unaudited admin write impossible to have, including for endpoints a future Better
     * Auth version adds.
     */
    after: createAuthMiddleware(async (ctx) => {
      // V7 A11 / D3 (U2). The lock error when this request started a lock; returned LAST, after the
      // audit and the 2FA stamp below, because a hook's return value replaces the response.
      let lockError: APIError | undefined;
      try {
        lockError = await throttleAfter(ctx, throttleDeps);
      } catch (err) {
        console.error('[auth-throttle] error recording the attempt', err);
      }

      // 🛑 The try/catch is not belt-and-braces. This hook's matcher is `() => true`, so it
      // runs on EVERY auth request - a throw here fails sign-in for the mobile app and the
      // dashboard, not just /admin/*. writeAuditRow guards its own DB call; this guards
      // everything before it. Low reachability, total blast radius.
      try {
        // 🛑 The cast to `never` erases the static link to better-auth's context shape. If
        // an upgrade moves `session` or `returned` off `ctx.context`, every row silently
        // degrades to `actorUserId: null` and neither `tsc` nor the specs would notice.
        // GenericEndpointContext is not exported from 'better-auth/api', so the cast stands.
        await recordAuthAdminAction(prisma, ctx as never, (message, err) =>
          console.error(`[admin-audit] ${message}`, err),
        );
      } catch (err) {
        console.error('[admin-audit] bridge threw; auth request continues', err);
      }

      // CF4-41. Never throws on its own; the try/catch covers the cast for the same reason as above.
      try {
        await stampTwoFactorSession(prisma, ctx as never);
      } catch (err) {
        console.error('[staff-two-factor] stamp threw; auth request continues', err);
      }

      return lockError;
    }),
  },
  user: {
    /**
     * P25 (« changer e-mail »). Better Auth refuses `POST /change-email` with CHANGE_EMAIL_DISABLED unless
     * this is set (better-auth `routes/update-user.mjs`), so the dashboard's « Changer l'e-mail » form had
     * never been able to succeed. No `updateEmailWithoutVerification` and no `sendChangeEmailConfirmation`
     * on purpose: the endpoint then mails a verification link to the NEW address (through
     * `emailVerification.sendVerificationEmail` above) and changes nothing until it is clicked, so an
     * address nobody proved cannot replace a staff member's sign-in identity. A session is also required
     * (`sensitiveSessionMiddleware`).
     */
    changeEmail: { enabled: true },
    additionalFields: {
      firstName: { type: 'string', required: false },
      lastName: { type: 'string', required: false },
      phone: { type: 'string', required: false },
      // NOT `input: false`, unlike phoneVerifiedAt: this genuinely is user input
      // at signup. Which is exactly why normalise-username.ts must guard the
      // update hook too - see its header.
      username: { type: 'string', required: false },
      // Server-written only. Without input: false a signup body could claim a
      // verified phone, which is the whole trust signal piece 4 depends on.
      phoneVerifiedAt: { type: 'date', required: false, input: false },
      // Pre-launch Item 2. Mandatory CGU acceptance.
      cguAccepted: { type: 'boolean', required: false },
      cguAcceptedAt: { type: 'date', required: false, input: false },
      cguVersion: { type: 'string', required: false, input: false },
      // V9 B1 (`DEC9-04`, `DEC9-05`). The privacy box is sign-up input like `cguAccepted`; the rest
      // is server-written: stamped here, by `account.create.after`, or by the completion routes.
      privacyAccepted: { type: 'boolean', required: false },
      privacyAcceptedAt: { type: 'date', required: false, input: false },
      privacyVersion: { type: 'string', required: false, input: false },
      signupMethod: { type: 'string', required: false, input: false },
      usernameConfirmedAt: { type: 'date', required: false, input: false },
      // Pre-launch Item 3. Separate marketing consent (opt-in).
      marketingConsent: { type: 'boolean', required: false },
      marketingConsentAt: { type: 'date', required: false, input: false },
      marketingConsentEmail: { type: 'boolean', required: false, input: false },
      marketingConsentSms: { type: 'boolean', required: false, input: false },
    },
  },
  databaseHooks: {
    // V9 B1 (`DEC9-04` (6)): the first login row decides how the account signed up, once; a provider
    // linked later never overwrites it (`applySignupMethod`). A failure only loses the method.
    account: {
      create: {
        after: async (account) => {
          try {
            await applySignupMethod(prisma, account, new Date());
          } catch (error) {
            console.error('[signup] could not record the sign-up method', {
              userId: account.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      },
      // V9 U3 final review (Important 1): a Google link that carried a step-up nonce (`linkSocial`'s
      // `additionalData`) records it, so the step-up confirms only the session that started it
      // (`google-step-up-link.ts`). 🛑 An `update.before` hook, never `after`: Better Auth runs `after`
      // hooks once the request state is gone, where `getOAuthState()` throws (V9 `ISS9-011`). A failure
      // only means the confirmation is refused and the user tries again.
      update: googleStepUpAccountUpdateHooks(prisma, { getState: () => getOAuthState() }),
    },
    user: {
      create: {
        // 🛑 CHAINED, not two `before` keys. `before` is a single property on this
        // object: a second one would silently win and delete the phone
        // normalisation, with no typecheck error and no failing test. The phone
        // hook runs first because its rejections are the ones a user is likeliest
        // to hit, so its message is the one they see.
        before: async (user) => {
          const rawUser = user as Record<string, unknown>;
          // Pre-launch Item 2. Mandatory CGU acceptance on registration.
          // Note: social signup provides no raw body fields; email signup passes cguAccepted.
          // If cguAccepted is explicitly provided or for email signup, ensure it is true and stamp audit fields.
          const now = new Date();
          // V7 D5 (U9b, `DEC7-24`): the dashboard's active CGU version, the one source (FND7-027).
          // V9 B1: the privacy box beside it (`signup-consent.ts`); its absence is an older build.
          const consent = await signupConsentFields(rawUser, now, {
            cgu: () => activeCguVersion(prisma),
            privacy: () => activePrivacyVersion(prisma),
          });

          // Pre-launch Item 3. Separate marketing consent (opt-in).
          const marketingConsent = rawUser.marketingConsent === true;
          const marketingConsentAt = marketingConsent ? now : undefined;
          const marketingConsentEmail = marketingConsent;
          const marketingConsentSms = marketingConsent;

          const phone = await normalisePhoneForWrite(prisma, user, { mode: 'create' });
          const username = await normaliseUsernameForWrite(prisma, phone.data, { mode: 'create' });

          return {
            data: {
              ...username.data,
              ...consent,
              marketingConsent,
              ...(marketingConsent ? { marketingConsentAt, marketingConsentEmail, marketingConsentSms } : {}),
            },
          };
        },
        after: async (user, context) => {
          await ensureProfileForUser(prisma, user);
          // The account already exists at this point, so a throw would turn a successful sign-up
          // into a 500 the user retries into « email already used », and would still leave no
          // proof. Logged loudly instead. RESIDUAL, recorded rather than hidden: nothing re-creates
          // the proof afterwards, so a failure here leaves that account without a CGU proof.
          try {
            await recordUserCguConsentProof(prisma, user, context);
          } catch (error) {
            console.error('[compliance] could not record the CGU proof for a new account', {
              userId: user.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          // V9 B1: the privacy proof, same residual as the CGU one.
          try {
            await recordUserPrivacyConsentProof(prisma, user as never, context);
          } catch (error) {
            console.error('[compliance] could not record the privacy proof for a new account', {
              userId: user.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      },
      update: {
        // POST /update-user is live behind nothing but sessionMiddleware, its
        // body is an open record, and both `phone` and `username` are
        // additionalFields with no validator, so parseUserInput hands raw values
        // to both columns. Guard that route with the same normalise-and-check as
        // create, or an authenticated user defeats the canonical form and a
        // duplicate escapes as an unmapped P2002.
        before: async (user, context) => {
          const currentUserId = context?.context.session?.user.id;
          const phone = await normalisePhoneForWrite(prisma, user, {
            mode: 'update',
            currentUserId,
          });
          return normaliseUsernameForWrite(prisma, phone.data, {
            mode: 'update',
            currentUserId,
          });
        },
      },
    },
  },
});
