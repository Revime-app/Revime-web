import { describe, expect, it } from 'vitest';
import { deriveDisputeTimeline, euros, notificationCopy, repairStatus, type CommandeDto, type RepairFacts } from '../src/index.js';

/**
 * V8 B2, `Q8-08` (owner: « Yes, change it », 2026-11-17). When the client validates and Revime HOLDS
 * the réparateur's payout (he has not finished « Virements » or his fiscal information), the order
 * is RELEASED with no transfer. « Fonds versés au réparateur » is then false. The client asked that
 * the order « passe en « Terminée » »; the réparateur reads that his payment is waiting.
 *
 * The fact is `hasStripeTransfer`, the same raw field `CommandeDto` and `CommandeListItem` carry, and
 * only `=== false` means held: an older API sends nothing, and that must read as before.
 */
const released = (hasStripeTransfer?: boolean): RepairFacts => ({
  demandeStatus: 'IN_PROGRESS',
  offerCount: 1,
  commande: { status: 'PAID', step: 'RELEASED', disputeOpen: false, hasStripeTransfer },
});

describe('repairStatus on a held payout (Q8-08)', () => {
  it('the client reads « Terminée », as the last stage of his ladder too', () => {
    const s = repairStatus(released(false), 'CLIENT');
    expect(s.label).toBe('Terminée');
    expect(s.currentIndex).toBe(7);
    expect(s.stages[7]).toBe('Terminée');
    expect(s.tone).toBe('verified');
  });

  it('the réparateur reads « Paiement en attente »', () => {
    const s = repairStatus(released(false), 'REPAIRER');
    expect(s.label).toBe('Paiement en attente');
    expect(s.stages[3]).toBe('Paiement en attente');
    expect(s.tone).toBe('amber');
  });

  it('is unchanged once the transfer left, and against an API that sends no field', () => {
    for (const facts of [released(true), released(undefined)]) {
      expect(repairStatus(facts, 'CLIENT').label).toBe('Fonds versés au réparateur');
      expect(repairStatus(facts, 'CLIENT').stages[7]).toBe('Fonds versés au réparateur');
      expect(repairStatus(facts, 'REPAIRER').label).toBe('Fonds versés');
    }
  });

  it('a demande the API reports DONE reads the same, when its commande says held', () => {
    expect(repairStatus({ ...released(false), demandeStatus: 'DONE' }, 'CLIENT').label).toBe('Terminée');
  });
});

describe('the order page timeline on a held payout (Q8-08)', () => {
  const order = (viewerRole: 'CLIENT' | 'REPAIRER', hasStripeTransfer: boolean): CommandeDto =>
    ({
      id: 'c1',
      delivery: 'HAND_DELIVERY',
      status: 'PAID',
      step: 'RELEASED',
      viewerRole,
      disputeOpen: false,
      hasStripeTransfer,
      stepEvents: [],
    }) as unknown as CommandeDto;
  const releasedLabel = (data: CommandeDto) =>
    deriveDisputeTimeline(data).mainSteps.find((s) => s.key === 'RELEASED')?.label;

  it('names the last step « Terminée » for the client and « Paiement en attente » for the réparateur', () => {
    expect(releasedLabel(order('CLIENT', false))).toBe('Terminée');
    expect(releasedLabel(order('REPAIRER', false))).toBe('Paiement en attente');
  });

  it('keeps « Fonds versés » once the money left', () => {
    expect(releasedLabel(order('CLIENT', true))).toBe('Fonds versés au réparateur');
    expect(releasedLabel(order('REPAIRER', true))).toBe('Fonds versés');
  });
});

describe("the client's FUNDS_RELEASED notification (Q8-08)", () => {
  it('says the funds were released FOR his réparateur, true whether or not Revime is holding them', () => {
    expect(notificationCopy({ type: 'FUNDS_RELEASED', mode: 'CLIENT', amountCents: 7500, subject: null })).toEqual({
      title: 'Fonds débloqués',
      sub: `${euros(7500)} débloqués pour votre réparateur`,
    });
    expect(notificationCopy({ type: 'FUNDS_RELEASED', mode: 'CLIENT', amountCents: null, subject: null }).sub).toBe(
      'Les fonds ont été débloqués pour votre réparateur',
    );
  });
});
