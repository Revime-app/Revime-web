import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { Field } from '../../src/components/Field';
import { Button } from '../../src/components/Button';
import { SocialAuthButtons } from '../../src/components/SocialAuthButtons';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { authClient } from '../../src/lib/auth-client';
import { useSessionContext } from '../../src/lib/session';
import { afterSocialSignIn } from '../../src/lib/after-social-sign-in';
import { authErrorMessageFr, enterSignedInApp, needsTwoFactor, signInSchema } from '@revime/shared';
import type { ZodIssue } from 'zod';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

export default function Login() {
  const router = useRouter();
  const { palette, accent } = useTheme();
  const { refresh } = useSessionContext();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setErrors({});
    setGeneralError(null);

    // Validate with zod
    const result = signInSchema.safeParse({ email, password });
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

    setLoading(true);
    try {
      const signInResult = await authClient.signIn.email({
        email,
        password,
      });

      if (signInResult.error) {
        // Translate the code, never the message: Better Auth's `message` is
        // English, so rendering it put "Invalid email or password" on screen.
        setGeneralError(authErrorMessageFr(signInResult.error.code, 'Identifiants incorrects.'));
        return;
      }

      /**
       * 🛑 CF4-52. Since CF4-51 the server never challenges the app (2FA is dashboard-only), so the
       * code step that lived here (CF4-43) is gone. This guard stays: if a 2FA challenge ever came
       * back, the answer has NO session, and treating it as success looped the user back to an
       * empty login screen. Better a clear message than that loop.
       */
      if (needsTwoFactor(signInResult.data)) {
        setGeneralError('Connexion impossible pour le moment. Veuillez réessayer.');
        return;
      }

      // Refresh session and navigate. `enterSignedInApp`, not `replace`: CF4-47.
      await refresh();
      enterSignedInApp(router, '/(tabs)');
    } catch (error) {
      console.error('Login error:', error);
      setGeneralError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  // The social block gates itself now -- see SocialAuthButtons, which owns both
  // providers' prerequisites and renders nothing when neither is available. This
  // screen used to hold `EXPO_PUBLIC_GOOGLE_ENABLED` and hide the whole block with
  // it, which meant Google's readiness decided whether APPLE appeared.

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <ScreenMotif v={2} variant="accent" />
      <KeyboardAvoider style={styles.avoid}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: 22 + insets.top }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.head}>
              <BrandWordmark height={26} />
              <Text style={[styles.title, { color: palette.ink }]}>
                Bon retour !
              </Text>
              <Text style={[styles.subtitle, { color: palette.muted }]}>
                Connectez-vous pour accéder à votre compte.
              </Text>
            </View>

            {generalError && (
              <View style={[styles.errorBanner, { backgroundColor: palette.redSoft, borderColor: palette.red }]}>
                <Text style={[styles.errorText, { color: palette.redDeep }]}>{generalError}</Text>
              </View>
            )}

            <SocialAuthButtons
              disabled={loading}
              onSignedIn={async () => {
                const next = await afterSocialSignIn();
                await refresh();
                enterSignedInApp(router, next);
              }}
            />

            <View style={styles.form}>
              <Field
                label="Adresse e-mail"
                value={email}
                onChangeText={setEmail}
                error={errors.email}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                editable={!loading}
              />
              <Field
                label="Mot de passe"
                value={password}
                onChangeText={setPassword}
                error={errors.password}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                editable={!loading}
              />
            </View>

            <View style={styles.forgot}>
              <Pressable onPress={() => router.push('/(auth)/forgot-password')}>
                <Text style={[styles.forgotText, { color: accent.accent }]}>
                  Mot de passe oublié ?
                </Text>
              </Pressable>
            </View>

            <View style={styles.action}>
              <Button label="Se connecter" onPress={handleSubmit} loading={loading} />
            </View>

            <View style={styles.foot}>
              <Text style={[styles.footText, { color: palette.muted }]}>
                Vous n'avez pas de compte ?{' '}
                {/**
                 * 🛑 `push('/(auth)/roles')`, not `router.back()`. Changed 2026-08-21 with the
                 * sign-out fix, and it was load-bearing rather than tidying.
                 *
                 * `back()` was only ever correct because login had exactly one entrance:
                 * `signup.tsx` pushes it, so popping landed on signup. Sign-out now replaces
                 * straight to this screen, and from THAT entry there is nothing to pop to -
                 * `back()` would either do nothing or escape into the signed-out tabs.
                 *
                 * The target is `roles`, not `signup`, because signup reads its mode from
                 * `params.client` / `params.repairer` (`roles.tsx:124` sets them). Going
                 * straight to signup would create an account with neither mode chosen.
                 */}
                <Text
                  style={[styles.link, { color: accent.accent }]}
                  onPress={() => router.push('/(auth)/roles')}
                >
                  S'inscrire
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
  errorBanner: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  errorText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  form: {
    gap: 4,
  },
  forgot: {
    alignItems: 'flex-end',
    marginTop: -8,
  },
  forgotText: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 13,
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
  link: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
});
