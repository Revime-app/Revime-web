import {
  SERVICE_TEMPLATE_KEYS,
  type AdminBroadcastPreview,
  type BroadcastTarget,
} from '@revime/shared';

/**
 * Whether the send is held to the recipients' marketing opt-in. The same rule the API applies
 * (`needsMarketingConsent`): a campaign to a segment with a commercial template. A maintenance
 * notice, a verification reminder and a one-to-one message are not.
 */
export function isConsentRestricted(target: BroadcastTarget, templateKey: string): boolean {
  return target.type === 'SEGMENT' && !(SERVICE_TEMPLATE_KEYS as readonly string[]).includes(templateKey);
}

type SegmentTarget = Extract<BroadcastTarget, { type: 'SEGMENT' }>;

/** A client has no stored location: leaving a city behind when the role stops being « réparateur » would target nobody. */
export function segmentForRole(target: SegmentTarget, role: SegmentTarget['role']): SegmentTarget {
  return role === 'REPAIRER' ? { ...target, role } : { ...target, role, city: '', department: '' };
}

/** City and department apply to réparateurs only. */
export const locationFieldsEnabled = (target: SegmentTarget): boolean => target.role === 'REPAIRER';

/** Who the send will actually reach, per channel: everyone eligible, or only those who opted in. */
export function reachCounts(
  preview: AdminBroadcastPreview | null,
  restricted: boolean,
): { total: number; email: number; push: number } {
  if (!preview) return { total: 0, email: 0, push: 0 };
  return restricted
    ? { total: preview.totalRecipients, email: preview.marketingEmailCount, push: preview.marketingPushCount }
    : { total: preview.totalRecipients, email: preview.emailEligibleCount, push: preview.pushEligibleCount };
}

/**
 * V7 D1 (U6). Who a send reaches by push, per platform, and why the rest are out: no device with
 * the notifications on, or (commercial send) no marketing consent. `noConsent` is null on a service
 * or one-to-one message, where consent is not asked. The client's two push broadcasts of
 * 2026-10-27 reached 0 of ~3,000 with nothing on the page saying why.
 */
export function pushReach(
  preview: AdminBroadcastPreview | null,
  restricted: boolean,
): { reachable: number; ios: number; android: number; noDevice: number; noConsent: number | null } {
  if (!preview) return { reachable: 0, ios: 0, android: 0, noDevice: 0, noConsent: null };
  const noDevice = preview.totalRecipients - preview.pushEligibleCount;
  return restricted
    ? {
        reachable: preview.marketingPushCount,
        ios: preview.marketingPushIosCount ?? 0,
        android: preview.marketingPushAndroidCount ?? 0,
        noDevice,
        noConsent: preview.pushEligibleCount - preview.marketingPushCount,
      }
    : {
        reachable: preview.pushEligibleCount,
        ios: preview.pushIosCount ?? 0,
        android: preview.pushAndroidCount ?? 0,
        noDevice,
        noConsent: null,
      };
}

/** The sentence to show when push is ticked and nobody will receive it, or null. Never blocks the send. */
export function pushReachWarning(
  preview: AdminBroadcastPreview | null,
  restricted: boolean,
  pushChannel: boolean,
): string | null {
  if (!preview || !pushChannel) return null;
  const reach = pushReach(preview, restricted);
  if (reach.reachable > 0) return null;
  if (reach.noConsent !== null && reach.noConsent > 0) {
    return `La notification push ne partira vers aucun téléphone : les ${reach.noConsent} membre(s) qui ont les notifications activées n'ont pas accepté les communications commerciales. Une information de service (maintenance, rappel de vérification) part à tous.`;
  }
  return "La notification push ne partira vers aucun téléphone : personne dans cette audience n'a l'application avec les notifications activées.";
}

/** Why the audience count could not be read. The API's own sentence wins; a dead call gets a plain one. */
export function previewFailureMessage(status: number | null, body: { message?: unknown } | null): string {
  if (typeof body?.message === 'string' && body.message.trim()) return body.message;
  return status === null
    ? "Impossible de calculer l'aperçu de l'audience : le serveur n'a pas répondu."
    : `Impossible de calculer l'aperçu de l'audience (erreur ${status}).`;
}

/**
 * The first reason the send button must stay shut, or null. A send whose audience could not be
 * counted is a blind send: the operator would confirm « 0 destinataire(s) » that is really « unknown ».
 */
export function sendBlocker(s: {
  hasChannel: boolean;
  subjectValid: boolean;
  bodyValid: boolean;
  targetValid: boolean;
  sending: boolean;
  previewError: string | null;
}): string | null {
  if (!s.hasChannel) return 'Sélectionnez au moins un canal de diffusion.';
  if (!s.subjectValid) return "L'objet doit contenir au moins 3 caractères.";
  if (!s.bodyValid) return 'Le corps doit contenir au moins 10 caractères.';
  if (!s.targetValid) return 'Choisissez un destinataire.';
  if (s.previewError) return s.previewError;
  if (s.sending) return 'Envoi en cours.';
  return null;
}

/** Asks the API how many people a target reaches. Never throws: a failure comes back as `error`. */
export async function loadAudiencePreview(
  fetchFn: typeof fetch,
  target: BroadcastTarget,
): Promise<{ preview: AdminBroadcastPreview | null; error: string | null }> {
  try {
    const res = await fetchFn('/api/proxy/admin/communications/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(target),
    });
    if (res.ok) return { preview: (await res.json()) as AdminBroadcastPreview, error: null };
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    return { preview: null, error: previewFailureMessage(res.status, body) };
  } catch {
    return { preview: null, error: previewFailureMessage(null, null) };
  }
}
