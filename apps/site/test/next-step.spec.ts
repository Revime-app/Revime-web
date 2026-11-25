import { describe, expect, it } from 'vitest';
import { nextStep } from '../lib/client/next-step';

const base = { status: 'OPEN', offerCount: 0, commande: null, quoteRequest: null } as const;
const cmd = (status: string, step: string | null) => ({ status, step, commandeId: 'c', delivery: 'DROP_OFF', disputeOpen: false }) as never;

describe('qui doit agir', () => {
  it('waiting for offers: the réparateurs act', () => {
    expect(nextStep(base)?.who).toBe('them');
  });
  it('offers received: the client chooses', () => {
    expect(nextStep({ ...base, offerCount: 3 })).toMatchObject({ who: 'you', text: 'choisissez une des 3 offres.' });
  });
  it('to pay, then repairing, then to validate', () => {
    expect(nextStep({ ...base, status: 'IN_PROGRESS', commande: cmd('PENDING_PAYMENT', null) })?.who).toBe('you');
    expect(nextStep({ ...base, status: 'IN_PROGRESS', commande: cmd('PAID', 'REPAIR_STARTED') })?.who).toBe('them');
    expect(nextStep({ ...base, status: 'IN_PROGRESS', commande: cmd('PAID', 'AWAITING_VALIDATION') })?.who).toBe('you');
  });
  it('cancelled demandes say nothing', () => {
    expect(nextStep({ ...base, status: 'CANCELLED' })).toBeNull();
  });
});
