/**
 * V8 E1, `DEC8-08` (1): the two setup reminders, sent 3 and 8 days after a repairer turned on repairer mode if
 * setup is still unfinished. Built on the server (`apps/api/src/setup/`) and stored in the notification's
 * `subject`, the `FISCAL_DECLARATION_REQUIRED` precedent, so the push and the in-app row read the same sentence.
 *
 * Mockup 5 draws a third notification (« 29 demandes … Terminez votre profil pour y répondre ») that the client's
 * text does not ask for, and that contradicts E1 itself (the profile never blocks a reply); it is not built.
 */

/** The push title. The mockup draws none (only the app name); a push needs one. Plan copy, listed for the owner. */
export const SETUP_REMINDER_TITLE = 'Configuration réparateur';

/** Days after `RepairerProfile.createdAt`. */
export const SETUP_REMINDER_DAYS = { first: 3, second: 8 } as const;

/**
 * The 3-day sentence. The mockup's « presque terminée » is kept for one or two steps left; with three or more it
 * would not be true, so the sentence says « n'est pas terminée » instead (approved in the design round).
 */
export function setupReminderFirstText(stepsLeft: number): string {
  if (stepsLeft <= 1) return "Votre configuration est presque terminée : plus qu'une étape !";
  if (stepsLeft === 2) return 'Votre configuration est presque terminée : plus que 2 étapes !';
  return `Votre configuration n'est pas terminée : plus que ${stepsLeft} étapes.`;
}

/**
 * The 8-day sentence. The mockup's « réparer son piano » becomes the request's own title in quotes, because
 * building « son/sa/ses <objet> » from a category breaks on French gender. With no request to quote, the second
 * sentence stands alone.
 */
export function setupReminderSecondText(demandeTitle: string | null, minutesLeft: number): string {
  const tail = `Finissez votre inscription en ${minutesLeft} min.`;
  const title = demandeTitle?.trim();
  return title ? `Un client cherche un réparateur près de chez vous : « ${title} ». ${tail}` : tail;
}
