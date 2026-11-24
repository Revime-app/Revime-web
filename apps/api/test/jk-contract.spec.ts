import { describe, expect, it } from 'vitest';
import {
  DISPUTE_MOTIFS,
  motifsFor,
  formatDisputeRef,
  disputeTimelineSub,
  openDisputeByPartySchema,
  disputePolicy,
  SUPPORT_PREFIX,
  stripSupportPrefix,
  sendMessageSchema,
  notificationCopy,
  NOTIFICATION_GROUP_BY_TYPE,
  registerPushTokenSchema,
  type DisputeMotif,
} from '@revime/shared';

describe('CF4 J+K Shared Contract', () => {
  it('DISPUTE_MOTIFS has 9 keys and expected labels and sides', () => {
    const keys = Object.keys(DISPUTE_MOTIFS) as DisputeMotif[];
    expect(keys).toHaveLength(9);

    expect(DISPUTE_MOTIFS.REPAIR_NON_CONFORMING.label).toBe('Réparation non conforme');
    expect(DISPUTE_MOTIFS.REPAIR_NON_CONFORMING.subtitle).toBe("Le problème n'a pas été correctement résolu");
    expect(DISPUTE_MOTIFS.REPAIR_NON_CONFORMING.sides).toEqual(['CLIENT']);

    expect(DISPUTE_MOTIFS.ITEM_DAMAGED.label).toBe('Objet endommagé');
    expect(DISPUTE_MOTIFS.ITEM_DAMAGED.subtitle).toBe("L'objet est plus abîmé qu'avant");
    expect(DISPUTE_MOTIFS.ITEM_DAMAGED.sides).toEqual(['CLIENT']);

    expect(DISPUTE_MOTIFS.REPAIR_INCOMPLETE.label).toBe('Réparation incomplète');
    expect(DISPUTE_MOTIFS.REPAIR_INCOMPLETE.subtitle).toBe("Tout n'a pas été réparé");
    expect(DISPUTE_MOTIFS.REPAIR_INCOMPLETE.sides).toEqual(['CLIENT']);

    expect(DISPUTE_MOTIFS.DEADLINE_MISSED.label).toBe('Non respect du délai');
    expect(DISPUTE_MOTIFS.DEADLINE_MISSED.subtitle).toBe("Le délai annoncé n'a pas été respecté");
    expect(DISPUTE_MOTIFS.DEADLINE_MISSED.sides).toEqual(['CLIENT']);

    expect(DISPUTE_MOTIFS.CLIENT_UNREACHABLE.label).toBe('Client injoignable');
    expect(DISPUTE_MOTIFS.CLIENT_UNREACHABLE.subtitle).toBe('Le client ne répond plus');
    expect(DISPUTE_MOTIFS.CLIENT_UNREACHABLE.sides).toEqual(['REPAIRER']);

    expect(DISPUTE_MOTIFS.ITEM_NOT_AS_DESCRIBED.label).toBe('Objet non conforme à la description');
    expect(DISPUTE_MOTIFS.ITEM_NOT_AS_DESCRIBED.subtitle).toBe("L'objet reçu ne correspond pas à la demande");
    expect(DISPUTE_MOTIFS.ITEM_NOT_AS_DESCRIBED.sides).toEqual(['REPAIRER']);

    expect(DISPUTE_MOTIFS.ITEM_NOT_HANDED_OVER.label).toBe('Objet non envoyé / non remis');
    expect(DISPUTE_MOTIFS.ITEM_NOT_HANDED_OVER.subtitle).toBe("L'objet ne m'a pas été envoyé ou remis");
    expect(DISPUTE_MOTIFS.ITEM_NOT_HANDED_OVER.sides).toEqual(['REPAIRER']);

    expect(DISPUTE_MOTIFS.SERVICE_DISAGREEMENT.label).toBe('Désaccord sur la prestation');
    expect(DISPUTE_MOTIFS.SERVICE_DISAGREEMENT.subtitle).toBe('Désaccord avec le client sur la réparation');
    expect(DISPUTE_MOTIFS.SERVICE_DISAGREEMENT.sides).toEqual(['REPAIRER']);

    expect(DISPUTE_MOTIFS.OTHER.label).toBe('Autre motif');
    expect(DISPUTE_MOTIFS.OTHER.subtitle).toBeNull();
    expect(DISPUTE_MOTIFS.OTHER.sides).toEqual(['CLIENT', 'REPAIRER']);
  });

  it('motifsFor returns motifs in enum order for each side', () => {
    expect(motifsFor('CLIENT')).toEqual([
      'REPAIR_NON_CONFORMING',
      'ITEM_DAMAGED',
      'REPAIR_INCOMPLETE',
      'DEADLINE_MISSED',
      'OTHER',
    ]);
    expect(motifsFor('REPAIRER')).toEqual([
      'CLIENT_UNREACHABLE',
      'ITEM_NOT_AS_DESCRIBED',
      'ITEM_NOT_HANDED_OVER',
      'SERVICE_DISAGREEMENT',
      'OTHER',
    ]);
  });

  it('formatDisputeRef formats correctly with 4-digit minimum padding', () => {
    expect(formatDisputeRef(42)).toBe('#LIT-0042');
    expect(formatDisputeRef(12345)).toBe('#LIT-12345');
  });

  it('openDisputeByPartySchema validates description length and attachment limit', () => {
    const shortDesc = openDisputeByPartySchema.safeParse({
      motif: 'OTHER',
      description: '1234567890123456789', // 19 chars
      attachments: [],
    });
    expect(shortDesc.success).toBe(false);
    if (!shortDesc.success) {
      expect(shortDesc.error.issues[0]?.message).toBe('Décrivez le problème en 20 caractères minimum.');
    }

    const valid = openDisputeByPartySchema.safeParse({
      motif: 'OTHER',
      description: '12345678901234567890', // 20 chars
      attachments: [],
    });
    expect(valid.success).toBe(true);

    const sixAttachments = openDisputeByPartySchema.safeParse({
      motif: 'OTHER',
      description: '12345678901234567890',
      attachments: [
        { kind: 'photo', path: 'p1.jpg' },
        { kind: 'photo', path: 'p2.jpg' },
        { kind: 'photo', path: 'p3.jpg' },
        { kind: 'photo', path: 'p4.jpg' },
        { kind: 'photo', path: 'p5.jpg' },
        { kind: 'document', path: 'd1.pdf' },
      ],
    });
    expect(sixAttachments.success).toBe(false);
    if (!sixAttachments.success) {
      expect(sixAttachments.error.issues[0]?.message).toBe('Cinq pièces jointes au maximum.');
    }
  });

  it('sendMessageSchema rejects photo+document and accepts document-only', () => {
    const both = sendMessageSchema.safeParse({
      body: 'Hello',
      photoPath: 'photo.jpg',
      documentPath: 'doc.pdf',
    });
    expect(both.success).toBe(false);
    if (!both.success) {
      expect(both.error.issues[0]?.message).toBe('Une seule pièce jointe par message.');
    }

    const docOnly = sendMessageSchema.safeParse({
      body: '',
      documentPath: 'doc.pdf',
      documentName: 'contrat.pdf',
      documentSizeBytes: 1024,
    });
    expect(docOnly.success).toBe(true);

    const empty = sendMessageSchema.safeParse({
      body: '   ',
    });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues[0]?.message).toBe('Votre message est vide.');
    }
  });

  it('disputePolicy allows opening only for PAID, releasedAt null, and no dispute', () => {
    expect(
      disputePolicy({
        status: 'PAID',
        releasedAt: null,
        dispute: null,
      }).canOpen,
    ).toBe(true);

    expect(
      disputePolicy({
        status: 'REFUNDED',
        releasedAt: null,
        dispute: null,
      }).canOpen,
    ).toBe(false);

    expect(
      disputePolicy({
        status: 'PAID',
        releasedAt: new Date().toISOString(),
        dispute: null,
      }).canOpen,
    ).toBe(false);

    expect(
      disputePolicy({
        status: 'PAID',
        releasedAt: null,
        dispute: { status: 'RESOLVED_DISMISSED' },
      }).canOpen,
    ).toBe(false);
  });

  it('stripSupportPrefix strips SUPPORT_PREFIX and leaves unprefixed body intact', () => {
    expect(SUPPORT_PREFIX).toBe('REVIME — Support : ');
    expect(stripSupportPrefix('REVIME — Support : Bonjour')).toBe('Bonjour');
    expect(stripSupportPrefix('Bonjour tout le monde')).toBe('Bonjour tout le monde');
  });

  it('notificationCopy formats DISPUTE_MESSAGE and both DISPUTE_OPENED branches verbatim', () => {
    // DISPUTE_MESSAGE with subject
    expect(
      notificationCopy({
        type: 'DISPUTE_MESSAGE',
        mode: 'CLIENT',
        actorName: null,
        subject: 'Écran iPhone',
        amountCents: null,
        step: null,
        messagePreview: null,
      }),
    ).toEqual({
      title: 'REVIME — Support',
      sub: 'Nouveau message au sujet du litige sur la commande « Écran iPhone »',
    });

    // DISPUTE_MESSAGE without subject
    expect(
      notificationCopy({
        type: 'DISPUTE_MESSAGE',
        mode: 'CLIENT',
        actorName: null,
        subject: null,
        amountCents: null,
        step: null,
        messagePreview: null,
      }),
    ).toEqual({
      title: 'REVIME — Support',
      sub: 'Nouveau message au sujet de votre litige',
    });

    // DISPUTE_OPENED with actorName and subject
    expect(
      notificationCopy({
        type: 'DISPUTE_OPENED',
        mode: 'CLIENT',
        actorName: 'Alice',
        subject: 'Écran iPhone',
        amountCents: null,
        step: null,
        messagePreview: null,
      }),
    ).toEqual({
      title: 'Nouveau litige',
      sub: 'Alice a ouvert un litige sur la commande « Écran iPhone ». Consultez la conversation et transmettez vos éléments à REVIME',
    });

    // DISPUTE_OPENED with actorName and no subject
    expect(
      notificationCopy({
        type: 'DISPUTE_OPENED',
        mode: 'CLIENT',
        actorName: 'Alice',
        subject: null,
        amountCents: null,
        step: null,
        messagePreview: null,
      }),
    ).toEqual({
      title: 'Nouveau litige',
      sub: 'Alice a ouvert un litige sur votre commande. Consultez la conversation et transmettez vos éléments à REVIME',
    });

    // DISPUTE_OPENED with null actorName (today's copy unchanged) with subject
    expect(
      notificationCopy({
        type: 'DISPUTE_OPENED',
        mode: 'CLIENT',
        actorName: null,
        subject: 'Écran iPhone',
        amountCents: null,
        step: null,
        messagePreview: null,
      }),
    ).toEqual({
      title: 'Litige ouvert',
      sub: 'REVIME examine la commande « Écran iPhone ». Les fonds sont conservés jusqu\'à la résolution.',
    });

    // DISPUTE_OPENED with null actorName without subject
    expect(
      notificationCopy({
        type: 'DISPUTE_OPENED',
        mode: 'CLIENT',
        actorName: null,
        subject: null,
        amountCents: null,
        step: null,
        messagePreview: null,
      }),
    ).toEqual({
      title: 'Litige ouvert',
      sub: "REVIME examine la commande. Les fonds sont conservés jusqu'à la résolution.",
    });
  });

  it('NOTIFICATION_GROUP_BY_TYPE assigns DISPUTE_MESSAGE to commandes', () => {
    expect(NOTIFICATION_GROUP_BY_TYPE.DISPUTE_MESSAGE).toBe('commandes');
  });

  it('registerPushTokenSchema accepts sound: revime and no sound', () => {
    expect(
      registerPushTokenSchema.safeParse({
        token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        platform: 'IOS',
        sound: 'revime',
      }).success,
    ).toBe(true);

    expect(
      registerPushTokenSchema.safeParse({
        token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        platform: 'ANDROID',
      }).success,
    ).toBe(true);

    expect(
      registerPushTokenSchema.safeParse({
        token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        platform: 'ANDROID',
        sound: 'invalid',
      }).success,
    ).toBe(false);
  });

  it('disputeTimelineSub returns appropriate subtitle depending on openedBySide and viewerRole', () => {
    expect(disputeTimelineSub('CLIENT', 'client')).toBe('Votre signalement a été transmis à REVIME');
    expect(disputeTimelineSub('CLIENT', 'repairer')).toBe('Le client a signalé un problème');
    expect(disputeTimelineSub('REPAIRER', 'repairer')).toBe('Votre signalement a été transmis à REVIME');
    expect(disputeTimelineSub('REPAIRER', 'client')).toBe('Le réparateur a signalé un problème');
    expect(disputeTimelineSub('REVIME', 'client')).toBe('Litige transmis à REVIME');
    expect(disputeTimelineSub('REVIME', 'repairer')).toBe('Litige transmis à REVIME');
  });
});
