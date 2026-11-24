import { describe, expect, it } from 'vitest';
import {
  activityCopy,
  canAdvance,
  commandeStepSchema,
  DASHBOARD_ACTIVITY_KINDS,
  euros,
  isRepairerTurn,
  mergeActivity,
  repairerDashboardSchema,
  TODO_EMPTY_COPY,
  todoBadgeCount,
  todoCopy,
  type CommandeStep,
  type DashboardActivityItem,
  type DeliveryMode,
} from '@revime/shared';

/**
 * CF4 sub-project G - the réparateur dashboard's shared rules (spec §4.1, §4.2).
 * Exhaustive tables, because `apps/mobile` has no harness and these strings and turns are
 * what the réparateur reads.
 */

describe('isRepairerTurn', () => {
  const LOCAL: Record<CommandeStep, boolean> = {
    PAID: true,
    PARCEL_SENT: false,
    PARCEL_RECEIVED: false,
    REPAIR_STARTED: true,
    REPAIR_DONE: true,
    RETURN_SENT: false,
    RETURN_RECEIVED: false,
    AWAITING_VALIDATION: false,
    RELEASED: false,
  };
  const PARCEL: Record<CommandeStep, boolean> = {
    PAID: false,
    PARCEL_SENT: true,
    PARCEL_RECEIVED: true,
    REPAIR_STARTED: true,
    REPAIR_DONE: true,
    RETURN_SENT: false,
    RETURN_RECEIVED: true,
    AWAITING_VALIDATION: false,
    RELEASED: false,
  };
  const expected: Record<DeliveryMode, Record<CommandeStep, boolean>> = {
    HOME: LOCAL,
    WORKSHOP: LOCAL,
    PARCEL,
  };

  for (const delivery of ['HOME', 'WORKSHOP', 'PARCEL'] as const) {
    for (const step of commandeStepSchema.options) {
      it(`${delivery} at ${step} -> ${expected[delivery][step]}`, () => {
        expect(isRepairerTurn(step, delivery)).toBe(expected[delivery][step]);
      });
      // The dashboard's « nécessite votre attention » and the commande screen's step button
      // must be the SAME rule, or the line names an action the screen does not offer.
      it(`${delivery} at ${step} agrees with canAdvance(REPAIRER)`, () => {
        expect(isRepairerTurn(step, delivery)).toBe(canAdvance(step, delivery, 'REPAIRER'));
      });
    }
  }
});

function item(
  kind: DashboardActivityItem['kind'],
  at: string,
  commandeId = 'c1',
): DashboardActivityItem {
  return { kind, at, commandeId, subject: 'Écran cassé', amountCents: null, rating: null };
}

describe('mergeActivity', () => {
  it('returns [] for no items', () => {
    expect(mergeActivity([])).toEqual([]);
  });

  it('sorts newest first', () => {
    const out = mergeActivity([
      item('OFFER_ACCEPTED', '2026-09-01T10:00:00.000Z'),
      item('REPAIR_DONE', '2026-09-03T10:00:00.000Z'),
      item('DISPUTE_OPENED', '2026-09-02T10:00:00.000Z'),
    ]);
    expect(out.map((i) => i.at)).toEqual([
      '2026-09-03T10:00:00.000Z',
      '2026-09-02T10:00:00.000Z',
      '2026-09-01T10:00:00.000Z',
    ]);
  });

  it('cuts at 5 by default, keeping the newest', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      item('REPAIR_DONE', new Date(Date.UTC(2026, 8, 1 + i)).toISOString(), `c${i}`),
    );
    const out = mergeActivity(many);
    expect(out).toHaveLength(5);
    expect(out.map((i) => i.commandeId)).toEqual(['c11', 'c10', 'c9', 'c8', 'c7']);
  });

  it('honours an explicit limit', () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      item('REPAIR_DONE', new Date(Date.UTC(2026, 8, 1 + i)).toISOString(), `c${i}`),
    );
    expect(mergeActivity(many, 2)).toHaveLength(2);
  });

  it('breaks same-timestamp ties by kind order then commandeId, independent of input order', () => {
    const at = '2026-09-05T12:00:00.000Z';
    const input = [
      item('DISPUTE_OPENED', at, 'a'),
      item('OFFER_ACCEPTED', at, 'b'),
      item('OFFER_ACCEPTED', at, 'a'),
      item('FUNDS_RELEASED', at, 'a'),
    ];
    const expected = [
      ['OFFER_ACCEPTED', 'a'],
      ['OFFER_ACCEPTED', 'b'],
      ['FUNDS_RELEASED', 'a'],
      ['DISPUTE_OPENED', 'a'],
    ];
    const forward = mergeActivity(input).map((i) => [i.kind, i.commandeId]);
    const reversed = mergeActivity([...input].reverse()).map((i) => [i.kind, i.commandeId]);
    expect(forward).toEqual(expected);
    expect(reversed).toEqual(expected);
  });

  it('DASHBOARD_ACTIVITY_KINDS is the tie order', () => {
    expect(DASHBOARD_ACTIVITY_KINDS).toEqual([
      'OFFER_ACCEPTED',
      'REPAIR_DONE',
      'FUNDS_RELEASED',
      'REVIEW_RECEIVED',
      'DISPUTE_OPENED',
    ]);
  });
});

describe('todoCopy', () => {
  it('DISPUTE at 1', () => {
    expect(todoCopy({ kind: 'DISPUTE', count: 1, commandeId: 'x' })).toEqual({
      title: '1 litige est en cours sur une de vos réparations',
      body: 'REVIME examine la situation.',
      cta: 'Voir →',
    });
  });
  it('DISPUTE at 3', () => {
    expect(todoCopy({ kind: 'DISPUTE', count: 3, commandeId: null })).toEqual({
      title: '3 litiges sont en cours sur vos réparations',
      body: 'REVIME examine la situation.',
      cta: 'Voir →',
    });
  });
  // CF4-22 (V4 §6): when REVIME wrote last in his confidential space, the client's wording.
  it('DISPUTE awaiting his reply, at 1', () => {
    expect(todoCopy({ kind: 'DISPUTE', count: 2, commandeId: 'x', awaitingReply: 1 })).toEqual({
      title: '1 litige nécessite votre réponse',
      body: 'REVIME attend des informations de votre part.',
      cta: 'Répondre →',
    });
  });
  it('DISPUTE awaiting his reply, at 3', () => {
    expect(todoCopy({ kind: 'DISPUTE', count: 3, commandeId: null, awaitingReply: 3 })).toEqual({
      title: '3 litiges nécessitent votre réponse',
      body: 'REVIME attend des informations de votre part.',
      cta: 'Répondre →',
    });
  });
  it('DISPUTE with awaitingReply 0 keeps « en cours »', () => {
    expect(todoCopy({ kind: 'DISPUTE', count: 1, commandeId: 'x', awaitingReply: 0 }).title).toBe(
      '1 litige est en cours sur une de vos réparations',
    );
  });
  it('ATTENTION at 1', () => {
    expect(todoCopy({ kind: 'ATTENTION', count: 1, commandeId: 'x' })).toEqual({
      title: '1 réparation nécessite votre attention',
      body: 'Une étape est à valider de votre côté.',
      cta: 'Voir →',
    });
  });
  it('ATTENTION at 3', () => {
    expect(todoCopy({ kind: 'ATTENTION', count: 3, commandeId: null })).toEqual({
      title: '3 réparations nécessitent votre attention',
      body: 'Des étapes sont à valider de votre côté.',
      cta: 'Voir →',
    });
  });
  it('MATCHING at 1', () => {
    expect(todoCopy({ kind: 'MATCHING', count: 1 })).toEqual({
      title: '1 nouvelle demande correspond à vos services',
      body: "Vous n'avez pas encore fait d'offre.",
      cta: 'Voir les demandes →',
    });
  });
  it('MATCHING at 3', () => {
    expect(todoCopy({ kind: 'MATCHING', count: 3 })).toEqual({
      title: '3 nouvelles demandes correspondent à vos services',
      body: "Vous n'avez pas encore fait d'offre.",
      cta: 'Voir les demandes →',
    });
  });
  it('CATEGORIES_MISSING', () => {
    expect(todoCopy({ kind: 'CATEGORIES_MISSING' })).toEqual({
      title: 'Indiquez les catégories que vous réparez',
      body: 'Pour voir les demandes qui vous correspondent.',
      cta: 'Mes catégories →',
    });
  });
  it('empty state', () => {
    expect(TODO_EMPTY_COPY).toEqual({
      title: 'Tout est à jour',
      body: "Aucune action n'est requise pour le moment.",
    });
  });
});

describe('activityCopy', () => {
  const at = '2026-09-05T12:00:00.000Z';
  it('each kind', () => {
    expect(activityCopy(item('OFFER_ACCEPTED', at))).toBe('Offre acceptée');
    expect(activityCopy(item('REPAIR_DONE', at))).toBe('Réparation terminée');
    expect(activityCopy({ ...item('FUNDS_RELEASED', at), amountCents: 4500 })).toBe(
      `Fonds versés · ${euros(4500)}`,
    );
    expect(activityCopy({ ...item('FUNDS_RELEASED', at), amountCents: 4550 })).toBe(
      'Fonds versés · 45,50 €',
    );
    expect(activityCopy({ ...item('REVIEW_RECEIVED', at), rating: 4 })).toBe('Nouvel avis · 4/5');
    expect(activityCopy(item('DISPUTE_OPENED', at))).toBe('Litige ouvert');
  });
});

describe('todoBadgeCount', () => {
  it('sums counts, CATEGORIES_MISSING counts 1', () => {
    expect(
      todoBadgeCount([
        { kind: 'DISPUTE', count: 2, commandeId: null },
        { kind: 'CATEGORIES_MISSING' },
      ]),
    ).toBe(3);
  });
  it('0 for []', () => {
    expect(todoBadgeCount([])).toBe(0);
  });
});

describe('repairerDashboardSchema', () => {
  const dto = {
    todo: [
      { kind: 'DISPUTE', count: 1, commandeId: 'c1' },
      { kind: 'ATTENTION', count: 2, commandeId: null },
      { kind: 'MATCHING', count: 4 },
    ],
    activity: [
      {
        kind: 'FUNDS_RELEASED',
        at: '2026-09-05T12:00:00.000Z',
        commandeId: 'c1',
        subject: 'Écran',
        amountCents: 4500,
        rating: null,
      },
    ],
  };
  it('accepts a representative DTO', () => {
    expect(repairerDashboardSchema.parse(dto)).toEqual(dto);
  });
  it('accepts CATEGORIES_MISSING and an empty DTO', () => {
    expect(
      repairerDashboardSchema.parse({ todo: [{ kind: 'CATEGORIES_MISSING' }], activity: [] }),
    ).toBeTruthy();
    expect(repairerDashboardSchema.parse({ todo: [], activity: [] })).toBeTruthy();
  });
  it('rejects an unknown todo kind', () => {
    expect(() =>
      repairerDashboardSchema.parse({ todo: [{ kind: 'NOPE', count: 1 }], activity: [] }),
    ).toThrow();
  });
  it('rejects an unknown activity kind', () => {
    expect(() =>
      repairerDashboardSchema.parse({
        todo: [],
        activity: [{ ...dto.activity[0], kind: 'NOPE' }],
      }),
    ).toThrow();
  });
});
