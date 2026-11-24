import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_GROUP_BY_TYPE,
  notificationCopy,
  notificationTypeSchema,
  soundKeyFor,
} from '../src/index.js';

/**
 * V8 E1, `DEC8-08` (1), (5). The 3- and 8-day setup reminders are one notification type whose sentence the
 * server builds and stores in `subject` (the `FISCAL_DECLARATION_REQUIRED` precedent).
 */
describe('V8 E1: the SETUP_REMINDER notification', () => {
  it('is a notification type the API may send', () => {
    expect(notificationTypeSchema.parse('SETUP_REMINDER')).toBe('SETUP_REMINDER');
  });

  it('reads the sentence the server stored', () => {
    const copy = notificationCopy({
      type: 'SETUP_REMINDER',
      mode: 'REPAIRER',
      subject: 'Votre configuration est presque terminée : plus que 2 étapes !',
      amountCents: null,
    });
    expect(copy).toEqual({
      title: 'Configuration réparateur',
      sub: 'Votre configuration est presque terminée : plus que 2 étapes !',
    });
  });

  it('still makes sense without a stored sentence', () => {
    const copy = notificationCopy({ type: 'SETUP_REMINDER', mode: 'REPAIRER', subject: null, amountCents: null });
    expect(copy.sub).toBe('Terminez votre configuration réparateur.');
  });

  it('is silenced by « Offres et demandes »', () => {
    expect(NOTIFICATION_GROUP_BY_TYPE.SETUP_REMINDER).toBe('offers');
  });

  it('has a push sound, the one the other setup notices use', () => {
    expect(soundKeyFor('SETUP_REMINDER')).toBe(soundKeyFor('FISCAL_DECLARATION_REQUIRED'));
  });
});
