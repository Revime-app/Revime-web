import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { IconClock } from '../icons';

/**
 * CF4-01 (bugfix.md 2.4). Shown in réparateur mode while the identity check is PENDING - documents
 * sent, Stripe still checking. The caller decides WHEN (it owns the `repairerVerificationState`
 * derivation and the `activeMode` / `connectEnabled` gates); this component only renders.
 *
 * Copy is the client's, verbatim. The icon is a hugeicons component rather than a Unicode symbol:
 * Google Sans Flex has no glyph for « ⓘ » and friends (`apps/mobile/AGENTS.md`).
 *
 * Deliberately NOT pressable and with no CTA: there is nothing for him to do while Stripe checks,
 * and a button would point at a server that has nothing to give him yet (`CF-31`'s test).
 *
 * CF4-09: the title + body are split out as `VerificationPendingContent` so
 * `RepairerJourneyCard` (design spec §4.7) can embed the same verbatim copy inside its own
 * `Card` without this component's border/background - « one block, not two ». This banner is
 * unchanged for its existing callers: it wraps that content in its own bordered view.
 */
export function VerificationPendingContent() {
  const { palette } = useTheme();

  return (
    <>
      <View style={styles.titleRow}>
        <IconClock size={16} color={palette.amberDeep} strokeWidth={2.2} />
        <Text style={[styles.title, { color: palette.amberDeep }]}>Vérification en cours</Text>
      </View>
      <Text style={[styles.body, { color: palette.ink }]}>
        Vos documents ont bien été transmis. Votre compte est actuellement en cours de vérification.
        Vous pouvez consulter l'application, mais vous ne pouvez pas encore proposer vos services ni
        envoyer d'offres. Vous pourrez envoyer des offres dès que votre vérification sera validée.
      </Text>
    </>
  );
}

/**
 * `marginBottom` is the caller's, so it sits flush inside a Card and spaced above the Accueil feed.
 */
export function VerificationPendingBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { palette } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="summary"
      style={[
        styles.banner,
        { backgroundColor: palette.amberSoft, borderColor: palette.amber },
        style,
      ]}
    >
      <VerificationPendingContent />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { padding: 14, borderRadius: 14, borderWidth: 1.5, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, lineHeight: 17.4 },
});
