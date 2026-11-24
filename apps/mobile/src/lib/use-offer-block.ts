import { offerBlock, type OfferBlock } from '@revime/shared';
import { useSessionContext } from './session';
import { useBusinessStatus, useIdentityStatus } from './queries';

/**
 * V8 E1, `DEC8-08` (6). Why the server would refuse this repairer's offer right now, or null when it would accept,
 * so « Faire une offre » can say so BEFORE the form (`offerBlock`, the rule the server gate itself uses).
 *
 * The two flags are CF-10's, unchanged: `verificationRequired` for the e-mail/phone gate, and `identityRequired` AND
 * `connectEnabled` for the identity gate (with Connect off there is no grant path, so locking the button would point
 * at a screen that cannot help). Statuses are read through `?? null` (an older API omits fields). The business status
 * is fetched only when it can matter: a PRO whose identity is verified.
 */
export function useOfferBlock(): OfferBlock | null {
  const { me } = useSessionContext();
  const level = me?.profile.verificationLevel ?? 'NONE';
  const kind = me?.repairer?.kind ?? null;
  const identityRequired = Boolean(me?.identityRequired && me?.connectEnabled);

  const identity = useIdentityStatus(Boolean(me?.profile.repairerEnabled && me?.connectEnabled));
  const business = useBusinessStatus(kind === 'PRO' && level === 'IDENTITY');

  if (!me) return null;
  return offerBlock({
    level,
    kind,
    identityStatus: identity.data?.status ?? null,
    lastErrorCode: identity.data?.lastErrorCode ?? null,
    identityDecision: identity.data?.decision ?? null,
    businessStatus: business.data?.status ?? null,
    basicRequired: me.verificationRequired === true,
    identityRequired,
  });
}
