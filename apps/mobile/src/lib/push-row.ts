import type { PushRegistrationState } from './push';

/**
 * V7 A5 (U6). What the « Notifications push » row in Paramètres → Notifications says, and what a
 * tap does. Pure, so it is tested without the native module (`test/v7-u6-push-row.spec.ts`).
 *
 * Two defects it replaces, both on the client's Android phone:
 * - the row read the permission alone, so « Activées » showed while no token existed;
 * - the refusal hint named « Réglages iOS » on Android too.
 * The settings link after a refusal (the client's « lien vers les réglages ») already existed
 * since CF-44; only its wording was iOS-only.
 */
export type PushPermission = 'granted' | 'denied' | 'undetermined';

export interface PushRow {
  value: string | null;
  sub: string | null;
  tone: 'warn' | 'muted';
  /** `settings`: open the system settings; `register`: ask / register again; null: no tap. */
  action: 'settings' | 'register' | null;
}

export function pushRowState(input: {
  permission: PushPermission | null;
  registration: PushRegistrationState;
  platform: 'ios' | 'android';
}): PushRow {
  const { permission, registration, platform } = input;
  if (permission === null) return { value: null, sub: null, tone: 'muted', action: null };
  if (permission === 'denied') {
    return {
      value: 'Désactivées',
      sub:
        platform === 'ios'
          ? "Autorisez les notifications dans les Réglages iOS pour être prévenu quand l'application est fermée."
          : "Autorisez les notifications dans les paramètres de votre téléphone pour être prévenu quand l'application est fermée.",
      tone: 'warn',
      action: 'settings',
    };
  }
  if (permission === 'undetermined') return { value: 'Activer', sub: null, tone: 'muted', action: 'register' };
  switch (registration) {
    case 'registered':
      return { value: 'Activées', sub: null, tone: 'muted', action: null };
    case 'failed':
      return {
        value: 'Non disponibles',
        sub: "Ce téléphone n'a pas pu être inscrit aux notifications. Touchez pour réessayer.",
        tone: 'warn',
        action: 'register',
      };
    case 'pending':
      return { value: null, sub: null, tone: 'muted', action: null };
    case 'idle':
      return { value: null, sub: null, tone: 'muted', action: 'register' };
  }
}
