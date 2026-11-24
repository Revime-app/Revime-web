import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { MeResponse } from '@revime/shared';
import { UsernameStepView } from '../../src/components/signup/UsernameStepView';
import { api } from '../../src/lib/api';
import { useSessionContext } from '../../src/lib/session';
import { signOutAndLeave } from '../../src/lib/sign-out';
import { submitUsername } from '../../src/lib/signup-actions';
import { enterSignedInApp } from '@revime/shared';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-04` (1), `DEC9-06` (2)). The first completion step after an
 * Apple / Google sign-up, reached from `afterSocialSignIn` or the tab gate (`tabGateTarget`). The
 * generated handle is the starting value; « Continuer » confirms it or the edited one.
 */
export default function NomUtilisateurScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me, refresh } = useSessionContext();
  const [value, setValue] = useState(me?.username ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // `me` can arrive after the first render (cold start): seed the field once it does.
  useEffect(() => {
    if (me?.username) setValue((current) => (current === '' ? me.username : current));
  }, [me?.username]);

  const onSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await submitUsername(value, {
      patch: (path, body) => api.patch<MeResponse>(path, body),
      refresh,
    });
    setSubmitting(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    if (result.next === '/(tabs)') enterSignedInApp(router, '/(tabs)');
    else router.replace(result.next);
  };

  return (
    <UsernameStepView
      value={value}
      error={error}
      submitting={submitting}
      onChange={(next) => {
        setValue(next);
        if (error) setError(null);
      }}
      onSubmit={() => void onSubmit()}
      onSignOut={() => void signOutAndLeave({ queryClient, router })}
      onDelete={() => router.push('/parametres/supprimer')}
    />
  );
}
