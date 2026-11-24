import { z } from 'zod';
import type { AdminReviewsSummary } from './admin.schemas.js';

/**
 * One star value: an integer 1 to 5.
 *
 * `.int()` before the bounds, deliberately, so 4.5 is refused as a rating rather than
 * silently truncated - `Review.rating` is an `Int` column and Prisma would round a
 * float, which turns a half-star UI nobody built into a value nobody chose.
 */
const starSchema = z
  .int({ message: 'Note invalide.' })
  .min(1, { message: 'Note invalide.' })
  .max(5, { message: 'Note invalide.' });

/**
 * The global rating is REQUIRED and the three sub-ratings are not, which mirrors the
 * approved screen exactly: `LaisserAvis.tsx:128` disables « Publier mon avis » while
 * `stars === 0`, and line 91 labels the three details « facultatif ».
 *
 * The sub-ratings are stored and NEVER folded into `rating` (spec §4.4a). Averaging
 * them in would move a réparateur's headline Note when a client fills a field the
 * screen told him he could skip.
 *
 * Unknown keys are stripped by Zod, which is what stops a hostile body naming its own
 * `repairerUserId` - the service derives that from the commande. Pinned in this
 * schema's own test, because the protection is Zod's rather than ours.
 */
export const createReviewSchema = z.object({
  rating: starSchema,
  qualityRating: starSchema.optional(),
  delayRating: starSchema.optional(),
  communicationRating: starSchema.optional(),
  /**
   * 500 to match the prototype's own `maxLength={500}`. Optional rather than
   * defaulted to '': `Review.comment` is nullable, so « no comment » has exactly one
   * representation and a screen cannot invent a second by sending an empty string.
   */
  comment: z.string().max(500, { message: 'Commentaire trop long.' }).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/** One review as the public list renders it. */
export type ReviewDto = {
  id: string;
  /**
   * The author's FIRST NAME, never the full account name - spec §4.5. A review is
   * public and permanent and attached to a repair its author paid for, so a full legal
   * name is more exposure than the feature needs. `User.firstName` is nullable
   * (`schema.prisma:451`), so `User.name` is the fallback.
   *
   * This is NOT the same decision as `counterpartName` in `conversations.service.ts`,
   * which still shows a réparateur the client's full account name and is the owner's
   * open call. A private channel and a public list are different exposures.
   */
  authorName: string;
  rating: number;
  /** Null when the client skipped it. Never averaged into `rating`. */
  qualityRating: number | null;
  delayRating: number | null;
  communicationRating: number | null;
  comment: string | null;
  /** ISO string. */
  createdAt: string;
  // No `isDemo` here since PRE-2: the public list never contains a demo review, so there is nothing
  // to flag. The admin moderation DTO below keeps its flag (an operator does see them).
};

// --- CF4-37 « Avis » admin (sub-project L, spec §4.2 / §4.3) ---

/**
 * Why an admin hid a review (spec L3). There is deliberately NO « negative review » motif:
 * that is how « pas de suppression parce qu'un avis est négatif » is enforced.
 */
export const reviewModerationMotifSchema = z.enum(['ABUSIVE', 'PERSONAL_DATA', 'OFF_TOPIC', 'FAKE', 'OTHER'], {
  message: 'Choisissez un motif.',
});
export type ReviewModerationMotif = z.infer<typeof reviewModerationMotifSchema>;

export const REVIEW_MODERATION_MOTIF_LABEL: Record<ReviewModerationMotif, string> = {
  ABUSIVE: 'Propos injurieux ou discriminatoires',
  PERSONAL_DATA: 'Données personnelles',
  OFF_TOPIC: 'Hors sujet / sans lien avec la réparation',
  FAKE: 'Faux avis ou avis manipulé',
  OTHER: 'Autre',
};

/** Blank → absent, so « Autre » with a note of spaces is refused like no note at all. */
const optionalNote = z
  .string()
  .trim()
  .max(500, { message: '500 caractères maximum.' })
  .optional()
  .transform((v) => (v === '' ? undefined : v));

export const hideReviewInputSchema = z
  .object({ motif: reviewModerationMotifSchema, note: optionalNote })
  .superRefine((v, ctx) => {
    if (v.motif === 'OTHER' && v.note === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Précisez le motif.', path: ['note'] });
    }
  })
  .transform((v) => (v.note === undefined ? { motif: v.motif } : { motif: v.motif, note: v.note }));
export type HideReviewInput = z.infer<typeof hideReviewInputSchema>;

const optionalQueryString = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v));

/** A calendar day `YYYY-MM-DD` (read as a Europe/Paris day by the API). */
const optionalDay = () =>
  optionalQueryString().refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Date invalide.' });

export type AdminReviewListQuery = {
  state?: 'visible' | 'hidden';
  rating?: number | 'negative';
  demo?: 'yes' | 'no';
  from?: string;
  to?: string;
  q?: string;
  page?: number;
};

export const adminReviewListQuerySchema = z
  .object({
    state: z.enum(['visible', 'hidden']).optional(),
    rating: z.union([z.literal('negative'), z.coerce.number().int().min(1).max(5)]).optional(),
    demo: z.enum(['yes', 'no']).optional(),
    from: optionalDay(),
    to: optionalDay(),
    q: optionalQueryString(),
    page: z.coerce.number().int().positive().optional().default(1),
  })
  .transform((v) => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) as AdminReviewListQuery);

export type AdminReviewListItem = {
  id: string;
  /** ISO. */
  createdAt: string;
  rating: number;
  /** Full comment; the admin excerpts it for the table. */
  comment: string | null;
  authorUserId: string;
  authorUsername: string | null;
  authorEmail: string;
  repairerUserId: string;
  repairerUsername: string | null;
  repairerEmail: string;
  commandeId: string;
  demandeTitle: string;
  isDemo: boolean;
  /** Hidden = `deletedAt` set. */
  hidden: boolean;
  /** Null when visible, AND for a row hidden before L (« motif non renseigné »). */
  moderationMotif: ReviewModerationMotif | null;
};

export type AdminReviewDetail = AdminReviewListItem & {
  qualityRating: number | null;
  delayRating: number | null;
  communicationRating: number | null;
  commande: {
    id: string;
    status: string;
    step: string | null;
    repairCents: number;
    shippingCents: number;
    protectionCents: number;
    totalCents: number;
    /** ISO. */
    createdAt: string;
    paidAt: string | null;
    releasedAt: string | null;
  };
  /** Null when visible. */
  moderation: {
    motif: ReviewModerationMotif | null;
    note: string | null;
    moderatorUserId: string | null;
    moderatorName: string | null;
    /** ISO of `deletedAt`. */
    at: string;
  } | null;
};

export type AdminReviewsPage = {
  items: AdminReviewListItem[];
  total: number;
  page: number;
  pageSize: number;
  summary?: AdminReviewsSummary;
};

/**
 * The three derived numbers for one réparateur - spec §4.4 and §4.4a.
 *
 * DERIVED, never stored. There is deliberately no rating column on `RepairerProfile`,
 * because a stored average can visibly contradict the five-star histogram computed
 * beside it from the review list on the same screen, and a denormalised counter is
 * this codebase's recurring bug class by construction.
 *
 * `rating` is null for a réparateur with no reviews and never 0: a zero renders as a
 * catastrophic rating rather than an absent one (spec §7).
 *
 * `repairCount` is a count of commandes at `PAID` + `RELEASED`, the identical pair a
 * review requires, so `reviewCount <= repairCount` holds **while the commande stays PAID**.
 * A post-release refund breaks it: `repairCount` drops and the review stays. See
 * `OfferDto.repairCount` for the mechanism and the open owner decision.
 */
export type RepairerStats = {
  rating: number | null;
  reviewCount: number;
  repairCount: number;
};

/**
 * What a réparateur with no history reads as, in ONE place.
 *
 * `repairerStats` returns a map holding only the users who have something, so every
 * consumer needs this fallback. Exported rather than inlined at each call site so the
 * offer list and piece C's directory cannot disagree about what "no reviews" looks
 * like.
 */
export const NO_REPAIRER_STATS: RepairerStats = {
  rating: null,
  reviewCount: 0,
  repairCount: 0,
};
