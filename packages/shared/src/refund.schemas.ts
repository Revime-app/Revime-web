import { z } from 'zod';
import type { CommandeStep } from './commande.schemas.js';

/**
 * CF4-D (spec §1-2). Why the admin chose to refund the way he did. `DISPUTE_DECISION`
 * is its own motif rather than a reuse of one of the others: a dispute resolution is
 * an admin decision about a contested commande, not the same event as e.g. the client
 * simply cancelling.
 *
 * Kept here rather than in `admin.schemas.ts` so `resolveDisputeRefundSchema`
 * (admin.schemas.ts) can import it without a cycle: this file imports nothing from
 * `admin.schemas.ts`.
 */
export const refundMotifSchema = z.enum([
  'CLIENT_CANCELLED',
  'REPAIRER_CANCELLED',
  'REPAIR_NOT_DONE',
  'REPAIR_NONCONFORMING',
  'PARCEL_LOST_OR_DAMAGED',
  'DISPUTE_DECISION',
  'OTHER',
]);

export type RefundMotif = z.infer<typeof refundMotifSchema>;

/** The operator-facing wording for each motif (spec §2). */
export const REFUND_MOTIF_LABEL: Record<RefundMotif, string> = {
  CLIENT_CANCELLED: 'Annulation par le client',
  REPAIRER_CANCELLED: 'Annulation par le réparateur',
  REPAIR_NOT_DONE: 'Réparation non effectuée',
  REPAIR_NONCONFORMING: 'Réparation non conforme',
  PARCEL_LOST_OR_DAMAGED: 'Colis perdu ou endommagé',
  DISPUTE_DECISION: 'Décision de litige',
  OTHER: 'Autre',
};

/**
 * Integer cents, never negative. Exported so `resolveDisputeRefundSchema`
 * (admin.schemas.ts) can reuse it rather than redefining the same rule twice.
 */
export const cents = z.number().int({ message: 'Montant invalide.' }).min(0, { message: 'Montant invalide.' });

/**
 * The admin's flexible-refund input (spec §1): three amounts chosen independently,
 * one per component, plus the motif and a required explanatory note.
 *
 * Replaces the old `refundCommandeSchema` (`commande.schemas.ts`), which Task 4
 * deleted once the refund route moved onto this shape.
 */
export const refundBreakdownInputSchema = z.object({
  motif: refundMotifSchema,
  note: z
    .string()
    .trim()
    .min(3, { message: 'Motif requis.' })
    .max(500, { message: 'Motif trop long.' }),
  repairCents: cents,
  shippingCents: cents,
  protectionCents: cents,
});

export type RefundBreakdownInput = z.infer<typeof refundBreakdownInputSchema>;

/**
 * The three amounts actually refunded, plus their sum - what `CommandeDto.refund`
 * carries (spec §5). `totalCents` is stored/derived rather than recomputed by every
 * reader, the same reasoning `Commande.totalCents` itself follows.
 */
export type RefundBreakdown = {
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
  totalCents: number;
};

/**
 * The admin's starting point for a refund breakdown (spec §2): full refund of
 * whatever is still refundable at this point in the lifecycle.
 *
 * `shippingCents` folds in `insuranceCents` while the parcel has not moved yet
 * (`step` null or `'PAID'`) - `Commande.insuranceCents` has no breakdown column of
 * its own, so the shipping figure the admin edits must already include it or the
 * insurance premium would be silently unrefundable. From `PARCEL_SENT` onward the
 * parcel and its insurance are spent, so both shipping and protection default to 0
 * and only `repairCents` remains suggested in full.
 */
export function suggestedRefund(o: {
  step: CommandeStep | null;
  repairCents: number;
  shippingCents: number;
  insuranceCents: number;
  protectionCents: number;
}): { repairCents: number; shippingCents: number; protectionCents: number } {
  if (o.step === null || o.step === 'PAID') {
    return {
      repairCents: o.repairCents,
      shippingCents: o.shippingCents + o.insuranceCents,
      protectionCents: o.protectionCents,
    };
  }
  return { repairCents: o.repairCents, shippingCents: 0, protectionCents: 0 };
}
