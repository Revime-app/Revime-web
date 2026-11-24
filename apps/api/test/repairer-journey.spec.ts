import { describe, expect, it } from 'vitest';
import {
  type ConnectStatus,
  type IdentityStatus,
  type ProfileCompletion,
  type RepairerJourneyInput,
  repairerJourney,
} from '@revime/shared';

/**
 * CF4-09, design spec §4.1: the shared derivation behind the « Statut de vérification » hub, the resume
 * card and the return screens. `apps/mobile` has no test harness, so the pure derivation is pinned here,
 * following the pattern of `verification-state.spec.ts`.
 */

const EMPTY_COMPLETION: ProfileCompletion = {
  completed: 0,
  total: 6,
  items: {
    photo: false,
    banner: false,
    description: false,
    categories: false,
    zone: false,
    availability: false,
  },
};

function base(): RepairerJourneyInput {
  return {
    kind: 'INDIVIDUAL',
    level: 'BASIC',
    identityStatus: null,
    lastErrorCode: null,
    completion: EMPTY_COMPLETION,
    connectStatus: null,
    connectEnabled: true,
  };
}

describe('repairerJourney', () => {
  it('INDIVIDUAL step order', () => {
    const journey = repairerJourney(base());
    expect(journey.steps.map((s) => s.key)).toEqual(['kind', 'identity', 'fiscal', 'profile', 'payouts']);
  });

  it('PRO step order', () => {
    const journey = repairerJourney({ ...base(), kind: 'PRO' });
    expect(journey.steps.map((s) => s.key)).toEqual(['kind', 'identity', 'business', 'profile', 'payouts']);
  });

  it('connectEnabled false omits identity and payouts', () => {
    const individual = repairerJourney({ ...base(), connectEnabled: false });
    expect(individual.steps.map((s) => s.key)).toEqual(['kind', 'fiscal', 'profile']);

    const pro = repairerJourney({ ...base(), kind: 'PRO', connectEnabled: false });
    expect(pro.steps.map((s) => s.key)).toEqual(['kind', 'business', 'profile']);
  });

  it('kind null ⇒ next kind', () => {
    const journey = repairerJourney({ ...base(), kind: null });
    expect(journey.next).toBe('kind');
    const kindStep = journey.steps.find((s) => s.key === 'kind')!;
    expect(kindStep.cta).toBe('Choisir');
  });

  it('fresh INDIVIDUAL ⇒ next identity, cta Vérifier', () => {
    const journey = repairerJourney(base());
    expect(journey.next).toBe('identity');
    const identityStep = journey.steps.find((s) => s.key === 'identity')!;
    expect(identityStep.cta).toBe('Vérifier');
  });

  it('identity PROCESSING ⇒ waiting, next profile', () => {
    const journey = repairerJourney({ ...base(), identityStatus: 'PROCESSING' });
    const identityStep = journey.steps.find((s) => s.key === 'identity')!;
    expect(identityStep.status).toBe('waiting');
    expect(identityStep.cta).toBeNull();
    expect(journey.next).toBe('profile');
  });

  it('identity REFUSED shows reason', () => {
    const journey = repairerJourney({
      ...base(),
      identityStatus: 'REQUIRES_INPUT',
      lastErrorCode: 'document_expired',
    });
    const identityStep = journey.steps.find((s) => s.key === 'identity')!;
    expect(identityStep.body).toBe('Votre document est expiré.');
    expect(identityStep.cta).toBe('Recommencer');
  });

  it('REQUIRES_INPUT without code ⇒ Reprendre', () => {
    const journey = repairerJourney({ ...base(), identityStatus: 'REQUIRES_INPUT', lastErrorCode: null });
    const identityStep = journey.steps.find((s) => s.key === 'identity')!;
    expect(identityStep.body).toBe("Votre vérification d'identité n'est pas terminée.");
    expect(identityStep.cta).toBe('Reprendre');
  });

  it('CANCELED ⇒ Recommencer', () => {
    const journey = repairerJourney({ ...base(), identityStatus: 'CANCELED' });
    const identityStep = journey.steps.find((s) => s.key === 'identity')!;
    expect(identityStep.body).toBe('Votre vérification a été annulée.');
    expect(identityStep.cta).toBe('Recommencer');
  });

  it('PRO with identity PROCESSING ⇒ business blocked, next profile', () => {
    const journey = repairerJourney({ ...base(), kind: 'PRO', identityStatus: 'PROCESSING' });
    const businessStep = journey.steps.find((s) => s.key === 'business')!;
    expect(businessStep.status).toBe('blocked');
    expect(journey.next).toBe('profile');
  });

  it('PRO at IDENTITY ⇒ identity done, next business', () => {
    const journey = repairerJourney({ ...base(), kind: 'PRO', level: 'IDENTITY' });
    const identityStep = journey.steps.find((s) => s.key === 'identity')!;
    expect(identityStep.status).toBe('done');
    expect(journey.next).toBe('business');
    const businessStep = journey.steps.find((s) => s.key === 'business')!;
    expect(businessStep.cta).toBe('Vérifier mon entreprise');
  });

  it('identityStatus VERIFIED at BASIC ⇒ identity done (webhook lag)', () => {
    const journey = repairerJourney({ ...base(), level: 'BASIC', identityStatus: 'VERIFIED' });
    const identityStep = journey.steps.find((s) => s.key === 'identity')!;
    expect(identityStep.status).toBe('done');
  });

  it('completion partial body', () => {
    const partial = repairerJourney({
      ...base(),
      completion: { completed: 4, total: 6, items: EMPTY_COMPLETION.items },
    });
    expect(partial.steps.find((s) => s.key === 'profile')!.body).toBe('Complétez votre profil : 4/6 éléments.');

    const nullCompletion = repairerJourney({ ...base(), completion: null });
    expect(nullCompletion.steps.find((s) => s.key === 'profile')!.body).toBe(
      'Complétez votre profil : 0/6 éléments.',
    );
  });

  it('payouts statuses', () => {
    const none = repairerJourney({ ...base(), connectStatus: null });
    const noneStep = none.steps.find((s) => s.key === 'payouts')!;
    expect(noneStep.status).toBe('todo');
    expect(noneStep.cta).toBe('Configurer');

    const pending = repairerJourney({ ...base(), connectStatus: 'PENDING' });
    const pendingStep = pending.steps.find((s) => s.key === 'payouts')!;
    expect(pendingStep.status).toBe('todo');
    expect(pendingStep.cta).toBe('Reprendre');

    const restricted = repairerJourney({ ...base(), connectStatus: 'RESTRICTED' });
    const restrictedStep = restricted.steps.find((s) => s.key === 'payouts')!;
    expect(restrictedStep.status).toBe('todo');
    expect(restrictedStep.cta).toBe('Compléter');

    const verified = repairerJourney({ ...base(), connectStatus: 'VERIFIED' });
    expect(verified.steps.find((s) => s.key === 'payouts')!.status).toBe('done');

    const rejected = repairerJourney({ ...base(), connectStatus: 'REJECTED' });
    const rejectedStep = rejected.steps.find((s) => s.key === 'payouts')!;
    expect(rejectedStep.status).toBe('blocked');
    expect(rejectedStep.cta).toBeNull();
  });

  it('INDIVIDUAL with identity not done ⇒ fiscal blocked', () => {
    const journey = repairerJourney(base());
    const fiscalStep = journey.steps.find((s) => s.key === 'fiscal')!;
    expect(fiscalStep.status).toBe('blocked');
    expect(fiscalStep.body).toBe('Disponible après la validation de votre identité.');
    expect(fiscalStep.cta).toBeNull();
  });

  it('INDIVIDUAL with identity done but fiscal not completed ⇒ next fiscal, cta Renseigner mes informations', () => {
    const journey = repairerJourney({ ...base(), level: 'IDENTITY' });
    const fiscalStep = journey.steps.find((s) => s.key === 'fiscal')!;
    expect(fiscalStep.status).toBe('todo');
    expect(fiscalStep.body).toBe('Renseignez vos informations fiscales (déclaration annuelle DAC7).');
    expect(fiscalStep.cta).toBe('Renseigner mes informations');
    expect(journey.next).toBe('fiscal');
  });

  it('INDIVIDUAL with fiscalCompleted true ⇒ fiscal done', () => {
    const journey = repairerJourney({ ...base(), level: 'IDENTITY', fiscalCompleted: true });
    const fiscalStep = journey.steps.find((s) => s.key === 'fiscal')!;
    expect(fiscalStep.status).toBe('done');
    expect(fiscalStep.body).toBe('Vos informations fiscales sont complétées.');
    expect(fiscalStep.cta).toBeNull();
    expect(journey.next).toBe('profile');
  });

  it('all done ⇒ complete', () => {
    const journey = repairerJourney({
      ...base(),
      level: 'IDENTITY',
      fiscalCompleted: true,
      completion: { completed: 6, total: 6, items: EMPTY_COMPLETION.items },
      connectStatus: 'VERIFIED',
    });
    expect(journey.complete).toBe(true);
    expect(journey.next).toBeNull();
    expect(journey.completed).toBe(5);
    expect(journey.total).toBe(5);
  });

  it('PRO complete needs BUSINESS', () => {
    const atIdentity = repairerJourney({
      ...base(),
      kind: 'PRO',
      level: 'IDENTITY',
      completion: { completed: 6, total: 6, items: EMPTY_COMPLETION.items },
      connectStatus: 'VERIFIED',
    });
    expect(atIdentity.complete).toBe(false);

    const atBusiness = repairerJourney({
      ...base(),
      kind: 'PRO',
      level: 'BUSINESS',
      completion: { completed: 6, total: 6, items: EMPTY_COMPLETION.items },
      connectStatus: 'VERIFIED',
    });
    expect(atBusiness.complete).toBe(true);
  });

  it('invariant: next is the first todo', () => {
    const kinds = ['PRO', 'INDIVIDUAL', null] as const;
    const levels = ['NONE', 'BASIC', 'IDENTITY', 'BUSINESS'] as const;
    const identityStatuses: (IdentityStatus | null)[] = ['REQUIRES_INPUT', 'PROCESSING', 'VERIFIED', 'CANCELED', null];
    const connectStatuses: (ConnectStatus | null)[] = ['PENDING', 'VERIFIED', 'RESTRICTED', 'REJECTED', null];
    const connectEnableds = [true, false];
    const fiscalCompleteds = [true, false, null];
    const completions: (ProfileCompletion | null)[] = [
      { completed: 0, total: 6, items: EMPTY_COMPLETION.items },
      { completed: 6, total: 6, items: EMPTY_COMPLETION.items },
    ];

    for (const kind of kinds) {
      for (const level of levels) {
        for (const identityStatus of identityStatuses) {
          for (const connectStatus of connectStatuses) {
            for (const connectEnabled of connectEnableds) {
              for (const fiscalCompleted of fiscalCompleteds) {
                for (const completion of completions) {
                  const journey = repairerJourney({
                    kind,
                    level,
                    identityStatus,
                    lastErrorCode: null,
                    completion,
                    connectStatus,
                    connectEnabled,
                    fiscalCompleted,
                  });

                  const expectedNext = journey.steps.find((s) => s.status === 'todo')?.key ?? null;
                  expect(journey.next).toBe(expectedNext);

                  const expectedCompleted = journey.steps.filter((s) => s.status === 'done').length;
                  expect(journey.completed).toBe(expectedCompleted);

                  expect(journey.complete).toBe(journey.completed === journey.total);

                  for (const step of journey.steps) {
                    if (step.status !== 'todo') expect(step.cta).toBeNull();
                  }
                }
              }
            }
          }
        }
      }
    }
  });
});

/**
 * CF4-39 (sub-project M), Review Focus 2. A refused session still reads `identityStatus` VERIFIED
 * (the session Stripe verified), and `identityDone` used to treat that as done - so a refused
 * réparateur would read « Votre identité est vérifiée ». The decision must win.
 */
describe('repairerJourney — operator decision', () => {
  const identityOf = (input: RepairerJourneyInput) => repairerJourney(input).steps.find((s) => s.key === 'identity')!;

  it('a refusal on a Stripe-verified session is todo with the motif and « Recommencer »', () => {
    const step = identityOf({
      ...base(),
      level: 'BASIC',
      identityStatus: 'VERIFIED',
      decision: 'REFUSED',
      decisionReason: 'Document expiré',
    });
    expect(step).toMatchObject({ status: 'todo', body: 'Document expiré', cta: 'Recommencer' });
  });

  it('a documents request is todo with its reason', () => {
    const step = identityOf({
      ...base(),
      level: 'BASIC',
      identityStatus: 'VERIFIED',
      decision: 'DOCUMENTS_REQUESTED',
      decisionReason: 'Autre : Photo coupée',
    });
    expect(step).toMatchObject({ status: 'todo', body: 'Autre : Photo coupée', cta: 'Recommencer' });
  });

  it('a decision without a reason falls back to the Stripe reason', () => {
    const step = identityOf({ ...base(), identityStatus: 'VERIFIED', decision: 'REFUSED', decisionReason: null });
    expect(step).toMatchObject({ status: 'todo', body: 'Documents non conformes. Veuillez recommencer.' });
  });

  it('a PRO whose identity was refused has the business step blocked', () => {
    const journey = repairerJourney({
      ...base(),
      kind: 'PRO',
      identityStatus: 'VERIFIED',
      decision: 'REFUSED',
      decisionReason: 'Document illisible',
    });
    expect(journey.steps.find((s) => s.key === 'business')!.status).toBe('blocked');
    // Also with connect disabled, where the identity step is omitted.
    const off = repairerJourney({
      ...base(),
      kind: 'PRO',
      connectEnabled: false,
      identityStatus: 'VERIFIED',
      decision: 'REFUSED',
    });
    expect(off.steps.find((s) => s.key === 'business')!.status).toBe('blocked');
  });

  it('an INDIVIDUAL whose identity was refused has the fiscal step blocked', () => {
    const journey = repairerJourney({
      ...base(),
      kind: 'INDIVIDUAL',
      identityStatus: 'VERIFIED',
      decision: 'REFUSED',
      decisionReason: 'Document illisible',
    });
    expect(journey.steps.find((s) => s.key === 'fiscal')!.status).toBe('blocked');
    // Also with connect disabled, where the identity step is omitted.
    const off = repairerJourney({
      ...base(),
      kind: 'INDIVIDUAL',
      connectEnabled: false,
      identityStatus: 'VERIFIED',
      decision: 'REFUSED',
    });
    expect(off.steps.find((s) => s.key === 'fiscal')!.status).toBe('blocked');
  });

  it('no decision on a VERIFIED session is still done', () => {
    expect(identityOf({ ...base(), identityStatus: 'VERIFIED', decision: null }).status).toBe('done');
    expect(identityOf({ ...base(), identityStatus: 'VERIFIED' }).status).toBe('done');
  });
});
