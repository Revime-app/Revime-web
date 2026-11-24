import { DELETED_USER_NAME } from '@revime/shared';

/**
 * A deleted account keeps its row (the id is referenced, with no FK, by assignments), so the
 * tombstone is read from the profile or from the replaced name. One reading for every admin
 * surface that shows or refuses an assignee.
 */
export function isDeletedAccount(user: {
  name: string | null;
  profile: { deletedAt: Date | null } | null;
}): boolean {
  return Boolean(user.profile?.deletedAt) || user.name === DELETED_USER_NAME;
}
