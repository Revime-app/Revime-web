import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { STEP_UP_COPY, type StepUpChoice, type StepUpProvider } from '@revime/shared';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Field } from './Field';
import { GoogleMark } from './GoogleMark';
import { IconLock } from '../icons';
import { ApiError, api } from '../lib/api';
import { appleAuth } from '../lib/apple-auth';
import { confirmWithApple, confirmWithGoogle } from '../lib/provider-step-up';
import { KeyboardAvoider } from './KeyboardAvoider';

/** What the sheet offers (`stepUpChoices`), and the account's providers. Null while closed. */
export type StepUpRequest = { choices: StepUpChoice[]; providers: StepUpProvider[] };

type Props = {
  request: StepUpRequest | null;
  /** Called once the server has stamped the session (true) or the user closed the sheet (false). */
  onDone: (confirmed: boolean) => void;
};

type Busy = 'CONFIRM' | 'CODE' | StepUpProvider | null;

const fallbackError = 'La confirmation n’a pas abouti. Réessayez.';
const PASSWORD_SUBTITLE = 'Pour votre sécurité, saisissez votre mot de passe avant de continuer.';
const CODE_SUBTITLE = 'Pour votre sécurité, nous vous envoyons un code par e-mail avant de continuer.';

/**
 * V7 A11 (U2b, Q6 / Q7). « Confirmez votre identité », opened by `withStepUp` when the API answers
 * `STEP_UP_REQUIRED`. V9 U3 (`DEC9-09`): it offers what `stepUpChoices` gave the context: the password,
 * « Continuer avec Apple / Google » (a fresh sign-in with the provider, checked by the server), or for an
 * account with neither the 6-digit code by e-mail. The server stamps the session for 10 minutes.
 *
 * Same Modal-and-scrim shape as CF-10's `IdentityGateSheet`, now `OfferGateSheet` (no `expo-blur`: a native module, see AGENTS.md).
 * 🛑 The card sits in the shared `KeyboardAvoider` (V7 U3), which pads on BOTH platforms: under
 * Android edge-to-edge the window no longer resizes for the keyboard, which is V7 A1's root cause.
 *
 * Width (V9 U3, measured with PIL on GoogleSansFlex 600SemiBold at 16pt): « Continuer avec Google » is
 * 175.5pt plus the mark and its gap, about 204pt; the card on an iPhone SE is 375 - 2×24 - 2×24 = 279pt
 * wide, so the label holds on one line with room to spare. Apple's own button sizes its text itself.
 */
export function StepUpSheet({ request, onDone }: Props) {
  const [value, setValue] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A fresh sheet each time it opens.
    setValue('');
    setCodeSent(false);
    setBusy(null);
    setError(null);
  }, [request]);

  const fail = (err: unknown) => setError(err instanceof ApiError ? err.message : fallbackError);

  const sendCode = async () => {
    setBusy('CODE');
    setError(null);
    try {
      await api.post('/security/step-up/code/send', {});
      setCodeSent(true);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    setBusy('CONFIRM');
    setError(null);
    try {
      if (request?.choices.includes('PASSWORD')) await api.post('/security/step-up', { password: value });
      else await api.post('/security/step-up/code', { code: value.trim() });
      onDone(true);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const withProvider = async (provider: StepUpProvider) => {
    setBusy(provider);
    setError(null);
    const result = provider === 'APPLE' ? await confirmWithApple() : await confirmWithGoogle();
    setBusy(null);
    if (result.ok) onDone(true);
    else if (!result.cancelled) setError(result.messageFr);
  };

  return (
    <StepUpSheetView
      request={request}
      value={value}
      codeSent={codeSent}
      busy={busy}
      error={error}
      onChangeValue={setValue}
      onSendCode={() => void sendCode()}
      onConfirm={() => void confirm()}
      onProvider={(p) => void withProvider(p)}
      onCancel={() => onDone(false)}
    />
  );
}

export type StepUpSheetViewProps = {
  request: StepUpRequest | null;
  value: string;
  codeSent: boolean;
  busy: Busy;
  error: string | null;
  onChangeValue: (value: string) => void;
  onSendCode: () => void;
  onConfirm: () => void;
  onProvider: (provider: StepUpProvider) => void;
  onCancel: () => void;
};

function subtitleFor(choices: StepUpChoice[]): string {
  if (choices.length === 0) return STEP_UP_COPY.noChoice;
  const provider = choices.find((c): c is StepUpProvider => c === 'APPLE' || c === 'GOOGLE');
  const password = choices.includes('PASSWORD');
  if (provider && password) return STEP_UP_COPY.passwordOrProviderSubtitle(provider);
  if (provider) return STEP_UP_COPY.providerSubtitle(provider);
  return password ? PASSWORD_SUBTITLE : CODE_SUBTITLE;
}

/** Stateless, so the specs can read the tree it returns (`test/render-tree.ts`). */
export function StepUpSheetView(props: StepUpSheetViewProps) {
  const { request, value, codeSent, busy, error, onChangeValue, onSendCode, onConfirm, onProvider, onCancel } = props;
  const { palette, radii, spacing } = useTheme();
  const choices = request?.choices ?? [];
  const password = choices.includes('PASSWORD');
  const code = choices.includes('EMAIL_CODE');
  const anyBusy = busy !== null;

  return (
    <Modal visible={request !== null} transparent animationType="fade" onRequestClose={onCancel} accessibilityViewIsModal>
      <KeyboardAvoider>
        <Pressable style={[styles.scrim, { backgroundColor: `${palette.ink}8C` }]} onPress={onCancel} accessible={false}>
          <Pressable
            style={[styles.card, { backgroundColor: palette.paper, borderRadius: radii.card, padding: spacing.lg }]}
            onPress={() => {}}
            accessible={false}
          >
            <View style={[styles.badge, { backgroundColor: palette.redSoft, marginBottom: spacing.md }]}>
              <IconLock size={26} color={palette.red} strokeWidth={2} />
            </View>
            <Text style={[styles.title, { color: palette.ink }]}>{STEP_UP_COPY.title}</Text>
            <Text style={[styles.subtitle, { color: palette.muted, marginBottom: spacing.lg }]}>{subtitleFor(choices)}</Text>

            {(password || (code && codeSent)) && (
              <Field
                label={password ? 'Mot de passe' : 'Code reçu par e-mail'}
                value={value}
                onChangeText={onChangeValue}
                secureTextEntry={password}
                keyboardType={password ? 'default' : 'number-pad'}
                autoCapitalize="none"
                autoComplete={password ? 'current-password' : 'one-time-code'}
                maxLength={password ? 128 : 6}
                autoFocus
              />
            )}

            {error !== null && <Text style={[styles.error, { color: palette.redDeep, marginBottom: spacing.sm }]}>{error}</Text>}

            {password && <Button label="Confirmer" onPress={onConfirm} loading={busy === 'CONFIRM'} disabled={value.length === 0 || anyBusy} />}

            {choices.includes('APPLE') && (
              <View style={{ marginTop: password ? spacing.sm : 0 }}>
                <AppleConfirmButton onPress={() => onProvider('APPLE')} disabled={anyBusy} />
              </View>
            )}
            {choices.includes('GOOGLE') && (
              <View style={{ marginTop: password || choices.includes('APPLE') ? spacing.sm : 0 }}>
                <Button
                  label="Continuer avec Google"
                  variant="secondary"
                  icon={<GoogleMark />}
                  onPress={() => onProvider('GOOGLE')}
                  loading={busy === 'GOOGLE'}
                  disabled={anyBusy && busy !== 'GOOGLE'}
                />
              </View>
            )}

            {code && !codeSent && <Button label="Recevoir un code" onPress={onSendCode} loading={busy === 'CODE'} />}
            {code && codeSent && (
              <>
                <Button label="Confirmer" onPress={onConfirm} loading={busy === 'CONFIRM'} disabled={value.length === 0} />
                <View style={{ marginTop: spacing.sm }}>
                  <Button label="Renvoyer un code" variant="text" onPress={onSendCode} disabled={anyBusy} />
                </View>
              </>
            )}

            <View style={{ marginTop: spacing.xs }}>
              <Button label="Annuler" variant="text" onPress={onCancel} disabled={anyBusy} />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoider>
    </Modal>
  );
}

/**
 * Apple's own button, as `SocialAuthButtons.tsx` draws it (localized « Continuer avec Apple », Apple's
 * branding rules). A child component so the module is reached only on a path that probed it.
 */
function AppleConfirmButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const { radii } = useTheme();
  const mod = appleAuth();
  if (mod === null) return null;
  const AppleAuthenticationButton = mod.AppleAuthenticationButton;
  return (
    <AppleAuthenticationButton
      buttonType={mod.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={mod.AppleAuthenticationButtonStyle.BLACK}
      // 🛑 cornerRadius is a PROP, and BOTH dimensions are required or nothing renders (SocialAuthButtons.tsx).
      cornerRadius={radii.field}
      style={{ width: '100%', height: 52 }}
      onPress={disabled ? () => {} : onPress}
    />
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420 },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 19, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  error: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, lineHeight: 18 },
});
