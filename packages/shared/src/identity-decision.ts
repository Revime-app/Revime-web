import { z } from 'zod';

/**
 * CF4-39 (sub-project M, spec §4.5). An operator's decision on a réparateur's identity check.
 *
 * Stripe Identity stays the gate (decision M1): these decisions OVERRIDE it on the current
 * session and are reset by `start()` when a new session begins (M3). REFUSED and
 * DOCUMENTS_REQUESTED have the same effect - validation withdrawn, restart allowed - and differ
 * only in the wording the réparateur reads (M4).
 */
export const identityDecisionSchema = z.enum(['ACCEPTED', 'REFUSED', 'DOCUMENTS_REQUESTED']);
export type IdentityDecision = z.infer<typeof identityDecisionSchema>;

export const identityDecisionMotifSchema = z.enum(
  ['ILLEGIBLE', 'EXPIRED', 'INCONSISTENT', 'WRONG_DOCUMENT', 'OTHER'],
  { message: 'Choisissez un motif.' },
);
export type IdentityDecisionMotif = z.infer<typeof identityDecisionMotifSchema>;

export const IDENTITY_DECISION_MOTIF_LABEL: Record<IdentityDecisionMotif, string> = {
  ILLEGIBLE: 'Document illisible',
  EXPIRED: 'Document expiré',
  INCONSISTENT: 'Document incohérent',
  WRONG_DOCUMENT: 'Mauvais document',
  OTHER: 'Autre',
};

/** The reason line the réparateur and the operator read. « Autre : <note> » for OTHER. */
export function identityDecisionReasonFr(
  motif: IdentityDecisionMotif | null,
  note: string | null,
): string | null {
  if (motif === null) return null;
  if (motif === 'OTHER') return note ? `Autre : ${note}` : IDENTITY_DECISION_MOTIF_LABEL.OTHER;
  return IDENTITY_DECISION_MOTIF_LABEL[motif];
}

/** Blank → absent, so « Autre » with a note of spaces is refused like no note at all. */
const optionalNote = z
  .string()
  .trim()
  .max(500, { message: '500 caractères maximum.' })
  .optional()
  .transform((v) => (v === '' ? undefined : v));

/** Body of refuse AND request-documents: same effect, same form (M4). */
export const identityRefuseInputSchema = z
  .object({ motif: identityDecisionMotifSchema, note: optionalNote })
  .superRefine((v, ctx) => {
    if (v.motif === 'OTHER' && v.note === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Précisez le motif.', path: ['note'] });
    }
  })
  .transform((v) => (v.note === undefined ? { motif: v.motif } : { motif: v.motif, note: v.note }));
export type IdentityRefuseInput = z.infer<typeof identityRefuseInputSchema>;

export const identityAcceptInputSchema = z.object({
  note: z
    .string({ message: "Le motif d'acceptation manuelle est obligatoire (au moins 5 caractères)." })
    .trim()
    .min(5, { message: "Le motif d'acceptation manuelle est obligatoire (au moins 5 caractères)." })
    .max(500, { message: '500 caractères maximum.' }),
});
export type IdentityAcceptInput = z.infer<typeof identityAcceptInputSchema>;
