import { USERNAME_STEP_HINT, USERNAME_STEP_TITLE } from '@revime/shared';
import { Button } from '../Button';
import { Field } from '../Field';
import { SignupStepFrame } from './SignupStepFrame';

type Props = {
  value: string;
  error: string | null;
  submitting: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSignOut: () => void;
  onDelete: () => void;
};

/**
 * V9 B1 (`DEC9-06` (2)). The username step after an Apple / Google sign-up: pre-filled with the
 * generated handle, « Continuer » keeps it as is, no skip, never empty, a taken name shown under the
 * field. Stateless: the screen (`app/(auth)/nom-utilisateur.tsx`) holds the value and the request.
 */
export function UsernameStepView(p: Props) {
  const empty = p.value.trim().length === 0;
  // Called as a function, not mounted as <SignupStepFrame>, so the specs read one flat tree; its hooks
  // run in this component's render in a fixed order, exactly as if inlined.
  return SignupStepFrame({
    title: USERNAME_STEP_TITLE,
    onSignOut: p.onSignOut,
    onDelete: p.onDelete,
    footer: <Button label="Continuer" onPress={p.onSubmit} disabled={empty} loading={p.submitting} />,
    children: (
      <Field
        label="Nom d'utilisateur"
        value={p.value}
        onChangeText={p.onChange}
        helperText={USERNAME_STEP_HINT}
        error={p.error ?? undefined}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        maxLength={20}
        returnKeyType="done"
        onSubmitEditing={empty ? undefined : p.onSubmit}
        editable={!p.submitting}
      />
    ),
  });
}
