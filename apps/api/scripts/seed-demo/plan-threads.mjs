import { randomUUID } from 'node:crypto';

/** Two threads on his own demande. French copy, and the reparateur speaks last. */
const SCRIPTS = [
  {
    repairerKey: 'voltaire',
    actorName: 'Atelier Voltaire',
    turns: [
      ['client', "Bonjour, votre offre m'intéresse. L'écran est bien d'origine Apple ?"],
      ['repairer', "Bonjour, oui, bloc écran d'origine avec garantie 12 mois. Je vous fournis la facture."],
      ['client', 'Parfait. Combien de temps si je dépose demain matin ?'],
      ['repairer', "Déposé demain matin, prêt le surlendemain en fin de journée. Je vous préviens dès que c'est terminé."],
    ],
  },
  {
    repairerKey: 'karim',
    actorName: 'Karim Mobile Repair',
    turns: [
      ['client', 'Bonjour, vous vous déplacez bien dans le 17e ?'],
      ['repairer', "Bonjour, oui, je suis dans le quartier. Je peux passer chez vous jeudi après-midi."],
      ['client', "Jeudi c'est compliqué pour moi, vendredi serait possible ?"],
      ['repairer', "Vendredi me va, disons 14 h. La réparation prend environ une heure sur place."],
      ['repairer', "Dites-moi simplement l'adresse exacte et je confirme le créneau."],
    ],
  },
];

export function planThreads({ clientUserId, clientDemandeId, repairerIds, now }) {
  const conversations = [];
  const messages = [];
  const notifications = [];

  SCRIPTS.forEach((script, si) => {
    const repairerUserId = repairerIds[script.repairerKey];
    if (!repairerUserId) throw new Error(`No id for reparateur ${script.repairerKey}`);

    const conversationId = randomUUID();
    // Thread si=0 started 2 days ago, si=1 about 1 day ago.
    const start = now.getTime() - (2 - si) * 86_400_000;

    let last = start;
    let lastMessageId = null;
    script.turns.forEach((turn, ti) => {
      const [who, body] = turn;
      const createdAt = new Date(start + ti * 40 * 60_000);
      last = createdAt.getTime();
      lastMessageId = randomUUID();
      messages.push({
        id: lastMessageId,
        conversationId,
        senderUserId: who === 'client' ? clientUserId : repairerUserId,
        body,
        createdAt,
        deletedAt: null,
      });
    });

    const lastMessageAt = new Date(last);
    conversations.push({
      id: conversationId,
      demandeId: clientDemandeId,
      clientUserId,
      repairerUserId,
      lastMessageAt,
      // Deliberately BEFORE the last message: the inbox badge has to be genuine.
      clientLastReadAt: new Date(last - 30 * 60_000),
      repairerLastReadAt: lastMessageAt,
      createdAt: new Date(start),
      deletedAt: null,
    });

    /**
     * conversationId is the ROUTING target and messageId is what the body is joined
     * on at read time -- the one deliberate exception to this model's snapshot rule.
     * A row carrying only demandeId routes nowhere and renders empty.
     *
     * readAt stays null so the bell counts it, which is the same reason
     * clientLastReadAt sits behind the last message. The partial unique index
     * (userId, conversationId) where type = MESSAGE_RECEIVED and readAt is null
     * permits both rows because their conversationIds differ.
     */
    notifications.push({
      id: randomUUID(),
      userId: clientUserId,
      mode: 'CLIENT',
      type: 'MESSAGE_RECEIVED',
      actorName: script.actorName,
      subject: null,
      amountCents: null,
      step: null,
      demandeId: clientDemandeId,
      commandeId: null,
      conversationId,
      messageId: lastMessageId,
      readAt: null,
      createdAt: lastMessageAt,
    });
  });

  return { conversations, messages, notifications };
}
