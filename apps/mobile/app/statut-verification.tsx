import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { type JourneyStep } from '@revime/shared';
import { useTheme } from '../src/theme';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Button';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { JourneyProgressBar } from '../src/components/JourneyProgressBar';
import { IconLock, IconTick } from '../src/icons';
import { useSessionContext } from '../src/lib/session';
import { useIdentityStart } from '../src/lib/use-identity-start';
import { useRepairerJourney } from '../src/lib/use-repairer-journey';
import { useConnectOnboarding } from '../src/lib/use-connect-onboarding';
import { ConnectOnboardingSheet } from '../src/components/ConnectOnboardingSheet';

/**
 * `CF-50`, then `CF4-09` (design spec §4.5). Mockup `04` panel 3, « Statut de vérification ».
 *
 * 🛑 NOT `/verification`, WHICH ALREADY EXISTS and is « Confirmez votre compte » - the email and
 * phone OTP screen. Two routes one word apart: that one COLLECTS codes, this one REPORTS where
 * the réparateur journey stands. Do not merge them.
 *
 * CF4-09: this is now the réparateur journey HUB rather than a fixed identity-plus-business
 * layout. `useRepairerJourney` (which wraps the shared, pure `repairerJourney` from Task 1) is
 * the single source of every step's label, body, status and CTA label - this screen maps
 * `status` -> pill tone/text and `key` -> the action a tap actually runs, and adds no status
 * logic of its own.
 *
 * V8 E1, mockup 2 (`DEC8-08` (8), (10), (12)): « Configuration réparateur », a summary (« n étapes sur N
 * terminées », « ≈ X min », the bar); a done step reads « <label> · <value> » with a green tick; a step to do reads
 * « <label> · X min » (the profile « Profil réparateur · c/6 · X min »), its chip, its body and ITS OWN button (every
 * step to do, not only `journey.next`); a blocked step shows why and a waiting one « Vérification en cours », neither
 * with a button. While setup is unfinished, « Configurer plus tard » opens the Demandes feed (the repairer-mode
 * middle tab) - the page still opens by itself after sign-up (`repairer-entry.ts`), and this is its way out.
 */
/** « Informations fiscales · 2 min », or for the profile « Profil réparateur · 1/6 · 2 min » (mockup 2). */
function stepTitle(step: JourneyStep): string {
  return step.progress
    ? `${step.label} · ${step.progress} · ${step.minutes} min`
    : `${step.label} · ${step.minutes} min`;
}

export default function StatutVerification() {
  const { palette, accent, spacing } = useTheme();
  const router = useRouter();
  const { me } = useSessionContext();
  const { loading, identityError, connectError, journey, refetch } = useRepairerJourney();
  const { startIdentity, loading: identityLoading, error: identityStartError } =
    useIdentityStart();
  const connectOnboarding = useConnectOnboarding();

  if (!me) return null;

  const handlePayouts = () => {
    void connectOnboarding.startOnboarding();
  };

  const renderCta = (step: JourneyStep) => {
    if (step.cta === null) return null;

    switch (step.key) {
      case 'kind':
        return <Button label={step.cta} onPress={() => router.push('/mode-reparateur')} />;
      case 'identity':
        return (
          <>
            {identityStartError && (
              <Text style={[styles.rowError, { color: palette.redDeep }]}>{identityStartError}</Text>
            )}
            <Button label={step.cta} onPress={startIdentity} loading={identityLoading} />
          </>
        );
      case 'business':
        return <Button label={step.cta} onPress={() => router.push('/entreprise')} />;
      case 'fiscal':
        return <Button label={step.cta} onPress={() => router.push('/fiscalite')} />;
      case 'profile':
        return <Button label={step.cta} onPress={() => router.push('/profil-public')} />;
      case 'payouts':
        return (
          <>
            {connectOnboarding.error && (
              <Text style={[styles.rowError, { color: palette.redDeep }]}>
                {connectOnboarding.error}
              </Text>
            )}
            <Button
              label={step.cta}
              onPress={handlePayouts}
              loading={connectOnboarding.loading}
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenHeader title="Configuration réparateur" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        {loading ? (
          <>
            <Card style={[styles.skeletonCard, { marginBottom: spacing.md }]} />
            <Card style={[styles.skeletonCard, { marginBottom: spacing.md }]} />
            <Card style={styles.skeletonCard} />
          </>
        ) : (
          journey !== null && (
            <>
              <Card style={{ marginBottom: spacing.md }}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryTitle, { color: palette.ink }]}>
                    {journey.completed <= 1
                      ? `${journey.completed} étape sur ${journey.total} terminée`
                      : `${journey.completed} étapes sur ${journey.total} terminées`}
                  </Text>
                  {!journey.complete && (
                    <Text style={[styles.summaryTime, { color: palette.muted }]}>{`≈ ${journey.minutesLeft} min`}</Text>
                  )}
                </View>
                <View style={{ marginTop: spacing.sm }}>
                  <JourneyProgressBar completed={journey.completed} total={journey.total} />
                </View>
              </Card>

              {journey.steps.map((step, index) => {
                const erroredSource =
                  (step.key === 'identity' && identityError) || (step.key === 'payouts' && connectError);

                if (step.status === 'done' && !erroredSource) {
                  return (
                    <Card key={step.key} style={[styles.doneRow, { marginBottom: spacing.md }]}>
                      <View style={[styles.tick, { backgroundColor: palette.greenSoft }]}>
                        <IconTick size={14} color={palette.greenDeep} strokeWidth={2.6} />
                      </View>
                      <Text style={[styles.rowLabel, { color: palette.ink }]}>{`${step.label} · ${step.value ?? ''}`}</Text>
                    </Card>
                  );
                }

                return (
                  <Card key={step.key} style={{ marginBottom: spacing.md }}>
                    <View style={styles.headRow}>
                      <Text style={[styles.stepNumber, { color: palette.muted }]}>{String(index + 1)}</Text>
                      <Text style={[styles.rowLabel, { color: palette.ink }]}>{stepTitle(step)}</Text>
                    </View>
                    {step.status === 'waiting' ? (
                      <Text style={[styles.rowStatus, { color: palette.amberDeep }]}>Vérification en cours</Text>
                    ) : (
                      <View style={[styles.chip, { backgroundColor: accent.accentSoft }]}>
                        <IconLock size={13} color={accent.accentDeep} strokeWidth={2.2} />
                        <Text style={[styles.chipText, { color: accent.accentDeep }]}>{step.unlocks}</Text>
                      </View>
                    )}
                    <Text style={[styles.rowBody, { color: palette.muted }]}>
                      {erroredSource ? 'Statut indisponible, réessayez' : step.body}
                    </Text>
                    {erroredSource ? (
                      <View style={{ marginTop: spacing.md }}>
                        <Button label="Réessayer" variant="text" onPress={refetch} />
                      </View>
                    ) : (
                      step.status === 'todo' && <View style={{ marginTop: spacing.md }}>{renderCta(step)}</View>
                    )}
                  </Card>
                );
              })}

              {journey.complete ? (
                <Card>
                  <Text style={[styles.rowLabel, { color: palette.ink }]}>Configuration terminée</Text>
                  <Text style={[styles.rowBody, { color: palette.muted }]}>
                    Vous pouvez envoyer des offres et recevoir vos paiements.
                  </Text>
                </Card>
              ) : (
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    label="Configurer plus tard"
                    variant="secondary"
                    onPress={() => router.navigate('/(tabs)/publier')}
                  />
                  <Text style={[styles.laterNote, { color: palette.muted }]}>
                    Vous pouvez déjà consulter les demandes près de chez vous.
                  </Text>
                </View>
              )}
            </>
          )
        )}
      </ScrollView>
      <ConnectOnboardingSheet
        visible={connectOnboarding.visible}
        connectInstance={connectOnboarding.connectInstance}
        isTimedOut={connectOnboarding.isTimedOut}
        onExit={connectOnboarding.handleExit}
        onLoadError={connectOnboarding.handleLoadError}
        onRetry={connectOnboarding.handleRetry}
        onDismiss={connectOnboarding.handleDismiss}
        onPageDidLoad={connectOnboarding.handlePageDidLoad}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  skeletonCard: { minHeight: 72 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  summaryTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, flexShrink: 1 },
  summaryTime: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tick: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    maxWidth: '100%',
  },
  chipText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, lineHeight: 16, flexShrink: 1 },
  laterNote: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  stepNumber: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },
  rowLabel: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, flex: 1 },
  rowStatus: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5, marginTop: 8 },
  rowBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, lineHeight: 17.4, marginTop: 8 },
  rowError: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, lineHeight: 18, marginBottom: 8 },
});
