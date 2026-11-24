import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { BlockingOverlay } from '../../src/components/BlockingOverlay';
import { RepairerKindPicker } from '../../src/components/RepairerKindPicker';
import { applyModes } from '../../src/lib/apply-modes';
import { ApiError } from '../../src/lib/api';
import { routeAfterOnboarding } from '../../src/lib/repairer-entry';
import { useSessionContext } from '../../src/lib/session';
import { useTheme } from '../../src/theme';

type Kind = 'INDIVIDUAL' | 'PRO';

/**
 * CF4-06. The separate Particulier / Professionnel page pushed from
 * `roles.tsx`'s single Réparateur card.
 *
 * Two entry shapes, distinguished by the `apply` param:
 * - normal signup (no `apply`): the choice is just forwarded onto the signup
 *   form's URL, same as `roles.tsx` built it before this screen existed - the
 *   account does not exist yet, so there is nothing to PATCH here.
 * - `apply=1` (social sign-in, `roles?apply=1` forwarded it here): the account
 *   already exists, so this screen does what `roles.tsx` used to do for a
 *   réparateur choice directly - `applyModes`, then the journey entry (CF4-09).
 */
export default function TypeReparateur() {
  const router = useRouter();
  const { palette, spacing } = useTheme();
  const { refresh } = useSessionContext();
  const params = useLocalSearchParams();
  const applyDirectly = params.apply === '1';

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const choose = async (kind: Kind) => {
    if (!applyDirectly) {
      router.push(`/(auth)/signup?repairer=1&kind=${kind}`);
      return;
    }
    if (applying) return;
    setApplyError(null);
    setApplying(true);
    try {
      await applyModes({ client: false, repairer: true, kind });
      // applyModes stamps Profile.onboardingCompletedAt as an existing side
      // effect of PATCH /users/me/modes, so this screen cannot re-appear on a
      // successful mode application. If it FAILS the stamp is not written. The
      // failed account stays client-only until an explicit sign-out (sessions last
      // 60 days and app/index.tsx sends any session-holder straight to /(tabs)),
      // though it is recoverable via Profil's mode switch.
      await refresh();
      routeAfterOnboarding(router, true);
    } catch (e) {
      // applyModes documents that its failures return French messages in
      // ApiError.message (see apply-modes.ts:11), so preserve them rather than
      // replacing them with a generic retry line. Enabling réparateur mode no
      // longer requires identity (CF4-01), but the server still answers in French
      // for the refusals that remain (e.g. a suspended réparateur).
      setApplyError(
        e instanceof ApiError ? e.message : "Impossible d'enregistrer votre choix. Veuillez réessayer.",
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
      <ScreenHeader title="Type de réparateur" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text style={[styles.prompt, { color: palette.ink }]}>Choisissez votre statut</Text>
        <Text style={[styles.hint, { color: palette.muted, marginBottom: spacing.lg }]}>
          Vous pourrez vérifier votre identité juste après la création de votre compte.
        </Text>

        <RepairerKindPicker onChoose={(k) => void choose(k)} disabled={applying} />

        {applyError && (
          <View style={[styles.error, { backgroundColor: palette.redSoft, padding: spacing.lg }]}>
            <Text style={[styles.errorText, { color: palette.redDeep }]}>{applyError}</Text>
          </View>
        )}
      </ScrollView>

      <BlockingOverlay
        visible={applying}
        label="Enregistrement…"
        detail="Activation du mode réparateur"
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
