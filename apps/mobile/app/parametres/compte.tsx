import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { MeResponse } from '@revime/shared';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SettingsRow, SettingsSection } from '../../src/components/SettingsRow';
import { Button } from '../../src/components/Button';
import { api, ApiError } from '../../src/lib/api';
import { useSessionContext } from '../../src/lib/session';
import { useTheme } from '../../src/theme';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

/**
 * `CF-47` task 10. Informations du compte: read-mostly view of email, phone, username,
 * and verification level.
 *
 * 🛑 E-mail and téléphone are READ-ONLY. `changeEmail` is not enabled server-side, so a
 * « Modifier » affordance would point at a route that refuses. This is the shape
 * `apps/mobile/AGENTS.md` records: the test for a new CTA is not "is this helpful" but
 * "will the server say yes today". French prose beats a link the server will refuse.
 *
 * 🛑 Width decision (of three options): Added optional `valueMaxWidth` prop to
 * SettingsRow, defaulting to 170 to preserve hub geometry. Email/phone rows use 200,
 * which comfortably fits the measured 175.5pt email « marc.rousseau@exemple.fr » at 14pt
 * regular. Cost: one backward-compatible prop. Alternatives (stacked two-line row,
 * numberOfLines={2}) deferred as they change more surface.
 */
export default function CompteScreen() {
  const { palette, spacing, radii, type } = useTheme();
  const { me, refresh } = useSessionContext();

  /**
   * Normalize at entry. A new field from an API newer than the app arrives `undefined`,
   * and `undefined !== null` passes every null guard. Give absence one representation and
   * make it `null`. See `apps/mobile/AGENTS.md`.
   */
  const email = me?.email ?? null;
  const phone = me?.phone ?? null;
  const username = me?.username ?? null;
  const emailVerified = me?.emailVerified ?? false;
  const phoneVerified = me?.phoneVerified ?? false;
  const verificationLevel = me?.profile.verificationLevel ?? 'NONE';

  const [usernameEdit, setUsernameEdit] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditingUsername = usernameEdit !== null;
  const usernameChanged = isEditingUsername && usernameEdit.trim() !== (username ?? '');

  const saveUsername = async () => {
    if (!usernameChanged || saving) return;
    setUsernameError(null);
    setSaving(true);
    try {
      await api.patch<MeResponse>('/users/me/username', { username: usernameEdit.trim() });
      await refresh();
      setUsernameEdit(null);
    } catch (e) {
      setUsernameError(
        e instanceof ApiError ? (e.fields?.username ?? e.message) : 'Une erreur est survenue.',
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelUsernameEdit = () => {
    setUsernameEdit(null);
    setUsernameError(null);
  };

  /**
   * Verification level labels per `VerifiedChips.tsx`. BUSINESS sits above IDENTITY, so a
   * level-3 account has passed both checks.
   */
  const verificationLabel = (() => {
    if (verificationLevel === 'BUSINESS') return 'Entreprise vérifiée';
    if (verificationLevel === 'IDENTITY') return 'Identité vérifiée';
    if (verificationLevel === 'BASIC') return 'Basique';
    return 'Aucune';
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
      <ScreenHeader title="Informations du compte" onBack={() => router.back()} />
      <KeyboardAvoider>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <SettingsSection title="Coordonnées">
          {/* E-mail: read-only. Verified → inert with "Vérifié", unverified → push /verification.
              🛑 No « Modifier » affordance: changeEmail is not enabled server-side, and the rule
              is "will the server say yes today". State the fact in prose instead. */}
          {email && emailVerified && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: type.caption.size,
                color: palette.muted,
                marginTop: spacing.md,
                marginBottom: spacing.xs,
                marginHorizontal: spacing.lg,
              }}
            >
              Vérifié
            </Text>
          )}
          {email && !emailVerified && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: type.caption.size,
                color: palette.muted,
                marginTop: spacing.md,
                marginBottom: spacing.xs,
                marginHorizontal: spacing.lg,
              }}
            >
              Non vérifié · Appuyez pour vérifier
            </Text>
          )}
          <SettingsRow
            label="E-mail"
            value={email ?? 'Non renseigné'}
            valueMaxWidth={200}
            onPress={
              email && !emailVerified
                ? () => router.push('/verification')
                : null
            }
          />

          {/* Téléphone: same structure as e-mail. */}
          {phone && phoneVerified && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: type.caption.size,
                color: palette.muted,
                marginTop: spacing.md,
                marginBottom: spacing.xs,
                marginHorizontal: spacing.lg,
              }}
            >
              Vérifié
            </Text>
          )}
          {phone && !phoneVerified && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: type.caption.size,
                color: palette.muted,
                marginTop: spacing.md,
                marginBottom: spacing.xs,
                marginHorizontal: spacing.lg,
              }}
            >
              Non vérifié · Appuyez pour vérifier
            </Text>
          )}
          <SettingsRow
            label="Téléphone"
            value={phone ?? 'Non renseigné'}
            valueMaxWidth={200}
            onPress={
              phone && !phoneVerified
                ? () => router.push('/verification')
                : null
            }
            last
          />
        </SettingsSection>

        <SettingsSection title="Identifiant">
          {!isEditingUsername ? (
            <SettingsRow
              label="Pseudo"
              value={username ?? 'Non défini'}
              onPress={() => setUsernameEdit(username ?? '')}
              last
            />
          ) : (
            <View style={{ padding: spacing.lg, backgroundColor: palette.paper }}>
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_600SemiBold',
                  fontSize: 12.5,
                  color: palette.ink,
                  marginBottom: spacing.xs,
                }}
              >
                Pseudo
              </Text>
              <TextInput
                value={usernameEdit}
                onChangeText={(t) => {
                  setUsernameEdit(t);
                  setUsernameError(null);
                }}
                placeholder="Votre pseudo"
                placeholderTextColor={palette.faint}
                style={{
                  paddingVertical: 15,
                  paddingHorizontal: 14,
                  borderWidth: 1.5,
                  borderColor: usernameError ? palette.red : palette.line,
                  borderRadius: radii.field,
                  backgroundColor: palette.mist,
                  fontFamily: 'GoogleSansFlex_400Regular',
                  fontSize: type.body.size,
                  color: palette.ink,
                }}
              />
              {usernameError && (
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: type.caption.size,
                    color: palette.red,
                    marginTop: spacing.xs,
                  }}
                >
                  {usernameError}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Button label="Annuler" onPress={cancelUsernameEdit} variant="secondary" />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Enregistrer"
                    onPress={saveUsername}
                    loading={saving}
                    disabled={!usernameChanged}
                  />
                </View>
              </View>
            </View>
          )}
        </SettingsSection>

        <SettingsSection title="Vérification">
          <SettingsRow label="Niveau de vérification" value={verificationLabel} onPress={null} last />
        </SettingsSection>
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
