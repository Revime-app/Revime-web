import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Card } from '../src/components/Card';
import { DottedArc } from '../src/components/ScreenMotif';
import { IconVerified, IconStore, IconStar, IconShieldCheck } from '../src/icons';

/**
 * « Réparateurs vérifiés » - the trust explainer, ported from the prototype's
 * `Verification.tsx`.
 *
 * 🛑 WHY THIS SCREEN EXISTS, because the reason is a mistake worth not repeating.
 * Accueil's trust strip navigates to `/verification` in the prototype, and this app
 * already has a `/verification` route - the client's own email/SMS code entry. Those two
 * are unrelated screens that happen to share a path, and a first pass at Accueil read the
 * collision the wrong way round: it assumed the prototype was pointing somewhere
 * inappropriate and "improved" the strip by sending it to the réparateur directory
 * instead. The prototype was right and the app was simply missing the screen. This is it,
 * at a path that cannot collide.
 *
 * Content is verbatim from the prototype, including « Chez Revime, la confiance passe
 * avant tout. » - client-approved copy, not filler.
 *
 * 🛑 THREE OF THE FOUR CLAIMS ARE INERT IN PRODUCTION TODAY, and that is a deployment
 * state rather than a lie in the copy: identity and SIRET checks exist in code but no
 * account can reach `IDENTITY` until `CONNECT_ENABLED`'s four conditions close, and the
 * badge therefore renders for nobody. Only « Seuls les clients ayant payé peuvent laisser
 * un avis » is literally demonstrable right now, since a review does require a RELEASED
 * commande. Recorded so nobody reads this screen as evidence the checks are live.
 */
const POINTS = [
  {
    Icon: IconVerified,
    title: 'Identité contrôlée',
    sub: "Pièce d'identité vérifiée pour chaque réparateur.",
  },
  {
    Icon: IconStore,
    title: 'Entreprise vérifiée',
    sub: 'SIRET et statut professionnel confirmés.',
  },
  {
    Icon: IconStar,
    title: 'Avis authentiques',
    sub: 'Seuls les clients ayant payé peuvent laisser un avis.',
  },
  {
    Icon: IconShieldCheck,
    title: 'Badge de confiance',
    sub: 'Les réparateurs fiables gagnent un badge visible.',
  },
] as const;

export default function ReparateursVerifies() {
  const { palette, accent, spacing, radii } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      {/* No ScreenMotif here, unlike the other pushed screens: this screen draws its OWN
          arc around the shield below, and the ambient motif's arc would collide with it. */}
      <ScreenHeader title="Réparateurs vérifiés" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {/* The signature header: a shield in a white disc, inside a dotted orbit, over a
            soft accent blob (`Verification.tsx:24-42`). */}
        <View style={styles.hero}>
          <View
            style={[styles.blob, { backgroundColor: accent.accentSoft, borderCurve: 'continuous' }]}
          />
          <DottedArc size={118} sweep={300} rotate={-20} opacity={0.5} color={palette.red} />
          <View
            style={[
              styles.shieldDisc,
              { backgroundColor: palette.paper, borderCurve: 'continuous' },
            ]}
          >
            <IconShieldCheck size={28} color={palette.red} strokeWidth={2.3} />
          </View>
        </View>

        <Text style={[styles.intro, { color: palette.muted }]}>
          Chez Revime, la confiance passe avant tout. Voici comment nous vérifions chaque
          réparateur.
        </Text>

        {POINTS.map(({ Icon, title, sub }) => (
          <Card key={title} style={styles.point}>
            <View
              style={[
                styles.pointIcon,
                { backgroundColor: accent.accentSoft, borderCurve: 'continuous' },
              ]}
            >
              <Icon size={20} color={accent.accent} strokeWidth={2.1} />
            </View>
            <View style={styles.pointBody}>
              <Text style={[styles.pointTitle, { color: palette.ink }]}>{title}</Text>
              <Text style={[styles.pointSub, { color: palette.muted }]}>{sub}</Text>
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hero: { height: 128, alignItems: 'center', justifyContent: 'center' },
  blob: { position: 'absolute', width: 150, height: 150, borderRadius: 75, opacity: 0.5 },
  shieldDisc: {
    position: 'absolute',
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    // Matches `Card`'s shadow so the disc reads as the same material as the cards below.
    shadowColor: '#101828',
    shadowOpacity: 0.07,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  intro: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 320,
    marginBottom: 4,
  },
  // Card hardcodes `padding: spacing.lg` (16); the prototype uses 16 here too, so the
  // default is correct and only the row layout is overridden.
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pointIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointBody: { flex: 1 },
  pointTitle: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14.5 },
  pointSub: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, lineHeight: 18, marginTop: 3 },
});
