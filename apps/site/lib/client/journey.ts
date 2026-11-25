'use client';

import { useState } from 'react';
import {
  repairerJourney,
  repairerVerificationState,
  type BusinessStatusResponse,
  type ConnectStatusResponse,
  type IdentitySessionResponse,
  type IdentityStatusResponse,
  type IdentityVariant,
  type RepairerJourney,
} from '@revime/shared';
import { api, errorMessage } from './api';
import { useSession } from './session';
import { useApi } from './use-api';

/**
 * The app's useRepairerJourney (apps/mobile/src/lib/use-repairer-journey.ts): the same three reads and
 * the same shared `repairerJourney`, so the site's « Configuration réparateur » lists the same steps.
 */
export function useRepairerJourney(): {
  loading: boolean;
  journey: RepairerJourney | null;
  identity: IdentityStatusResponse | undefined;
  connect: ConnectStatusResponse | undefined;
  verificationLabel: string | null;
  identityError: boolean;
  connectError: boolean;
  reload: () => void;
} {
  const { me, refresh } = useSession();
  const enabled = Boolean(me?.profile.repairerEnabled && me?.connectEnabled);
  const identity = useApi<IdentityStatusResponse>(enabled ? '/identity/status' : null);
  const connect = useApi<ConnectStatusResponse>(enabled ? '/connect/status' : null);
  const business = useApi<BusinessStatusResponse>(me?.profile.repairerEnabled && me?.repairer?.kind === 'PRO' ? '/business/status' : null);

  const reload = () => {
    identity.reload();
    connect.reload();
    business.reload();
    void refresh();
  };

  const loading = !me || (enabled && (identity.loading || connect.loading));
  if (loading || !me) {
    return { loading: true, journey: null, identity: undefined, connect: undefined, verificationLabel: null, identityError: false, connectError: false, reload };
  }
  const identityError = enabled && identity.error !== null;
  const connectError = enabled && connect.error !== null;
  const id = identityError ? undefined : identity.data;
  const journey = repairerJourney({
    kind: me.repairer?.kind ?? null,
    level: me.profile.verificationLevel,
    identityStatus: id?.status ?? null,
    lastErrorCode: id?.lastErrorCode ?? null,
    completion: me.repairer?.completion ?? null,
    connectStatus: connectError ? null : connect.data?.status ?? null,
    connectEnabled: me.connectEnabled,
    decision: id?.decision ?? null,
    decisionReason: id?.decisionReason ?? null,
    fiscalCompleted: Boolean(me.repairer?.fiscalCompleted),
    businessStatus: business.data?.status ?? null,
  });
  const verificationLabel = repairerVerificationState(
    me.profile.verificationLevel,
    me.repairer?.kind ?? null,
    id?.status ?? null,
    id?.lastErrorCode ?? null,
    id?.decision ?? null,
  ).label;
  return { loading: false, journey, identity: id, connect: connect.data, verificationLabel, identityError, connectError, reload };
}

/** Starts Stripe Identity in the browser: the hosted page, then back to /identite/retour. */
export function useIdentityStart() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async (variant: IdentityVariant = 'DOCUMENT_AND_SELFIE') => {
    setLoading(true);
    setError(null);
    try {
      const s = await api.post<IdentitySessionResponse>('/identity/session?surface=web', { variant });
      window.location.assign(s.url);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  };
  return { start, loading, error };
}

/** Starts Stripe Connect's hosted onboarding (versements), back to the dashboard. */
export function useConnectStart() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<{ url: string }>('/connect/onboarding?surface=web', {});
      window.location.assign(r.url);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  };
  return { start, loading, error };
}
