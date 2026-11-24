import { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { Field } from '../../src/components/Field';
import { Button } from '../../src/components/Button';
import { Checkbox } from '../../src/components/Checkbox';
import { SocialAuthButtons } from '../../src/components/SocialAuthButtons';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { authClient } from '../../src/lib/auth-client';
import { applyModes } from '../../src/lib/apply-modes';
import { useSessionContext } from '../../src/lib/session';
import { afterSocialSignIn } from '../../src/lib/after-social-sign-in';
import { authErrorMessageFr, enterSignedInApp, signUpSchema } from '@revime/shared';
import type { ZodIssue } from 'zod';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

export default function Signup() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { palette, accent } = useTheme();
  const { refresh, me, session } = useSessionContext();
  const insets = useSafeAreaInsets();
  const createdAccountEmailRef = useRef<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cguAccepted, setCguAccepted] = useState(false);
  // V9 B1 (`DEC9-04` (2)): the privacy box, required like the CGU one.
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);


  const handleSubmit = async () => {
    setErrors({});
    setModeError(null);

    if (password !== confirmPassword) {
      setErrors({ confirmPassword: 'Les mots de passe ne correspondent pas' });
      return;
    }

    // Validate with zod
    const result = signUpSchema.safeParse({
      firstName,
      lastName,
      username,
      email,
      phone,
      password,
      cguAccepted,
      privacyAccepted,
      marketingConsent,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue: ZodIssue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0] as string] = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    // If user already created this account in the current flow and pressed "Back",
    // don't attempt to re-create the user in DB; proceed directly to verification.
    if (createdAccountEmailRef.current === email.trim().toLowerCase()) {
      setLoading(true);
      try {
        await refresh();
        router.push('/verification');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      // Sign up
      const signUpResult = await authClient.signUp.email({
        email,
        password,
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        // Zod canonicalised this to lowercase during validation; send the
        // canonical form, not the raw input - same rule as `phone` below.
        username: result.data.username,
        // Zod normalised this to E.164 during validation; send the canonical
        // form, not the raw input.
        phone: result.data.phone,
        // Pre-launch Item 2 & 3. CGU acceptance and optional marketing opt-in.
        cguAccepted: true,
        privacyAccepted: true,
        marketingConsent,
      });

      if (signUpResult.error) {
        // If the account already exists and is authenticated for this user, advance to verification
        if (
          signUpResult.error.code === 'USER_ALREADY_EXISTS' &&
          (me?.email === email.trim().toLowerCase() || (session as any)?.user?.email === email.trim().toLowerCase())
        ) {
          createdAccountEmailRef.current = email.trim().toLowerCase();
          await refresh();
          router.push('/verification');
          return;
        }

        // Translate the code, never the message: a repeat signup answers
        // USER_ALREADY_EXISTS, whose Better Auth `message` is English.
        const errorMessage = authErrorMessageFr(
          signUpResult.error.code,
          'Erreur lors de la création du compte.',
        );

        // Route the error to the field that caused it. A code, never a message:
        // Better Auth's `message` is English and authErrorMessageFr resolves codes.
        const field =
          signUpResult.error.code === 'CGU_REQUIRED'
            ? 'cgu'
            : signUpResult.error.code === 'PRIVACY_REQUIRED'
              ? 'privacy'
              : signUpResult.error.code === 'USERNAME_ALREADY_EXISTS' ||
                signUpResult.error.code === 'INVALID_USERNAME'
              ? 'username'
              : signUpResult.error.code === 'PHONE_ALREADY_EXISTS' ||
                  signUpResult.error.code === 'INVALID_PHONE'
                ? 'phone'
                : 'email';

        setErrors({ [field]: errorMessage });
        return;
      }

      createdAccountEmailRef.current = email.trim().toLowerCase();

      // Apply mode selection from role screen
      const repairerKind = params.kind === 'PRO' ? 'PRO' : params.repairer === '1' ? 'INDIVIDUAL' : undefined;
      try {
        await applyModes({
          client: params.client === '1',
          repairer: params.repairer === '1',
          kind: repairerKind,
        });
      } catch (modeErr) {
        // Mode application failed but account exists - show retry option
        setModeError('Compte créé, mais erreur lors de la configuration du mode. Veuillez réessayer.');
        return;
      }

      // Refresh session and navigate to verification (push preserves signup form in history for "Back")
      await refresh();
      router.push('/verification');
    } catch (error) {
      console.error('Signup error:', error);
      setErrors({ email: 'Une erreur est survenue. Veuillez réessayer.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRetryMode = async () => {
    setModeError(null);
    setLoading(true);
    const repairerKind = params.kind === 'PRO' ? 'PRO' : params.repairer === '1' ? 'INDIVIDUAL' : undefined;
    try {
      await applyModes({
        client: params.client === '1',
        repairer: params.repairer === '1',
        kind: repairerKind,
      });

      await refresh();
      router.push('/verification');
    } catch (error) {
      setModeError('Erreur lors de la configuration du mode. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAnyway = async () => {
    // Account exists with client mode enabled (server default)
    // User can enable repairer mode later from Profil screen
    await refresh();
    router.push('/verification');
  };

  // The social block gates itself now -- see SocialAuthButtons, which owns both
  // providers' prerequisites and renders nothing when neither is available. This
  // screen used to hold `EXPO_PUBLIC_GOOGLE_ENABLED` and hide the whole block with
  // it, which meant Google's readiness decided whether APPLE appeared.

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <ScreenMotif v={1} variant="accent" />
      <KeyboardAvoider style={styles.avoid}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: 22 + insets.top }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.head}>
              <BrandWordmark height={26} />
              <Text style={[styles.title, { color: palette.ink }]}>
                Créer votre compte
              </Text>
              <Text style={[styles.subtitle, { color: palette.muted }]}>
                Rejoignez Revime pour réparer ou proposer vos services.
              </Text>
            </View>

            {modeError && (
              <View style={[styles.banner, { backgroundColor: accent.accentSoft, borderColor: accent.accent }]}>
                <Text style={[styles.bannerText, { color: accent.accentDeep }]}>{modeError}</Text>
                <View style={styles.bannerActions}>
                  <Pressable onPress={handleRetryMode} disabled={loading}>
                    <Text style={[styles.bannerLink, { color: accent.accent }]}>Réessayer</Text>
                  </Pressable>
                  <Text style={[styles.bannerSeparator, { color: accent.accentDeep }]}>·</Text>
                  <Pressable onPress={handleContinueAnyway} disabled={loading}>
                    <Text style={[styles.bannerLink, { color: accent.accent }]}>Continuer quand même</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <SocialAuthButtons
              disabled={loading}
              onSignedIn={async () => {
                // V9 B1 (`FND9-017` (b)): the role picked before this screen is applied, not asked again.
                const chose = params.client === '1' || params.repairer === '1';
                const next = await afterSocialSignIn(
                  chose
                    ? {
                        client: params.client === '1',
                        repairer: params.repairer === '1',
                        ...(params.repairer === '1' ? { kind: params.kind === 'PRO' ? ('PRO' as const) : ('INDIVIDUAL' as const) } : {}),
                      }
                    : undefined,
                );
                await refresh();
                // CF4-47: clear the auth screens, not just this one.
                enterSignedInApp(router, next);
              }}
            />

            <View style={styles.form}>
              <Field
                label="Prénom"
                value={firstName}
                onChangeText={setFirstName}
                error={errors.firstName}
                autoComplete="given-name"
                autoCapitalize="words"
                placeholder="Camille"
                editable={!loading}
              />
              <Field
                label="Nom"
                value={lastName}
                onChangeText={setLastName}
                error={errors.lastName}
                autoComplete="family-name"
                autoCapitalize="words"
                placeholder="Martin"
                editable={!loading}
              />
              <Field
                label="Nom d'utilisateur"
                value={username}
                onChangeText={setUsername}
                error={errors.username}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                placeholder="camille_m"
                editable={!loading}
              />
              <Text style={[styles.helper, { color: palette.muted }]}>
                C'est ce que les autres utilisateurs voient. Votre nom et votre prénom
                restent privés.
              </Text>
              <Field
                label="Adresse e-mail"
                value={email}
                onChangeText={setEmail}
                error={errors.email}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!loading}
              />
              <Field
                label="Téléphone"
                value={phone}
                onChangeText={setPhone}
                error={errors.phone}
                autoComplete="tel"
                keyboardType="phone-pad"
                placeholder="06 12 34 56 78"
                editable={!loading}
              />
              <Field
                label="Mot de passe"
                value={password}
                onChangeText={setPassword}
                error={errors.password}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
                editable={!loading}
              />
              <Field
                label="Confirmer le mot de passe"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={errors.confirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
                editable={!loading}
              />

              {/* Pre-launch Item 2: Mandatory CGU acceptance */}
              <View style={{ marginTop: 8, marginBottom: 4 }}>
                <Checkbox
                  checked={cguAccepted}
                  onPress={() => setCguAccepted(!cguAccepted)}
                  disabled={loading}
                  error={Boolean(errors.cguAccepted || errors.cgu)}
                >
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 13.5,
                      lineHeight: 19,
                      color: palette.ink,
                    }}
                  >
                    J&apos;accepte les{' '}
                    <Text
                      style={{ color: accent.accent, textDecorationLine: 'underline' }}
                      onPress={() => router.push('/legal/cgu')}
                    >
                      Conditions générales d&apos;utilisation
                    </Text>
                  </Text>
                </Checkbox>
                {(errors.cguAccepted || errors.cgu) && (
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_500Medium',
                      fontSize: 12,
                      color: palette.red,
                      marginLeft: 30,
                      marginTop: 2,
                    }}
                  >
                    {errors.cguAccepted || errors.cgu}
                  </Text>
                )}
              </View>

              {/* V9 B1 (`DEC9-04` (2), `DEC9-05` (4)): the privacy box, required, the mockup's wording. */}
              <View style={{ marginBottom: 16 }}>
                <Checkbox
                  checked={privacyAccepted}
                  onPress={() => setPrivacyAccepted(!privacyAccepted)}
                  disabled={loading}
                  error={Boolean(errors.privacyAccepted || errors.privacy)}
                >
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 13.5,
                      lineHeight: 19,
                      color: palette.ink,
                    }}
                  >
                    J&apos;accepte la{' '}
                    <Text
                      style={{ color: accent.accent, textDecorationLine: 'underline' }}
                      onPress={() => router.push('/legal/confidentialite')}
                    >
                      Politique de confidentialité
                    </Text>
                  </Text>
                </Checkbox>
                {(errors.privacyAccepted || errors.privacy) && (
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_500Medium',
                      fontSize: 12,
                      color: palette.red,
                      marginLeft: 30,
                      marginTop: 2,
                    }}
                  >
                    {errors.privacyAccepted || errors.privacy}
                  </Text>
                )}
              </View>

              {/* Pre-launch Item 3: Optional marketing consent */}
              <View style={{ marginBottom: 16 }}>
                <Checkbox
                  checked={marketingConsent}
                  onPress={() => setMarketingConsent(!marketingConsent)}
                  disabled={loading}
                >
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_400Regular',
                      fontSize: 13,
                      lineHeight: 18.5,
                      color: palette.muted,
                    }}
                  >
                    J&apos;accepte de recevoir des communications commerciales de REVIME par e-mail et SMS (facultatif).
                  </Text>
                </Checkbox>
              </View>
            </View>

            <View style={styles.action}>
              <Button label="Créer mon compte" onPress={handleSubmit} loading={loading} />
            </View>

            <View style={styles.foot}>
              <Text style={[styles.footText, { color: palette.muted }]}>
                Vous avez déjà un compte ?{' '}
                <Text
                  style={[styles.link, { color: accent.accent }]}
                  onPress={() => router.push('/(auth)/login')}
                >
                  Se connecter
                </Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoider>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  avoid: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 26,
  },
  content: {
    flex: 1,
    zIndex: 2,
    gap: 20,
  },
  head: {
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 22,
    letterSpacing: -0.2,
    marginTop: 10,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  banner: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
  },
  bannerText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  bannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerLink: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
  },
  bannerSeparator: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
  },
  form: {
    gap: 4,
  },
  action: {
    marginTop: 8,
  },
  foot: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingTop: 16,
  },
  footText: {
    fontSize: 13,
    lineHeight: 20,
  },
  helper: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: -2,
    marginBottom: 6,
  },
  link: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
