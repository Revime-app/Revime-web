import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { Card } from './Card';
import { Button } from './Button';
import { JourneyProgressBar } from './JourneyProgressBar';
import { VerificationPendingContent } from './VerificationPendingBanner';
import { IconLock } from '../icons';
import { useSessionContext } from '../lib/session';
import { useRepairerJourney } from '../lib/use-repairer-journey';

/**
 * CF4-09, then V8 E1 mockup 1. The réparateur journey's resume card - one entry point repeated on Accueil and
 * Profil so a réparateur mid-setup is never more than a tap from `/statut-verification`, whichever tab he opens.
 *
 * Returns `null` in every case where there is nothing to resume: still loading, no journey, the journey already
 * `complete` (Profil then shows `SetupCompleteRow`, mockup 6), or the account not in réparateur mode
 * (`me.profile.activeMode === 'REPAIRER'`, the field path `profil.tsx` reads for its mode-gated sections).
 *
 * Content (V8 E1, `DEC8-08` (2), (12)):
 *   « Configuration réparateur · n/N » with « ≈ X min » on the right, the progress bar;
 *   « Étape suivante : <label> (X min) » and a lock chip with what that step unlocks (omitted when `next` is
 *     null, i.e. everything left is waiting or blocked);
 *   `VerificationPendingContent` when the identity step is `waiting`;
 *   « Continuer » → `/statut-verification`.
 *
 * Measured with PIL against the shipped TTFs (`apps/mobile/AGENTS.md`), 375 pt screen, 16 pt (`spacing.lg`) screen
 * and card padding = 311 pt inside: « Configuration réparateur · 5/5 » 215.0 pt at 15/600 + 8 pt gap + « ≈ 11 min »
 * 44.5 pt at 13/400 = 267.5 pt, so the title row holds on one line. The next-step line (up to 313.3 pt, Pro) and
 * the chip (up to 325.3 pt, profile) can wrap, so neither is single-line. « ≈ » is in the font's cmap (gid 568).
 *
 * The whole card is one accessibility group, announced as a single unit.
 */
export function RepairerJourneyCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { palette, accent, spacing } = useTheme();
  const router = useRouter();
  const { me } = useSessionContext();
  const { loading, journey } = useRepairerJourney();

  if (loading || !journey || journey.complete) return null;
  if (me?.profile.activeMode !== 'REPAIRER') return null;

  const nextStep = journey.next ? (journey.steps.find((s) => s.key === journey.next) ?? null) : null;
  const identityStep = journey.steps.find((s) => s.key === 'identity') ?? null;
  const identityWaiting = identityStep?.status === 'waiting';

  return (
    <Card accessible accessibilityRole="summary" style={style}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: palette.ink }]}>
          {`Configuration réparateur · ${journey.completed}/${journey.total}`}
        </Text>
        <Text style={[styles.time, { color: palette.muted }]}>{`≈ ${journey.minutesLeft} min`}</Text>
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <JourneyProgressBar completed={journey.completed} total={journey.total} />
      </View>
      {nextStep && (
        <>
          <Text style={[styles.nextLine, { color: palette.ink, marginTop: spacing.md }]}>
            {`Étape suivante : ${nextStep.label} (${nextStep.minutes} min)`}
          </Text>
          <View style={[styles.chip, { backgroundColor: accent.accentSoft }]}>
            <IconLock size={13} color={accent.accentDeep} strokeWidth={2.2} />
            <Text style={[styles.chipText, { color: accent.accentDeep }]}>{nextStep.unlocks}</Text>
          </View>
        </>
      )}
      {identityWaiting && (
        <View style={{ marginTop: spacing.md }}>
          <VerificationPendingContent />
        </View>
      )}
      <View style={{ marginTop: spacing.md }}>
        <Button label="Continuer" onPress={() => router.push('/statut-verification')} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, flexShrink: 1 },
  time: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13 },
  nextLine: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, lineHeight: 18 },
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
});
