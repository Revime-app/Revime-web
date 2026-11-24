import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { MeResponse } from '@revime/shared';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { BlockingOverlay } from '../src/components/BlockingOverlay';
import { RepairerKindPicker } from '../src/components/RepairerKindPicker';
import { api, ApiError } from '../src/lib/api';
import { useSessionContext } from '../src/lib/session';
import { useTheme } from '../src/theme';

type Kind = 'INDIVIDUAL' | 'PRO';

/**
 * CF4-01. The Particulier / Professionnel step an EXISTING client passes through when he turns
 * réparateur mode on from Paramètres. The server no longer gates that transition on identity
 * (identity is required on ACTIONS - the offer gate - not on the mode), so this screen enables the
 * mode and hands him straight to « Statut de vérification », where he starts the check.
 *
 * 🛑 NOT `roles?apply=1`. That path's `applyModes` sets `clientEnabled: false`, which would take
 * client mode away from an account that has been using it. This PATCH leaves `clientEnabled`
 * untouched, so both modes stay available.
 *
 * The two choices mirror `app/(auth)/roles.tsx`'s kind options and copy. Same failure handling as
 * Paramètres' `handleModeSwitch`: in-flight guard, `BlockingOverlay`, and the server's French
 * message surfaced (a suspended réparateur is refused with REPAIRER_SUSPENDED).
 */
export default function ModeReparateurScreen() {
  const { palette, spacing } = useTheme();
  const { refresh } = useSessionContext();
  const [choosing, setChoosing] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (kind: Kind) => {
    if (choosing !== null) return;
    setError(null);
    setChoosing(kind);
    try {
      await api.patch<MeResponse>('/users/me/modes', {
        repairerEnabled: true,
        activeMode: 'REPAIRER',
        kind,
      });
      await refresh();
      router.replace('/statut-verification');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Une erreur est survenue. Veuillez réessayer.',
      );
    } finally {
      setChoosing(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
      <ScreenHeader title="Mode réparateur" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={[styles.prompt, { color: palette.ink }]}>Choisissez votre statut</Text>
        <Text style={[styles.hint, { color: palette.muted, marginBottom: spacing.lg }]}>
          Votre mode client reste disponible. Vous pourrez basculer à tout moment depuis les
          paramètres.
        </Text>

        <RepairerKindPicker onChoose={(k) => void choose(k)} disabled={choosing !== null} />

        {error && (
          <View style={[styles.error, { backgroundColor: palette.redSoft, padding: spacing.lg }]}>
            <Text style={[styles.errorText, { color: palette.redDeep }]}>{error}</Text>
          </View>
        )}
      </ScrollView>

      <BlockingOverlay
        visible={choosing !== null}
        label="Changement de mode…"
        detail="Passage en mode réparateur"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  prompt: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 18 },
  hint: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, lineHeight: 18, marginTop: 4 },
  error: { borderRadius: 12, marginTop: 4 },
  errorText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, lineHeight: 22 },
});
