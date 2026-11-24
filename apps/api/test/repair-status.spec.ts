import { describe, expect, it } from 'vitest';
import {
  CLIENT_STAGES,
  REPAIRER_STAGES,
  repairStatus,
  offersStillMatter,
  timelineLabel,
  orderNumberFor,
  type RepairFacts,
  type RepairStatus,
  type RepairViewer,
} from '@revime/shared';
import type { DemandeStatus } from '@revime/shared';
import type { CommandeStatus, CommandeStep } from '@revime/shared';

const facts = (over: Partial<RepairFacts> = {}): RepairFacts => ({
  demandeStatus: null,
  offerCount: 0,
  commande: null,
  ...over,
});

describe('CLIENT_STAGES', () => {
  it("is the client's eight labels, in order", () => {
    expect(CLIENT_STAGES).toEqual([
      "En attente d'offres",
      'Offres reçues',
      'Offre sélectionnée — Paiement en attente',
      'Paiement effectué',
      'Réparation en cours',
      'Réparation terminée — En attente de validation',
      'Réparation validée — Fonds à verser',
      'Fonds versés au réparateur',
    ]);
  });
});

describe('REPAIRER_STAGES', () => {
  it("is the réparateur's four labels, in order", () => {
    expect(REPAIRER_STAGES).toEqual([
      'Paiement effectué',
      'Réparation en cours',
      'Réparation terminée — En attente de validation du client',
      'Fonds versés',
    ]);
  });
});

describe('repairStatus — client', () => {
  it("no commande & 0 offers is index 0, \"En attente d'offres\"", () => {
    const r = repairStatus(facts({ demandeStatus: 'OPEN', offerCount: 0, commande: null }), 'CLIENT');
    expect(r.currentIndex).toBe(0);
    expect(r.label).toBe("En attente d'offres");
  });

  it('1 offer is index 1, singular label', () => {
    const r = repairStatus(facts({ demandeStatus: 'OPEN', offerCount: 1, commande: null }), 'CLIENT');
    expect(r.currentIndex).toBe(1);
    expect(r.label).toBe('Offres reçues — 1 offre');
  });

  it('2 offers is index 1, plural label', () => {
    const r = repairStatus(facts({ demandeStatus: 'OPEN', offerCount: 2, commande: null }), 'CLIENT');
    expect(r.currentIndex).toBe(1);
    expect(r.label).toBe('Offres reçues — 2 offres');
  });

  it('an ABANDONED commande with 2 offers is index 1', () => {
    const r = repairStatus(
      facts({ demandeStatus: 'OPEN', offerCount: 2, commande: { status: 'ABANDONED', step: null } }),
      'CLIENT',
    );
    expect(r.currentIndex).toBe(1);
    expect(r.label).toBe('Offres reçues — 2 offres');
  });

  it('PENDING_PAYMENT is index 2', () => {
    const r = repairStatus(
      facts({ demandeStatus: 'OPEN', commande: { status: 'PENDING_PAYMENT', step: null } }),
      'CLIENT',
    );
    expect(r.currentIndex).toBe(2);
    expect(r.label).toBe('Offre sélectionnée — Paiement en attente');
  });

  it.each(['PAID', 'PARCEL_SENT', 'PARCEL_RECEIVED', null] as const)(
    'PAID commande with step %s is index 3, "Paiement effectué"',
    (step) => {
      const r = repairStatus(
        facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'PAID', step } }),
        'CLIENT',
      );
      expect(r.currentIndex).toBe(3);
      expect(r.label).toBe('Paiement effectué');
    },
  );

  it('REPAIR_STARTED is index 4', () => {
    const r = repairStatus(
      facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'PAID', step: 'REPAIR_STARTED' } }),
      'CLIENT',
    );
    expect(r.currentIndex).toBe(4);
    expect(r.label).toBe('Réparation en cours');
  });

  it.each(['REPAIR_DONE', 'RETURN_SENT', 'RETURN_RECEIVED'] as const)(
    'step %s is index 5, "Réparation terminée" (no validation suffix)',
    (step) => {
      const r = repairStatus(
        facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'PAID', step } }),
        'CLIENT',
      );
      expect(r.currentIndex).toBe(5);
      expect(r.label).toBe('Réparation terminée');
    },
  );

  it('AWAITING_VALIDATION is index 5, with the full validation-wait label', () => {
    const r = repairStatus(
      facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'PAID', step: 'AWAITING_VALIDATION' } }),
      'CLIENT',
    );
    expect(r.currentIndex).toBe(5);
    expect(r.label).toBe('Réparation terminée — En attente de validation');
  });

  it('index 6 is never current for any table row', () => {
    for (const demandeStatus of ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const) {
      for (const status of ['PENDING_PAYMENT', 'PAID', 'ABANDONED', 'REFUNDED'] as const) {
        for (const step of [
          null,
          'PAID',
          'PARCEL_SENT',
          'PARCEL_RECEIVED',
          'REPAIR_STARTED',
          'REPAIR_DONE',
          'RETURN_SENT',
          'RETURN_RECEIVED',
          'AWAITING_VALIDATION',
          'RELEASED',
        ] as const) {
          const r = repairStatus(
            facts({ demandeStatus, commande: { status, step } }),
            'CLIENT',
          );
          expect(r.currentIndex).not.toBe(6);
        }
      }
    }
  });

  it('step RELEASED is index 7, "Fonds versés au réparateur"', () => {
    const r = repairStatus(
      facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'PAID', step: 'RELEASED' } }),
      'CLIENT',
    );
    expect(r.currentIndex).toBe(7);
    expect(r.label).toBe('Fonds versés au réparateur');
  });

  it('demande DONE is index 7 regardless of commande', () => {
    const r = repairStatus(facts({ demandeStatus: 'DONE', commande: null }), 'CLIENT');
    expect(r.currentIndex).toBe(7);
    expect(r.label).toBe('Fonds versés au réparateur');
  });
});

describe('repairStatus — réparateur', () => {
  it('PAID is index 0', () => {
    const r = repairStatus(facts({ demandeStatus: null, commande: { status: 'PAID', step: 'PAID' } }), 'REPAIRER');
    expect(r.currentIndex).toBe(0);
    expect(r.label).toBe('Paiement effectué');
  });

  it('REPAIR_STARTED is index 1', () => {
    const r = repairStatus(
      facts({ demandeStatus: null, commande: { status: 'PAID', step: 'REPAIR_STARTED' } }),
      'REPAIRER',
    );
    expect(r.currentIndex).toBe(1);
    expect(r.label).toBe('Réparation en cours');
  });

  it('REPAIR_DONE is index 2, "Réparation terminée"', () => {
    const r = repairStatus(
      facts({ demandeStatus: null, commande: { status: 'PAID', step: 'REPAIR_DONE' } }),
      'REPAIRER',
    );
    expect(r.currentIndex).toBe(2);
    expect(r.label).toBe('Réparation terminée');
  });

  it('AWAITING_VALIDATION is index 2 with the full "…validation du client" label', () => {
    const r = repairStatus(
      facts({ demandeStatus: null, commande: { status: 'PAID', step: 'AWAITING_VALIDATION' } }),
      'REPAIRER',
    );
    expect(r.currentIndex).toBe(2);
    expect(r.label).toBe('Réparation terminée — En attente de validation du client');
  });

  it('RELEASED is index 3, "Fonds versés"', () => {
    const r = repairStatus(
      facts({ demandeStatus: null, commande: { status: 'PAID', step: 'RELEASED' } }),
      'REPAIRER',
    );
    expect(r.currentIndex).toBe(3);
    expect(r.label).toBe('Fonds versés');
  });
});

describe('repairStatus — overrides', () => {
  it('CANCELLED demande is exit "Annulée" even with a REFUNDED commande', () => {
    const r = repairStatus(
      facts({ demandeStatus: 'CANCELLED', commande: { status: 'REFUNDED', step: null } }),
      'CLIENT',
    );
    expect(r.exit).toBe('Annulée');
    expect(r.currentIndex).toBe(-1);
  });

  it('a REFUNDED commande alone is exit "Remboursée"', () => {
    const r = repairStatus(
      facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'REFUNDED', step: 'REPAIR_STARTED' } }),
      'CLIENT',
    );
    expect(r.exit).toBe('Remboursée');
    expect(r.currentIndex).toBe(-1);
  });

  // CF4-D, task 1. `partialRefund` only changes the REFUNDED exit's wording - it is
  // read straight off `commande.partialRefund`, optional so an old API response
  // (no field at all) still reads as a full refund.
  it.each(['CLIENT', 'REPAIRER'] as RepairViewer[])(
    'a REFUNDED commande with partialRefund true is exit "Remboursée partiellement" — %s',
    (viewer) => {
      const r = repairStatus(
        facts({
          demandeStatus: 'IN_PROGRESS',
          commande: { status: 'REFUNDED', step: 'REPAIR_STARTED', partialRefund: true },
        }),
        viewer,
      );
      expect(r.label).toBe('Remboursée partiellement');
      expect(r.exit).toBe('Remboursée partiellement');
    },
  );

  it.each([false, undefined] as (boolean | undefined)[])(
    'a REFUNDED commande with partialRefund %s stays exit "Remboursée"',
    (partialRefund) => {
      const r = repairStatus(
        facts({
          demandeStatus: 'IN_PROGRESS',
          commande: { status: 'REFUNDED', step: 'REPAIR_STARTED', partialRefund },
        }),
        'CLIENT',
      );
      expect(r.label).toBe('Remboursée');
      expect(r.exit).toBe('Remboursée');
    },
  );

  it('disputeOpen on REPAIR_STARTED is "Litige en cours", tone danger, disputed true, index kept — client', () => {
    const r = repairStatus(
      facts({
        demandeStatus: 'IN_PROGRESS',
        commande: { status: 'PAID', step: 'REPAIR_STARTED', disputeOpen: true },
      }),
      'CLIENT',
    );
    expect(r.label).toBe('Litige en cours');
    expect(r.tone).toBe('danger');
    expect(r.disputed).toBe(true);
    expect(r.currentIndex).toBe(4);
  });

  it('disputeOpen on REPAIR_STARTED is "Litige en cours", index kept — réparateur', () => {
    const r = repairStatus(
      facts({
        demandeStatus: null,
        commande: { status: 'PAID', step: 'REPAIR_STARTED', disputeOpen: true },
      }),
      'REPAIRER',
    );
    expect(r.label).toBe('Litige en cours');
    expect(r.tone).toBe('danger');
    expect(r.disputed).toBe(true);
    expect(r.currentIndex).toBe(1);
  });

  it('missing disputeOpen reads as not disputed', () => {
    const r = repairStatus(
      facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'PAID', step: 'REPAIR_STARTED' } }),
      'CLIENT',
    );
    expect(r.disputed).toBe(false);
  });
});

describe('repairStatus — tones', () => {
  it('client stages 0-2 are neutral', () => {
    expect(repairStatus(facts({ demandeStatus: 'OPEN', offerCount: 0 }), 'CLIENT').tone).toBe('neutral');
    expect(repairStatus(facts({ demandeStatus: 'OPEN', offerCount: 1 }), 'CLIENT').tone).toBe('neutral');
    expect(
      repairStatus(
        facts({ demandeStatus: 'OPEN', commande: { status: 'PENDING_PAYMENT', step: null } }),
        'CLIENT',
      ).tone,
    ).toBe('neutral');
  });

  it('client stages 3-5 are amber', () => {
    expect(
      repairStatus(facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'PAID', step: 'PAID' } }), 'CLIENT')
        .tone,
    ).toBe('amber');
    expect(
      repairStatus(
        facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'PAID', step: 'REPAIR_STARTED' } }),
        'CLIENT',
      ).tone,
    ).toBe('amber');
    expect(
      repairStatus(
        facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'PAID', step: 'AWAITING_VALIDATION' } }),
        'CLIENT',
      ).tone,
    ).toBe('amber');
  });

  it('client stage 7 is verified', () => {
    expect(repairStatus(facts({ demandeStatus: 'DONE' }), 'CLIENT').tone).toBe('verified');
  });

  it('réparateur stages 0-2 are amber', () => {
    expect(
      repairStatus(facts({ demandeStatus: null, commande: { status: 'PAID', step: 'PAID' } }), 'REPAIRER').tone,
    ).toBe('amber');
    expect(
      repairStatus(
        facts({ demandeStatus: null, commande: { status: 'PAID', step: 'REPAIR_STARTED' } }),
        'REPAIRER',
      ).tone,
    ).toBe('amber');
    expect(
      repairStatus(
        facts({ demandeStatus: null, commande: { status: 'PAID', step: 'AWAITING_VALIDATION' } }),
        'REPAIRER',
      ).tone,
    ).toBe('amber');
  });

  it('réparateur stage 3 is verified', () => {
    expect(
      repairStatus(facts({ demandeStatus: null, commande: { status: 'PAID', step: 'RELEASED' } }), 'REPAIRER').tone,
    ).toBe('verified');
  });

  it('exits are neutral', () => {
    expect(repairStatus(facts({ demandeStatus: 'CANCELLED' }), 'CLIENT').tone).toBe('neutral');
    expect(
      repairStatus(facts({ demandeStatus: 'IN_PROGRESS', commande: { status: 'REFUNDED', step: null } }), 'CLIENT')
        .tone,
    ).toBe('neutral');
  });

  it('a dispute is danger', () => {
    expect(
      repairStatus(
        facts({
          demandeStatus: 'IN_PROGRESS',
          commande: { status: 'PAID', step: 'REPAIR_STARTED', disputeOpen: true },
        }),
        'CLIENT',
      ).tone,
    ).toBe('danger');
  });
});

describe('offersStillMatter', () => {
  it('is true only at client index 0 or 1', () => {
    expect(offersStillMatter(repairStatus(facts({ demandeStatus: 'OPEN', offerCount: 0 }), 'CLIENT'))).toBe(
      true,
    );
    expect(offersStillMatter(repairStatus(facts({ demandeStatus: 'OPEN', offerCount: 1 }), 'CLIENT'))).toBe(
      true,
    );
    expect(
      offersStillMatter(
        repairStatus(
          facts({ demandeStatus: 'OPEN', commande: { status: 'PENDING_PAYMENT', step: null } }),
          'CLIENT',
        ),
      ),
    ).toBe(false);
  });

  it('is false for an exit even at what would be index 0/1', () => {
    expect(offersStillMatter(repairStatus(facts({ demandeStatus: 'CANCELLED' }), 'CLIENT'))).toBe(false);
  });

  it('is false while disputed', () => {
    const r = repairStatus(
      facts({
        demandeStatus: 'OPEN',
        offerCount: 1,
        commande: { status: 'PAID', step: 'REPAIR_STARTED', disputeOpen: true },
      }),
      'CLIENT',
    );
    expect(offersStillMatter(r)).toBe(false);
  });
});

describe('repairStatus — exhaustive', () => {
  const demandeStatuses: (DemandeStatus | null)[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED', null];
  const commandeStatuses: CommandeStatus[] = ['PENDING_PAYMENT', 'PAID', 'ABANDONED', 'REFUNDED'];
  const steps: (CommandeStep | null)[] = [
    null,
    'PAID',
    'PARCEL_SENT',
    'PARCEL_RECEIVED',
    'REPAIR_STARTED',
    'REPAIR_DONE',
    'RETURN_SENT',
    'RETURN_RECEIVED',
    'AWAITING_VALIDATION',
    'RELEASED',
  ];
  const offerCounts = [0, 1, 2];
  const viewers: RepairViewer[] = ['CLIENT', 'REPAIRER'];

  it('every combination yields a non-empty label, a valid tone, and a consistent index', () => {
    for (const viewer of viewers) {
      for (const demandeStatus of demandeStatuses) {
        for (const offerCount of offerCounts) {
          const commandeCases: (RepairFacts['commande'])[] = [null];
          for (const status of commandeStatuses) {
            for (const step of steps) {
              commandeCases.push({ status, step });
              commandeCases.push({ status, step, disputeOpen: true });
              commandeCases.push({ status, step, disputeOpen: false });
            }
          }
          for (const commande of commandeCases) {
            const r: RepairStatus = repairStatus({ demandeStatus, offerCount, commande }, viewer);
            expect(r.label.length).toBeGreaterThan(0);
            expect(['verified', 'neutral', 'amber', 'danger']).toContain(r.tone);
            if (r.exit !== null) {
              expect(r.currentIndex).toBe(-1);
            } else {
              expect(r.currentIndex).toBeGreaterThanOrEqual(0);
              expect(r.currentIndex).toBeLessThan(r.stages.length);
            }
          }
        }
      }
    }
  });
});

describe('timelineLabel', () => {
  it.each([
    ['PAID', 'CLIENT', 'Paiement effectué'],
    ['PAID', 'REPAIRER', 'Paiement effectué'],
    ['PARCEL_SENT', 'CLIENT', 'Colis envoyé'],
    ['PARCEL_SENT', 'REPAIRER', 'Colis envoyé'],
    ['PARCEL_RECEIVED', 'CLIENT', 'Colis reçu par le réparateur'],
    ['PARCEL_RECEIVED', 'REPAIRER', 'Colis reçu par le réparateur'],
    ['REPAIR_STARTED', 'CLIENT', 'Réparation en cours'],
    ['REPAIR_STARTED', 'REPAIRER', 'Réparation en cours'],
    ['REPAIR_DONE', 'CLIENT', 'Réparation terminée'],
    ['REPAIR_DONE', 'REPAIRER', 'Réparation terminée'],
    ['RETURN_SENT', 'CLIENT', 'Colis retour envoyé'],
    ['RETURN_SENT', 'REPAIRER', 'Colis retour envoyé'],
    ['RETURN_RECEIVED', 'CLIENT', 'Colis retour reçu'],
    ['RETURN_RECEIVED', 'REPAIRER', 'Colis retour reçu'],
    ['AWAITING_VALIDATION', 'CLIENT', 'En attente de votre validation'],
    ['AWAITING_VALIDATION', 'REPAIRER', 'En attente de la validation du client'],
    ['RELEASED', 'CLIENT', 'Fonds versés au réparateur'],
    ['RELEASED', 'REPAIRER', 'Fonds versés'],
  ] as const)('%s for %s is %s', (step, viewer, label) => {
    expect(timelineLabel(step, viewer)).toBe(label);
  });
});

describe('orderNumberFor', () => {
  it('is "#CMD-" plus the first 8 characters, upper-cased', () => {
    expect(orderNumberFor('d6a31660-aaaa-4444-8888-000000000000')).toBe('#CMD-D6A31660');
  });
});
