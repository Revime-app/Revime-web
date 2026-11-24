import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { MeResponse } from '@revime/shared';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SettingsRow, SettingsSection } from '../../src/components/SettingsRow';
import { BlockingOverlay } from '../../src/components/BlockingOverlay';
import { api, ApiError } from '../../src/lib/api';
import { signOutAndLeave } from '../../src/lib/sign-out';
import { useSessionContext } from '../../src/lib/session';
import { useTheme } from '../../src/theme';
import { useTourActions, useTourPage, useTourTarget } from '../../src/tour/use-tour';
import { REVOIR_LA_VISITE } from '../../src/lib/tour-copy';

/**
 * `CF-47`. The Paramètres hub - the client's eight sections, minus « préférences »
 * (« si nécessaire », and there is no preference here that is not already one of the
 * other seven).
 *
 * Sign-out and the mode switcher MOVED here from Profil rather than being duplicated:
 * the client listed both under Paramètres and `CF-22`'s « no doublons » is the standing
 * mandate. 🛑 `profil.tsx`'s `handleForceSignOut` deliberately STAYS - it is the escape
 * hatch on the profile-failed-to-load state, which is the one case where this screen is
 * unreachable.
 */
export default function ParametresScreen() {
  const { palette, spacing } = useTheme();
  const { me, refresh } = useSessionContext();
  const queryClient = useQueryClient();

  /**
   * The mode being switched TO while a switch is in flight, and null otherwise. A target rather
   * than a boolean so `BlockingOverlay` can name the destination - the wait should say which
   * direction it is going, not just that it is busy. `switching` below stays as the derived flag,
   * so every guard and `disabled` prop reads exactly as it did.
   */
  const [switchingTo, setSwitchingTo] = useState<'CLIENT' | 'REPAIRER' | null>(null);
  const switching = switchingTo !== null;
  const [error, setError] = useState<string | null>(null);
  // V8 E2: « Changer de mode » and « Revoir la visite ».
  useTourPage('parametres', me !== null);
  const modeTarget = useTourTarget('modeSection');
  const revoirTarget = useTourTarget('revoirVisite');
  // Criterion 8, `DEC8-09` (5): resets the current mode's bubbles and goes to Accueil, where they start.
  const { replayCurrentMode } = useTourActions();

  const confirmSignOut = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion',
        style: 'destructive',
        onPress: () =>
          void signOutAndLeave({
            queryClient,
            router,
          }),
      },
    ]);
  };

  /**
   * Moved from profil.tsx and restored to the merge base's error-handling shape. Two branches:
   * enabling réparateur mode for the first time pushes `/mode-reparateur` (CF4-01), otherwise
   * it is an activeMode switch alone. With try/catch (so a rejection shows the server's
   * French message), in-flight guard (so double-tap does not fire two PATCHes), and
   * BlockingOverlay (so the screen does not freeze with no explanation during two sequential
   * round trips to Paris).
   */
  const handleModeSwitch = async (target: 'CLIENT' | 'REPAIRER') => {
    if (switching || !me || me.profile.activeMode === target) return;

    /**
     * CF4-01. Turning réparateur mode on for the FIRST time goes through the Particulier /
     * Professionnel step, which enables the mode (client mode stays on) and lands on « Statut de
     * vérification ». Identity is no longer required to enable the mode - only to send offers.
     */
    if (target === 'REPAIRER' && !me.profile.repairerEnabled) {
      router.push('/mode-reparateur');
      return;
    }

    setError(null);
    setSwitchingTo(target);

    try {
      // Switching between enabled modes
      await api.patch<MeResponse>('/users/me/modes', {
        activeMode: target,
        ...(target === 'CLIENT' ? { clientEnabled: true } : {}),
      });
      await refresh();
    } catch (err) {
      /**
       * Surface the server's French message (network errors, and a suspended réparateur's
       * REPAIRER_SUSPENDED on switching back into réparateur mode).
       */
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      setSwitchingTo(null);
    }
  };

  const activeMode = me?.profile.activeMode ?? 'CLIENT';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
      <ScreenHeader title="Paramètres" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <SettingsSection title="Compte">
          <SettingsRow label="Informations du compte" onPress={() => router.push('/parametres/compte')} />
          <SettingsRow label="Informations personnelles" onPress={() => router.push('/parametres/personnel')} />
          <SettingsRow label="Sécurité" onPress={() => router.push('/parametres/securite')} />
          <SettingsRow label="Notifications" onPress={() => router.push('/parametres/notifications')} last />
        </SettingsSection>

        <View {...modeTarget}>
        <SettingsSection title="Mode">
          <SettingsRow
            label="Mode client"
            onPress={activeMode === 'CLIENT' || switching ? null : () => void handleModeSwitch('CLIENT')}
            value={activeMode === 'CLIENT' ? 'Actif' : null}
          />
          <SettingsRow
            label="Mode réparateur"
            onPress={activeMode === 'REPAIRER' || switching ? null : () => void handleModeSwitch('REPAIRER')}
            value={activeMode === 'REPAIRER' ? 'Actif' : null}
          />
          <View {...revoirTarget}>
            <SettingsRow label={REVOIR_LA_VISITE} onPress={replayCurrentMode} last />
          </View>
        </SettingsSection>
        </View>

        {/* Mode hint restored from profil.tsx merge base. The MODE section currently has no
            explanatory copy at all, on the client's own named ask. */}
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13,
            lineHeight: 18,
            color: palette.muted,
            marginTop: -spacing.xs,
            marginBottom: spacing.lg,
            marginHorizontal: 4,
          }}
        >
          Un seul compte, deux usages. Basculez à tout moment sans vous déconnecter.
        </Text>

        {/* Error rendering for mode switch failures. */}
        {error && (
          <View
            style={{
              backgroundColor: palette.redSoft,
              borderRadius: 12,
              padding: spacing.lg,
              marginBottom: spacing.lg,
            }}
          >
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 15,
                color: palette.redDeep,
                lineHeight: 22,
              }}
            >
              {error}
            </Text>
          </View>
        )}

        <SettingsSection title="Confidentialité">
          <SettingsRow
            label="Politique de confidentialité"
            onPress={() => router.push('/parametres/confidentialite')}
            last
          />
        </SettingsSection>

        <SettingsSection title="Informations légales">
          <SettingsRow
            label="Conditions générales d'utilisation"
            onPress={() => router.push('/legal/cgu')}
          />
          <SettingsRow
            label="Mentions légales"
            onPress={() => router.push('/legal/mentions-legales')}
          />
          <SettingsRow
            label="Fonctionnement de REVIME"
            onPress={() => router.push('/legal/fonctionnement')}
          />
          <SettingsRow
            label="Comment sont classés les réparateurs"
            onPress={() => router.push('/legal/classement')}
          />
          <SettingsRow
            label="Livraison"
            onPress={() => router.push('/legal/livraison')}
          />
          <SettingsRow
            label="Protection REVIME"
            onPress={() => router.push('/legal/protection')}
          />
          <SettingsRow
            label="Politique des avis"
            onPress={() => router.push('/legal/avis')}
          />
          <SettingsRow
            label="Règles de la plateforme"
            onPress={() => router.push('/legal/regles')}
          />
          <SettingsRow
            label="Informations relatives au paiement"
            onPress={() => router.push('/legal/paiement-info')}
            last
          />
        </SettingsSection>

        <SettingsSection title={null}>
          <SettingsRow label="Déconnexion" onPress={confirmSignOut} destructive />
          <SettingsRow
            label="Supprimer mon compte"
            onPress={() => router.push('/parametres/supprimer')}
            destructive
            last
          />
        </SettingsSection>
      </ScrollView>

      {/* BlockingOverlay: switching mode re-themes the entire app off two sequential round trips to
          Paris, and without it the screen simply stops responding for a couple of seconds with
          nothing to say why. Restored from the merge base. 🛑 `BlockingOverlay` currently has ZERO
          consumers in the app, which is the proof this was an omission and not a decision. */}
      <BlockingOverlay
        visible={switching}
        label="Changement de mode…"
        detail={switchingTo === 'CLIENT' ? 'Passage en mode client' : 'Passage en mode réparateur'}
      />
    </SafeAreaView>
  );
}
