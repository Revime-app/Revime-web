import type { DemandeStatus } from './demande.schemas.js';
import type { CommandeStatus, CommandeStep, DeliveryMode } from './commande.schemas.js';

/**
 * The commande facts the ladder needs, and deliberately nothing else. Raw values, never
 * a label: a label crossing the wire would put French copy in an API response and make a
 * wording change a deploy.
 *
 * The one place a caller imports this type from - `demande-progress.ts`, which used to
 * re-export it, is deleted (Task 4).
 *
 * Widened (CF4-12/13/14, design §4.2) with `commandeId`, `delivery` and `disputeOpen` -
 * the three facts `DemandeListItem.commande` and `CommandeListItem` need beyond the
 * status ladder itself, so the list rows do not need a second query to get them.
 */
export type ProgressCommande = {
  status: CommandeStatus;
  step: CommandeStep | null;
  commandeId: string;
  delivery: DeliveryMode;
  disputeOpen: boolean;
  /**
   * CF4-D. True when a REFUNDED commande's refund was a flexible PARTIAL one -
   * changes only the REFUNDED exit's wording. Optional so an old API's rows (no
   * field) read as a full refund, same reasoning as `disputeOpen` below on
   * `RepairFacts['commande']`.
   */
  partialRefund?: boolean;
  /**
   * CF4-I. True while a PENDING cancellation request freezes this commande - drives the
   * ladder's « Annulation demandée » override on `DemandeListItem.commande` /
   * `CommandeListItem` rows. Optional: an old API's rows (no field) read as unfrozen.
   */
  cancellationPending?: boolean;
  /**
   * V8 B2 / `Q8-08`. False while Revime HOLDS the réparateur's payout on a validated order (RELEASED,
   * no transfer yet): the client's ladder then ends on « Terminée », not « Fonds versés au
   * réparateur ». Sent only to the order's parties (`pickCommande`'s `withTransfer`), never to
   * another réparateur. Optional: absent (an older API, or a viewer who is not told) reads as before.
   */
  hasStripeTransfer?: boolean;
};

export type RepairViewer = 'CLIENT' | 'REPAIRER';

/**
 * V8 B2 / `Q8-08`. True when the client validated but Revime is HOLDING the réparateur's payout (no
 * « Virements » yet, or fiscal information missing): PAID, RELEASED, and a transfer reported missing.
 * `=== false` on purpose: an older API, or a viewer who is not told, sends nothing, and that must
 * read as « paid », exactly as before this rule existed.
 */
export function isPayoutHeld(c: {
  status: CommandeStatus;
  step: CommandeStep | null;
  hasStripeTransfer?: boolean;
} | null | undefined): boolean {
  return c?.status === 'PAID' && c.step === 'RELEASED' && c.hasStripeTransfer === false;
}

/** The last stage's wording on a held payout (`Q8-08`): the client's own word, and the réparateur's truth. */
const HELD_CLIENT_LABEL = 'Terminée';
const HELD_REPAIRER_LABEL = 'Paiement en attente';

/** `Badge`'s four tones. A fifth value will not render. */
export type RepairTone = 'verified' | 'neutral' | 'amber' | 'danger';

export type RepairFacts = {
  /** Null for a réparateur row (he has no demande in the list). */
  demandeStatus: DemandeStatus | null;
  /** 0 when unknown / réparateur. */
  offerCount: number;
  commande: {
    status: CommandeStatus;
    step: CommandeStep | null;
    /**
     * Optional so an old API's rows (no field) compile and read as not disputed - see
     * `disputed` below.
     */
    disputeOpen?: boolean;
    /**
     * CF4-D. True when a REFUNDED commande's refund was a flexible PARTIAL one.
     * Optional so an old API's rows (no field) read as a full refund - the REFUNDED
     * exit then keeps its plain "Remboursée" wording, same reasoning as `disputeOpen`.
     */
    partialRefund?: boolean;
    /**
     * CF4-I. True while a PENDING cancellation request freezes this commande. Optional so an
     * old API's rows (no field) compile and read as not pending - same reasoning as
     * `disputeOpen` above. Mutually exclusive with `disputeOpen` by I12 (a dispute supersedes
     * any pending request in the same transaction), so the two overrides never compete.
     */
    cancellationPending?: boolean;
    /** V8 `Q8-08`, see `ProgressCommande.hasStripeTransfer` and `isPayoutHeld`. */
    hasStripeTransfer?: boolean;
  } | null;
};

export type RepairStatus = {
  /** The chain for this viewer. */
  stages: readonly string[];
  /** Position reached (kept during a dispute); -1 for an exit. */
  currentIndex: number;
  /** What the badge shows. */
  label: string;
  tone: RepairTone;
  exit: 'Annulée' | 'Remboursée' | 'Remboursée partiellement' | null;
  disputed: boolean;
  /**
   * CF4-I. True when a pending cancellation request is overriding the label - mirrors
   * `disputed`'s shape. Always `false` when `disputed` is true (I12: mutually exclusive).
   */
  cancellationPending: boolean;
};

/**
 * The client's eight-stage chain, his wording and order (spec §4.1).
 *
 * Index 6 - « Réparation validée — Fonds à verser » - is NEVER current: validation and
 * the transfer are one call, so nothing pauses there. It exists purely as a chain
 * position between "terminée" and "versés", the same reasoning `demande-progress.ts`'s
 * header used for chain positions that are never a badge value.
 */
export const CLIENT_STAGES = [
  "En attente d'offres",
  'Offres reçues',
  'Offre sélectionnée — Paiement en attente',
  'Paiement effectué',
  'Réparation en cours',
  'Réparation terminée — En attente de validation',
  'Réparation validée — Fonds à verser',
  'Fonds versés au réparateur',
] as const;

/** The réparateur's four-stage chain, worded from his side (spec §4.1, D4). */
export const REPAIRER_STAGES = [
  'Paiement effectué',
  'Réparation en cours',
  'Réparation terminée — En attente de validation du client',
  'Fonds versés',
] as const;

const CLIENT_TONE_BY_INDEX: Record<number, RepairTone> = {
  0: 'neutral',
  1: 'neutral',
  2: 'neutral',
  3: 'amber',
  4: 'amber',
  5: 'amber',
  7: 'verified',
};

const REPAIRER_TONE_BY_INDEX: Record<number, RepairTone> = {
  0: 'amber',
  1: 'amber',
  2: 'amber',
  3: 'verified',
};

/**
 * Position 3-5, shared by client (offset +3) and réparateur (offset +0): step PAID or
 * null is the earliest of the three, REPAIR_STARTED the middle, and the terminal-repair
 * steps (REPAIR_DONE, RETURN_SENT, RETURN_RECEIVED, AWAITING_VALIDATION) the last.
 *
 * `canValidate` allows the client to validate only at AWAITING_VALIDATION, so the
 * **badge label** at that shared position distinguishes the plain "terminée" steps from
 * AWAITING_VALIDATION even though they share one chain position (spec §4.1, "Stage 5
 * badge nuance"). The stage LIST itself does not gain a row for this - only the label
 * read off it differs.
 */
function paidStepOffset(step: CommandeStep | null): 0 | 1 | 2 | null {
  if (step === null || step === 'PAID' || step === 'PARCEL_SENT' || step === 'PARCEL_RECEIVED') {
    return 0;
  }
  if (step === 'REPAIR_STARTED') return 1;
  if (
    step === 'REPAIR_DONE' ||
    step === 'RETURN_SENT' ||
    step === 'RETURN_RECEIVED' ||
    step === 'AWAITING_VALIDATION'
  ) {
    return 2;
  }
  // RELEASED is handled by its own final position before this helper is reached.
  return null;
}

function clientLabelAt(index: number, offerCount: number, step: CommandeStep | null): string {
  if (index === 1) {
    return offerCount === 1 ? 'Offres reçues — 1 offre' : `Offres reçues — ${String(offerCount)} offres`;
  }
  if (index === 5) {
    return step === 'AWAITING_VALIDATION'
      ? 'Réparation terminée — En attente de validation'
      : 'Réparation terminée';
  }
  return CLIENT_STAGES[index] as string;
}

function repairerLabelAt(index: number, step: CommandeStep | null): string {
  if (index === 2) {
    return step === 'AWAITING_VALIDATION'
      ? 'Réparation terminée — En attente de validation du client'
      : 'Réparation terminée';
  }
  return REPAIRER_STAGES[index] as string;
}

function clientChainIndex(facts: RepairFacts): number {
  const { commande, offerCount } = facts;
  if (!commande || commande.status === 'ABANDONED') {
    return offerCount > 0 ? 1 : 0;
  }
  if (commande.status === 'PENDING_PAYMENT') return 2;

  // PAID from here (REFUNDED is handled as an exit before this function runs).
  if (commande.step === 'RELEASED') return 7;
  const offset = paidStepOffset(commande.step);
  return offset === null ? 3 : 3 + offset;
}

function repairerChainIndex(commande: NonNullable<RepairFacts['commande']>): number {
  if (commande.step === 'RELEASED') return 3;
  const offset = paidStepOffset(commande.step);
  return offset ?? 0;
}

/**
 * The single place that decides where a demande/commande sits, for either viewer.
 *
 * Overrides, first match wins (spec §4.1): demande CANCELLED -> exit « Annulée »;
 * commande REFUNDED -> exit « Remboursée » (or « Remboursée partiellement » when
 * `commande.partialRefund` is true, CF4-D); `disputeOpen` -> label « Litige en cours »,
 * tone danger, `disputed: true`, `currentIndex` KEPT (not reset) so the chain position
 * reached before the dispute opened is not lost.
 *
 * CF4-I: `cancellationPending` -> label « Annulation demandée », tone amber, `currentIndex`
 * KEPT, same shape as the dispute override. Checked AFTER `disputeOpen` and mutually
 * exclusive with it by I12 (opening a dispute clears any pending request in the same
 * transaction), so only one of the two flags is ever true on a real row - the order between
 * them here never actually competes, and `disputeOpen` keeps precedence defensively.
 */
export function repairStatus(facts: RepairFacts, viewer: RepairViewer): RepairStatus {
  const stages = viewer === 'CLIENT' ? CLIENT_STAGES : REPAIRER_STAGES;

  if (facts.demandeStatus === 'CANCELLED') {
    return {
      stages,
      currentIndex: -1,
      label: 'Annulée',
      tone: 'neutral',
      exit: 'Annulée',
      disputed: false,
      cancellationPending: false,
    };
  }
  if (facts.commande?.status === 'REFUNDED') {
    // CF4-D. `partialRefund === true` is the only condition that flips this wording -
    // absent or false both read as the plain full refund, per the field's own comment.
    const partial = facts.commande.partialRefund === true;
    const label = partial ? 'Remboursée partiellement' : 'Remboursée';
    return {
      stages,
      currentIndex: -1,
      label,
      tone: 'neutral',
      exit: label,
      disputed: false,
      cancellationPending: false,
    };
  }

  let currentIndex: number;
  let label: string;
  let tone: RepairTone;

  // V8 `Q8-08`: on a held payout the last stage is renamed in the ladder itself, so the list
  // of stages a screen draws and the badge never disagree.
  const held = isPayoutHeld(facts.commande);
  let shownStages: readonly string[] = stages;

  if (viewer === 'CLIENT') {
    if (facts.demandeStatus === 'DONE') {
      currentIndex = 7;
    } else {
      currentIndex = clientChainIndex(facts);
    }
    label = clientLabelAt(currentIndex, facts.offerCount, facts.commande?.step ?? null);
    tone = CLIENT_TONE_BY_INDEX[currentIndex] ?? 'neutral';
    if (held && currentIndex === 7) {
      label = HELD_CLIENT_LABEL;
      shownStages = [...CLIENT_STAGES.slice(0, 7), HELD_CLIENT_LABEL];
    }
  } else {
    currentIndex = facts.commande ? repairerChainIndex(facts.commande) : 0;
    label = repairerLabelAt(currentIndex, facts.commande?.step ?? null);
    tone = REPAIRER_TONE_BY_INDEX[currentIndex] ?? 'amber';
    if (held && currentIndex === 3) {
      label = HELD_REPAIRER_LABEL;
      tone = 'amber';
      shownStages = [...REPAIRER_STAGES.slice(0, 3), HELD_REPAIRER_LABEL];
    }
  }

  const disputed = facts.commande?.disputeOpen ?? false;
  if (disputed) {
    return {
      stages: shownStages,
      currentIndex,
      label: 'Litige en cours',
      tone: 'danger',
      exit: null,
      disputed: true,
      cancellationPending: false,
    };
  }

  const cancellationPending = facts.commande?.cancellationPending ?? false;
  if (cancellationPending) {
    return {
      stages: shownStages,
      currentIndex,
      label: 'Annulation demandée',
      tone: 'amber',
      exit: null,
      disputed: false,
      cancellationPending: true,
    };
  }

  return { stages: shownStages, currentIndex, label, tone, exit: null, disputed: false, cancellationPending: false };
}

/**
 * Whether an offer count may still be rendered beside this demande - client stage 0 or
 * 1 only, never an exit, never while disputed.
 *
 * Renamed from `repairOffersStillMatter` (Task 4): `demande-progress.ts`'s own
 * `offersStillMatter` is gone with that file, so this is now the one definition and
 * takes back the plain name.
 */
export function offersStillMatter(s: RepairStatus): boolean {
  return s.exit === null && !s.disputed && (s.currentIndex === 0 || s.currentIndex === 1);
}

/**
 * The details page timeline label for one step, worded per viewer (spec §4.1).
 *
 * Deliberately separate from `STEP_LABEL` (`commande.schemas.ts`), which stays
 * unchanged for its other callers - this is a new, viewer-aware label set for the
 * timeline card only.
 *
 * `payoutHeld` (V8 `Q8-08`): RELEASED reads « Terminée » / « Paiement en attente » while Revime
 * holds the réparateur's payout, the same words `repairStatus` uses. Defaults to false.
 */
export function timelineLabel(step: CommandeStep, viewer: RepairViewer, payoutHeld = false): string {
  if (step === 'RELEASED' && payoutHeld) {
    return viewer === 'CLIENT' ? HELD_CLIENT_LABEL : HELD_REPAIRER_LABEL;
  }
  switch (step) {
    case 'PAID':
      return 'Paiement effectué';
    case 'PARCEL_SENT':
      return 'Colis envoyé';
    case 'PARCEL_RECEIVED':
      return 'Colis reçu par le réparateur';
    case 'REPAIR_STARTED':
      return 'Réparation en cours';
    case 'REPAIR_DONE':
      return 'Réparation terminée';
    case 'RETURN_SENT':
      return 'Colis retour envoyé';
    case 'RETURN_RECEIVED':
      return 'Colis retour reçu';
    case 'AWAITING_VALIDATION':
      return viewer === 'CLIENT' ? 'En attente de votre validation' : 'En attente de la validation du client';
    case 'RELEASED':
      return viewer === 'CLIENT' ? 'Fonds versés au réparateur' : 'Fonds versés';
  }
}

/**
 * `#CMD-` plus the commande id's first 8 characters, upper-cased - the format
 * `conversations.service.ts` builds inline today; that call site moves onto this
 * helper in a later task.
 */
export function orderNumberFor(commandeId: string): string {
  return `#CMD-${commandeId.slice(0, 8).toUpperCase()}`;
}

/**
 * Normalises an order search term / reference entered by an operator or user.
 * Strips leading '#', 'CMD-', 'cmd-', 'Cmd #', etc., and trims and lowercases.
 * Bug B15: Short references (#86642ef2, #CMD-A9DB011E) displayed everywhere
 * resolve cleanly in search.
 */
export function normaliseOrderSearch(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let value = input.trim();
  while (value.startsWith('#')) {
    value = value.slice(1).trim();
  }
  if (/^cmd[\s\-_:]*/i.test(value)) {
    value = value.replace(/^cmd[\s\-_:]*/i, '').trim();
  }
  while (value.startsWith('#')) {
    value = value.slice(1).trim();
  }
  return value.toLowerCase();
}

/**
 * The id prefix an operator typed, or null when the term cannot be one. Six hex characters is
 * the shortest reference that is not noise; anything else (a name, a hyphenated full id) is
 * matched by the callers' other clauses, never as an `id startsWith`.
 */
export function orderIdPrefix(input: string): string | null {
  const normalised = normaliseOrderSearch(input);
  return normalised.length >= 6 && /^[0-9a-f]+$/.test(normalised) ? normalised : null;
}
