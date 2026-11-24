import { DELETED_USER_NAME, isDeletedUsername } from './user.schemas.js';

/**
 * How a person is presented to somebody who is not them.
 *
 * 🛑 THE POINT OF THIS FUNCTION IS ITS SIGNATURE. `User.name`, `firstName` and
 * `lastName` are deliberately NOT parameters, so a surface cannot leak a legal
 * name by copying a call. The client's V1 feedback is explicit - « Le nom et
 * prénom ne doivent pas être visibles publiquement par les autres utilisateurs »
 * - and before this existed the legal name was reachable from four DTOs, one of
 * them by DEFAULT (`RepairerProfile.displayName` was seeded from `user.name`).
 *
 * A réparateur is presented by his chosen trade name, because that is the trust
 * signal a client needs on an offer he is about to pay for. A client has no
 * trade name and is presented by his handle.
 *
 * **Do not add a `name` parameter and do not add a `firstName` fallback.** The
 * absence of both is the feature. A user with no display name has a username,
 * because the column is NOT NULL.
 *
 * CF5-23: When a user is deleted (tombstone username or DELETED_USER_NAME),
 * render « Utilisateur supprimé » without any « @ » prefix.
 */
export function publicIdentity(p: { username: string; displayName: string | null }): string {
  if (isDeletedUsername(p.username) || p.displayName === DELETED_USER_NAME) {
    return DELETED_USER_NAME;
  }
  return p.displayName ?? `@${p.username}`;
}

/**
 * CF4-50 / CF5-23. How the Messages list, the chat header and the dispute spaces name the other party:
 * the same identity as `publicIdentity`, WITHOUT the « @ » the owner asked to drop from messaging.
 * Same signature and the same deliberate absence of `name` / `firstName` (CF-05). Every other
 * surface keeps `publicIdentity`'s « @handle ».
 *
 * CF5-23: Returns « Utilisateur supprimé » if the account was deleted.
 */
export function messagingIdentity(p: { username: string; displayName: string | null }): string {
  if (isDeletedUsername(p.username) || p.displayName === DELETED_USER_NAME) {
    return DELETED_USER_NAME;
  }
  return p.displayName ?? p.username;
}

/**
 * CF4-50. An avatar's fallback letters: the first LETTER OR DIGIT of up to two words, upper-cased.
 *
 * 🛑 NOT `word[0]`. Names reach avatars as « @handle » from `publicIdentity`, and the first
 * character of « @mlk » is the « @ » - which every message row drew instead of an « M ». Handles
 * also carry « _ » and « . », so a word is scanned for its first `\p{L}` / `\p{N}`, and words with
 * neither are skipped. « ? » when nothing usable remains.
 */
export function avatarInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .filter((c) => c !== '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return letters || '?';
}
