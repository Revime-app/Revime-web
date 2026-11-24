import { z } from 'zod';

/**
 * V7 A10 (U7, `DEC7-22`). CGU art. 53: a réparateur « particulier » is capped at 10 missions or
 * 1 500 € over a rolling 12 months; past it he « ne peut plus publier de nouvelle offre en tant que
 * particulier ». WHICH orders count is the API's `particular-quota.ts`; this is what the figures
 * MEAN, shared so the app's card, the offer form, the dashboard and the offer gate cannot disagree.
 *
 * Reached AT the figure, not past it (Q2): the 10th paid mission is the last one, as « atteint »
 * says. The limits are read from the figures rather than from the constants, so a screen states the
 * ceiling the server sent.
 */
export const particularQuotaStandingSchema = z.enum(['OK', 'WARNING', 'REACHED']);
export type ParticularQuotaStanding = z.infer<typeof particularQuotaStandingSchema>;

export type ParticularQuotaFigures = {
  missionsCount: number;
  missionsMax: number;
  amountCollectedCents: number;
  amountMaxCents: number;
};

const WARNING_RATIO = 0.8;

export function particularQuotaStanding(f: ParticularQuotaFigures): ParticularQuotaStanding {
  if (f.missionsCount >= f.missionsMax || f.amountCollectedCents >= f.amountMaxCents) return 'REACHED';
  if (
    f.missionsCount >= Math.ceil(f.missionsMax * WARNING_RATIO) ||
    f.amountCollectedCents >= f.amountMaxCents * WARNING_RATIO
  ) {
    return 'WARNING';
  }
  return 'OK';
}

/** Q5: the card and the offer form, from 80 %. */
export const PARTICULAR_CAP_WARNING_TEXT =
  'Vous approchez du plafond des réparateurs particuliers. Au-delà, faites vérifier votre entreprise pour continuer à proposer des offres.';

/**
 * Q7: the offer gate's refusal, and the blocking card that replaces « Envoyer mon offre ». The
 * figures are written out, as in the CGU's own text: change them with `PARTICULAR_QUOTA_MAX_*`.
 */
export const PARTICULAR_CAP_REACHED_TEXT =
  'Vous avez atteint le plafond des réparateurs particuliers (10 missions ou 1 500 € sur 12 mois). Faites vérifier votre entreprise dans « Mon entreprise » pour continuer à proposer des offres.';

/** Q8: the « Mon entreprise » card's line at the cap, in place of « Facultatif : … ». */
export const BUSINESS_REQUIRED_AT_CAP_TEXT = 'Requis pour continuer à proposer des offres : vérifiez votre SIREN ou SIRET.';

export const myParticularQuotaSchema = z.object({
  missionsCount: z.number().int().nonnegative(),
  missionsMax: z.number().int().positive(),
  amountCollectedCents: z.number().int().nonnegative(),
  amountMaxCents: z.number().int().positive(),
  /** The day the oldest counted mission leaves the window, as on the dashboard. */
  nextMissionReleaseAt: z.string().nullable(),
  standing: particularQuotaStandingSchema,
});
export type MyParticularQuota = z.infer<typeof myParticularQuotaSchema>;

/**
 * `GET /users/me/particular-quota`. `quota` is null for anyone who is not a private individual
 * (professionals are never counted, A10 criterion 4). `offerBlockedMessage` is the sentence the CGU
 * art. 53 cap would answer an offer right now, null while the cap allows offers (the identity gate
 * is separate): the server writes it, so the « Vérification en cours » case (Q9) needs no copy here.
 */
export const myParticularQuotaResponseSchema = z.object({
  quota: myParticularQuotaSchema.nullable(),
  offerBlockedMessage: z.string().nullable(),
});
export type MyParticularQuotaResponse = z.infer<typeof myParticularQuotaResponseSchema>;
