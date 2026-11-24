import type { NotificationDto } from "@revime/shared";

/**
 * Where a notification leads. ONE function for both surfaces: the notification screen's row
 * tap, and (`CF-44`) a push tap on the lock screen - a `PushData` satisfies `NotificationTarget`
 * too. Null when the id it needs is absent, which every caller treats as « stay put ».
 *
 * Moved out of `app/notifications.tsx` by `CF-44`, unchanged: the two deliberate `null` cases and
 * the `default` are load-bearing and their comments travel with them.
 *
 * OFFER_ACCEPTED opens the COMMANDE and not the demande: by then a commande exists and is
 * paid, the demande is IN_PROGRESS, and the réparateur's remaining work - tracking, then
 * asking for release - is all on the commande screen. Design §6.2 of the 2026-08-20 notifications design.
 */
export type NotificationTarget = Pick<
  NotificationDto,
  "type" | "demandeId" | "commandeId" | "conversationId"
>;

export function destinationFor(n: NotificationTarget): string | null {
  switch (n.type) {
    case "OFFER_RECEIVED":
      return n.demandeId === null ? null : `/demande/${n.demandeId}/offres`;
    case "OFFER_ACCEPTED":
      return n.commandeId === null ? null : `/commande/${n.commandeId}`;
    case "OFFER_DECLINED":
      return n.demandeId === null ? null : `/demande/${n.demandeId}`;
    case "MESSAGE_RECEIVED":
      return n.conversationId === null
        ? null
        : `/conversation/${n.conversationId}`;
    case "COMMANDE_STEP":
    case "FUNDS_RELEASED":
    case "COMMANDE_REFUNDED":
    // CF4-D task 8. A partial refund lands on the same commande screen as a full one.
    case "COMMANDE_PARTIALLY_REFUNDED":
      return n.commandeId === null ? null : `/commande/${n.commandeId}`;

    // CF-43. The OFFERS LIST, deliberately, and NOT CF-40's échec screen even though that is
    // the screen for this event. Two reasons, both measured:
    //
    // 1. `echec.tsx:37` renders « Réessayer » only `{offerId && ...}`, and `Notification` has
    //    no offerId column - so this row could only ever open a failure page with its retry
    //    button hidden, which is a dead end wearing the right title.
    // 2. By the time this notification is tapped the session has EXPIRED, so there is no live
    //    session to resume anyway. The commande is ABANDONED, which vacates the partial unique
    //    index and returns `repairStatus()` to client index 0 - the offers are intact and
    //    choosing one again is the actual recovery path.
    //
    // 🛑 This switch has a `default` (FIX 3 below), so an unhandled type here does NOT fail
    // typecheck the way `ICON_FOR` does in NotificationRow - it silently marks read and stays
    // put. That asymmetry is why this case is written rather than assumed.
    case "PAYMENT_ABANDONED":
      return n.demandeId === null ? null : `/demande/${n.demandeId}/offres`;

    case "DEMANDE_UPDATED":
      return n.demandeId === null ? null : `/demande/${n.demandeId}`;

    // CF6-12: a private quote cancellation carries the conversation where the notice was
    // recorded, so the tap lands there. A public demande has none and stays put (null): it is
    // soft-deleted, so `/demande/:id` would be a 404. `!` rather than `=== null` because an API
    // older than this app omits the field (`undefined`), and that must not become `/conversation/undefined`.
    case "DEMANDE_WITHDRAWN":
      return !n.conversationId ? null : `/conversation/${n.conversationId}`;

    // 🛑 `null` ON PURPOSE: the demande is hidden or soft-deleted by the time this row exists,
    // so every demande-scoped destination is a guaranteed 404 - a dead end wearing the right
    // title. (DEMANDE_WITHDRAWN above returns null for the same reason on a public demande, and
    // only gains a destination - the conversation - when the cancellation was recorded in one.) Written rather than left to the
    // `default` below, because this switch HAS a default: an unwritten case here silently
    // marks read and stays put, and would look identical to a deliberate decision.
    case "DEMANDE_MODERATED":
      return null;

    // Livraison Boxtal. Every parcel event lives on the commande screen (label button,
    // timeline). Written rather than left to `default`, per the AGENTS.md rule on this switch.
    case "PARCEL_LABEL_READY":
    case "PARCEL_SHIPPED":
    case "PARCEL_OUT_FOR_DELIVERY":
    case "PARCEL_AT_PICKUP_POINT":
    case "PARCEL_DELIVERED":
    case "PARCEL_INCIDENT":
      return n.commandeId === null ? null : `/commande/${n.commandeId}`;

    // CF4-28. Spec E1: a dispute notification moves to the litige screen, which does not
    // exist yet - tracked by CF4-28. Until then land on the commande, the closest real
    // screen; null when there is none to open.
    case "DISPUTE_OPENED":
    case "DISPUTE_DISMISSED":
      return n.commandeId === null ? null : `/commande/${n.commandeId}`;

    // CF4-31 (spec §4.7): DISPUTE_MESSAGE routes to /commande/{id}/litige
    case "DISPUTE_MESSAGE":
      return n.commandeId === null ? null : `/commande/${n.commandeId}/litige`;

    // CF4-E. `/statut-verification`, NOT `/verification` - that route is the email/phone
    // OTP screen, and these three notifications are about identity/KYC status, which is a
    // different flow entirely.
    case "IDENTITY_VERIFIED":
    case "IDENTITY_DOCUMENTS_REQUIRED":
    case "VERIFICATION_REVOKED":
      return "/statut-verification";

    // CF5-07. Professional business verification leads to /entreprise.
    case "BUSINESS_VERIFIED":
    case "BUSINESS_REFUSED":
    case "BUSINESS_DOCUMENTS_REQUIRED":
      return "/entreprise";

    // CMP-D3. The reminder and the held-payout notice exist to send the réparateur to the form; a
    // tap that went nowhere (the default arm) would defeat both.
    case "FISCAL_DECLARATION_REQUIRED":
      return "/fiscalite";

    // V8 B2. « Votre paiement vous attend : terminez votre configuration ». The setup page lists
    // every step still to do (« Virements », « Informations fiscales »), whichever held the payout.
    case "PAYOUT_WAITING":
      return "/statut-verification";

    // V8 E1. Both setup reminders open the setup page; the 8-day one names a request in its sentence (and
    // `demandeId`), but its point is « finish your setup », which the request page cannot do.
    case "SETUP_REMINDER":
      return "/statut-verification";

    // CMP-D4. The yearly recap itself is the email; the app has no screen for it, and the screen it
    // belongs to is the fiscal information it is drawn from, which the réparateur can check there.
    case "DAC7_ANNUAL_RECAP_SENT":
      return "/fiscalite";

    // CF4-25 (spec §4.3): every quote-request event opens the request screen. The server lets
    // BOTH parties read a private request in any status (`getForViewer`), so a closed one -
    // declined, refused, expired - still renders its reason rather than 404ing.
    case "QUOTE_REQUESTED":
    case "QUOTE_DECLINED":
    case "QUOTE_REFUSED":
    case "QUOTE_EXPIRED":
      return n.demandeId === null ? null : `/demande/${n.demandeId}`;

    // CF4-27 (spec §4.7). All three cancellation-lifecycle events land on the commande, the
    // same shape as COMMANDE_STEP - both parties can read the pending/refused state there.
    case "CANCELLATION_REQUESTED":
    case "CANCELLATION_WITHDRAWN":
    case "CANCELLATION_REFUSED":
      return n.commandeId === null ? null : `/commande/${n.commandeId}`;

    // FIX 3: Default for API-newer-than-app drift. An unknown type means the API added
    // one after this build shipped. Return null so the tap marks read and stays put
    // rather than throwing and unwinding the app.
    default:
      return null;
  }
}
