import { describe, expect, it } from 'vitest';
import { notificationCopy, type NotificationCopyInput } from '@revime/shared';

/**
 * Exercised OUTSIDE React over every state, per `apps/mobile/AGENTS.md`: two of the four
 * prototype-copy defects found on 2026-08-20 were caught only this way, and one was a
 * count-interpolated string that was both ungrammatical and false. Every case below asserts
 * a full sentence, because a null column must degrade the wording rather than print « undefined ».
 */
const base: NotificationCopyInput = {
  mode: 'CLIENT',
  type: 'OFFER_RECEIVED',
  actorName: 'FixLab',
  subject: 'Écran iPhone 13 fissuré',
  amountCents: 6500,
  step: null,
  messagePreview: null,
};

const copy = (over: Partial<NotificationCopyInput> = {}) => notificationCopy({ ...base, ...over });

describe('notificationCopy - OFFER_RECEIVED', () => {
  it('is the prototype\'s own line', () => {
    expect(copy()).toEqual({
      title: 'Nouvelle offre reçue',
      sub: 'FixLab a proposé 65 € pour « Écran iPhone 13 fissuré »',
    });
  });

  it('names a réparateur generically when the snapshot has no name', () => {
    expect(copy({ actorName: null }).sub).toBe(
      'Un réparateur a proposé 65 € pour « Écran iPhone 13 fissuré »',
    );
  });

  it('treats a whitespace-only name as absent', () => {
    expect(copy({ actorName: '   ' }).sub).toBe(
      'Un réparateur a proposé 65 € pour « Écran iPhone 13 fissuré »',
    );
  });

  it('says « une offre » rather than interpolating a null price', () => {
    expect(copy({ amountCents: null }).sub).toBe(
      'FixLab a proposé une offre pour « Écran iPhone 13 fissuré »',
    );
  });

  it('drops the subject clause entirely when there is no subject', () => {
    expect(copy({ subject: null }).sub).toBe('FixLab a proposé 65 €');
  });

  it('still reads as a sentence with every optional column absent', () => {
    expect(copy({ actorName: null, subject: null, amountCents: null }).sub).toBe(
      'Un réparateur a proposé une offre',
    );
  });
});

describe('notificationCopy - the offer outcomes', () => {
  it('tells the réparateur who accepted and for how much', () => {
    expect(copy({ mode: 'REPAIRER', type: 'OFFER_ACCEPTED', actorName: 'Léa M.' })).toEqual({
      title: 'Offre acceptée',
      sub: 'Léa M. a accepté votre offre de 65 €',
    });
  });

  it('restructures rather than printing a null amount', () => {
    expect(copy({ mode: 'REPAIRER', type: 'OFFER_ACCEPTED', amountCents: null }).sub).toBe(
      'FixLab a accepté votre offre',
    );
  });

  it('names NO actor on a decline, because being outbid is not about a person', () => {
    expect(copy({ mode: 'REPAIRER', type: 'OFFER_DECLINED' })).toEqual({
      title: 'Offre non retenue',
      sub: 'Le client a choisi une autre offre pour « Écran iPhone 13 fissuré »',
    });
  });

  it('drops the subject clause on a decline with no subject', () => {
    expect(copy({ mode: 'REPAIRER', type: 'OFFER_DECLINED', subject: null }).sub).toBe(
      'Le client a choisi une autre offre',
    );
  });
});

describe('notificationCopy - MESSAGE_RECEIVED', () => {
  it('is the prototype\'s own line, preview and all', () => {
    expect(
      copy({
        type: 'MESSAGE_RECEIVED',
        actorName: 'Sophie',
        messagePreview: 'Parfait, je peux passer demain matin.',
      }),
    ).toEqual({ title: 'Message de Sophie', sub: 'Parfait, je peux passer demain matin.' });
  });

  it('falls back when moderation has soft-deleted the message', () => {
    expect(copy({ type: 'MESSAGE_RECEIVED', actorName: 'Sophie', messagePreview: null }).sub).toBe(
      'Nouveau message',
    );
  });

  it('never leaves the title dangling without a name', () => {
    expect(copy({ type: 'MESSAGE_RECEIVED', actorName: null }).title).toBe(
      'Message de votre correspondant',
    );
  });
});

describe('notificationCopy - FUNDS_RELEASED and COMMANDE_REFUNDED', () => {
  // V8 `Q8-08` (amended 2026-11-17, owner's « Yes, change it »): was the prototype's « 75 € versés à
  // votre réparateur », false while Revime holds the réparateur's payout; « débloqués pour » is
  // true whether the transfer left at once or later.
  it('tells the client the funds were released for his réparateur', () => {
    expect(copy({ type: 'FUNDS_RELEASED', amountCents: 7500 })).toEqual({
      title: 'Fonds débloqués',
      sub: '75 € débloqués pour votre réparateur',
    });
  });

  it('NEVER tells a réparateur about « votre réparateur »', () => {
    const r = copy({ mode: 'REPAIRER', type: 'FUNDS_RELEASED', amountCents: 7500 });
    expect(r).toEqual({ title: 'Paiement reçu', sub: '75 € versés sur votre compte' });
    expect(r.sub).not.toContain('votre réparateur');
  });

  it('phrases a refund per mode', () => {
    expect(copy({ type: 'COMMANDE_REFUNDED', amountCents: 7500 }).sub).toBe(
      '75 € remboursés pour « Écran iPhone 13 fissuré »',
    );
    expect(copy({ mode: 'REPAIRER', type: 'COMMANDE_REFUNDED' })).toEqual({
      title: 'Commande remboursée',
      sub: '« Écran iPhone 13 fissuré » a été remboursée',
    });
  });
});

describe('notificationCopy - PAYMENT_ABANDONED', () => {
  // CF-43. The client asked for « paiement refusé ». No such event can exist - the gateway
  // takes cards only, cards are synchronous, and a declined card never leaves Stripe
  // Checkout - so the nearest TRUE signal is a checkout session that expired with the
  // commande still unpaid. The wording is therefore his own from CF-40 and not his « refusé »,
  // which would assert a decline we never observed.
  it('states only what was observed, never a refusal', () => {
    const c = copy({ type: 'PAYMENT_ABANDONED', amountCents: null });
    expect(c).toEqual({
      title: 'Paiement non finalisé',
      sub: "Votre paiement pour « Écran iPhone 13 fissuré » n'a pas abouti",
    });
    expect(c.title).not.toContain('refusé');
    expect(c.sub).not.toContain('refusé');
  });

  it('drops the subject clause rather than interpolating a null', () => {
    expect(copy({ type: 'PAYMENT_ABANDONED', subject: null, amountCents: null }).sub).toBe(
      "Votre paiement n'a pas abouti",
    );
  });

  // No past participle agreeing with the subject: a demande title has arbitrary gender
  // (« Écran » masculine, « Batterie » feminine) and the copy cannot know it.
  it('reads correctly whatever the subject\'s gender', () => {
    expect(copy({ type: 'PAYMENT_ABANDONED', subject: 'Batterie gonflée', amountCents: null }).sub).toBe(
      "Votre paiement pour « Batterie gonflée » n'a pas abouti",
    );
  });
});

describe('notificationCopy - COMMANDE_STEP', () => {
  const step = (s: NotificationCopyInput['step'], over: Partial<NotificationCopyInput> = {}) =>
    copy({ type: 'COMMANDE_STEP', step: s, actorName: 'Karim R.', ...over });

  it('is the prototype\'s third row', () => {
    expect(step('REPAIR_STARTED')).toEqual({
      title: 'Réparation en cours',
      sub: 'Karim R. a démarré la réparation',
    });
  });

  it('covers all seven emitted steps', () => {
    expect(step('PARCEL_SENT').sub).toBe("Karim R. a expédié l'objet");
    expect(step('PARCEL_RECEIVED').sub).toBe('Karim R. a reçu votre objet');
    expect(step('REPAIR_DONE').sub).toBe('Karim R. a terminé la réparation');
    expect(step('RETURN_SENT').sub).toBe("Karim R. vous a renvoyé l'objet");
    expect(step('RETURN_RECEIVED').sub).toBe('Karim R. a confirmé la réception');
    expect(step('AWAITING_VALIDATION')).toEqual({
      title: 'Validation attendue',
      sub: 'Confirmez la réparation pour débloquer les fonds',
    });
  });

  it('falls back to the CLAIMANT\'s role when the name is absent, not to a generic person', () => {
    // STEP_CLAIMANT.REPAIR_STARTED is REPAIRER, so the actor is the réparateur.
    expect(step('REPAIR_STARTED', { actorName: null }).sub).toBe(
      'Le réparateur a démarré la réparation',
    );
    // STEP_CLAIMANT.PARCEL_SENT is CLIENT.
    expect(step('PARCEL_SENT', { actorName: null }).sub).toBe("Le client a expédié l'objet");
  });

  // CF-43. « paiement effectué » is one of the six events the client named, and it was the
  // only one of them with no notification at all: at payment the webhook told the winning
  // réparateur and every loser, and never the person who had just paid.
  it('tells the client his payment cleared', () => {
    expect(step('PAID')).toEqual({
      title: 'Paiement effectué',
      sub: 'La réparation peut maintenant commencer',
    });
  });

  it('interpolates NO actor into the paid row, because PAID has no claimant', () => {
    // 🛑 STEP_CLAIMANT.PAID is null, and stepCopy's `claimant === 'CLIENT'` test sends null
    // to the réparateur branch - so an entry that used `who` would read « Le réparateur ... »
    // to the client, wrongly and silently. Pinned so a later edit cannot reintroduce it.
    expect(step('PAID', { actorName: null }).sub).toBe('La réparation peut maintenant commencer');
    expect(step('PAID', { actorName: 'Karim R.' }).sub).not.toContain('Karim');
  });

  it('degrades safely for the step that must never be emitted, and for null', () => {
    // RELEASED has a null claimant and is covered by FUNDS_RELEASED. Reaching here means a
    // bug upstream; it must not print « undefined ».
    //
    // 🛑 PAID was in this list until CF-43 and deliberately is not any more. It is a real
    // client-facing row now, so leaving it here would assert the fallback as correct and
    // turn the feature into a silent regression the moment someone trusted this test.
    for (const s of ['RELEASED', null] as const) {
      expect(step(s)).toEqual({
        title: 'Suivi de la réparation',
        sub: 'La réparation a avancé',
      });
    }
  });
});

describe('notificationCopy - Livraison Boxtal (six parcel types)', () => {
  it('PARCEL_LABEL_READY tells the sender what to do next', () => {
    expect(copy({ type: 'PARCEL_LABEL_READY', actorName: null, amountCents: null, step: 'PARCEL_SENT' })).toEqual({
      title: 'Votre étiquette est prête',
      sub: 'Téléchargez-la depuis votre commande et déposez le colis',
    });
  });

  it('names the leg from the step marker: PARCEL_SENT is the outbound leg, RETURN_SENT the return', () => {
    expect(copy({ type: 'PARCEL_SHIPPED', actorName: null, amountCents: null, step: 'PARCEL_SENT' })).toEqual({
      title: 'Colis pris en charge par le transporteur',
      sub: 'Aller · « Écran iPhone 13 fissuré »',
    });
    expect(copy({ type: 'PARCEL_DELIVERED', actorName: null, amountCents: null, step: 'RETURN_SENT' })).toEqual({
      title: 'Colis livré',
      sub: 'Retour · « Écran iPhone 13 fissuré »',
    });
  });

  it('degrades without a subject rather than printing « undefined »', () => {
    expect(copy({ type: 'PARCEL_OUT_FOR_DELIVERY', subject: null, actorName: null, amountCents: null, step: 'PARCEL_SENT' })).toEqual({
      title: 'Colis en cours de livraison',
      sub: 'Aller',
    });
  });

  it('the two remaining titles', () => {
    expect(copy({ type: 'PARCEL_AT_PICKUP_POINT', actorName: null, amountCents: null, step: 'RETURN_SENT' }).title).toBe('Colis disponible en point relais');
    expect(copy({ type: 'PARCEL_INCIDENT', actorName: null, amountCents: null, step: 'PARCEL_SENT' }).title).toBe('Incident de livraison');
  });
});
