/**
 * Password Reset Request Screen
 *
 * Note: With MAIL_DRIVER=console in development (Étape 3a spec §4.5), no email
 * actually arrives. The reset link is in the API logs. This is expected behavior.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { Field } from '../../src/components/Field';
import { Button } from '../../src/components/Button';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { authClient } from '../../src/lib/auth-client';
import { forgotPasswordSchema } from '@revime/shared';
import type { ZodIssue } from 'zod';
import { IconMail } from '../../src/icons';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

export default function ForgotPassword() {
  const router = useRouter();
  const { palette, accent, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setErrors({});

    // Validate with zod
    const result = forgotPasswordSchema.safeParse({ email });
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
      /**
       * 🛑 CF4-44. `requestPasswordReset`, NOT `forgetPassword`. Better Auth 1.6 serves only
       * `/request-password-reset`; the old name hit a route that does not exist, and because
       * Better Auth's client RETURNS an error instead of throwing, this screen showed « Vérifiez
       * votre boîte mail » while no e-mail was ever sent. Pinned by
       * apps/api/test/auth-two-factor-and-reset.spec.ts.
       */
      const res = await authClient.requestPasswordReset({
        email,
        redirectTo: 'revime://reset-password',
      });
      // Logged, never shown: the screen must not reveal whether the address has an account.
      if (res?.error) {
        console.warn('Password reset request failed:', res.error.status ?? null, res.error.code ?? null);
      }

      // Always show success message regardless of whether the email exists
      // This prevents account enumeration attacks
      setSubmitted(true);
    } catch (error) {
      console.error('Password reset request error:', error);
      // Still show success to prevent enumeration
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.paper }]}>
        <ScreenMotif v={3} variant="accent" />
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: 22 + insets.top }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.successIcon}>
              <View style={[styles.iconCircle, { backgroundColor: accent.accentSoft }]}>
                <IconMail size={32} color={accent.accent} strokeWidth={2} />
              </View>
            </View>

            <View style={styles.head}>
              <Text style={[styles.title, { color: palette.ink }]}>
                Vérifiez votre boîte mail
              </Text>
              <Text style={[styles.subtitle, { color: palette.muted }]}>
                Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.
              </Text>
            </View>

            <View style={styles.action}>
              <Button
                label="Retour à la connexion"
                onPress={() => router.push('/(auth)/login')}
                variant="secondary"
              />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <ScreenMotif v={3} variant="accent" />
      <KeyboardAvoider style={styles.avoid}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: 22 + insets.top }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.head}>
              <BrandWordmark height={26} />
              <Text style={[styles.title, { color: palette.ink }]}>
                Mot de passe oublié ?
              </Text>
              <Text style={[styles.subtitle, { color: palette.muted }]}>
                Entrez votre adresse e-mail pour recevoir un lien de réinitialisation.
              </Text>
            </View>

            <View style={styles.form}>
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
            </View>

            <View style={styles.action}>
              <Button label="Envoyer le lien" onPress={handleSubmit} loading={loading} />
            </View>

            <View style={styles.foot}>
              <Text style={[styles.footText, { color: palette.muted }]}>
                Vous vous souvenez de votre mot de passe ?{' '}
                <Text
                  style={[styles.link, { color: accent.accent }]}
                  onPress={() => router.back()}
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
  link: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
  },
  successIcon: {
    alignItems: 'center',
    marginVertical: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
