import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { enterSignedInApp, platformStatusSchema, termsTitle } from '@revime/shared';
import { TermsStepView } from '../../src/components/signup/TermsStepView';
import { api } from '../../src/lib/api';
import { useSessionContext } from '../../src/lib/session';
import { signOutAndLeave } from '../../src/lib/sign-out';
import { submitTerms } from '../../src/lib/signup-actions';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` B1 (1)–(3), `DEC9-05` (3)). The last completion step, and the screen
 * any account with no recorded CGU acceptance is sent to (`tabGateTarget`). Both boxes, then
 * `POST /users/me/signup-acceptance`; the tab gate then runs the existing phone check.
 */
export default function ConditionsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me, refresh } = useSessionContext();
  const [cgu, setCgu] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const method = me?.signupMethod ?? null;
  const connectedWith = method === 'APPLE' ? 'Apple' : method === 'GOOGLE' ? 'Google' : null;

  const onSubmit = async () => {
    if (submitting || !cgu || !privacy) return;
    setSubmitting(true);
    setError(null);
    const result = await submitTerms({
      getStatus: async () => platformStatusSchema.parse(await api.get<unknown>('/platform/status')),
      post: (path, body) => api.post(path, body),
      refresh,
    });
    setSubmitting(false);
    if ('error' in result) setError(result.error);
    else enterSignedInApp(router, result.next);
  };

  return (
    <TermsStepView
      title={termsTitle({ signupMethod: method })}
      connectedWith={connectedWith}
      cguChecked={cgu}
      privacyChecked={privacy}
      error={error}
      submitting={submitting}
      onToggleCgu={() => setCgu((v) => !v)}
      onTogglePrivacy={() => setPrivacy((v) => !v)}
      onOpenCgu={() => router.push('/legal/cgu')}
      onOpenPrivacy={() => router.push('/legal/confidentialite')}
      onSubmit={() => void onSubmit()}
      onSignOut={() => void signOutAndLeave({ queryClient, router })}
      onDelete={() => router.push('/parametres/supprimer')}
    />
  );
}
