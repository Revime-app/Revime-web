import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_GROUP_BY_TYPE,
  euros,
  notificationCopy,
  notificationTypeSchema,
  soundKeyFor,
} from '../src/index.js';

/**
 * V8 B2. When the client validates and the réparateur cannot be paid yet (no « Virements » set up,
 * or his fiscal information missing), Revime keeps the money and tells HIM, in the client's words:
 * « Votre paiement de X € vous attend : terminez votre configuration pour le recevoir. »
 */
describe('V8 B2: the PAYOUT_WAITING notification', () => {
  it('is a notification type the API may send', () => {
    expect(notificationTypeSchema.parse('PAYOUT_WAITING')).toBe('PAYOUT_WAITING');
  });

  it("reads the client's sentence with the amount", () => {
    const copy = notificationCopy({ type: 'PAYOUT_WAITING', mode: 'REPAIRER', amountCents: 8900, subject: 'iPhone 13' });
    expect(copy.title).toBe('Paiement en attente');
    expect(copy.sub).toBe(`Votre paiement de ${euros(8900)} vous attend : terminez votre configuration pour le recevoir.`);
  });

  it('still makes sense without an amount', () => {
    const copy = notificationCopy({ type: 'PAYOUT_WAITING', mode: 'REPAIRER', amountCents: null, subject: null });
    expect(copy.sub).toBe('Votre paiement vous attend : terminez votre configuration pour le recevoir.');
  });

  it('belongs to the orders group, like the « paiement reçu » it stands in for', () => {
    expect(NOTIFICATION_GROUP_BY_TYPE.PAYOUT_WAITING).toBe(NOTIFICATION_GROUP_BY_TYPE.FUNDS_RELEASED);
  });

  it('has a push sound', () => {
    expect(soundKeyFor('PAYOUT_WAITING')).toBe(soundKeyFor('FUNDS_RELEASED'));
  });
});
