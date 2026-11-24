import { describe, expect, it } from 'vitest';
import { NOTIFICATION_GROUP_BY_TYPE, notificationCopy, type NotificationCopyInput } from '@revime/shared';

const base = (type: NotificationCopyInput['type'], mode: 'CLIENT' | 'REPAIRER', subject: string | null = 'Écran iPhone') =>
  notificationCopy({ type, mode, actorName: null, subject, amountCents: null, step: null, messagePreview: null });

describe('CF4-E notification copy', () => {
  it.each(['CLIENT', 'REPAIRER'] as const)('DISPUTE_OPENED reads the same for %s', (mode) => {
    expect(base('DISPUTE_OPENED', mode)).toEqual({
      title: 'Litige ouvert',
      sub: 'REVIME examine la commande « Écran iPhone ». Les fonds sont conservés jusqu\'à la résolution.',
    });
  });
  it('DISPUTE_OPENED without a subject', () => {
    expect(base('DISPUTE_OPENED', 'CLIENT', null).sub).toBe('REVIME examine la commande. Les fonds sont conservés jusqu\'à la résolution.');
  });
  it.each(['CLIENT', 'REPAIRER'] as const)('DISPUTE_DISMISSED for %s', (mode) => {
    expect(base('DISPUTE_DISMISSED', mode)).toEqual({ title: 'Litige clos', sub: 'La commande « Écran iPhone » reprend son cours normal.' });
  });
  it('DISPUTE_DISMISSED without a subject', () => {
    expect(base('DISPUTE_DISMISSED', 'REPAIRER', null).sub).toBe('La commande reprend son cours normal.');
  });
  it('verification copy', () => {
    expect(base('IDENTITY_VERIFIED', 'REPAIRER')).toEqual({ title: 'Identité vérifiée', sub: 'Votre identité a été vérifiée. Consultez votre statut de vérification.' });
    expect(base('IDENTITY_DOCUMENTS_REQUIRED', 'REPAIRER')).toEqual({ title: 'Documents à refaire', sub: "Votre vérification d'identité n'a pas abouti. Vous pouvez recommencer." });
    expect(base('VERIFICATION_REVOKED', 'REPAIRER')).toEqual({ title: 'Vérification retirée', sub: 'REVIME a retiré un niveau de vérification de votre compte.' });
  });
  it('groups', () => {
    expect(NOTIFICATION_GROUP_BY_TYPE.DISPUTE_OPENED).toBe('commandes');
    expect(NOTIFICATION_GROUP_BY_TYPE.DISPUTE_DISMISSED).toBe('commandes');
    expect(NOTIFICATION_GROUP_BY_TYPE.IDENTITY_VERIFIED).toBe('account');
    expect(NOTIFICATION_GROUP_BY_TYPE.IDENTITY_DOCUMENTS_REQUIRED).toBe('account');
    expect(NOTIFICATION_GROUP_BY_TYPE.VERIFICATION_REVOKED).toBe('account');
  });
});
