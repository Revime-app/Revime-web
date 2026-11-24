import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { Field } from '../../src/components/Field';
import { Button } from '../../src/components/Button';
import { ScreenMotif } from '../../src/components/ScreenMotif';
import { BrandWordmark } from '../../src/components/BrandWordmark';
import { authClient } from '../../src/lib/auth-client';
import { authErrorMessageFr } from '@revime/shared';
import { z } from 'zod';
import { IconLock } from '../../src/icons';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas.',
  path: ['confirmPassword'],
});

export default function ResetPassword() {
  const router = useRouter();
  const { palette, accent, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { token, error: tokenError } = useLocalSearchParams<{ token: string; error?: string }>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrors({});
    setSubmitError(null);

    const result = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0] as string] = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    if (!token) {
      setSubmitError('Lien de réinitialisation invalide ou manquant.');
      return;
    }

    setLoading(true);
    try {
      const res = await authClient.resetPassword({
        newPassword: password,
        token: token,
      });
      
      if (res.error) {
        setSubmitError(
          authErrorMessageFr(res.error.code, 'La réinitialisation a échoué. Le lien est peut-être expiré.'),
        );
      } else {
        setSubmitted(true);
      }
    } catch (error) {
      console.error('Password reset error:', error);
      setSubmitError('Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  };

  if (tokenError) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.paper }]}>
        <ScreenMotif v={3} variant="accent" />
        <ScrollView contentContainerStyle={[styles.container, { paddingTop: 22 + insets.top }]}>
          <View style={styles.content}>
            <Text style={[styles.title, { color: palette.ink, textAlign: 'center' }]}>Lien invalide</Text>
            <Text style={[styles.body, { color: palette.muted, textAlign: 'center', marginTop: 10 }]}>
              {tokenError}
            </Text>
            <View style={{ marginTop: 24 }}>
              <Button label="Retour à la connexion" onPress={() => router.replace('/(auth)/login')} />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (submitted) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.paper }]}>
        <ScreenMotif v={3} variant="accent" />
        <ScrollView contentContainerStyle={[styles.container, { paddingTop: 22 + insets.top }]}>
          <View style={styles.content}>
            <View style={styles.successIcon}>
              <View style={[styles.iconCircle, { backgroundColor: accent.accentSoft }]}>
                <IconLock size={32} color={accent.accent} strokeWidth={2} />
              </View>
            </View>
            <Text style={[styles.title, { color: palette.ink, textAlign: 'center', marginTop: 24 }]}>
              Mot de passe modifié !
            </Text>
            <Text style={[styles.body, { color: palette.muted, textAlign: 'center', marginTop: 12 }]}>
              Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.
            </Text>
            <View style={{ marginTop: 32 }}>
              <Button label="Retour à la connexion" onPress={() => router.replace('/(auth)/login')} />
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoider style={[styles.screen, { backgroundColor: palette.paper }]}>
      <ScreenMotif v={3} variant="accent" />
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: 22 + insets.top }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.wordmark}>
          <BrandWordmark />
        </View>

        <View style={styles.content}>
          <Text style={[styles.title, { color: palette.ink }]}>Réinitialiser</Text>
          <Text style={[styles.body, { color: palette.muted, marginTop: 8 }]}>
            Entrez votre nouveau mot de passe ci-dessous.
          </Text>

          {submitError && (
            <Text style={[styles.errorAlert, { color: accent.accentDeep, backgroundColor: accent.accentSoft }]}>
              {submitError}
            </Text>
          )}

          <View style={styles.form}>
            <Field
              label="Nouveau mot de passe"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="new-password"
            />
            
            <Field
              label="Confirmer le mot de passe"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={errors.confirmPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="new-password"
            />

            <View style={{ marginTop: spacing.md }}>
              <Button label="Enregistrer le mot de passe" onPress={handleSubmit} loading={loading} />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flexGrow: 1 },
  wordmark: { alignSelf: 'center', marginTop: 32, marginBottom: 48 },
  content: { paddingHorizontal: 20 },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 26, letterSpacing: -0.5 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 16, lineHeight: 24 },
  errorAlert: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 14,
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    overflow: 'hidden',
  },
  form: { marginTop: 32, gap: 16 },
  successIcon: { alignItems: 'center' },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
