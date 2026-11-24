import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SettingsRow, SettingsSection } from '../../src/components/SettingsRow';
import { Field } from '../../src/components/Field';
import { Button } from '../../src/components/Button';
import { authClient } from '../../src/lib/auth-client';
import { useSessionContext } from '../../src/lib/session';
import { useTheme } from '../../src/theme';
import { RevimeLoader } from '../../src/components/lottie/RevimeLoader';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

/**
 * `CF-47` task 11. Sécurité: change password, revoke other sessions, deletion entry point.
 *
 * 🛑 THREE BETTER AUTH METHODS CALLED HERE HAVE NEVER RUN AGAINST THIS SERVER BEFORE THIS SLICE.
 * A green typecheck proves the call signatures match the installed types and proves NOTHING about
 * the runtime. The methods are: `listAccounts()`, `changePassword(...)`, `revokeOtherSessions()`.
 *
 * 🛑 `/change-password` runs behind `sensitiveSessionMiddleware` (auth.ts), so a live session is
 * not automatically sufficient. Handle a rejection rather than assuming success.
 *
 * 🛑 `revokeOtherSessions: true` on password change is deliberate and non-optional. A password
 * change that leaves other devices signed in is not a security control. Sessions last 60 days
 * (auth.ts:114), so this is a real action with visible consequences on the user's other devices.
 */
export default function SecuriteScreen() {
  const { palette, spacing, type } = useTheme();
  const { me } = useSessionContext();

  // Normalize: a new field from a stale API arrives `undefined`, and `undefined !== null` passes every null guard.
  const email = me?.email ?? null;

  const [hasPassword, setHasPassword] = useState<boolean | null>(null); // null = checking
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  /**
   * Check whether this account has a password at all. A social signup has no credential Account
   * row, so there is no password to change. `listAccounts` is a plain async method, NOT a hook.
   */
  useEffect(() => {
    const checkPassword = async () => {
      try {
        const accounts = await authClient.listAccounts();
        /**
         * 🛑 The `any` cast exists because Better Auth's SDK exported types do not match the
         * runtime shape. The field name `providerId` is verified correct against
         * `node_modules/better-auth/dist/api/routes/account.mjs:15`, which declares
         * `/list-accounts` items with a required `providerId` property. If this field name
         * ever drifts, `hasPassword` would be `false` for everyone and every password-holding
         * user would be falsely told their account signs in with Google or Apple.
         */
        const credential = (accounts.data ?? []).some((a: any) => a.providerId === 'credential');
        setHasPassword(credential);
      } catch (e) {
        console.error('[securite] listAccounts failed', e);
        // Fall back to assuming password exists, so we render the change form rather than nothing.
        setHasPassword(true);
      }
    };
    void checkPassword();
  }, []);

  const handleChangePassword = async () => {
    if (saving || !currentPassword.trim() || !newPassword.trim()) return;
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      /**
       * `revokeOtherSessions: true` is deliberate: a password change that leaves other devices
       * signed in is not a security control. Sessions last 60 days, so this is a real action.
       */
      const { error: err } = await authClient.changePassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
        revokeOtherSessions: true,
      });

      if (err) {
        /**
         * Map Better Auth error codes to French. Never surface an English library message.
         * Known codes: CREDENTIAL_ACCOUNT_NOT_FOUND, INVALID_PASSWORD, PASSWORD_TOO_SHORT, PASSWORD_TOO_LONG.
         */
        const code = (err as any)?.code ?? '';
        if (code === 'CREDENTIAL_ACCOUNT_NOT_FOUND') {
          // The proactive check was wrong; this account has no password. Fall back to the no-password branch.
          setHasPassword(false);
          setError(null);
        } else if (code === 'INVALID_PASSWORD') {
          setError('Le mot de passe actuel est incorrect.');
        } else if (code === 'PASSWORD_TOO_SHORT') {
          setError('Le mot de passe est trop court.');
        } else if (code === 'PASSWORD_TOO_LONG') {
          setError('Le mot de passe est trop long.');
        } else {
          console.error('[securite] changePassword unrecognised error', err);
          setError('Une erreur est survenue.');
        }
      } else {
        // Success
        setSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (e) {
      console.error('[securite] changePassword exception', e);
      setError('Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeOtherSessions = async () => {
    if (revoking) return;
    setRevoking(true);
    try {
      await authClient.revokeOtherSessions();
      Alert.alert('Terminé', 'Les autres appareils ont été déconnectés.');
    } catch (e) {
      console.error('[securite] revokeOtherSessions failed', e);
      Alert.alert('Erreur', 'Impossible de déconnecter les autres appareils. Merci de réessayer.');
    } finally {
      setRevoking(false);
    }
  };

  const confirmRevokeOtherSessions = () => {
    Alert.alert(
      'Déconnecter les autres appareils',
      'Les sessions durent 60 jours. Cette action déconnectera tous vos autres appareils. Vous devrez vous reconnecter sur ceux-ci.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          style: 'destructive',
          onPress: handleRevokeOtherSessions,
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
      <ScreenHeader title="Sécurité" onBack={() => router.back()} />
      <KeyboardAvoider>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* Checking password status */}
        {hasPassword === null && (
          <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
            <RevimeLoader variant="fill" size={72} />
          </View>
        )}

        {/* Has password: change password form */}
        {hasPassword === true && (
          <SettingsSection title="Mot de passe">
            <View style={{ padding: spacing.lg }}>
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_600SemiBold',
                  fontSize: 14,
                  color: palette.ink,
                  marginBottom: spacing.md,
                }}
              >
                Changer le mot de passe
              </Text>

              <Field
                label="Mot de passe actuel"
                value={currentPassword}
                onChangeText={(t) => {
                  setCurrentPassword(t);
                  setError(null);
                  setSuccess(false);
                }}
                placeholder="Votre mot de passe actuel"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
              />

              <Field
                label="Nouveau mot de passe"
                value={newPassword}
                onChangeText={(t) => {
                  setNewPassword(t);
                  setError(null);
                  setSuccess(false);
                }}
                placeholder="Votre nouveau mot de passe"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
              />

              {error && (
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: type.body.size,
                    color: palette.red,
                    marginTop: -spacing.xs,
                    marginBottom: spacing.md,
                  }}
                >
                  {error}
                </Text>
              )}

              {success && (
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: type.body.size,
                    color: palette.green,
                    marginTop: -spacing.xs,
                    marginBottom: spacing.md,
                  }}
                >
                  Mot de passe modifié avec succès
                </Text>
              )}

              <Button
                label="Enregistrer"
                onPress={handleChangePassword}
                loading={saving}
                disabled={!currentPassword.trim() || !newPassword.trim()}
              />
            </View>
          </SettingsSection>
        )}

        {/* No password: social-only account
            🛑 NO « Définir un mot de passe » BUTTON. Better Auth's `setPassword` is declared
            `createAuthEndpoint.serverOnly(...)` (v1.6.23), so `authClient.setPassword()` is not
            callable from the client - the clean path does not exist. And `reset-password` takes
            `newPassword` + `token` and is documented against an existing credential account;
            nothing says it creates one when there is none. So sending a social-only user through
            forgot-password may produce an e-mail whose link then fails.

            The prose is adequate rather than a compromise: a social-only account signs in with
            Google or Apple and does not need a password. Keep the section visible - a section
            that vanishes reads as a feature the app lost. This is the same shape as the disabled
            message composer and the garantie field for non-verified réparateurs: render and
            explain, rather than hide. */}
        {hasPassword === false && (
          <SettingsSection title="Mot de passe">
            <View style={{ padding: spacing.lg }}>
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_400Regular',
                  fontSize: type.body.size,
                  color: palette.muted,
                  lineHeight: type.body.size * 1.5,
                }}
              >
                Votre compte se connecte avec Google ou Apple. Vous ne pouvez pas ajouter de mot de
                passe à ce compte.
              </Text>
            </View>
          </SettingsSection>
        )}

        {/* Sign out other devices */}
        {hasPassword !== null && (
          <SettingsSection title="Sessions">
            <SettingsRow
              label="Déconnecter les autres appareils"
              onPress={confirmRevokeOtherSessions}
              last
            />
          </SettingsSection>
        )}

        {/* Deletion entry point */}
        {hasPassword !== null && (
          <SettingsSection title="Compte">
            <SettingsRow
              label="Supprimer mon compte"
              onPress={() => router.push('/parametres/supprimer')}
              destructive
              last
            />
          </SettingsSection>
        )}
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
