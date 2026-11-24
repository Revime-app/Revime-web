import type { z } from 'zod';
import type { IdentityStatus } from './identity.schemas.js';
import type { ConnectStatus } from './connect.schemas.js';
import type { BusinessVerificationStatus } from './business.schemas.js';
import { businessStepRefusal } from './offer-gate.js';
import type { ProfileCompletion } from './profile-completion.js';
import type { repairerKindSchema, verificationLevelSchema } from './user.schemas.js';
import {
  identityRefusalReasonFr,
  repairerVerificationState,
  type WithdrawingIdentityDecision,
} from './verification-state.js';

/**
 * CF4-09, design spec §4.1: the shared derivation behind the « Statut de vérification » hub, the resume
 * card and the return screens (`docs/superpowers/specs/2026-09-29-cf4-a-repairer-journey-design.md`). Pure,
 * no I/O, so mobile and the API's unit tests derive exactly the same answer.
 */
type VerificationLevel = z.infer<typeof verificationLevelSchema>;
type RepairerKind = z.infer<typeof repairerKindSchema>;

export type JourneyStepKey = 'kind' | 'identity' | 'business' | 'fiscal' | 'profile' | 'payouts';
export type JourneyStepStatus = 'done' | 'todo' | 'waiting' | 'blocked';

export type JourneyStep = {
  key: JourneyStepKey;
  status: JourneyStepStatus;
  /** French, ready to render. */
  label: string;
  /** French, one line. */
  body: string;
  /** French button label when actionable, else null. */
  cta: string | null;
  /** V8 E1 (`DEC8-08` (2)). Fixed estimate for this step, in minutes. */
  minutes: number;
  /** V8 E1 (`DEC8-08` (12)). French chip: what this step unlocks. */
  unlocks: string;
  /** V8 E1 (`DEC8-08` (12)). French value shown once `done` (« Vérifiée », « Activés »…), else null. */
  value: string | null;
  /** V8 E1, mockup 2 « Profil réparateur · 1/6 ». `'c/t'` for a not-done profile step, else null. */
  progress: string | null;
};

/** What each step builder decides; `repairerJourney` adds the V8 E1 fields from the tables below. */
type BaseStep = Omit<JourneyStep, 'minutes' | 'unlocks' | 'value' | 'progress'>;

export type RepairerJourneyInput = {
  kind: RepairerKind | null;
  level: VerificationLevel;
  identityStatus: IdentityStatus | null;
  lastErrorCode: string | null;
  completion: ProfileCompletion | null;
  connectStatus: ConnectStatus | null;
  /** Server flag. False ⇒ identity and payouts steps are omitted (their routes would refuse). */
  connectEnabled: boolean;
  /** CF4-39. `GET /identity/status` `decision`; optional, read `?? null` (a stale API omits it). */
  decision?: WithdrawingIdentityDecision | null;
  /** CF4-39. `GET /identity/status` `decisionReason`, the motif line shown as the refusal body. */
  decisionReason?: string | null;
  /** CMP-D1: Fiscal declaration completion flag. */
  fiscalCompleted?: boolean | null;
  /**
   * V8 E1 (review I1). `GET /business/status` `status` for a PRO; optional, read `?? null`. Without it a business
   * check under review read as a step to do (its button, its 3 minutes) while the offer sheet said « en cours ».
   */
  businessStatus?: BusinessVerificationStatus | null;
};

export type RepairerJourney = {
  /** Applicable steps, in order. */
  steps: JourneyStep[];
  /** First `todo` step. */
  next: JourneyStepKey | null;
  /** Count of `done`. */
  completed: number;
  /** `steps.length`. */
  total: number;
  /** Every step `done`. */
  complete: boolean;
  /**
   * V8 E1 (`DEC8-08` (2)). Minutes still ahead of him: the sum over `todo` and `blocked` steps. A step
   * `waiting` on review counts 0 (nothing for him to do); a `blocked` one counts, since he will do it.
   */
  minutesLeft: number;
};

export const JOURNEY_STEP_LABELS: Readonly<Record<JourneyStepKey, string>> = {
  kind: 'Statut',
  identity: 'Identité',
  business: 'Informations professionnelles',
  fiscal: 'Informations fiscales',
  profile: 'Profil réparateur',
  payouts: 'Virements',
};

/**
 * V8 E1, `DEC8-08` (2). Identité, Informations fiscales and Profil are the client's mockup figures; Statut,
 * Informations professionnelles (SIRET lookup + document upload) and Virements (Stripe's form) are ours, approved
 * by the owner. A new repairer's profile is created with a kind, so he usually starts at ≈ 9 min (Particulier) or
 * ≈ 10 min (Pro).
 */
export const JOURNEY_STEP_MINUTES: Readonly<Record<JourneyStepKey, number>> = {
  kind: 1,
  identity: 2,
  business: 3,
  fiscal: 2,
  profile: 2,
  payouts: 3,
};

/** V8 E1, `DEC8-08` (12). The chip under a step still to do: what finishing it unlocks. */
export const JOURNEY_STEP_UNLOCKS: Readonly<Record<JourneyStepKey, string>> = {
  kind: 'Nécessaire pour vérifier votre identité',
  identity: 'Nécessaire pour envoyer des offres',
  business: 'Nécessaire pour envoyer des offres',
  fiscal: 'Nécessaire pour recevoir vos paiements',
  profile: 'Recommandé : les clients vous choisissent plus facilement',
  payouts: 'Nécessaire pour recevoir vos paiements',
};

/** V8 E1, `DEC8-08` (12). The value a done step shows (mockup 2 « Identité · Vérifiée »); `kind` reads its body. */
const DONE_VALUE: Readonly<Record<Exclude<JourneyStepKey, 'kind'>, string>> = {
  identity: 'Vérifiée',
  business: 'Vérifiées',
  fiscal: 'Renseignées',
  profile: 'Complet',
  payouts: 'Activés',
};

function withE1Fields(step: BaseStep, input: RepairerJourneyInput): JourneyStep {
  const done = step.status === 'done';
  const value = done ? (step.key === 'kind' ? step.body : DONE_VALUE[step.key]) : null;
  const progress =
    step.key === 'profile' && !done
      ? `${input.completion?.completed ?? 0}/${input.completion?.total ?? 6}`
      : null;
  return {
    ...step,
    minutes: JOURNEY_STEP_MINUTES[step.key],
    unlocks: JOURNEY_STEP_UNLOCKS[step.key],
    value,
    progress,
  };
}

function kindStep(input: RepairerJourneyInput): BaseStep {
  const label = JOURNEY_STEP_LABELS.kind;
  if (input.kind !== null) {
    return {
      key: 'kind',
      status: 'done',
      label,
      body: input.kind === 'INDIVIDUAL' ? 'Particulier' : 'Professionnel',
      cta: null,
    };
  }
  return {
    key: 'kind',
    status: 'todo',
    label,
    body: 'Choisissez Particulier ou Professionnel.',
    cta: 'Choisir',
  };
}

/**
 * `done` iff the level reached IDENTITY or BUSINESS (either kind), or the identity session itself is VERIFIED
 * with no operator decision withdrawing it.
 *
 * 🛑 CF4-39, Review Focus 2: a refused session still reads VERIFIED (the operator overrode what Stripe
 * accepted), so the session shortcut must yield to the decision - or a refused réparateur reads « Votre
 * identité est vérifiée ». The LEVEL stays the conclusion: a refusal drops it, so it cannot be IDENTITY here.
 */
function identityDone(input: RepairerJourneyInput): boolean {
  const withdrawn = (input.decision ?? null) !== null;
  return (
    input.level === 'IDENTITY' || input.level === 'BUSINESS' || (input.identityStatus === 'VERIFIED' && !withdrawn)
  );
}

function identityStep(input: RepairerJourneyInput): BaseStep {
  const label = JOURNEY_STEP_LABELS.identity;

  if (identityDone(input)) {
    return { key: 'identity', status: 'done', label, body: 'Votre identité est vérifiée.', cta: null };
  }

  const state = repairerVerificationState(
    input.level,
    input.kind,
    input.identityStatus,
    input.lastErrorCode,
    input.decision ?? null,
  );
  if (state.state === 'PENDING') {
    return {
      key: 'identity',
      status: 'waiting',
      label,
      body:
        'Vos documents ont bien été transmis. Vous pourrez envoyer des offres dès que votre vérification sera validée.',
      cta: null,
    };
  }

  if (state.state === 'REFUSED' || state.state === 'DOCUMENTS_REQUESTED') {
    return {
      key: 'identity',
      status: 'todo',
      label,
      // CF4-39: REVIME's motif when an operator decided, else Stripe's reason.
      body: input.decisionReason ?? identityRefusalReasonFr(input.lastErrorCode),
      cta: 'Recommencer',
    };
  }

  if (input.identityStatus === 'REQUIRES_INPUT') {
    return {
      key: 'identity',
      status: 'todo',
      label,
      body: "Votre vérification d'identité n'est pas terminée.",
      cta: 'Reprendre',
    };
  }

  if (input.identityStatus === 'CANCELED') {
    return {
      key: 'identity',
      status: 'todo',
      label,
      body: 'Votre vérification a été annulée.',
      cta: 'Recommencer',
    };
  }

  return {
    key: 'identity',
    status: 'todo',
    label,
    body: 'La vérification d\'identité est nécessaire pour proposer vos services.',
    cta: 'Vérifier',
  };
}

function businessStep(input: RepairerJourneyInput, identityIsDone: boolean): BaseStep {
  const label = JOURNEY_STEP_LABELS.business;

  if (input.level === 'BUSINESS') {
    return { key: 'business', status: 'done', label, body: 'Votre entreprise est vérifiée.', cta: null };
  }

  if (!identityIsDone) {
    return {
      key: 'business',
      status: 'blocked',
      label,
      body: 'Disponible après la validation de votre identité.',
      cta: null,
    };
  }

  // V8 E1 (review I1): the server's own sentences (`businessStepRefusal`), as on the offer sheet.
  const status = input.businessStatus ?? null;
  if (status === 'PENDING') {
    return { key: 'business', status: 'waiting', label, body: businessStepRefusal(status) ?? '', cta: null };
  }

  return {
    key: 'business',
    status: 'todo',
    label,
    body: businessStepRefusal(status) ?? 'Vérifiez votre SIREN ou SIRET pour envoyer des offres.',
    cta: 'Vérifier mon entreprise',
  };
}

function fiscalStep(input: RepairerJourneyInput, identityIsDone: boolean): BaseStep {
  const label = JOURNEY_STEP_LABELS.fiscal;

  if (input.fiscalCompleted) {
    return { key: 'fiscal', status: 'done', label, body: 'Vos informations fiscales sont complétées.', cta: null };
  }

  if (!identityIsDone) {
    return {
      key: 'fiscal',
      status: 'blocked',
      label,
      body: 'Disponible après la validation de votre identité.',
      cta: null,
    };
  }

  return {
    key: 'fiscal',
    status: 'todo',
    label,
    body: 'Renseignez vos informations fiscales (déclaration annuelle DAC7).',
    cta: 'Renseigner mes informations',
  };
}

function profileStep(input: RepairerJourneyInput): BaseStep {
  const label = JOURNEY_STEP_LABELS.profile;
  const completed = input.completion?.completed ?? 0;
  const total = input.completion?.total ?? 6;

  if (input.completion !== null && completed === total) {
    return { key: 'profile', status: 'done', label, body: 'Votre profil réparateur est complet.', cta: null };
  }

  return {
    key: 'profile',
    status: 'todo',
    label,
    body: `Complétez votre profil : ${completed}/${total} éléments.`,
    cta: 'Compléter mon profil',
  };
}

function payoutsStep(input: RepairerJourneyInput): BaseStep {
  const label = JOURNEY_STEP_LABELS.payouts;

  if (input.connectStatus === 'VERIFIED') {
    return { key: 'payouts', status: 'done', label, body: 'Vos virements sont configurés.', cta: null };
  }

  if (input.connectStatus === 'REJECTED') {
    return {
      key: 'payouts',
      status: 'blocked',
      label,
      body: 'Votre compte de virement a été refusé. Contactez-nous.',
      cta: null,
    };
  }

  if (input.connectStatus === 'PENDING') {
    return {
      key: 'payouts',
      status: 'todo',
      label,
      body: 'Vérification en cours.',
      cta: 'Reprendre',
    };
  }

  if (input.connectStatus === 'RESTRICTED') {
    return {
      key: 'payouts',
      status: 'todo',
      label,
      body: 'Informations complémentaires requises.',
      cta: 'Compléter',
    };
  }

  return {
    key: 'payouts',
    status: 'todo',
    label,
    body: 'Configurez vos virements pour recevoir vos paiements.',
    cta: 'Configurer',
  };
}

export function repairerJourney(input: RepairerJourneyInput): RepairerJourney {
  const steps: BaseStep[] = [kindStep(input)];

  const identity = input.connectEnabled ? identityStep(input) : null;
  if (identity) steps.push(identity);

  const identityIsDone = identity ? identity.status === 'done' : identityDone(input);

  if (input.kind === 'PRO') {
    steps.push(businessStep(input, identityIsDone));
  } else {
    steps.push(fiscalStep(input, identityIsDone));
  }

  steps.push(profileStep(input));

  if (input.connectEnabled) steps.push(payoutsStep(input));

  const full = steps.map((s) => withE1Fields(s, input));
  const next = full.find((s) => s.status === 'todo')?.key ?? null;
  const completed = full.filter((s) => s.status === 'done').length;
  const total = full.length;
  const minutesLeft = full
    .filter((s) => s.status === 'todo' || s.status === 'blocked')
    .reduce((sum, s) => sum + s.minutes, 0);

  return { steps: full, next, completed, total, complete: completed === total, minutesLeft };
}
