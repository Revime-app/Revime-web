/**
 * CF4-25 (spec §4.2). Every French refusal the private quote request flow sends, in one file
 * so `demandes.service.ts` and `offers.service.ts` can refuse with the same sentence without
 * importing `QuoteRequestsService` (and its DI graph).
 */
export const QUOTE_SELF = 'Vous ne pouvez pas vous demander un devis.';
export const QUOTE_TARGET_UNAVAILABLE = 'Ce réparateur ne reçoit pas de demandes de devis.';
export const QUOTE_TARGET_UNVERIFIED = 'Ce réparateur ne peut pas encore envoyer de devis.';
export const QUOTE_ALREADY_OPEN = 'Vous avez déjà une demande de devis en cours auprès de ce réparateur.';
/** The loser of any race at the edge of OPEN. */
export const QUOTE_NOT_OPEN = "Cette demande n'est plus ouverte.";
export const QUOTE_NOTHING_TO_REFUSE = 'Aucun devis à refuser.';
export const QUOTE_ALREADY_ACCEPTED = 'Cette demande est déjà acceptée.';
/** `PATCH demandes/:id` from an older build. */
export const QUOTE_NOT_EDITABLE =
  'Une demande de devis ne peut pas être modifiée. Annulez-la et envoyez-en une nouvelle.';
/** `DELETE demandes/:id` from an older build. */
export const QUOTE_USE_CANCEL = 'Utilisez « Annuler la demande ».';
