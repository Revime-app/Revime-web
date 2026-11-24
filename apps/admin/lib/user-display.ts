import { DELETED_USER_NAME, isDeletedUser } from '@revime/shared';

export { DELETED_USER_NAME, isDeletedUser };

/**
 * Returns a sanitized email address, or null if the user has a tombstone/deleted email.
 * Accepts email alone, or (email, name) / (name, email) interchangeably.
 */
export function safeUserEmail(
  arg1?: string | null,
  arg2?: string | null,
): string | null {
  if (isDeletedUser(arg1, arg2)) {
    return null;
  }
  const email = arg1?.includes('@') ? arg1 : arg2?.includes('@') ? arg2 : arg1;
  if (!email) return null;
  const trimmed = email.trim();
  if (trimmed.includes('@revime.invalid') || trimmed.startsWith('deleted+')) {
    return null;
  }
  return trimmed;
}

/**
 * Formats a user's name and email for display.
 * If the user is deleted, guarantees name is "Utilisateur supprimé" and email is null.
 */
export function formatUserDisplay(
  name?: string | null,
  email?: string | null,
  fallbackName = 'Inconnu',
): { name: string; email: string | null; isDeleted: boolean } {
  if (isDeletedUser(name, email)) {
    return {
      name: DELETED_USER_NAME,
      email: null,
      isDeleted: true,
    };
  }
  return {
    name: name?.trim() || fallbackName,
    email: safeUserEmail(email),
    isDeleted: false,
  };
}
