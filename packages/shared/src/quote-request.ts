import { z } from 'zod';
import { createDemandeSchema, feedQuerySchema, type DemandeStatus } from './demande.schemas.js';
import { travelModeSchema } from './offer.schemas.js';
import { euros } from './compare-criteria.js';
import { publicIdentity } from './public-identity.js';

/**
 * CF4 sub-project H - private « Demander un devis » (CF4-25) and client browsing (CF4-24).
 * Spec `docs/superpowers/specs/2026-09-30-cf4-h-devis-browse-design.md`.
 *
 * A private request is a `Demande` with `targetRepairerUserId`; the quote is an ordinary
 * `Offer`. Everything the app shows about the request's state is decided here (labels) so
 * the rule is unit-tested here and again where the screens apply it (`apps/mobile`'s vitest harness).
 */

/** H2: an unanswered request expires after this many days. */
export const QUOTE_REQUEST_TTL_DAYS = 7;

/** H6: the author already has an open quote request with this repairer. */
export const QUOTE_ALREADY_OPEN =
  'Vous avez déjà une demande de devis en cours auprès de ce réparateur.';

/**
 * Why a private request is CANCELLED. Keep in step with `QuoteClosedReason` in
 * `schema.prisma`.
 */
export const quoteClosedReasonSchema = z.enum([
  'DECLINED',
  'EXPIRED',
  'QUOTE_REFUSED',
  'CANCELLED_BY_CLIENT',
]);
export type QuoteClosedReason = z.infer<typeof quoteClosedReasonSchema>;

type TravelMode = z.infer<typeof travelModeSchema>;

/**
 * H3: the public demande's fields plus the two a public demande has no column for.
 *
 * Built by `.and()` over `createDemandeSchema` rather than re-listing its fields, so the
 * request and the demande cannot drift (title, description, budget refine, photo cap). The
 * budget refine stays on the demande half; `.and` keeps it.
 */
export const createQuoteRequestSchema = createDemandeSchema.and(
  z.object({
    /** « Mode d'intervention souhaité ». */
    preferredTravel: travelModeSchema.optional(),
    /** « Informations complémentaires ». */
    details: z.string().max(1000, { message: 'Informations trop longues.' }).optional(),
  }),
);
export type CreateQuoteRequestInput = z.infer<typeof createQuoteRequestSchema>;

export const declineQuoteRequestSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, { message: 'Indiquez la raison du refus.' })
    .max(300, { message: 'Raison trop longue.' }),
});
export type DeclineQuoteRequestInput = z.infer<typeof declineQuoteRequestSchema>;

/**
 * The private-request facts on `DemandeDto.quoteRequest`. Null on a public demande.
 * `declineNote` is the réparateur's reason, shown to the client (spec §4.2).
 */
export type QuoteRequestInfo = {
  repairer: { userId: string; displayName: string };
  preferredTravel: TravelMode | null;
  details: string | null;
  /** ISO. Null once a quote was sent (the timer stops) or the request closed. */
  expiresAt: string | null;
  closedReason: QuoteClosedReason | null;
  declineNote: string | null;
};

/**
 * H1: what a browsing client sees of someone else's open demande. Built by its own mapper
 * (`toPublicDemandeView` in apps/api) from an explicit select, so postcode, coordinates,
 * distance, author identity and offers are absent by construction.
 */
export type PublicDemandeView = {
  id: string;
  title: string;
  description: string;
  /** Signed URLs. */
  photos: string[];
  category: { id: string; labelFr: string };
  budgetCents: number | null;
  /** The town only. */
  locationLabel: string;
  createdAt: string;
};

/** GET demandes/browse. Same messages as `feedQuerySchema`; `page` is 1-based. */
export const BROWSE_PAGE_SIZE = 20;
export const browseQuerySchema = z.object({
  q: feedQuerySchema.shape.q,
  categoryId: feedQuerySchema.shape.categoryId,
  page: z.coerce
    .number({ message: 'Page invalide.' })
    .int({ message: 'Page invalide.' })
    .min(1, { message: 'Page invalide.' })
    .max(1000, { message: 'Page invalide.' })
    .optional(),
});
export type BrowseQuery = z.infer<typeof browseQuerySchema>;

/** One row of GET repairers/me/quote-requests. */
export type RepairerQuoteRequestItem = {
  demandeId: string;
  title: string;
  clientName: string;
  status: DemandeStatus;
  expiresAt: string | null;
  closedReason: QuoteClosedReason | null;
  liveQuote: { offerId: string; priceCents: number } | null;
  createdAt: string;
};

/**
 * Dedicated lifecycle status for private quote requests (CF6-15).
 * Matches the client's 5 exact lifecycle states.
 */
export const quoteLifecycleStatusSchema = z.enum([
  'PENDING_REPLY',
  'QUOTE_RECEIVED',
  'QUOTE_ACCEPTED',
  'REFUSED',
  'CANCELLED',
]);
export type QuoteLifecycleStatus = z.infer<typeof quoteLifecycleStatusSchema>;

export type QuoteBadgeTone = 'amber' | 'verified' | 'danger' | 'neutral';

export type QuoteBadgeInfo = {
  status: QuoteLifecycleStatus;
  label: string;
  tone: QuoteBadgeTone;
};

/**
 * Derives the canonical lifecycle status for a private quote request.
 */
export function getQuoteLifecycleStatus(args: {
  status: DemandeStatus;
  hasLiveQuote: boolean;
  closedReason?: QuoteClosedReason | null;
}): QuoteLifecycleStatus {
  switch (args.status) {
    case 'OPEN':
      return args.hasLiveQuote ? 'QUOTE_RECEIVED' : 'PENDING_REPLY';
    case 'IN_PROGRESS':
    case 'DONE':
      return 'QUOTE_ACCEPTED';
    case 'CANCELLED':
      if (args.closedReason === 'DECLINED' || args.closedReason === 'QUOTE_REFUSED') {
        return 'REFUSED';
      }
      return 'CANCELLED';
  }
}

/**
 * Resolves the dedicated label and visual badge tone for private quotes (CF6-15).
 * Supports role-adapted labels for CLIENT and REPAIRER.
 */
export function quoteBadge(args: {
  status: DemandeStatus;
  hasLiveQuote: boolean;
  closedReason?: QuoteClosedReason | null;
  /** Required: the two viewers read different words, and a default would hide a forgotten one. */
  viewer: 'CLIENT' | 'REPAIRER';
}): QuoteBadgeInfo {
  const lifecycle = getQuoteLifecycleStatus(args);
  const { viewer } = args;

  if (viewer === 'CLIENT') {
    switch (lifecycle) {
      case 'PENDING_REPLY':
        return { status: lifecycle, label: 'En attente de réponse', tone: 'amber' };
      case 'QUOTE_RECEIVED':
        return { status: lifecycle, label: 'Devis reçu', tone: 'amber' };
      case 'QUOTE_ACCEPTED':
        return { status: lifecycle, label: 'Devis accepté', tone: 'verified' };
      case 'REFUSED':
        return { status: lifecycle, label: 'Refusé', tone: 'danger' };
      case 'CANCELLED':
        return { status: lifecycle, label: 'Annulé', tone: 'neutral' };
    }
  } else {
    switch (lifecycle) {
      case 'PENDING_REPLY':
        return { status: lifecycle, label: 'À traiter', tone: 'amber' };
      case 'QUOTE_RECEIVED':
        return { status: lifecycle, label: 'Devis envoyé', tone: 'amber' };
      case 'QUOTE_ACCEPTED':
        return { status: lifecycle, label: 'Devis accepté', tone: 'verified' };
      case 'REFUSED':
        return { status: lifecycle, label: 'Refusé', tone: 'danger' };
      case 'CANCELLED':
        return { status: lifecycle, label: 'Annulé', tone: 'neutral' };
    }
  }
}

/**
 * The client's dedicated label for a private quote request (CF6-15).
 * Returns one of: « En attente de réponse », « Devis reçu », « Devis accepté », « Refusé », « Annulé ».
 */
export function quoteRequestLabel(
  info: QuoteRequestInfo,
  status: DemandeStatus,
  hasLiveQuote: boolean,
): string {
  return quoteBadge({
    status,
    hasLiveQuote,
    closedReason: info.closedReason,
    viewer: 'CLIENT',
  }).label;
}

/**
 * The header line of a private request's detail screen. The author sees who he asked; the
 * target réparateur passes `{ clientUsername }` and sees who is asking (never his own name).
 */
export function quoteRequestHeader(
  info: QuoteRequestInfo,
  target?: { clientUsername: string | null },
): string {
  if (target) {
    const clientLabel = target.clientUsername
      ? publicIdentity({ username: target.clientUsername, displayName: null })
      : 'Client';
    return `Demande de devis privée · ${clientLabel}`;
  }
  return `Demande de devis privée · ${info.repairer.displayName}`;
}

export type QuoteRequestViewer = 'AUTHOR' | 'TARGET' | 'OTHER';

export type QuoteRequestActions = {
  /** Author: « Annuler la demande ». */
  canCancel: boolean;
  /** Author: « Refuser » the live quote. */
  canRefuseQuote: boolean;
  /** Author: see the quote (then « Accepter » via the existing checkout). */
  canViewQuote: boolean;
  /** Target: « Envoyer un devis » (the existing offer form). */
  canSendQuote: boolean;
  /** Target: « Refuser la demande ». */
  canDecline: boolean;
};

/** Which buttons a private request shows. Only an OPEN request has any. */
export function quoteRequestActions(args: {
  viewer: QuoteRequestViewer;
  status: DemandeStatus;
  hasLiveQuote: boolean;
}): QuoteRequestActions {
  const none: QuoteRequestActions = {
    canCancel: false,
    canRefuseQuote: false,
    canViewQuote: false,
    canSendQuote: false,
    canDecline: false,
  };
  if (args.status !== 'OPEN') return none;
  if (args.viewer === 'AUTHOR') {
    return {
      ...none,
      canCancel: true,
      canViewQuote: args.hasLiveQuote,
      canRefuseQuote: args.hasLiveQuote,
    };
  }
  if (args.viewer === 'TARGET') {
    return { ...none, canDecline: true, canSendQuote: !args.hasLiveQuote };
  }
  return none;
}

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/**
 * « 7 octobre », in the device's local time. Built by hand rather than with
 * `toLocaleDateString(..., { timeZone })`: Hermes' Intl coverage varies by build, and a
 * local-time day is what the reader expects anyway.
 */
export function quoteExpiryDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

const REPAIRER_CLOSED_LABEL: Record<QuoteClosedReason, string> = {
  DECLINED: 'Vous avez refusé',
  EXPIRED: 'Expirée sans réponse',
  QUOTE_REFUSED: 'Devis refusé par le client',
  CANCELLED_BY_CLIENT: 'Annulée par le client',
};

/** The réparateur's « Demandes de devis » row label - the counterpart of `quoteRequestLabel`. */
export function repairerQuoteRequestLabel(item: RepairerQuoteRequestItem): string {
  switch (item.status) {
    case 'OPEN':
      if (item.liveQuote) return `Devis envoyé · ${euros(item.liveQuote.priceCents)}`;
      return item.expiresAt ? `À traiter avant le ${quoteExpiryDay(item.expiresAt)}` : 'À traiter';
    case 'IN_PROGRESS':
    case 'DONE':
      return 'Devis accepté';
    case 'CANCELLED':
      return item.closedReason ? REPAIRER_CLOSED_LABEL[item.closedReason] : 'Annulée';
  }
}

const CLIENT_CLOSED_DETAIL: Record<QuoteClosedReason, string> = {
  DECLINED: 'Refusée par le réparateur',
  EXPIRED: `Expirée : aucune réponse sous ${QUOTE_REQUEST_TTL_DAYS} jours`,
  QUOTE_REFUSED: 'Devis refusé par vous',
  CANCELLED_BY_CLIENT: 'Demande annulée',
};

const REPAIRER_CLOSED_DETAIL: Record<QuoteClosedReason, string> = {
  DECLINED: 'Vous avez refusé cette demande',
  EXPIRED: 'Expirée sans réponse',
  QUOTE_REFUSED: 'Devis refusé par le client',
  CANCELLED_BY_CLIENT: 'Annulée par le client',
};

/**
 * The badge of a CLIENT list row (Mes réparations, Mes demandes), or `null` when the ordinary
 * repair ladder (`repairStatus`) should speak instead. Both lists used to carry this 14-line
 * ternary separately; the detail screen and `QuoteRequestList` still do not apply the override.
 *
 * A private quote gets its dedicated lifecycle badge UNLESS something more urgent is true of
 * the commande: an open dispute, a pending cancellation or a refund. Those keep the ladder's
 * label and tone, so « Litige en cours » is never hidden behind « Devis accepté ».
 */
export function privateQuoteListBadge(args: {
  isPrivate: boolean;
  quoteRequest: QuoteRequestInfo | null;
  status: DemandeStatus;
  offerCount: number;
  /** A dispute, a pending cancellation or a refund: the ladder wins. */
  ladderOverrides: boolean;
}): QuoteBadgeInfo | null {
  if (!args.isPrivate || args.quoteRequest === null || args.ladderOverrides) return null;
  return quoteBadge({
    status: args.status,
    hasLiveQuote: args.offerCount > 0,
    closedReason: args.quoteRequest.closedReason,
    viewer: 'CLIENT',
  });
}

/**
 * Returns an explanatory closure sentence for detail screens when closed.
 */
export function quoteClosedDetail(
  reason: QuoteClosedReason | null | undefined,
  viewer: 'CLIENT' | 'REPAIRER',
): string | null {
  if (!reason) return null;
  return viewer === 'CLIENT' ? CLIENT_CLOSED_DETAIL[reason] : REPAIRER_CLOSED_DETAIL[reason];
}

/**
 * The target réparateur's status label on the request screen - the counterpart of
 * `quoteRequestLabel`, which speaks to the client (CF6-15).
 * Returns one of: « À traiter », « Devis envoyé », « Devis accepté », « Refusé », « Annulé ».
 */
export function quoteRequestTargetLabel(
  info: QuoteRequestInfo,
  status: DemandeStatus,
  hasLiveQuote: boolean,
): string {
  return quoteBadge({
    status,
    hasLiveQuote,
    closedReason: info.closedReason,
    viewer: 'REPAIRER',
  }).label;
}
