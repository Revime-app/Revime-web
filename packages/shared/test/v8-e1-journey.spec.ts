import { describe, expect, it } from 'vitest';
import {
  type ProfileCompletion,
  type RepairerJourneyInput,
  repairerJourney,
} from '../src/index.js';

/**
 * V8 E1 (`DEC8-08` (2), (12)). Each step carries its time, what it unlocks and its value once done; the journey
 * carries the time left. The mockup's own figures are the anchor: 3/5 with fiscal and profile left reads ≈ 4 min.
 */

function completion(completed: number): ProfileCompletion {
  const keys = ['photo', 'banner', 'description', 'categories', 'zone', 'availability'] as const;
  const items = Object.fromEntries(keys.map((k, i) => [k, i < completed])) as ProfileCompletion['items'];
  return { completed, total: 6, items };
}

function fresh(kind: 'INDIVIDUAL' | 'PRO'): RepairerJourneyInput {
  return {
    kind,
    level: 'BASIC',
    identityStatus: null,
    lastErrorCode: null,
    completion: completion(0),
    connectStatus: null,
    connectEnabled: true,
    fiscalCompleted: false,
  };
}

function mockup2(): RepairerJourneyInput {
  return {
    kind: 'INDIVIDUAL',
    level: 'IDENTITY',
    identityStatus: 'VERIFIED',
    lastErrorCode: null,
    completion: completion(1),
    connectStatus: 'VERIFIED',
    connectEnabled: true,
    fiscalCompleted: false,
  };
}

function step(input: RepairerJourneyInput, key: string) {
  const s = repairerJourney(input).steps.find((x) => x.key === key);
  if (!s) throw new Error(`no ${key} step`);
  return s;
}

describe('V8 E1 journey times, chips and values', () => {
  it('mockup 2: 3/5 with fiscal and profile left reads ≈ 4 min', () => {
    const j = repairerJourney(mockup2());
    expect([j.completed, j.total, j.minutesLeft]).toEqual([3, 5, 4]);
    expect(step(mockup2(), 'fiscal')).toMatchObject({
      minutes: 2,
      unlocks: 'Nécessaire pour recevoir vos paiements',
      value: null,
    });
    expect(step(mockup2(), 'profile')).toMatchObject({
      progress: '1/6',
      minutes: 2,
      unlocks: 'Recommandé : les clients vous choisissent plus facilement',
    });
    expect(step(mockup2(), 'payouts').value).toBe('Activés');
  });

  it('nothing done: ≈ 10 min (Statut 1 + Identité 2 + fiscal 2 + Profil 2 + Virements 3)', () => {
    expect(repairerJourney({ ...fresh('INDIVIDUAL'), kind: null }).minutesLeft).toBe(10);
  });

  it('a new repairer (Statut chosen): ≈ 9 min Particulier, ≈ 10 min Pro; blocked steps still count', () => {
    expect(repairerJourney(fresh('INDIVIDUAL')).minutesLeft).toBe(9);
    expect(repairerJourney(fresh('PRO')).minutesLeft).toBe(10);
    expect(step(fresh('INDIVIDUAL'), 'fiscal').status).toBe('blocked');
    expect(step(fresh('PRO'), 'business')).toMatchObject({ status: 'blocked', minutes: 3 });
  });

  it('a step waiting on review counts 0', () => {
    const waiting = { ...fresh('INDIVIDUAL'), identityStatus: 'PROCESSING' as const };
    expect(step(waiting, 'identity').status).toBe('waiting');
    expect(repairerJourney(waiting).minutesLeft).toBe(7);
  });

  it('minutesLeft without connect: 3 steps, fiscal 2 + Profil 2', () => {
    const j = repairerJourney({ ...fresh('INDIVIDUAL'), connectEnabled: false });
    expect(j.steps.map((s) => s.key)).toEqual(['kind', 'fiscal', 'profile']);
    expect(j.minutesLeft).toBe(4);
  });

  it('a done journey has no time left', () => {
    const done: RepairerJourneyInput = { ...mockup2(), completion: completion(6), fiscalCompleted: true };
    const j = repairerJourney(done);
    expect(j.complete).toBe(true);
    expect(j.minutesLeft).toBe(0);
  });

  it('done values', () => {
    const done: RepairerJourneyInput = { ...mockup2(), completion: completion(6), fiscalCompleted: true };
    const values = Object.fromEntries(repairerJourney(done).steps.map((s) => [s.key, s.value]));
    expect(values).toEqual({
      kind: 'Particulier',
      identity: 'Vérifiée',
      fiscal: 'Renseignées',
      profile: 'Complet',
      payouts: 'Activés',
    });
    const pro = repairerJourney({ ...done, kind: 'PRO', level: 'BUSINESS' });
    expect(pro.steps.find((s) => s.key === 'kind')?.value).toBe('Professionnel');
    expect(pro.steps.find((s) => s.key === 'business')?.value).toBe('Vérifiées');
  });

  it('a step not done has no value, and only the profile step has a progress', () => {
    for (const s of repairerJourney(fresh('PRO')).steps) {
      if (s.status !== 'done') expect(s.value).toBeNull();
      expect(s.progress).toBe(s.key === 'profile' ? '0/6' : null);
    }
    expect(step(mockup2(), 'profile').progress).toBe('1/6');
  });

  it("review I1: a Pro's business verification under review is waiting, not a step to do, and counts 0", () => {
    const pro: RepairerJourneyInput = {
      ...fresh('PRO'),
      level: 'IDENTITY',
      identityStatus: 'VERIFIED',
      businessStatus: 'PENDING',
    };
    const j = repairerJourney(pro);
    const business = j.steps.find((s) => s.key === 'business');
    expect(business).toMatchObject({ status: 'waiting', cta: null });
    expect(business?.body).toBe(
      'Vérification en cours. Vous pourrez envoyer des offres dès que votre vérification sera validée.',
    );
    // Profil 2 + Virements 3; the 3 business minutes are not his to spend.
    expect(j.minutesLeft).toBe(5);
    expect(j.next).toBe('profile');
  });

  it('review I1: a business verification to redo is a step to do with the reason', () => {
    const j = repairerJourney({ ...fresh('PRO'), level: 'IDENTITY', identityStatus: 'VERIFIED', businessStatus: 'REJECTED' });
    expect(j.steps.find((s) => s.key === 'business')).toMatchObject({
      status: 'todo',
      cta: 'Vérifier mon entreprise',
      body: "Votre vérification d'entreprise est à refaire : ouvrez « Mon entreprise » pour en voir le motif.",
    });
  });

  it('chips', () => {
    const chips = Object.fromEntries(repairerJourney(fresh('PRO')).steps.map((s) => [s.key, s.unlocks]));
    expect(chips).toEqual({
      kind: 'Nécessaire pour vérifier votre identité',
      identity: 'Nécessaire pour envoyer des offres',
      business: 'Nécessaire pour envoyer des offres',
      profile: 'Recommandé : les clients vous choisissent plus facilement',
      payouts: 'Nécessaire pour recevoir vos paiements',
    });
  });
});
