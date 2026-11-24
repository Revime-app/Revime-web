import { describe, expect, it } from 'vitest';
import {
  ATTENTION_REASON_LABEL,
  CANCELLATION_ALREADY_PENDING,
  CANCELLATION_DISPUTED,
  CANCELLATION_NOT_PENDING,
  CANCELLATION_PENDING,
  CANCELLATION_REASON_LABEL,
  CANCELLATION_RELEASED,
  CANCEL_PAYMENT_IN_FLIGHT,
  CANCEL_USE_DELETE,
  cancellationPolicy,
  cancellationReasonSchema,
  cancellationRequestStatusSchema,
  createCancellationRequestSchema,
  notificationCopy,
  NOTIFICATION_GROUP_BY_TYPE,
  refuseCancellationSchema,
  repairStatus,
  type CancellationRequestInfo,
} from '@revime/shared';

describe('cancellationReasonSchema', () => {
  it('accepts every spec reason', () => {
    for (const v of ['NO_LONGER_NEEDED', 'TOO_SLOW', 'REPAIRER_UNRESPONSIVE', 'OTHER_SOLUTION', 'OTHER']) {
      expect(cancellationReasonSchema.safeParse(v).success).toBe(true);
    }
  });

  it('refuses an unknown reason', () => {
    expect(cancellationReasonSchema.safeParse('MADE_UP').success).toBe(false);
  });
});

describe('cancellationRequestStatusSchema', () => {
  it('accepts every spec status', () => {
    for (const v of ['PENDING', 'APPROVED', 'REFUSED', 'WITHDRAWN', 'SUPERSEDED']) {
      expect(cancellationRequestStatusSchema.safeParse(v).success).toBe(true);
    }
  });
});

describe('CANCELLATION_REASON_LABEL', () => {
  it('matches the spec §3 labels exactly', () => {
    expect(CANCELLATION_REASON_LABEL).toEqual({
      NO_LONGER_NEEDED: "Je n'ai plus besoin de la réparation",
      TOO_SLOW: 'Délai trop long',
      REPAIRER_UNRESPONSIVE: 'Le réparateur ne répond pas',
      OTHER_SOLUTION: "J'ai trouvé une autre solution",
      OTHER: 'Autre',
    });
  });
});

describe('createCancellationRequestSchema', () => {
  it('accepts a non-OTHER reason with no comment', () => {
    const r = createCancellationRequestSchema.safeParse({ reason: 'TOO_SLOW' });
    expect(r.success).toBe(true);
  });

  it('refuses OTHER with no comment', () => {
    const r = createCancellationRequestSchema.safeParse({ reason: 'OTHER' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.join('.') === 'comment');
      expect(issue?.message).toBe('Précisez la raison.');
    }
  });

  it('refuses OTHER with a whitespace-only comment', () => {
    const r = createCancellationRequestSchema.safeParse({ reason: 'OTHER', comment: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.join('.') === 'comment');
      expect(issue?.message).toBe('Précisez la raison.');
    }
  });

  it('accepts OTHER with a real comment', () => {
    const r = createCancellationRequestSchema.safeParse({ reason: 'OTHER', comment: 'Changement de plan' });
    expect(r.success).toBe(true);
  });

  it('refuses a comment over 500 characters', () => {
    const r = createCancellationRequestSchema.safeParse({
      reason: 'TOO_SLOW',
      comment: 'a'.repeat(501),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.join('.') === 'comment');
      expect(issue?.message).toBe('Commentaire trop long.');
    }
  });
});

describe('refuseCancellationSchema', () => {
  it('refuses a blank note', () => {
    const r = refuseCancellationSchema.safeParse({ note: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Indiquez la raison du refus.');
    }
  });

  it('refuses a note over 300 characters', () => {
    const r = refuseCancellationSchema.safeParse({ note: 'a'.repeat(301) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Raison trop longue.');
    }
  });

  it('accepts a real note', () => {
    const r = refuseCancellationSchema.safeParse({ note: 'Réparation déjà commencée.' });
    expect(r.success).toBe(true);
  });
});

describe('cancellationPolicy', () => {
  const base = {
    status: 'PAID' as const,
    step: 'REPAIR_STARTED' as const,
    transferred: false,
    disputeOpen: false,
    paymentUnderReview: false,
    request: null as CancellationRequestInfo | null,
  };

  it('client may request when PAID, mid-repair, no request, no freeze', () => {
    const p = cancellationPolicy(base, 'CLIENT');
    expect(p.canRequest).toBe(true);
    expect(p.canWithdraw).toBe(false);
    expect(p.frozen).toBe(false);
  });

  it('client may not request once RELEASED', () => {
    const p = cancellationPolicy({ ...base, step: 'RELEASED' }, 'CLIENT');
    expect(p.canRequest).toBe(false);
  });

  it('client may not request once transferred', () => {
    const p = cancellationPolicy({ ...base, transferred: true }, 'CLIENT');
    expect(p.canRequest).toBe(false);
  });

  it('client may not request while a dispute is open', () => {
    const p = cancellationPolicy({ ...base, disputeOpen: true }, 'CLIENT');
    expect(p.canRequest).toBe(false);
  });

  it('client may not request while payment is under review', () => {
    const p = cancellationPolicy({ ...base, paymentUnderReview: true }, 'CLIENT');
    expect(p.canRequest).toBe(false);
  });

  it('client may not request once REFUNDED', () => {
    const p = cancellationPolicy({ ...base, status: 'REFUNDED' }, 'CLIENT');
    expect(p.canRequest).toBe(false);
  });

  it('a PENDING request freezes and allows withdraw, not another request, for the client', () => {
    const pending: CancellationRequestInfo = {
      id: 'r1',
      status: 'PENDING',
      reason: 'TOO_SLOW',
      comment: null,
      refusalNote: null,
      createdAt: new Date().toISOString(),
    };
    const p = cancellationPolicy({ ...base, request: pending }, 'CLIENT');
    expect(p.canWithdraw).toBe(true);
    expect(p.frozen).toBe(true);
    expect(p.canRequest).toBe(false);
  });

  it('the réparateur never gets canRequest/canWithdraw but sees frozen while PENDING', () => {
    const pending: CancellationRequestInfo = {
      id: 'r1',
      status: 'PENDING',
      reason: 'TOO_SLOW',
      comment: null,
      refusalNote: null,
      createdAt: new Date().toISOString(),
    };
    const p = cancellationPolicy({ ...base, request: pending }, 'REPAIRER');
    expect(p.canRequest).toBe(false);
    expect(p.canWithdraw).toBe(false);
    expect(p.frozen).toBe(true);
  });

  it('a latest REFUSED request allows a new request and shows the refusal', () => {
    const refused: CancellationRequestInfo = {
      id: 'r1',
      status: 'REFUSED',
      reason: 'TOO_SLOW',
      comment: null,
      refusalNote: 'Réparation déjà avancée.',
      createdAt: new Date().toISOString(),
    };
    const p = cancellationPolicy({ ...base, request: refused }, 'CLIENT');
    expect(p.canRequest).toBe(true);
    expect(p.showRefused).toBe(true);
  });
});

describe('repairStatus with cancellationPending', () => {
  const facts = {
    demandeStatus: null,
    offerCount: 0,
    commande: {
      status: 'PAID' as const,
      step: 'REPAIR_STARTED' as const,
      disputeOpen: false,
    },
  };

  it('shows the cancellation label, amber tone and the flag, index kept', () => {
    const withoutFlag = repairStatus(facts, 'CLIENT');
    const withFlag = repairStatus({ ...facts, commande: { ...facts.commande, cancellationPending: true } }, 'CLIENT');
    expect(withFlag.label).toBe('Annulation demandée');
    expect(withFlag.tone).toBe('amber');
    expect((withFlag as unknown as { cancellationPending: boolean }).cancellationPending).toBe(true);
    expect(withFlag.currentIndex).toBe(withoutFlag.currentIndex);
  });

  it('behaves exactly as today when the flag is absent (old API)', () => {
    const s = repairStatus(facts, 'CLIENT');
    expect((s as unknown as { cancellationPending?: boolean }).cancellationPending).toBeFalsy();
    expect(s.label).not.toBe('Annulation demandée');
  });

  it('REFUNDED still wins over a pending flag', () => {
    const refundedFacts = {
      ...facts,
      commande: { status: 'REFUNDED' as const, step: null, disputeOpen: false, cancellationPending: true },
    };
    const s = repairStatus(refundedFacts, 'CLIENT');
    expect(s.exit).toBe('Remboursée');
  });

  it('CANCELLED demande still wins over a pending flag', () => {
    const cancelledFacts = {
      demandeStatus: 'CANCELLED' as const,
      offerCount: 0,
      commande: { status: 'PAID' as const, step: 'REPAIR_STARTED' as const, disputeOpen: false, cancellationPending: true },
    };
    const s = repairStatus(cancelledFacts, 'CLIENT');
    expect(s.exit).toBe('Annulée');
  });
});

describe('notificationCopy for the three cancellation types', () => {
  it('CANCELLATION_REQUESTED to the réparateur carries the reason label as actorName', () => {
    const c = notificationCopy({
      mode: 'REPAIRER',
      type: 'CANCELLATION_REQUESTED',
      actorName: 'Délai trop long',
      subject: 'Réparation écran',
      amountCents: null,
      step: null,
      messagePreview: null,
    });
    expect(c.title).toBe('Annulation demandée');
    expect(c.sub).toContain('Délai trop long');
    expect(c.sub).toContain('Réparation écran');
  });

  it('CANCELLATION_WITHDRAWN to the réparateur', () => {
    const c = notificationCopy({
      mode: 'REPAIRER',
      type: 'CANCELLATION_WITHDRAWN',
      actorName: null,
      subject: 'Réparation écran',
      amountCents: null,
      step: null,
      messagePreview: null,
    });
    expect(c.title).toBe('Annulation retirée');
    expect(c.sub).toContain('Réparation écran');
  });

  it('CANCELLATION_REFUSED to the client', () => {
    const c = notificationCopy({
      mode: 'CLIENT',
      type: 'CANCELLATION_REFUSED',
      actorName: null,
      subject: 'Réparation écran',
      amountCents: null,
      step: null,
      messagePreview: null,
    });
    expect(c.title).toBe('Annulation refusée');
    expect(c.sub).toContain('Réparation écran');
  });

  it('CANCELLATION_REFUSED to the réparateur reads differently from the client copy', () => {
    const client = notificationCopy({
      mode: 'CLIENT',
      type: 'CANCELLATION_REFUSED',
      actorName: null,
      subject: 'Réparation écran',
      amountCents: null,
      step: null,
      messagePreview: null,
    });
    const repairer = notificationCopy({
      mode: 'REPAIRER',
      type: 'CANCELLATION_REFUSED',
      actorName: null,
      subject: 'Réparation écran',
      amountCents: null,
      step: null,
      messagePreview: null,
    });
    expect(repairer.sub).not.toBe(client.sub);
  });

  it('every cancellation type still produces a sentence with no subject', () => {
    for (const type of ['CANCELLATION_REQUESTED', 'CANCELLATION_WITHDRAWN', 'CANCELLATION_REFUSED'] as const) {
      const c = notificationCopy({
        mode: 'REPAIRER',
        type,
        actorName: null,
        subject: null,
        amountCents: null,
        step: null,
        messagePreview: null,
      });
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.sub.length).toBeGreaterThan(0);
    }
  });

  it('groups the three cancellation types under commandes', () => {
    expect(NOTIFICATION_GROUP_BY_TYPE.CANCELLATION_REQUESTED).toBe('commandes');
    expect(NOTIFICATION_GROUP_BY_TYPE.CANCELLATION_WITHDRAWN).toBe('commandes');
    expect(NOTIFICATION_GROUP_BY_TYPE.CANCELLATION_REFUSED).toBe('commandes');
  });
});

describe('AdminAttentionReason CANCELLATION_REQUESTED', () => {
  it('has the label « Annulation demandée »', () => {
    expect(ATTENTION_REASON_LABEL.CANCELLATION_REQUESTED).toBe('Annulation demandée');
  });
});

describe('cancellation message constants', () => {
  it('match the spec copy exactly', () => {
    expect(CANCELLATION_PENDING).toBe("Une demande d'annulation est en cours.");
    expect(CANCELLATION_NOT_PENDING).toBe("Cette demande d'annulation n'est plus en attente.");
    expect(CANCELLATION_ALREADY_PENDING).toBe("Une demande d'annulation est déjà en cours.");
    expect(CANCELLATION_RELEASED).toBe('Les fonds ont déjà été versés : ouvrez un litige.');
    expect(CANCELLATION_DISPUTED).toBe('Un litige est en cours sur cette commande.');
    expect(CANCEL_PAYMENT_IN_FLIGHT).toBe('Un paiement est en cours sur cette demande. Réessayez dans quelques minutes.');
    expect(CANCEL_USE_DELETE).toBe('Utilisez « Supprimer ».');
  });
});
