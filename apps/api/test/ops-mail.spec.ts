import { afterEach, describe, expect, it } from 'vitest';
import { euros } from '@revime/shared';
import { __setMailSender, type Mail } from '../src/mail/mail.service.js';
import {
  buildParcelOpsMail,
  sendParcelOpsMail,
  sendShippingOpsMail,
  buildRefundShareOpsMail,
  sendRefundShareOpsMail,
} from '../src/commandes/ops-mail.js';

const party = {
  name: 'Alice Martin', line1: '12 rue de la Paix', line2: null,
  postalCode: '75002', city: 'Paris', phone: '+33612345678',
};
const input = {
  commandeId: 'cmd-1', demandeTitle: 'Écran cassé', client: party, repairer: party,
};

describe('sendParcelOpsMail', () => {
  afterEach(() => {
    __setMailSender(undefined);
    delete process.env.OPS_EMAIL;
  });

  it('does not throw when the sender throws, because the address is already saved', async () => {
    process.env.OPS_EMAIL = 'ops@revime.test';
    __setMailSender({
      send: async () => {
        throw new Error('resend is down');
      },
    });
    // The assertion IS that this resolves. Without the try/catch it rejects, the
    // request 500s on a write that succeeded, and the retry skips the notification
    // for ever because both address rows now exist.
    await expect(sendParcelOpsMail(input)).resolves.toBeUndefined();
  });

  it('returns null from the builder when OPS_EMAIL is unset', () => {
    expect(buildParcelOpsMail(input)).toBeNull();
  });

  it('addresses the mail to OPS_EMAIL and names the demande in the subject', () => {
    process.env.OPS_EMAIL = 'ops@revime.test';
    const mail = buildParcelOpsMail(input);
    expect(mail?.to).toBe('ops@revime.test');
    expect(mail?.subject).toContain('Colis à préparer');
    expect(mail?.subject).toContain('Écran cassé');
  });
});

describe('sendShippingOpsMail (Livraison Boxtal)', () => {
  afterEach(() => {
    __setMailSender(undefined);
    delete process.env.OPS_EMAIL;
  });

  it('names the failure kind in the subject and the admin path in the body, never throws', async () => {
    process.env.OPS_EMAIL = 'ops@revime.test';
    const sent: Mail[] = [];
    __setMailSender({ send: async (m) => { sent.push(m); } });
    await sendShippingOpsMail({ kind: 'ORDER_REFUSED', commandeId: 'cmd-1', demandeTitle: 'Écran cassé', leg: 'OUTBOUND', detail: 'InvalidPaymentException: prélèvement non actif ou plafond atteint' });
    expect(sent[0]?.subject).toBe('Étiquette Boxtal refusée - Écran cassé');
    expect(sent[0]?.text).toContain('/colis');
    expect(sent[0]?.text).toContain('aller');
    __setMailSender({ send: async () => { throw new Error('down'); } });
    await expect(sendShippingOpsMail({ kind: 'CARRIER_EXCEPTION', commandeId: 'cmd-1', demandeTitle: 't', leg: 'RETURN', detail: 'x' })).resolves.toBeUndefined();
  });

  it('has a subject and an action for every kind, including the insurance defect the sandbox probe surfaced', async () => {
    process.env.OPS_EMAIL = 'ops@revime.test';
    const sent: Mail[] = [];
    __setMailSender({ send: async (m) => { sent.push(m); } });
    for (const kind of ['ORDER_REFUSED', 'LABEL_STORE_FAILED', 'CANCEL_FAILED', 'CARRIER_EXCEPTION', 'INSURANCE_NOT_APPLIED'] as const) {
      await sendShippingOpsMail({ kind, commandeId: 'cmd-1', demandeTitle: 'Écran cassé', leg: 'RETURN', detail: 'd' });
    }
    expect(sent.map((m) => m.subject.split(' - ')[0])).toEqual([
      'Étiquette Boxtal refusée',
      'Étiquette Boxtal non enregistrée',
      'Annulation Boxtal échouée',
      'Incident transporteur',
      'Assurance Boxtal non appliquée',
    ]);
    for (const m of sent) expect(m.text).toContain('retour');
  });
});

// Task 3 (CF4-D). The refund-share ops mail: the operator must pay the réparateur's
// share by hand from the admin, since the refund path stops at reversing the client's
// money and never moves anything TO the réparateur.
describe('buildRefundShareOpsMail / sendRefundShareOpsMail', () => {
  afterEach(() => {
    __setMailSender(undefined);
    delete process.env.OPS_EMAIL;
  });

  const shareInput = {
    commandeId: 'cmd-1',
    demandeTitle: 'Écran cassé',
    shareCents: 4900,
    reason: 'Réparation partiellement réalisée',
  };

  it('returns null from the builder when OPS_EMAIL is unset', () => {
    expect(buildRefundShareOpsMail(shareInput)).toBeNull();
  });

  it('logs loudly and does not throw when OPS_EMAIL is unset', async () => {
    await expect(sendRefundShareOpsMail(shareInput)).resolves.toBeUndefined();
  });

  it('addresses OPS_EMAIL with the subject naming the demande, and a body naming the commande, the amount, the reason, and the admin action', () => {
    process.env.OPS_EMAIL = 'ops@revime.test';
    const mail = buildRefundShareOpsMail(shareInput);
    expect(mail?.to).toBe('ops@revime.test');
    expect(mail?.subject).toBe('Part du réparateur à verser - Écran cassé');
    expect(mail?.text).toContain('cmd-1');
    expect(mail?.text).toContain(euros(4900));
    expect(mail?.text).toContain('Réparation partiellement réalisée');
    expect(mail?.text).toContain("Verser la part depuis la page Remboursement de l'admin.");
  });

  it('never throws when the sender rejects', async () => {
    process.env.OPS_EMAIL = 'ops@revime.test';
    __setMailSender({
      send: async () => {
        throw new Error('resend is down');
      },
    });
    await expect(sendRefundShareOpsMail(shareInput)).resolves.toBeUndefined();
  });

  it('sends the built mail through the mail sender', async () => {
    process.env.OPS_EMAIL = 'ops@revime.test';
    const sent: Mail[] = [];
    __setMailSender({ send: async (m) => { sent.push(m); } });
    await sendRefundShareOpsMail(shareInput);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe('Part du réparateur à verser - Écran cassé');
  });
});
