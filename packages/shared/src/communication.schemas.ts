import { z } from 'zod';

export const broadcastTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('INDIVIDUAL'),
    // Better Auth ids are 32-character strings, not UUIDs: `.uuid()` refused every real user.
    userId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  }),
  z.object({
    type: z.literal('SEGMENT'),
    role: z.enum(['ALL', 'CLIENT', 'REPAIRER']).default('ALL'),
    city: z.string().trim().optional(),
    department: z.string().trim().optional(),
    verifiedOnly: z.boolean().default(false),
    activeOnly: z.boolean().default(true),
  }),
]);

export type BroadcastTarget = z.infer<typeof broadcastTargetSchema>;

/**
 * V7 D2 (U5, `DEC7-20`). The single recipient is found by pseudo, name, e-mail, phone or id
 * prefix, never typed as an id: `GET /admin/communications/recipients?q=` answers these rows and
 * the dashboard fills `target.userId` from the one picked. No reachability field: the preview
 * says whether the person gets the e-mail and the push (V7 D1 is U6).
 */
export const RECIPIENT_SEARCH_MIN_CHARS = 2;
export const RECIPIENT_SEARCH_LIMIT = 8;

export const adminBroadcastRecipientSuggestionSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: z.enum(['CLIENT', 'REPAIRER']),
  suspended: z.boolean(),
});

export type AdminBroadcastRecipientSuggestion = z.infer<typeof adminBroadcastRecipientSuggestionSchema>;

/** The query as both ends read it: trimmed, a leading « @ » dropped, 100 characters at most. */
export function normaliseRecipientQuery(q: string | null | undefined): string {
  return (q ?? '').trim().replace(/^@+/, '').trim().slice(0, 100);
}

/**
 * Only a réparateur has a stored location (`serviceAreaLabel`, `postalCode`); a client has none.
 * « Tous les clients de Lyon » therefore matched nobody and the preview said 0 without saying
 * why. Refuse the combination instead of sending to an audience the operator did not mean.
 */
export function segmentLocationNeedsRepairers(target: BroadcastTarget): boolean {
  return (
    target.type === 'SEGMENT' &&
    target.role !== 'REPAIRER' &&
    Boolean(target.city?.trim() || target.department?.trim())
  );
}
export const SEGMENT_LOCATION_MESSAGE =
  'La ville et le département ne s\'appliquent qu\'aux réparateurs : choisissez « Réparateurs ».';

/**
 * Service messages (a maintenance notice, a reminder to finish a verification the user started)
 * may reach everyone. Everything else is a commercial message and needs the user's marketing
 * opt-in (`User.marketingConsentEmail` / `marketingConsent`, CNIL / RGPD). A one-to-one message
 * to a named user is not a campaign and is exempt.
 */
export const SERVICE_TEMPLATE_KEYS = ['MAINTENANCE', 'VERIFICATION_REMINDER'] as const;

export const adminBroadcastSendSchema = z.object({
  target: broadcastTargetSchema,
  channels: z
    .object({
      email: z.boolean().default(false),
      push: z.boolean().default(false),
    })
    .refine((c) => c.email || c.push, {
      message: 'Au moins un canal de diffusion (e-mail ou push) doit être sélectionné.',
    }),
  templateKey: z
    .enum([
      'CUSTOM',
      'ANNOUNCEMENT',
      'REPAIRER_OPPORTUNITY',
      'VERIFICATION_REMINDER',
      'MAINTENANCE',
    ])
    .default('CUSTOM'),
  subject: z.string().trim().min(3).max(150),
  body: z.string().trim().min(10).max(5000),
}).refine((v) => !segmentLocationNeedsRepairers(v.target), {
  path: ['target'],
  message: SEGMENT_LOCATION_MESSAGE,
});

export type AdminBroadcastSendInput = z.infer<typeof adminBroadcastSendSchema>;

export const adminBroadcastPreviewSchema = z.object({
  totalRecipients: z.number().int().nonnegative(),
  emailEligibleCount: z.number().int().nonnegative(),
  pushEligibleCount: z.number().int().nonnegative(),
  /** Of the e-mail / push eligible, those who opted in to marketing: what a commercial template reaches. */
  marketingEmailCount: z.number().int().nonnegative().default(0),
  marketingPushCount: z.number().int().nonnegative().default(0),
  /**
   * V7 D1 (U6): of the push eligible, those with an active iOS / Android token, and the same split
   * of the opted-in. A user with both counts on both, so the two can add up to more than the total.
   */
  pushIosCount: z.number().int().nonnegative().default(0),
  pushAndroidCount: z.number().int().nonnegative().default(0),
  marketingPushIosCount: z.number().int().nonnegative().default(0),
  marketingPushAndroidCount: z.number().int().nonnegative().default(0),
  sampleRecipients: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      city: z.string().nullable(),
      role: z.enum(['CLIENT', 'REPAIRER']),
    })
  ),
});

export type AdminBroadcastPreview = z.infer<typeof adminBroadcastPreviewSchema>;

export const adminBroadcastItemSchema = z.object({
  id: z.string(),
  subject: z.string(),
  channelEmail: z.boolean(),
  channelPush: z.boolean(),
  targetType: z.enum(['INDIVIDUAL', 'SEGMENT']),
  targetSummary: z.string(),
  totalRecipients: z.number().int().nonnegative(),
  sentEmailCount: z.number().int().nonnegative(),
  sentPushCount: z.number().int().nonnegative(),
  operatorName: z.string(),
  createdAt: z.string(),
});

export type AdminBroadcastItem = z.infer<typeof adminBroadcastItemSchema>;

export const adminBroadcastHistoryResponseSchema = z.object({
  items: z.array(adminBroadcastItemSchema),
  total: z.number().int().nonnegative(),
});

export type AdminBroadcastHistoryResponse = z.infer<
  typeof adminBroadcastHistoryResponseSchema
>;
