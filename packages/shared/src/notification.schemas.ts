import { z } from 'zod';
import { STEP_CLAIMANT, type CommandeStep } from './commande.schemas.js';
import { euros } from './compare-criteria.js';
import { modeSchema } from './user.schemas.js';
import { SETUP_REMINDER_TITLE } from './setup-reminders.js';

/**
 * The event families, named after the EVENT rather than the screen, because one type serves
 * both modes for several of them and a screen-shaped name would lie about half its rows.
 * See the design §3.
 *
 * 🛑 The count is deliberately not stated. This comment read « The eight event families »
 * while the enum held TEN members, because two slices added a member without touching the
 * prose above it. `notificationTypeSchema.options` is the answer; derive it.
 *
 * 🛑 Keep in step with the `NotificationType` enum in `schema.prisma`. This list is the
 * wire contract and that one is the column; a member added to only one of them typechecks
 * on both sides and fails at runtime. `apps/api/test/notification-type-parity.spec.ts`
 * enforces both directions.
 */
export const notificationTypeSchema = z.enum([
  'OFFER_RECEIVED',
  'OFFER_ACCEPTED',
  'OFFER_DECLINED',
  'MESSAGE_RECEIVED',
  'COMMANDE_STEP',
  'FUNDS_RELEASED',
  'COMMANDE_REFUNDED',
  // CF-43, migration 24. A checkout session that expired with the commande still unpaid.
  // NOT « refused »: see the copy branch for why no decline event can exist.
  'PAYMENT_ABANDONED',
  // CF-16 / CF-17, migration 30. A demande a réparateur has quoted on was changed, or
  // withdrawn by its author. Sent to the RÉPARATEUR, not the client. `WITHDRAWN` rather than
  // `DELETED`: the row is soft-deleted and the offer survives, so « deleted » would overstate
  // what happened to his work.
  'DEMANDE_UPDATED',
  'DEMANDE_WITHDRAWN',
  // Stage 6 piece C1, migration 34. An operator removed a demande this réparateur had
  // quoted on. Sent to the RÉPARATEUR. NOT a reuse of DEMANDE_WITHDRAWN - see the copy
  // branch, which names Revime rather than « le client ».
  'DEMANDE_MODERATED',
  // Livraison Boxtal, migration 20260904020000. Six members, one per user-visible carrier
  // outcome. `Notification` has no free-text column and `step` is a CommandeStep, so ONE
  // « tracking » type would have had to smuggle the status through `actorName`; six honest
  // types cost six enum values and nothing else. `step` carries the LEG (PARCEL_SENT =
  // outbound, RETURN_SENT = return), which is a truthful use of that column: it names the
  // step whose parcel this is.
  'PARCEL_LABEL_READY',
  'PARCEL_SHIPPED',
  'PARCEL_OUT_FOR_DELIVERY',
  'PARCEL_AT_PICKUP_POINT',
  'PARCEL_DELIVERED',
  'PARCEL_INCIDENT',
  // CF4-E §3 (spec section E3), migration 20260929010000. Five honest types rather than
  // fewer with a status smuggled through another column: `Notification` has no free-text
  // column, and `step` is a `CommandeStep` so it cannot carry a dispute or verification
  // outcome either. DISPUTE_OPENED / DISPUTE_DISMISSED read the same for both parties -
  // there is no claimant to address around. The three IDENTITY_* members are separate
  // rather than one parametrised type because each names a different real-world event
  // (a check passing, one failing, an existing grant being pulled) and collapsing them
  // would need a second field just to tell the three apart.
  'DISPUTE_OPENED',
  'DISPUTE_DISMISSED',
  'IDENTITY_VERIFIED',
  'IDENTITY_DOCUMENTS_REQUIRED',
  'VERIFICATION_REVOKED',
  // CF4-D §... (flexible refunds), migration 20260929020000. The admin refunded only
  // part of the commande - REPAIR_NOT_DONE and friends, never the plain full-refund
  // path, which keeps emitting COMMANDE_REFUNDED. Sent to both parties, worded from
  // the RÉPARATEUR's side for the amount clause since he is the one who keeps a share.
  'COMMANDE_PARTIALLY_REFUNDED',
  // CF4-H (CF4-25), migration 20260930040000. The private quote request's lifecycle.
  // QUOTE_REFUSED is its own member, not OFFER_DECLINED, whose copy reads « Le client a
  // choisi une autre offre » - false for a private quote the client simply refused.
  'QUOTE_REQUESTED',
  'QUOTE_DECLINED',
  'QUOTE_EXPIRED',
  'QUOTE_REFUSED',
  // CF4-I §4.7, migration 20260930050000. The client cancellation lifecycle. REQUESTED and
  // WITHDRAWN go to the RÉPARATEUR only (the client caused both, so he is never notified of
  // his own action); REFUSED goes to BOTH, worded differently per recipient (§4.7).
  // APPROVED emits no new type of its own - the refund engine's existing COMMANDE_REFUNDED /
  // COMMANDE_PARTIALLY_REFUNDED already covers it (spec §4.2 "Notifications are the refund
  // engine's").
  'CANCELLATION_REQUESTED',
  'CANCELLATION_WITHDRAWN',
  'CANCELLATION_REFUSED',
  'DISPUTE_MESSAGE',
  // CF5-07. Professional business verification lifecycle notifications.
  'BUSINESS_VERIFIED',
  'BUSINESS_REFUSED',
  'BUSINESS_DOCUMENTS_REQUIRED',
  'FISCAL_DECLARATION_REQUIRED',
  'DAC7_ANNUAL_RECAP_SENT',
  // V8 B2. The client validated but Revime is holding the réparateur's payout (no « Virements » yet,
  // or fiscal information missing). Sent to the RÉPARATEUR instead of FUNDS_RELEASED.
  'PAYOUT_WAITING',
  // V8 E1 (`DEC8-08` (1)). The 3- and 8-day « finish your setup » reminders; the server stores the sentence
  // in `subject`.
  'SETUP_REMINDER',
]);

export type NotificationType = z.infer<typeof notificationTypeSchema>;

/**
 * `CF-47`. The three groups the Paramètres screen offers, over the ten
 * `NotificationType` members.
 *
 * Three rather than ten, and the reason is honesty rather than tidiness:
 * `NotificationsService.emit` writes an in-app row and NOTHING else - there is no
 * mail or SMS fan-out, and push does not exist until `CF-44`. Ten switches over
 * one channel would be a control panel for a distinction the user cannot perceive.
 * The groups are the distinctions he can: offers and demande changes (both client-side
 * offers on his demandes and réparateur-side updates to demandes he quoted on), conversation
 * messages, and money.
 */
export type NotificationGroup = 'offers' | 'messages' | 'commandes' | 'account';

/**
 * 🛑 TOTAL, NOT SPARSE, AND THE `Record` IS THE GATE. `apps/mobile/AGENTS.md` records
 * that an eleventh `NotificationType` added in this package reaches four consumers and
 * `tsc` finds only the ones that opted into totality. This map opts in: a new member
 * is `TS2741` here, in the package that declared it, rather than a silently
 * unpreferenced notification discovered in production.
 *
 * Keep in step with the enum in `apps/api/prisma/schema.prisma`.
 */
export const NOTIFICATION_GROUP_BY_TYPE: Record<NotificationType, NotificationGroup> = {
  OFFER_RECEIVED: 'offers',
  OFFER_ACCEPTED: 'offers',
  OFFER_DECLINED: 'offers',
  MESSAGE_RECEIVED: 'messages',
  COMMANDE_STEP: 'commandes',
  FUNDS_RELEASED: 'commandes',
  COMMANDE_REFUNDED: 'commandes',
  PAYMENT_ABANDONED: 'commandes',
  // Both to `offers`, not a fourth group: a new group means another migration and a Paramètres
  // change, and a réparateur who silences offer activity silencing these too is coherent.
  DEMANDE_UPDATED: 'offers',
  DEMANDE_WITHDRAWN: 'offers',
  // `offers`, following DEMANDE_UPDATED and DEMANDE_WITHDRAWN: a new group means another
  // migration and a Paramètres change, and a réparateur who silences offer activity
  // silencing this too is coherent.
  DEMANDE_MODERATED: 'offers',
  // Money-adjacent and order-scoped, so `commandes` like COMMANDE_STEP. No fourth group.
  PARCEL_LABEL_READY: 'commandes',
  PARCEL_SHIPPED: 'commandes',
  PARCEL_OUT_FOR_DELIVERY: 'commandes',
  PARCEL_AT_PICKUP_POINT: 'commandes',
  PARCEL_DELIVERED: 'commandes',
  PARCEL_INCIDENT: 'commandes',
  // CF4-E. Order-scoped, like COMMANDE_STEP and the PARCEL_* rows.
  DISPUTE_OPENED: 'commandes',
  DISPUTE_DISMISSED: 'commandes',
  // The new `account` group. Verification outcomes decide whether a réparateur can work at
  // all - a standing on the platform, not an event about one commande or one demande - so
  // they get their own group rather than joining `commandes`, and a réparateur has no
  // switch to silence them: `wants()` in apps/api answers `true` unconditionally for this
  // group (spec E5).
  IDENTITY_VERIFIED: 'account',
  IDENTITY_DOCUMENTS_REQUIRED: 'account',
  VERIFICATION_REVOKED: 'account',
  // CF4-D. Order-scoped, like COMMANDE_REFUNDED.
  COMMANDE_PARTIALLY_REFUNDED: 'commandes',
  // CF4-H. Offer activity on both sides, like OFFER_RECEIVED / OFFER_DECLINED.
  QUOTE_REQUESTED: 'offers',
  QUOTE_DECLINED: 'offers',
  QUOTE_EXPIRED: 'offers',
  QUOTE_REFUSED: 'offers',
  // CF4-I. Order-scoped, like COMMANDE_STEP and the dispute rows.
  CANCELLATION_REQUESTED: 'commandes',
  CANCELLATION_WITHDRAWN: 'commandes',
  CANCELLATION_REFUSED: 'commandes',
  DISPUTE_MESSAGE: 'commandes',
  // CF5-07. Account-level verification outcomes.
  BUSINESS_VERIFIED: 'account',
  BUSINESS_REFUSED: 'account',
  BUSINESS_DOCUMENTS_REQUIRED: 'account',
  // CMP-D3. Account-level DAC7 fiscal declaration reminder.
  FISCAL_DECLARATION_REQUIRED: 'account',
  // CMP-D4. Account-level DAC7 statutory annual recap sent.
  DAC7_ANNUAL_RECAP_SENT: 'account',
  // V8 B2. Same group as the FUNDS_RELEASED it stands in for.
  PAYOUT_WAITING: 'commandes',
  // V8 E1, `DEC8-08` (5). A nudge, not a decision about his account: « Offres et demandes » off silences it, and a
  // repairer who turned off offer activity does not want « a client is looking for a repairer ».
  SETUP_REMINDER: 'offers',
};

/**
 * `mode` is REQUIRED and comes from the query string rather than the session's
 * `activeMode`. The server could read it off `Profile`, but then the mobile cache key
 * would not contain it and switching mode would serve the other mode's list out of
 * cache. See the design §5.1.
 */
export const notificationQuerySchema = z.object({ mode: modeSchema });

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export type NotificationDto = {
  id: string;
  mode: z.infer<typeof modeSchema>;
  type: NotificationType;
  /**
   * The other party's name AS IT WAS when the event happened. Snapshotted, so a later
   * displayName edit does not rewrite history - the reasoning `Commande.transferredCents`
   * already carries. Nullable, so `notificationCopy` must produce a sentence without it.
   */
  actorName: string | null;
  /** The demande title, snapshotted for the same reason. */
  subject: string | null;
  amountCents: number | null;
  step: CommandeStep | null;
  /**
   * JOINED at read time from `messageId`, never snapshotted - so a moderation
   * soft-delete actually takes effect on this surface. Null both when there is no
   * message and when an operator removed it. See the design §3.5.
   */
  messagePreview: string | null;
  demandeId: string | null;
  commandeId: string | null;
  conversationId: string | null;
  read: boolean;
  createdAt: string;
};

export type NotificationCopy = { title: string; sub: string };

/**
 * Exactly the fields the copy reads. A narrower parameter than `NotificationDto` on
 * purpose: it makes every test case above constructible without inventing an id or a
 * timestamp, and it stops the copy from quietly starting to depend on routing ids.
 */
export type NotificationCopyInput = Pick<
  NotificationDto,
  'mode' | 'type' | 'actorName' | 'subject' | 'amountCents' | 'step' | 'messagePreview'
>;

/**
 * A trimmed name, or the fallback. Trimmed BEFORE the emptiness test, so a
 * whitespace-only `displayName` - which the database permits - does not pass a
 * truthiness check and render « Bonjour   a proposé ».
 */
function named(value: string | null, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

/** The demande title in French quotes, or null so the clause can be dropped entirely. */
function quoted(subject: string | null): string | null {
  const trimmed = subject?.trim();
  return trimmed && trimmed.length > 0 ? `« ${trimmed} »` : null;
}

/**
 * One line per step, addressed to the party who did NOT cause it - which is why there
 * are eight and not eighteen. `STEP_CLAIMANT` already records who causes each step, so
 * the recipient's mode is implied and needs no branch here. See the design §4.2.
 *
 * `RELEASED` is ABSENT rather than mapped: it has a null claimant and is already covered
 * by FUNDS_RELEASED, so emitting COMMANDE_STEP for it would notify twice about one event.
 *
 * 🛑 `PAID` was absent for the same stated reason until CF-43, and the reason was only
 * half true. « Already covered by a dedicated type » meant OFFER_ACCEPTED - which goes to
 * the RÉPARATEUR and reads « Le client a accepté votre offre ». Nothing covered the client,
 * so the person who paid was the one party the payment never notified. It is mapped now,
 * and it is emitted to the client ONLY, from the webhook rather than from `advanceStep`.
 */
const STEP_COPY: Partial<Record<CommandeStep, { title: string; sub: (who: string) => string }>> = {
  // CF-43. The client asked to be notified when a payment goes through, and he was the one
  // party nobody told: the webhook notified the winning réparateur and every loser. Title
  // matches CF-38's chain position and `acceptee.tsx`'s heading, so the notification and the
  // screen cannot read as two different events.
  //
  // 🛑 The sub takes no actor, and that is load-bearing rather than terse. STEP_CLAIMANT.PAID
  // is null and `stepCopy` resolves a null claimant to « Le réparateur », so interpolating
  // `who` here would tell the client his réparateur had paid. Same shape as
  // AWAITING_VALIDATION below, which ignores `who` for its own reason.
  PAID: { title: 'Paiement effectué', sub: () => 'La réparation peut maintenant commencer' },
  PARCEL_SENT: { title: 'Colis envoyé', sub: (who) => `${who} a expédié l'objet` },
  PARCEL_RECEIVED: { title: 'Colis reçu', sub: (who) => `${who} a reçu votre objet` },
  REPAIR_STARTED: { title: 'Réparation en cours', sub: (who) => `${who} a démarré la réparation` },
  REPAIR_DONE: { title: 'Réparation terminée', sub: (who) => `${who} a terminé la réparation` },
  RETURN_SENT: { title: 'Objet renvoyé', sub: (who) => `${who} vous a renvoyé l'objet` },
  RETURN_RECEIVED: {
    title: 'Objet reçu par le client',
    sub: (who) => `${who} a confirmé la réception`,
  },
  // The only row addressed as an instruction rather than a report, because it is the one
  // step where the recipient must act for the money to move.
  AWAITING_VALIDATION: {
    title: 'Validation attendue',
    sub: () => 'Confirmez la réparation pour débloquer les fonds',
  },
};

/** Reached only if a step outside STEP_COPY is emitted, which is a bug upstream. */
/** « Aller · « titre » » / « Retour · « titre » », or the leg alone when the demande title is unknown. */
function legLine(step: CommandeStep | null | undefined, subject: string | null): string {
  const leg = step === 'RETURN_SENT' ? 'Retour' : 'Aller';
  return subject ? `${leg} · ${subject}` : leg;
}

const STEP_FALLBACK: NotificationCopy = {
  title: 'Suivi de la réparation',
  sub: 'La réparation a avancé',
};

function stepCopy(input: NotificationCopyInput): NotificationCopy {
  if (input.step === null) return STEP_FALLBACK;
  const entry = STEP_COPY[input.step];
  if (!entry) return STEP_FALLBACK;

  // The actor is the step's CLAIMANT, so the fallback names that role rather than a
  // generic person.
  //
  // 🛑 STEP_CLAIMANT is null for PAID and RELEASED. RELEASED has no entry above and returned
  // already - but PAID DOES have one as of CF-43, so it reaches this line with a null claimant
  // and `who` resolves to « Le réparateur » via the else branch. That is harmless ONLY because
  // the PAID entry's sub ignores its argument. Any future claimant-less entry must do the same,
  // or read the claimant explicitly instead of relying on this fallback.
  const claimant = STEP_CLAIMANT[input.step];
  const who = named(input.actorName, claimant === 'CLIENT' ? 'Le client' : 'Le réparateur');
  return { title: entry.title, sub: entry.sub(who) };
}

/**
 * The ONLY place a notification's French exists. Nothing in `apps/api` or `apps/mobile`
 * builds one of these strings.
 *
 * Every branch must produce a sentence for every combination of absent columns. That is
 * not defensive padding: `actorName`, `subject` and `amountCents` are all nullable, a
 * newly added field arrives `undefined` from an API that predates it
 * (`apps/mobile/AGENTS.md`), and this function's output is rendered directly.
 *
 * No trailing period, matching the prototype's own rows. A joined message body keeps
 * whatever punctuation the sender typed.
 */
export function notificationCopy(input: NotificationCopyInput): NotificationCopy {
  const subject = quoted(input.subject);
  // FIX 4: Use == null instead of === null so undefined also collapses to null,
  // preventing NaN from reaching euros() and yielding « NaN € » on screen.
  const amount = input.amountCents == null ? null : euros(input.amountCents);

  switch (input.type) {
    case 'OFFER_RECEIVED': {
      const who = named(input.actorName, 'Un réparateur');
      // Assembled from parts so a null price or a null subject removes its clause
      // instead of leaving « a proposé  pour ».
      const sub = [`${who} a proposé`, amount ?? 'une offre', subject ? `pour ${subject}` : null]
        .filter((part): part is string => part !== null)
        .join(' ');
      return { title: 'Nouvelle offre reçue', sub };
    }

    case 'OFFER_ACCEPTED': {
      const who = named(input.actorName, 'Le client');
      return {
        title: 'Offre acceptée',
        sub:
          amount === null
            ? `${who} a accepté votre offre`
            : `${who} a accepté votre offre de ${amount}`,
      };
    }

    case 'OFFER_DECLINED':
      // « Le client » rather than his name, deliberately: being outbid is not something
      // to attach a person to, and the réparateur has no relationship with that client.
      return {
        title: 'Offre non retenue',
        sub: subject
          ? `Le client a choisi une autre offre pour ${subject}`
          : 'Le client a choisi une autre offre',
      };

    case 'MESSAGE_RECEIVED': {
      const preview = input.messagePreview?.trim();
      return {
        title: `Message de ${named(input.actorName, 'votre correspondant')}`,
        // « Nouveau message » covers both no-message and moderation-removed. The title
        // still names the sender, so the two lines never read as duplicates.
        sub: preview && preview.length > 0 ? preview : 'Nouveau message',
      };
    }

    case 'COMMANDE_STEP':
      return stepCopy(input);

    case 'FUNDS_RELEASED':
      // The line that forced this whole function to be keyed on mode: « versés à votre
      // réparateur » is true for a client and a lie for a réparateur, and the prototype
      // shows the client's version on both screens. See the design §2.
      //
      // V8 `Q8-08`: « débloqués pour », not « versés à ». Revime may be HOLDING the réparateur's
      // payout (no « Virements » yet, or fiscal information missing), and « versés » was then false;
      // « débloqués pour votre réparateur » is true whether the transfer left today or later.
      //
      // V8 `ISS8-020` (b): the participle agrees with the amount, singular below 2 € (« 1 € débloqué »).
      return input.mode === 'CLIENT'
        ? {
            title: 'Fonds débloqués',
            sub:
              amount === null
                ? 'Les fonds ont été débloqués pour votre réparateur'
                : `${amount} ${input.amountCents! < 200 ? 'débloqué' : 'débloqués'} pour votre réparateur`,
          }
        : {
            title: 'Paiement reçu',
            sub:
              amount === null
                ? 'Le paiement a été versé sur votre compte'
                : `${amount} ${input.amountCents! < 200 ? 'versé' : 'versés'} sur votre compte`,
          };

    // CF-43. The client asked for « paiement refusé » and that event CANNOT EXIST:
    // `payments/gateway.ts` sets `payment_method_types: ['card']`, cards settle
    // synchronously so `checkout.session.async_payment_failed` never fires, and a declined
    // card never leaves Stripe Checkout in the first place. The only real failure signals
    // are abandonment and `checkout.session.expired`.
    //
    // 🛑 So the wording is his own from CF-40 - « n'a pas abouti » - and deliberately NOT
    // his « refusé », which would assert a decline nobody observed. Same discipline that
    // chose CF-40's heading. No amount, because nothing was ever charged, and the retry
    // affordance lives on the échec screen this row deep-links to rather than in the text.
    case 'PAYMENT_ABANDONED':
      return {
        title: 'Paiement non finalisé',
        // No past participle agreeing with the subject: a demande title's gender is
        // unknowable here (« Écran » vs « Batterie »), so the verb stays on « paiement ».
        sub: subject
          ? `Votre paiement pour ${subject} n'a pas abouti`
          : "Votre paiement n'a pas abouti",
      };

    case 'COMMANDE_REFUNDED':
      return input.mode === 'CLIENT'
        ? {
            title: 'Remboursement effectué',
            sub:
              amount === null
                ? 'Votre commande a été remboursée'
                : `${amount} remboursés${subject ? ` pour ${subject}` : ''}`,
          }
        : {
            title: 'Commande remboursée',
            sub: subject ? `${subject} a été remboursée` : 'Une commande a été remboursée',
          };

    case 'DEMANDE_UPDATED':
      return {
        title: 'Demande modifiée',
        sub: subject
          ? `Le client a modifié ${subject}`
          : 'Le client a modifié une demande que vous avez chiffrée',
      };

    // « Le client » rather than a name, following OFFER_DECLINED: the réparateur has no
    // relationship with this client, and the emit passes no actorName for that reason.
    case 'DEMANDE_WITHDRAWN':
      return {
        title: 'Demande retirée',
        sub: subject
          ? `Le client a retiré ${subject}`
          : 'Le client a retiré une demande que vous avez chiffrée',
      };

    /**
     * 🛑 « Revime », never « le client ». This is the whole reason the member exists rather
     * than reusing DEMANDE_WITHDRAWN: that branch reads « Le client a retiré … », and an
     * operator removal attributed to the client is a false claim about a person the
     * réparateur was dealing with.
     *
     * The MOTIVE is deliberately absent. `hiddenReason` / `deletedReason` are the
     * operator's internal words and disclosing them to a third party would leak a
     * moderation judgement about the author.
     */
    case 'DEMANDE_MODERATED':
      return {
        title: 'Demande retirée',
        sub: subject
          ? `Revime a retiré ${subject}`
          : 'Revime a retiré une demande que vous avez chiffrée',
      };

    // Livraison Boxtal. `step` is the LEG marker (see the enum comment); `subject` the demande.
    case 'PARCEL_LABEL_READY':
      return {
        title: 'Votre étiquette est prête',
        sub: 'Téléchargez-la depuis votre commande et déposez le colis',
      };
    case 'PARCEL_SHIPPED':
      return { title: 'Colis pris en charge par le transporteur', sub: legLine(input.step, subject) };
    case 'PARCEL_OUT_FOR_DELIVERY':
      return { title: 'Colis en cours de livraison', sub: legLine(input.step, subject) };
    case 'PARCEL_AT_PICKUP_POINT':
      return { title: 'Colis disponible en point relais', sub: legLine(input.step, subject) };
    case 'PARCEL_DELIVERED':
      return { title: 'Colis livré', sub: legLine(input.step, subject) };
    case 'PARCEL_INCIDENT':
      return { title: 'Incident de livraison', sub: legLine(input.step, subject) };

    // CF4-E §3 (E3), amended CF4-J §4.3. Branches on actorName:
    // non-null → party-opened (mockup 7), sent to the other party only;
    // null → admin-opened, today's copy unchanged.
    case 'DISPUTE_OPENED': {
      const actor = input.actorName?.trim();
      if (actor && actor.length > 0) {
        return {
          title: 'Nouveau litige',
          sub: subject
            ? `${actor} a ouvert un litige sur la commande ${subject}. Consultez la conversation et transmettez vos éléments à REVIME`
            : `${actor} a ouvert un litige sur votre commande. Consultez la conversation et transmettez vos éléments à REVIME`,
        };
      }
      return {
        title: 'Litige ouvert',
        sub: subject
          ? `REVIME examine la commande ${subject}. Les fonds sont conservés jusqu'à la résolution.`
          : "REVIME examine la commande. Les fonds sont conservés jusqu'à la résolution.",
      };
    }

    // Same reasoning as DISPUTE_OPENED: one sentence, both parties.
    case 'DISPUTE_DISMISSED':
      return {
        title: 'Litige clos',
        sub: subject
          ? `La commande ${subject} reprend son cours normal.`
          : 'La commande reprend son cours normal.',
      };

    // CF4-J §4.4. REVIME wrote in a confidential dispute space.
    case 'DISPUTE_MESSAGE':
      return {
        title: 'REVIME — Support',
        sub: subject
          ? `Nouveau message au sujet du litige sur la commande ${subject}`
          : 'Nouveau message au sujet de votre litige',
      };

    // Verification outcomes. No subject, no amount, no step - these are about the person's
    // standing, not about one commande, which is also why they get their own `account`
    // group instead of joining `commandes`.
    case 'IDENTITY_VERIFIED':
      return {
        title: 'Identité vérifiée',
        sub: 'Votre identité a été vérifiée. Consultez votre statut de vérification.',
      };
    case 'IDENTITY_DOCUMENTS_REQUIRED':
      return {
        title: 'Documents à refaire',
        sub: "Votre vérification d'identité n'a pas abouti. Vous pouvez recommencer.",
      };
    case 'VERIFICATION_REVOKED':
      return {
        title: 'Vérification retirée',
        sub: 'REVIME a retiré un niveau de vérification de votre compte.',
      };
    case 'BUSINESS_VERIFIED':
      return {
        title: 'Entreprise vérifiée',
        sub: 'Votre entreprise a été vérifiée. Le badge « Professionnel vérifié » est activé.',
      };
    case 'BUSINESS_REFUSED':
      return {
        title: 'Vérification refusée',
        sub: "REVIME a refusé votre vérification d'entreprise. Vous pouvez recommencer.",
      };
    case 'BUSINESS_DOCUMENTS_REQUIRED':
      return {
        title: 'Documents requis',
        sub: 'REVIME vous demande de nouveaux documents pour valider votre entreprise.',
      };
    case 'FISCAL_DECLARATION_REQUIRED':
      return {
        title: 'Déclaration fiscale requise (DAC7)',
        sub: subject ?? 'Complétez vos informations fiscales pour continuer à recevoir vos versements.',
      };
    // V8 B2. The client's own sentence. « configuration » covers both reasons a payout is held
    // (« Virements » and the fiscal information), and the tap opens the page that lists both.
    case 'PAYOUT_WAITING':
      return {
        title: 'Paiement en attente',
        sub:
          amount === null
            ? 'Votre paiement vous attend : terminez votre configuration pour le recevoir.'
            : `Votre paiement de ${amount} vous attend : terminez votre configuration pour le recevoir.`,
      };
    // V8 E1. The sentence is built on the server when the reminder is sent (`setupReminderFirstText` /
    // `setupReminderSecondText`) and stored in `subject`, so the push and this row read the same words.
    case 'SETUP_REMINDER':
      return {
        title: SETUP_REMINDER_TITLE,
        // The RAW subject: the local `subject` above is the quoted form (« … »), right for a demande title,
        // wrong for a whole sentence.
        sub: input.subject?.trim() || 'Terminez votre configuration réparateur.',
      };
    case 'DAC7_ANNUAL_RECAP_SENT': {
      const year = input.subject?.trim();
      return {
        title: 'Récapitulatif annuel DAC7',
        sub: year
          ? `Votre récapitulatif annuel de revenus pour l'année ${year} est disponible.`
          : 'Votre récapitulatif annuel de revenus est disponible.',
      };
    }

    // CF4-D. Reads the same title as COMMANDE_REFUNDED - it is the same kind of event,
    // a refund, just not for the full amount - but the sub is worded from the
    // RÉPARATEUR's side rather than branched on `mode` like COMMANDE_REFUNDED: what the
    // client is told is exactly the amount clause dropped, since he has no share to be
    // told about.
    case 'COMMANDE_PARTIALLY_REFUNDED':
      return {
        title: 'Commande remboursée',
        sub:
          amount === null
            ? 'Commande remboursée au client'
            : `Commande remboursée au client · ${amount} vous reviennent`,
      };

    // CF4-H. Spec §4.2. The client's name on QUOTE_REQUESTED (the réparateur is being asked
    // by a person); the other three name the role only, like OFFER_DECLINED.
    case 'QUOTE_REQUESTED': {
      const who = named(input.actorName, 'Un client');
      return {
        title: 'Nouvelle demande de devis',
        sub: subject ? `${who} vous demande un devis pour ${subject}` : `${who} vous demande un devis`,
      };
    }
    case 'QUOTE_DECLINED':
      return {
        title: 'Demande de devis refusée',
        sub: subject
          ? `Le réparateur a refusé votre demande pour ${subject}`
          : 'Le réparateur a refusé votre demande',
      };
    case 'QUOTE_EXPIRED':
      return {
        title: 'Demande de devis expirée',
        sub: subject ? `Aucune réponse sous 7 jours pour ${subject}` : 'Aucune réponse sous 7 jours',
      };
    case 'QUOTE_REFUSED':
      return {
        title: 'Devis refusé',
        sub: subject
          ? `Le client a refusé votre devis pour ${subject}`
          : 'Le client a refusé votre devis',
      };

    // CF4-I §4.7. To the réparateur only - the client caused this, so he is never notified of
    // his own request. `actorName` carries the reason LABEL (never the comment - I6), passed
    // by the caller as `CANCELLATION_REASON_LABEL[reason]`.
    case 'CANCELLATION_REQUESTED': {
      const motif = input.actorName?.trim();
      const motifClause = motif && motif.length > 0 ? ` : ${motif}.` : '.';
      return {
        title: 'Annulation demandée',
        sub: subject
          ? `Le client a demandé l'annulation de ${subject}${motifClause} REVIME examine la demande.`
          : `Le client a demandé l'annulation${motifClause} REVIME examine la demande.`,
      };
    }

    // CF4-I §4.7. To the réparateur only, same reasoning as CANCELLATION_REQUESTED.
    case 'CANCELLATION_WITHDRAWN':
      return {
        title: 'Annulation retirée',
        sub: subject
          ? `Le client a retiré sa demande d'annulation pour ${subject}. Vous pouvez reprendre.`
          : "Le client a retiré sa demande d'annulation. Vous pouvez reprendre.",
      };

    // CF4-I §4.7. To BOTH parties, worded differently: the client is told his own request was
    // refused; the réparateur is told the order resumes, following the DISPUTE_DISMISSED /
    // DISPUTE_OPENED shape of branching on `mode` for a fact both sides need worded for them.
    case 'CANCELLATION_REFUSED':
      return input.mode === 'CLIENT'
        ? {
            title: 'Annulation refusée',
            sub: subject
              ? `Votre demande d'annulation pour ${subject} a été refusée.`
              : "Votre demande d'annulation a été refusée.",
          }
        : {
            title: 'Annulation refusée',
            sub: subject
              ? `La demande d'annulation pour ${subject} a été refusée. Vous pouvez reprendre.`
              : "La demande d'annulation a été refusée. Vous pouvez reprendre.",
          };

    // FIX 3: Default for API-newer-than-app drift. When an installed build fetches a
    // row whose type was added after that build shipped, this renders a safe generic
    // rather than throwing and unwinding the whole app.
    default:
      return { title: 'Notification', sub: 'Vous avez une nouvelle notification' };
  }
}
