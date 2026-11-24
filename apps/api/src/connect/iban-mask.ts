/**
 * The only form in which REVIME shows a réparateur's bank account: the last four characters Stripe
 * holds (`ConnectAccount.ibanLast4`), nothing else. The country and check digits are NOT known from
 * four characters, so no `FR76` is invented in front of them. Used by the DAC7 file and the admin
 * fiscal block, which showed an IBAN built from the Stripe account id until RU-29.
 */
export function maskIbanLast4(last4: string | null | undefined): string | null {
  return last4 ? `•••• ${last4}` : null;
}
