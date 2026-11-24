/**
 * « Paramètres » › Profil. Pure, so the rules are testable without a browser.
 *
 * The staff member's name is written to Better Auth's own user row (`POST /update-user`):
 * `firstName` / `lastName` are its additionalFields and `name` is the display name shown in
 * the dashboard (e.g. « Assigné à » on Litiges). It is the same account as in the app, so
 * the app shows the new name too.
 */
export const NAME_MAX_LENGTH = 50;

export type ProfileNameData = { firstName: string; lastName: string; name: string };
type Parsed = { ok: true; data: ProfileNameData } | { ok: false; error: string };

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

export function profileNameInput(first: string, last: string): Parsed {
  const firstName = clean(first);
  const lastName = clean(last);
  if (!firstName) return { ok: false, error: 'Saisissez votre prénom.' };
  if (firstName.length > NAME_MAX_LENGTH || lastName.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `Le prénom et le nom font au plus ${NAME_MAX_LENGTH} caractères chacun.` };
  }
  return { ok: true, data: { firstName, lastName, name: lastName ? `${firstName} ${lastName}` : firstName } };
}
