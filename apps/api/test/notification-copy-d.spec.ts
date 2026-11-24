import { describe, expect, it } from 'vitest';
import {
  ATTENTION_REASON_LABEL,
  NOTIFICATION_GROUP_BY_TYPE,
  REFUND_MOTIF_LABEL,
  euros,
  notificationCopy,
  type NotificationCopyInput,
} from '@revime/shared';

const base = (mode: 'CLIENT' | 'REPAIRER', amountCents: number | null) =>
  notificationCopy({
    type: 'COMMANDE_PARTIALLY_REFUNDED',
    mode,
    amountCents,
    subject: 'Écran',
    actorName: null,
    step: null,
    messagePreview: null,
  } satisfies NotificationCopyInput);

describe('CF4-D notification copy: COMMANDE_PARTIALLY_REFUNDED', () => {
  it('names the amount the réparateur keeps', () => {
    expect(base('REPAIRER', 3000)).toEqual({
      title: 'Commande remboursée',
      sub: `Commande remboursée au client · ${euros(3000)} vous reviennent`,
    });
  });

  it('drops the amount clause when null', () => {
    expect(base('REPAIRER', null)).toEqual({
      title: 'Commande remboursée',
      sub: 'Commande remboursée au client',
    });
  });

  it('is grouped with the other order-scoped types', () => {
    expect(NOTIFICATION_GROUP_BY_TYPE.COMMANDE_PARTIALLY_REFUNDED).toBe('commandes');
  });
});

describe('CF4-D: AdminAttentionReason.SHARE_OWED', () => {
  it('has its operator-facing label', () => {
    expect(ATTENTION_REASON_LABEL.SHARE_OWED).toBe('Part du réparateur à verser');
  });
});

describe('CF4-D: REFUND_MOTIF_LABEL', () => {
  it('labels DISPUTE_DECISION', () => {
    expect(REFUND_MOTIF_LABEL.DISPUTE_DECISION).toBe('Décision de litige');
  });
});
