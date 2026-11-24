import { describe, expect, it } from 'vitest';
import {
  SETUP_REMINDER_DAYS,
  SETUP_REMINDER_TITLE,
  setupReminderFirstText,
  setupReminderSecondText,
} from '../src/index.js';

/** V8 E1, `DEC8-08` (1): the two reminders' sentences, as the owner approved them. */
describe('V8 E1 setup reminder sentences', () => {
  it('3-day reminder: « presque » only when one or two steps are left', () => {
    expect(setupReminderFirstText(1)).toBe("Votre configuration est presque terminée : plus qu'une étape !");
    expect(setupReminderFirstText(2)).toBe('Votre configuration est presque terminée : plus que 2 étapes !');
    expect(setupReminderFirstText(3)).toBe("Votre configuration n'est pas terminée : plus que 3 étapes.");
    expect(setupReminderFirstText(4)).toBe("Votre configuration n'est pas terminée : plus que 4 étapes.");
  });

  it("8-day reminder quotes the request's title", () => {
    expect(setupReminderSecondText('Trois touches muettes sur le piano', 4)).toBe(
      'Un client cherche un réparateur près de chez vous : « Trois touches muettes sur le piano ». Finissez votre inscription en 4 min.',
    );
    expect(setupReminderSecondText('  Écran fissuré  ', 10)).toBe(
      'Un client cherche un réparateur près de chez vous : « Écran fissuré ». Finissez votre inscription en 10 min.',
    );
  });

  it('8-day reminder with no request keeps the second sentence alone', () => {
    expect(setupReminderSecondText(null, 4)).toBe('Finissez votre inscription en 4 min.');
    expect(setupReminderSecondText('   ', 4)).toBe('Finissez votre inscription en 4 min.');
  });

  it('title and thresholds', () => {
    expect(SETUP_REMINDER_TITLE).toBe('Configuration réparateur');
    expect(SETUP_REMINDER_DAYS).toEqual({ first: 3, second: 8 });
  });
});
