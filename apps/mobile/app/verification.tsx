import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { frPhoneSchema } from '@revime/shared';
import { useTheme } from '../src/theme';
import { Field } from '../src/components/Field';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { ScreenMotif } from '../src/components/ScreenMotif';
import { useSessionContext } from '../src/lib/session';
import { authClient } from '../src/lib/auth-client';
import { ApiError } from '../src/lib/api';
import { routeAfterOnboarding } from '../src/lib/repairer-entry';
import { useCheckPhoneVerification, useStartPhoneVerification } from '../src/lib/queries';
import { signOutAndLeave } from '../src/lib/sign-out';
import { KeyboardAvoider } from '../src/components/KeyboardAvoider';

/**
 * A one-second countdown, so a resend cannot be tapped inside the cooldown.
 *
 * Seeded from the server's own `retryAfterSeconds` rather than a duplicated
 * constant, so the number on screen cannot drift from the rule being enforced.
 */
function useCountdown(): [number, (seconds: number) => void] {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  return [remaining, setRemaining];
}

/** Per-channel state. The level alone cannot show which half is outstanding. */
function StatusPill({ done }: { done: boolean }) {
  const { palette, accent } = useTheme();
  return (
    <View
      style={[
        styles.pill,
        done
          ? { backgroundColor: accent.accentSoft, borderColor: accent.accent }
          : { backgroundColor: palette.mist, borderColor: palette.line },
      ]}
    >
      <Text style={[styles.pillText, { color: done ? accent.accentDeep : palette.muted }]}>
        {done ? 'Confirmé' : 'À confirmer'}
      </Text>
    </View>
  );
}

/**
 * « Confirmez votre compte » - the email and phone OTP flow.
 *
 * 🛑 NOT `/statut-verification`, which REPORTS where the three verification levels stand
 * (identité, informations professionnelles, profil réparateur). Two routes one word apart:
 * this one COLLECTS codes, that one REPORTS status. Do not merge them.
 */
export default function Verification() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { palette, accent, spacing } = useTheme();
  const { me, refresh } = useSessionContext();
  const insets = useSafeAreaInsets();

  const [emailSent, setEmailSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [emailCooldown, setEmailCooldown] = useCountdown();
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [phone, setPhone] = useState(me?.phone ?? '');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneCooldown, setPhoneCooldown] = useCountdown();

  useEffect(() => {
    if (me?.phone && !phone) {
      setPhone(me.phone);
    }
  }, [me?.phone]);
  /**
   * Two error slots, not one.
   *
   * A send failure belongs under the number field and a check failure under the
   * code field. Sharing one state is a defect this project already carries in
   * profil.tsx, where a mode-switch failure renders under the postal-code input,
   * and it is logged as a deferred minor. No reason to add a second instance.
   */
  const [phoneSendError, setPhoneSendError] = useState<string | null>(null);
  const [phoneCodeError, setPhoneCodeError] = useState<string | null>(null);

  const startPhone = useStartPhoneVerification();
  const checkPhone = useCheckPhoneVerification();

  const emailDone = me?.emailVerified === true;
  const phoneDone = me?.phoneVerified === true;
  const bothVerified = emailDone && phoneDone;

  useEffect(() => {
    if (bothVerified) {
      routeAfterOnboarding(router, me?.profile.repairerEnabled === true);
    }
  }, [bothVerified, router, me?.profile.repairerEnabled]);

  const sendEmailCode = async (): Promise<void> => {
    if (!me?.email || emailCooldown > 0) return;
    setEmailError(null);
    setEmailBusy(true);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: me.email,
        type: 'email-verification',
      });
      if (result.error) {
        setEmailError('Envoi impossible. Réessayez dans un instant.');
        return;
      }
      setEmailSent(true);
      setEmailCooldown(60);
    } catch {
      setEmailError('Envoi impossible. Vérifiez votre connexion.');
    } finally {
      setEmailBusy(false);
    }
  };

  const submitEmailCode = async (): Promise<void> => {
    if (!me?.email || emailCode.trim().length !== 6) return;
    setEmailError(null);
    setEmailBusy(true);
    try {
      const result = await authClient.emailOtp.verifyEmail({
        email: me.email,
        otp: emailCode.trim(),
      });
      if (result.error) {
        setEmailError('Code incorrect ou expiré. Demandez un nouveau code.');
        return;
      }
      setEmailCode('');
      await refresh();
    } catch {
      setEmailError('Code incorrect ou expiré. Demandez un nouveau code.');
    } finally {
      setEmailBusy(false);
    }
  };

  const sendPhoneCode = async (): Promise<void> => {
    if (phoneCooldown > 0) return;
    setPhoneSendError(null);

    const parsed = frPhoneSchema.safeParse(phone);
    if (!parsed.success) {
      setPhoneSendError(parsed.error.issues[0]?.message ?? 'Numéro invalide.');
      return;
    }

    try {
      const { retryAfterSeconds } = await startPhone.mutateAsync(parsed.data);
      setPhone(parsed.data);
      setPhoneSent(true);
      setPhoneCooldown(retryAfterSeconds);
    } catch (err) {
      setPhoneSendError(
        err instanceof ApiError ? (err.fields?.phone ?? err.message) : 'Envoi impossible.',
      );
    }
  };

  const submitPhoneCode = async (): Promise<void> => {
    if (phoneCode.trim().length !== 6) return;
    setPhoneCodeError(null);
    try {
      await checkPhone.mutateAsync({ phone, code: phoneCode.trim() });
      setPhoneCode('');
      await refresh();
    } catch (err) {
      setPhoneCodeError(err instanceof ApiError ? err.message : 'Vérification impossible.');
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <ScreenMotif v={2} variant="accent" />
      {/* Same shape as signup.tsx, login.tsx and forgot-password.tsx. Without it
          the ScrollView is never inset for the keyboard, and this screen puts the
          phone field below a full email card, so it sat underneath the keyboard
          with nothing the user could do about it.

          keyboardShouldPersistTaps is part of the same fix rather than a nicety:
          without it the first tap on a Confirmer button is consumed dismissing
          the keyboard, so every submit needs two taps. */}
      <KeyboardAvoider style={styles.avoid}>
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
        <Text style={[styles.title, { color: palette.ink }]}>Confirmez votre compte</Text>
        <Text style={[styles.intro, { color: palette.muted }]}>
          Pour utiliser pleinement REVIME, confirmez votre adresse email et votre numéro de mobile. Un code à 6 chiffres vous sera envoyé par email et par SMS après avoir cliqué sur « Recevoir le code ».
        </Text>

        {bothVerified && (
          <View
            style={[
              styles.banner,
              { backgroundColor: accent.accentSoft, borderColor: accent.accent },
            ]}
          >
            <Text style={[styles.bannerText, { color: accent.accentDeep }]}>
              Votre compte est confirmé. Vous pouvez maintenant continuer.
            </Text>
          </View>
        )}

        {/* Email */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>ADRESSE E-MAIL</Text>
            <StatusPill done={emailDone} />
          </View>
          <Text style={[styles.target, { color: palette.ink }]}>{me?.email}</Text>
          {!emailDone && (
            <>
              {!emailSent ? (
                <>
                  <Button
                    label="Recevoir le code par e-mail"
                    loading={emailBusy}
                    disabled={!me?.email}
                    onPress={() => void sendEmailCode()}
                  />
                  {emailError && (
                    <Text style={[styles.hint, { color: palette.red, marginTop: spacing.sm }]}>
                      {emailError}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Field
                    label="Code reçu par e-mail"
                    value={emailCode}
                    onChangeText={(text) => {
                      setEmailCode(text);
                      setEmailError(null);
                    }}
                    error={emailError ?? undefined}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="123456"
                  />
                  <Button
                    label="Confirmer l'e-mail"
                    disabled={emailCode.trim().length !== 6}
                    loading={emailBusy}
                    onPress={() => void submitEmailCode()}
                  />
                  <Pressable
                    onPress={() => void sendEmailCode()}
                    disabled={emailCooldown > 0}
                    style={styles.resend}
                  >
                    <Text
                      style={[
                        styles.resendText,
                        { color: emailCooldown > 0 ? palette.muted : accent.accent },
                      ]}
                    >
                      {emailCooldown > 0 ? `Renvoyer dans ${emailCooldown} s` : 'Renvoyer le code'}
                    </Text>
                  </Pressable>
                </>
              )}
            </>
          )}
        </Card>

        {/* Phone */}
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>NUMÉRO DE MOBILE</Text>
            <StatusPill done={phoneDone} />
          </View>
          {phoneDone ? (
            <Text style={[styles.target, { color: palette.ink }]}>{me?.phone}</Text>
          ) : (
            <>
              <Field
                label="Votre mobile"
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  setPhoneSendError(null);
                }}
                error={phoneSendError ?? undefined}
                keyboardType="phone-pad"
                placeholder="06 12 34 56 78"
              />
              <Button
                label={phoneSent ? 'Renvoyer un code SMS' : 'Recevoir un code par SMS'}
                disabled={phoneCooldown > 0 || phone.trim().length === 0}
                loading={startPhone.isPending}
                onPress={() => void sendPhoneCode()}
              />
              {phoneCooldown > 0 && (
                <Text style={[styles.hint, { color: palette.muted }]}>
                  Nouveau code possible dans {phoneCooldown} s.
                </Text>
              )}

              {phoneSent && (
                <View style={{ marginTop: spacing.md }}>
                  <Field
                    label="Code reçu par SMS"
                    value={phoneCode}
                    onChangeText={(text) => {
                      setPhoneCode(text);
                      setPhoneCodeError(null);
                    }}
                    error={phoneCodeError ?? undefined}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="123456"
                  />
                  <Button
                    label="Confirmer le numéro"
                    disabled={phoneCode.trim().length !== 6}
                    loading={checkPhone.isPending}
                    onPress={() => void submitPhoneCode()}
                  />
                </View>
              )}
            </>
          )}
        </Card>

        <View style={styles.actions}>
          <Button
            label="Continuer"
            disabled={!bothVerified}
            onPress={async () => {
              await refresh();
              routeAfterOnboarding(router, me?.profile.repairerEnabled === true);
            }}
          />
          <Button
            label="Retour"
            variant="text"
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                // Stack was wiped by router.replace() from (tabs)/_layout.tsx.
                // Sign out so the user can start fresh or log in with a different account.
                void signOutAndLeave({
                  queryClient,
                  router,
                });
              }
            }}
          />
        </View>
        </ScrollView>
      </KeyboardAvoider>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    marginTop: 8,
  },
  screen: { flex: 1 },
  avoid: { flex: 1 },
  // flexGrow rather than flex, matching the other form screens: the content must
  // be able to exceed the viewport once the keyboard has taken half of it.
  container: { flexGrow: 1, paddingHorizontal: 20 },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 22, marginBottom: 8 },
  intro: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, lineHeight: 19, marginBottom: 22 },
  banner: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 18,
  },
  bannerText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12.5, lineHeight: 17.4 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'GoogleSansFlex_600SemiBold',
    letterSpacing: 0.5,
  },
  target: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, marginBottom: 12 },
  hint: { fontSize: 12, lineHeight: 17.4, marginTop: 8 },
  resend: { paddingVertical: 12, alignItems: 'center' },
  resendText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 11 },
});
