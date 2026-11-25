import { Injectable } from '@nestjs/common';
import type {
  IdentitySessionInput,
  IdentitySessionResponse,
  IdentityStatusResponse,
} from '@revime/shared';
import { identityDecisionReasonFr } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { claimStripeEvent } from '../common/stripe-event-claim.js';
import { PrismaService } from '../prisma/prisma.service.js';
// isConnectEnabled gates this subsystem too. Its NAME is narrower than its scope:
// identity and payouts are one journey and must move together, because a réparateur
// who uploads an ID and then cannot configure payouts has handed over a document and
// still cannot be paid. One flag, deliberately.
import { isConnectEnabled } from '../connect/config.js';
import { identityGateway } from './gateway.js';
import { identityNotificationFor } from './identity-notify.js';
import { DOCUMENT_ONLY_REMEDY_CODES, SELFIE_FRAUD_CODES } from './error-codes.js';
import { redactIdentityForUser } from './redact-identity.js';
import { promoteFromIdentityIfEligible } from '../verification/promote-identity.js';
import { promoteToBasicIfEligible } from '../verification/promote-basic.js';
// 🛑 A VALUE import, not `import type`. Nest resolves constructor parameters from the
// `design:paramtypes` metadata TypeScript emits, and a type-only import is erased - the
// parameter is then emitted as `Function` and the whole API fails to boot with « Nest can't
// resolve dependencies of the IdentityService (PrismaService, ?) ». Found on the CF4-D
// test-mode run; `test/app-module-di.spec.ts` now gates every module for this.
import { NotificationsService } from '../notifications/notifications.service.js';

const IDENTITY_OFF = "La vérification d'identité n'est pas encore disponible.";
const CONTACT_UNVERIFIED =
  'Confirmez votre e-mail ou votre téléphone avant de vérifier votre identité.';
const ALREADY_VERIFIED = 'Votre identité est déjà vérifiée.';
const IN_PROGRESS = 'Vérification en cours.';
const SELFIE_REQUIRED = 'La vérification avec reconnaissance faciale est nécessaire pour votre compte.';

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async start(userId: string, input: IdentitySessionInput, surface: 'app' | 'web' = 'app'): Promise<IdentitySessionResponse> {
    if (!isConnectEnabled()) {
      throw new AppException('UNPROCESSABLE_ENTITY', IDENTITY_OFF);
    }

    // A LEVEL precondition - BASIC or above - deliberately NOT `repairerEnabled`.
    //
    // Requiring the mode deadlocked the branch's primary journey. With
    // IDENTITY_GATE_ENABLED on, the former `assertIdentityVerified(…, 'become')` (removed
    // in CF4-01) refused
    // PATCH /users/me/modes BEFORE the mode is written, so a client at BASIC could
    // not become a réparateur without being verified and could not verify without
    // being a réparateur. Identity is a fact about a person, not about a mode -
    // and `promoteFromIdentityIfEligible` already requires BASIC before it grants
    // anything, so this changes no grant semantics.
    //
    // Not "no precondition", for two reasons. Every session Stripe verifies is
    // BILLED, so an unguarded route exposes one paid verification per registered
    // account. And BASIC is the client's own door rule.
    //
    // 🛑 THE LEVEL, NOT THE TWO CONTACT COLUMNS, since 2026-09-04 (`CF-D1`). This used to
    // re-read `emailVerified` and `phoneVerifiedAt` and require BOTH, « expressed the way
    // promote-basic.ts expresses them » - so the door rule lived in two files, and when the
    // client's « téléphone ou adresse e-mail » made BASIC an OR, this copy would have kept
    // the AND in silence. promote-basic.ts is the one owner of what BASIC means; this asks
    // only whether it was granted. identity-variant.spec.ts pins that the columns are no
    // longer consulted here.
    //
    // POST /connect/onboarding keeps its `repairerEnabled` guard: payouts genuinely
    // ARE réparateur-only, and its card is reachable only once he is one.
    //
    // CF4-01: PROMOTE BEFORE REFUSING. A NONE account whose contacts are both verified
    // was refused here if the promotion hook had not run (or had run before the second
    // contact was confirmed). `promoteToBasicIfEligible` is the one owner of what BASIC
    // means and grants it only to a contact-verified account, so calling it here keeps
    // the billing guard intact: an account that is still NONE afterwards is refused.
    const readLevel = () =>
      this.prisma.profile.findFirst({
        where: { userId, deletedAt: null },
        select: { verificationLevel: true },
      });
    let profile = await readLevel();
    if (profile && profile.verificationLevel === 'NONE') {
      await promoteToBasicIfEligible(this.prisma, userId);
      profile = await readLevel();
    }
    if (!profile || profile.verificationLevel === 'NONE') {
      throw new AppException('FORBIDDEN', CONTACT_UNVERIFIED);
    }

    const existing = await this.prisma.identityVerification.findUnique({
      where: { userId },
      select: {
        stripeSessionId: true,
        status: true,
        variant: true,
        selfieFraudSignalAt: true,
        decision: true,
      },
    });

    // CF4-39 (spec §4.3). An operator's ACCEPTED is a validation: a new billed session buys
    // nothing. Refused here, BEFORE the resume path, so no Stripe call happens.
    if (existing?.decision === 'ACCEPTED') {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_VERIFIED);
    }

    /**
     * 🛑 CF4-39: AFTER A REFUSAL OR A DOCUMENTS REQUEST, THE STORED SESSION IS DEAD TO US. It is
     * often VERIFIED (the operator overrode what Stripe accepted), so the « déjà vérifiée »
     * refusals below - on the row and on Stripe's live status - must not apply; it is neither
     * resumed nor cancelled (a verified session cannot be); a fresh session is created and the
     * upsert clears the decision. The PROCESSING refusal and the fraud / document-only refusal
     * still apply. Review Focus 3: the installed build's « Commencer » lands here.
     */
    const withdrawn = existing?.decision === 'REFUSED' || existing?.decision === 'DOCUMENTS_REQUESTED';

    // Refusing rather than re-verifying. A second verified session buys nothing,
    // costs a per-verification fee, and would ask a réparateur for his passport
    // twice for no reason.
    if (existing?.status === 'VERIFIED' && !withdrawn) {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_VERIFIED);
    }

    // PROCESSING is refused for a money reason, not a tidiness one. A processing
    // session has a NULL hosted URL, so without this it fell through to creating a
    // second session - which Stripe bills a second time, and whose upsert repoints
    // `stripeSessionId` away from the first. The first session's own `verified`
    // webhook then finds no row by that id and returns quietly: two charges, and a
    // réparateur who passed the check left permanently unverified. The Profil card
    // is stale until the webhook lands, so « Reprendre » is the ordinary way here.
    if (existing?.status === 'PROCESSING') {
      throw new AppException('UNPROCESSABLE_ENTITY', IN_PROGRESS);
    }

    /**
     * 🛑 THE FRAUD REFUSAL, AND ITS POSITION IS LOAD-BEARING.
     *
     * AFTER the VERIFIED and PROCESSING refusals, because a verified user needs no alternative
     * and a processing one must wait - both of those answers outrank this one. BEFORE the resume
     * path, because the point is to refuse before any Stripe call happens.
     *
     * It reads `selfieFraudSignalAt` and NOT `lastErrorCode`, and that is the whole reason the
     * column exists: redaction replaces PII fields with placeholders, so a user could otherwise
     * fail the face match, request erasure, and find this route open. See the spec's §6.1.
     *
     * It blocks the ALTERNATIVE only. The selfie variant stays available, or the rule would be a
     * permanent lockout rather than a fraud control.
     */
    if (input.variant === 'DOCUMENT_ONLY' && existing?.selfieFraudSignalAt) {
      throw new AppException('FORBIDDEN', SELFIE_REQUIRED);
    }

    const base = process.env.PUBLIC_API_URL;
    // The site gets its own return route (a browser cannot open the app's revime:// link).
    const returnUrl = surface === 'web' ? `${base}/api/v1/identity/return-web` : `${base}/api/v1/identity/return`;

    if (existing && !withdrawn) {
      /**
       * 🛑 A VARIANT CHANGE CANNOT RESUME. `require_matching_selfie` is fixed when the session is
       * created, so returning the stored session's hosted URL would hand a selfie flow back to
       * someone who has just asked not to have one.
       */
      if (existing.variant === input.variant) {
        // A retrievable session's hosted URL is fetched rather than stored, for the
        // same reason P1 never stores a Checkout URL: a stored URL is a second source
        // of truth that can outlive the session it names.
        const session = await identityGateway().retrieveSession(existing.stripeSessionId);
        if (session.url) {
          const ephemeralKeySecret = await identityGateway().createEphemeralKey(existing.stripeSessionId);
          return {
            sessionId: existing.stripeSessionId,
            ephemeralKeySecret,
            url: session.url,
          };
        }

        // Refused on STRIPE'S live status as well as on the row's, and the second check
        // is the one that actually closes the hole. The row is written only by the
        // webhook, so the very scenario this refusal exists for - he submitted his
        // document seconds ago and tapped « Reprendre » before the webhook landed - has
        // a row still reading REQUIRES_INPUT while Stripe already says `processing`.
        // Checking the row alone would let exactly that case fall through to a second
        // billed session and a discarded verification.
        if (session.status === 'PROCESSING') {
          throw new AppException('UNPROCESSABLE_ENTITY', IN_PROGRESS);
        }
        if (session.status === 'VERIFIED') {
          throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_VERIFIED);
        }

        // Anything else with no URL is a genuinely spent session - REQUIRES_INPUT past
        // its retry allowance, or CANCELED. A fresh session is the only way forward,
        // and it is the only case where paying for a second one is right.
      } else {
        /**
         * 🛑 RE-CHECK STRIPE, NOT THE ROW, AND THIS IS THE SAME CHECK THE SAME-VARIANT BRANCH
         * ABOVE MAKES, FOR THE SAME REASON. Corrected 2026-09-02: the spec's §4.4 rule 3 claimed
         * « the guards above are what make this call safe by construction », and **that claim was
         * false** - those guards read `existing.status`, which is the ROW, and the row is written
         * only by the webhook. So it can still say REQUIRES_INPUT while Stripe already says
         * `processing` or `verified`: cancelling is then ILLEGAL, the best-effort `.catch` below
         * swallows the refusal, and the upsert repoints `stripeSessionId` away from a session
         * Stripe is about to verify. That session's later `verified` webhook finds no row,
         * `syncSession` returns quietly, and a PASSED, BILLED verification is discarded with no
         * promotion - while a second session is billed to replace it. The spec is corrected.
         *
         * 🛑 THE `.catch(() => null)` IS LOAD-BEARING, NOT PADDING. A retrieve failure must not
         * block verification, for exactly the reason the cancel beneath it is best-effort: a
         * cleanup-path Stripe error is not a reason to refuse a user his own verification. It is
         * also what `test/identity-variant.spec.ts`'s « creates a new session even when cancelling
         * the old one fails » requires - that test deliberately leaves `vs_old` unseeded, so a
         * bare `await retrieveSession(...)` would reject and fail it.
         */
        const live = await identityGateway()
          .retrieveSession(existing.stripeSessionId)
          .catch(() => null);
        if (live?.status === 'PROCESSING') {
          throw new AppException('UNPROCESSABLE_ENTITY', IN_PROGRESS);
        }
        if (live?.status === 'VERIFIED') {
          throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_VERIFIED);
        }

        /**
         * 🛑 CANCEL THE OLD SESSION, DO NOT MERELY ORPHAN IT. The upsert below repoints
         * `stripeSessionId`, so an abandoned session's later `verified` event finds no row and
         * `syncSession` returns quietly - a BILLED verification silently discarded, which is
         * exactly the hazard the PROCESSING comment above was written about.
         *
         * `cancel` is legal at any point before `processing` or `verified`, and it is the LIVE
         * re-check directly above - not the row-based guards further up - that has refused both of
         * those states by the time this line runs.
         *
         * BEST-EFFORT, and deliberately: this is hygiene, and refusing to let a user verify
         * because a cleanup call failed would be the worse failure. A failure is logged so the
         * orphan is discoverable.
         */
        await identityGateway()
          .cancelSession(existing.stripeSessionId)
          .catch((e: unknown) => {
            console.warn(
              `[identity] could not cancel ${existing.stripeSessionId} on a variant change`,
              e,
            );
            return undefined;
          });
      }
    }

    const session = await identityGateway().createSession({
      userId,
      returnUrl,
      variant: input.variant,
    });

    await this.prisma.identityVerification.upsert({
      where: { userId },
      create: {
        userId,
        stripeSessionId: session.id,
        status: session.status,
        variant: input.variant,
        lastErrorCode: session.lastErrorCode,
        lastSyncedAt: new Date(),
      },
      update: {
        stripeSessionId: session.id,
        status: session.status,
        variant: input.variant,
        lastErrorCode: session.lastErrorCode,
        // 🛑 CLEARED, and note they behave OPPOSITELY to the two PERSON fields, `verifiedAt` and
        // `selfieFraudSignalAt`. This row holds two classes of field. `stripeSessionId`, `status`,
        // `lastErrorCode`, `variant`, `erasureRequestedAt` and `redactionStatus` describe THE
        // SESSION CURRENTLY ON THE ROW, so repointing the row at a new session must reset them.
        // `verifiedAt` and `selfieFraudSignalAt` are facts about the PERSON and are never cleared -
        // and note `verifiedAt` is not in this object at all; it is written by `syncSession`.
        //
        // Without this, an erasure stamp from a previous session survives onto a fresh un-erased
        // document, and `redactIdentityForUser`'s idempotence guard then answers a genuine second
        // erasure request with "already done" while redacting nothing. See the spec's §5.2.
        erasureRequestedAt: null,
        redactionStatus: null,
        // CF4-39 (spec §4.1): the operator's decision is a SESSION field too - it judged the
        // session this upsert is replacing. History stays in the admin audit log.
        decision: null,
        decisionMotif: null,
        decisionNote: null,
        decidedAt: null,
        decidedByUserId: null,
        // 🛑 `selfieFraudSignalAt` is NOT reset here. It is never cleared by anything.
        lastSyncedAt: new Date(),
      },
    });

    if (!session.url) {
      // A created session with no hosted URL is Stripe misbehaving, not a user
      // error, and returning an empty string would send the app to a blank tab.
      throw new AppException('INTERNAL', IDENTITY_OFF);
    }
    return {
      sessionId: session.id,
      ephemeralKeySecret: session.ephemeralKeySecret ?? '',
      url: session.url,
    };
  }

  /**
   * The cached row, or a synthesised not-started shape.
   *
   * Deliberately does NOT call Stripe. The webhook keeps this row current, and a read that
   * repaired its own staleness would become a second writer - the property the level promotion
   * depends on not existing.
   *
   * 🛑 THE TWO BOOLEANS ARE DERIVED HERE AND NOWHERE ELSE. The app must not re-derive them: it
   * cannot see `selfieFraudSignalAt` at all, and reasoning from `lastErrorCode` would invert
   * silently after a redaction replaced it with a placeholder. See `error-codes.ts`.
   */
  async status(userId: string): Promise<IdentityStatusResponse> {
    const row = await this.prisma.identityVerification.findUnique({
      where: { userId },
      select: {
        status: true,
        verifiedAt: true,
        lastErrorCode: true,
        redactionStatus: true,
        erasureRequestedAt: true,
        selfieFraudSignalAt: true,
        decision: true,
        decisionMotif: true,
        decisionNote: true,
      },
    });

    if (!row) {
      // Never started: nothing has been signalled, so the alternative is available and there is
      // no failure to recommend it as a remedy for.
      return {
        status: null,
        verifiedAt: null,
        lastErrorCode: null,
        redactionStatus: null,
        erasureRequestedAt: null,
        documentOnlyAvailable: true,
        documentOnlyRecommended: false,
        decision: null,
        decisionReason: null,
      };
    }

    return {
      status: row.status,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      lastErrorCode: row.lastErrorCode,
      redactionStatus: row.redactionStatus,
      erasureRequestedAt: row.erasureRequestedAt?.toISOString() ?? null,
      documentOnlyAvailable: row.selfieFraudSignalAt === null,
      documentOnlyRecommended:
        row.lastErrorCode !== null && DOCUMENT_ONLY_REMEDY_CODES.has(row.lastErrorCode),
      // CF4-39: ACCEPTED is reported as null - the réparateur just sees « validée ».
      ...(row.decision === 'REFUSED' || row.decision === 'DOCUMENTS_REQUESTED'
        ? {
            decision: row.decision,
            decisionReason: identityDecisionReasonFr(row.decisionMotif, row.decisionNote),
          }
        : { decision: null, decisionReason: null }),
    };
  }

  /**
   * `DELETE /identity/verification`. Honours an Article 17 request against the identity
   * verification without closing the account.
   *
   * Returns the fresh status so the screen re-renders from one source rather than guessing.
   */
  async requestErasure(userId: string): Promise<IdentityStatusResponse> {
    await redactIdentityForUser(this.prisma, userId);
    return this.status(userId);
  }

  /**
   * Every Identity delivery lands here.
   *
   * Order matters, and it is P1's order for P1's reason. Verify, then claim the
   * event id, then act. Claiming first is what makes a redelivery a no-op: Stripe
   * retries on any non-2xx and on its own schedule, so the same event arrives more
   * than once as a matter of course rather than as a fault.
   */
  async handleWebhook(raw: Buffer, signature: string | undefined): Promise<void> {
    if (!signature) {
      throw new AppException('VALIDATION_FAILED', 'Signature manquante.');
    }
    if (!process.env.STRIPE_IDENTITY_WEBHOOK_SECRET) {
      // OUR fault, not the caller's. Distinguished from a bad signature
      // deliberately: conflating them makes a rotated-and-not-redeployed secret
      // look like an attack.
      throw new AppException('INTERNAL', 'Configuration de paiement incomplète.');
    }

    let event;
    try {
      event = identityGateway().constructEvent(raw, signature);
    } catch {
      console.warn('[identity] webhook signature verification failed');
      throw new AppException('VALIDATION_FAILED', 'Signature invalide.');
    }

    // Namespaced PER ENDPOINT rather than the bare event id - see the long comment on
    // the same line in connect.service.ts for why, and for the fact that makes this
    // free: `StripeEvent` was confirmed at ZERO rows in production on 2026-08-17, so
    // there is no migration and nothing to backfill. That is only true once.
    // `payments.service.ts` deliberately keeps the bare id.
    const claimKey = `identity:${event.id}`;

    const claimed = await claimStripeEvent(this.prisma, claimKey, event.type);
    if (!claimed) return;

    try {
      if (event.type.startsWith('identity.verification_session.')) {
        await this.syncSession(this.extractSessionId(event.object));
      }
      // Anything else is not an error. Throwing would make Stripe retry for three
      // days over an event we never subscribed to.
      return;
    } catch (e) {
      // The claim is what makes a redelivery a no-op, so a failed action must give
      // it back - otherwise Stripe's retry is discarded as a duplicate and a
      // verified réparateur stays unpromoted for good.
      await this.prisma.stripeEvent.delete({ where: { id: claimKey } }).catch(() => undefined);
      throw e;
    }
  }

  /**
   * Reads Stripe's own record rather than trusting the event payload, then writes
   * the row and runs the promotion. The event says WHICH session changed; Stripe
   * says what it changed to.
   */
  private async syncSession(stripeSessionId: string): Promise<void> {
    if (!stripeSessionId) return;

    const row = await this.prisma.identityVerification.findUnique({
      where: { stripeSessionId },
      // `selfieFraudSignalAt` is selected because the stamp below reads it, exactly as `verifiedAt`
      // is. Dropping either from this select is a TYPE error rather than a silent one - Prisma
      // narrows the result to the selected keys, so `tsc` refuses the read. Measured on 2026-09-02
      // by deleting the key: TS2339. What is NOT caught by types is dropping the `=== null` guard
      // below, which would re-stamp on every delivery; `test/identity-sync-writes.spec.ts` pins
      // that. Noting the split because the obvious guess is the wrong way round: an unselected
      // field arrives `undefined`, and `undefined === null` is false, so the stamp would never
      // fire at all rather than fire every time.
      //
      // `status` and `lastErrorCode` are selected for `identityNotificationFor` (CF4-E §3,
      // Controller Ruling R3): the notification decision needs the row's STATE BEFORE this
      // write, which is exactly what this pre-update select captures.
      select: {
        id: true,
        userId: true,
        verifiedAt: true,
        selfieFraudSignalAt: true,
        status: true,
        lastErrorCode: true,
      },
    });
    // Not ours. Returning quietly stops Stripe retrying for three days over an
    // event we can do nothing with.
    if (!row) return;

    const session = await identityGateway().retrieveSession(stripeSessionId);

    // Computed BEFORE the update below, against the row as Prisma read it - identityNotificationFor
    // needs the STORED state, and the update that follows is what turns that into history.
    const notify = identityNotificationFor(row, session);

    await this.prisma.identityVerification.update({
      where: { id: row.id },
      data: {
        status: session.status,
        lastErrorCode: session.lastErrorCode,
        // `verifiedAt` is NOT written here any more - see the conditional stamp after this
        // update (CF4-42). It is still stamped once, on the first transition to VERIFIED, and
        // NEVER cleared: evidence that something happened is a different kind of fact from a
        // current status, and clearing it would silently un-grant a level.
        /**
         * 🛑 STAMPED ONCE AND NEVER CLEARED, exactly like `verifiedAt` above and for the same
         * reason: it is evidence that something happened, not a current status. It is what the
         * document-only refusal reads, so that the refusal cannot be laundered by an erasure
         * replacing `lastErrorCode` with a placeholder. See the spec's §6.1.
         */
        ...(session.lastErrorCode !== null &&
        SELFIE_FRAUD_CODES.has(session.lastErrorCode) &&
        row.selfieFraudSignalAt === null
          ? { selfieFraudSignalAt: new Date() }
          : {}),
        /**
         * Stripe's own redaction progress: null until a redaction is requested, then PROCESSING and
         * eventually REDACTED, up to four days later.
         *
         * 🛑 WRITTEN ONLY WHEN NON-NULL, AND THIS IS THE ONE PLACE `summariseRedaction`'S
         * NULL-DEGRADATION MUST NOT REACH THE ROW. That helper deliberately returns `null` for a
         * redaction status nobody has read, because a screen's wording must not make Stripe retry
         * for three days (see `gateway.ts`, which explains why it degrades where `summariseSession`
         * throws). Propagating that null here would carry a row from REDACTED back to « nothing has
         * been redacted » on a user-facing GDPR screen the first time Stripe ships a fourth value -
         * a false statement about an Article 17 request, which is precisely the failure the erasure
         * copy is written against.
         *
         * Nothing is lost by conditioning it. The field is cleared on a repoint by the `upsert`
         * above, and a genuinely fresh session reports null anyway, so the only writes suppressed
         * are the ones that would degrade a known value into an unknown one. It also makes this
         * block internally consistent: `verifiedAt` and `selfieFraudSignalAt` beside it are both
         * written conditionally too.
         */
        ...(session.redactionStatus !== null
          ? { redactionStatus: session.redactionStatus }
          : {}),
        lastSyncedAt: new Date(),
      },
    });

    /**
     * 🛑 CF4-42. THE `verifiedAt` STAMP IS A CONDITIONAL WRITE, AND ONLY THE CALL THAT STAMPS MAY
     * NOTIFY. Stripe sends several events for one session (distinct event ids, so the claim in
     * `handleWebhook` does not dedupe them). Two ran concurrently in production on 2026-10-01: both
     * read `verifiedAt = null` before either wrote, both computed IDENTITY_VERIFIED, and the user
     * got two « Identité vérifiée » pushes. The pre-update read cannot decide « first »; the
     * database can. `where verifiedAt IS NULL` lets exactly one writer through (count 1); every
     * other one gets count 0 and stays silent. Before the promotion below, which reads the stamp.
     * Pinned by `identity-sync-writes.spec.ts`.
     */
    let stampedVerified = false;
    if (session.status === 'VERIFIED' && row.verifiedAt === null) {
      const { count } = await this.prisma.identityVerification.updateMany({
        where: { id: row.id, verifiedAt: null },
        data: { verifiedAt: new Date() },
      });
      stampedVerified = count === 1;
    }
    const toEmit = notify === 'IDENTITY_VERIFIED' && !stampedVerified ? null : notify;

    // After the row write and outside it: the promotion reads the row, so it must
    // see the state this event established. A failure to promote must not roll back
    // an accurate sync - and if it throws, handleWebhook releases the claim and
    // Stripe retries, which is why the promotion is idempotent.
    await promoteFromIdentityIfEligible(this.prisma, row.userId);

    // CF4-E §3, Controller Ruling R3. AFTER the promotion, matching the module's
    // "messages and notifications run AFTER the database write commits" rule - by this line
    // both the sync's own write and the level grant it may trigger are already committed.
    // `notify` was computed from the row's state BEFORE the update, so a redelivery of the
    // same webhook (Stripe retries on any non-2xx) reads the row it already wrote last time
    // and evaluates to null. `emit` never throws (NotificationsService's own contract), so a
    // notification failure cannot turn into a dropped Stripe claim. CF4-42: `toEmit`, not
    // `notify` - an IDENTITY_VERIFIED this call did not stamp belongs to the call that did.
    if (toEmit) {
      await this.notifications.emit({ userId: row.userId, mode: 'REPAIRER', type: toEmit });
    }
  }

  /** Read the session id with type checking; never pass an untyped indexed value. */
  private extractSessionId(object: Record<string, unknown>): string {
    return typeof object?.id === 'string' ? object.id : '';
  }
}
