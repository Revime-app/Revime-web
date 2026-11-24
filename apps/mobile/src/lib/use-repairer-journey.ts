import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { repairerJourney, repairerVerificationState, type RepairerJourney } from '@revime/shared';
import { useSessionContext } from './session';
import { useIdentityStatus, useConnectStatus, useBusinessStatus } from './queries';

/**
 * CF4-09, design spec §4.2: the hook behind the « Statut de vérification » hub. Reads `me` and the two
 * status queries, normalises every DTO field with `?? null` once (`apps/mobile/AGENTS.md`), and hands
 * `repairerJourney` (Task 1, `@revime/shared`) exactly what it needs. The hub does no status logic of
 * its own - every label, body and CTA already lives on the returned `journey.steps`.
 *
 * Both queries are enabled on the same condition identity start already refuses without
 * (`connectEnabled`) combined with the mode being on at all (`repairerEnabled`): a client-only account,
 * or one whose server has payments/identity off, has nothing to fetch.
 */
export function useRepairerJourney(): {
  loading: boolean;
  identityError: boolean;
  connectError: boolean;
  journey: RepairerJourney | null;
  /**
   * `repairerVerificationState(...)`'s label. Deliberately diverges from the identity step for a PRO
   * at level IDENTITY (identity step `done`, this label still says required, since the offer-gate
   * floor for a PRO needs BUSINESS) - accurate ONLY for a not-yet-`done` identity step (its `todo`
   * case: REQUIRED or REFUSED). The hub's identity pill uses this label only when the step itself is
   * still `todo`; a `done` or `waiting` step uses its own status instead.
   */
  verificationLabel: string | null;
  documentOnlyAvailable: boolean | null;
  refetch: () => void;
} {
  const { me, refresh } = useSessionContext();
  const enabled = Boolean(me?.profile.repairerEnabled && me?.connectEnabled);

  const identity = useIdentityStatus(enabled);
  const connect = useConnectStatus(enabled);
  // V8 E1 (review I1): a PRO's business check under review is a waiting step, not one to do. Same query and key
  // the offer sheet (`useOfferBlock`) and « Mon entreprise » read, so it is fetched once.
  const business = useBusinessStatus(Boolean(me?.profile.repairerEnabled && me?.repairer?.kind === 'PRO'));

  const identityError = enabled && identity.isError;
  const connectError = enabled && connect.isError;

  const refetch = useCallback(() => {
    void identity.refetch();
    void connect.refetch();
    void refresh();
  }, [identity.refetch, connect.refetch, refresh]);

  // Stripe return: the app is backgrounded during the hosted session, so refresh both statuses
  // and the session whenever the hub regains focus rather than trusting whatever was cached before the hand-off.
  useFocusEffect(
    useCallback(() => {
      if (enabled) refetch();
    }, [enabled, refetch]),
  );

  // `loading` is false once each ENABLED query has settled (data or error), never guessing a step
  // meanwhile. A disabled query never resolves `isFetched`, so it must not hold `loading` open.
  const identitySettled = !enabled || identity.isFetched;
  const connectSettled = !enabled || connect.isFetched;
  const loading = me === null || !identitySettled || !connectSettled;

  if (loading) {
    return {
      loading: true,
      identityError: false,
      connectError: false,
      journey: null,
      verificationLabel: null,
      documentOnlyAvailable: null,
      refetch,
    };
  }

  // DTO fields normalised once, at entry. A source that errored contributes `null` so the other
  // steps still compute - the hook never withholds the whole journey for one failed query.
  const identityStatus = identityError ? null : identity.data?.status ?? null;
  const lastErrorCode = identityError ? null : identity.data?.lastErrorCode ?? null;
  const connectStatus = connectError ? null : connect.data?.status ?? null;
  const documentOnlyAvailable = identity.data?.documentOnlyAvailable ?? null;
  // CF4-39: REVIME's decision on the current session. `?? null`: a stale API sends undefined.
  const decision = identityError ? null : identity.data?.decision ?? null;
  const decisionReason = identityError ? null : identity.data?.decisionReason ?? null;

  const journey = repairerJourney({
    kind: me.repairer?.kind ?? null,
    level: me.profile.verificationLevel,
    identityStatus,
    lastErrorCode,
    completion: me.repairer?.completion ?? null,
    connectStatus,
    connectEnabled: me.connectEnabled,
    decision,
    decisionReason,
    fiscalCompleted: Boolean(me.repairer?.fiscalCompleted),
    businessStatus: business.data?.status ?? null,
  });

  const verificationLabel = repairerVerificationState(
    me.profile.verificationLevel,
    me.repairer?.kind ?? null,
    identityStatus,
    lastErrorCode,
    decision,
  ).label;

  return {
    loading: false,
    identityError,
    connectError,
    journey,
    verificationLabel,
    documentOnlyAvailable,
    refetch,
  };
}
