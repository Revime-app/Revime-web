import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IconShieldCheck, IconChevronRight } from '../icons';

/**
 * The prototype's « Réparateurs vérifiés » trust strip (`Accueil.tsx:139-163`).
 *
 * Copy is verbatim from the approved design, including « Ici, la réputation compte plus
 * que le statut. » - which is a positioning line the client wrote, not filler.
 *
 * 🛑 THE TARGET IS DELIBERATELY NOT THE PROTOTYPE'S. It navigates to `/verification`
 * there, and in the real app that route is the CLIENT'S OWN email/SMS code screen - so
 * following the prototype literally would answer « who are these verified repairers? »
 * by asking the reader to verify himself. Stage 4b piece C shipped the actual answer,
 * the réparateur directory, so it opens that instead. Owner's call, 2026-08-20.
 */
export function TrustStrip({ onPress }: { onPress: () => void }) {
  const { palette, radii, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.strip,
        {
          // `--ink` (#141414), NOT `--navy` (#111827). Read off the prototype
          // (`Accueil.tsx:146`) after a first pass used navy from memory. It matters
          // beyond a few points of lightness: the demande card's footer strip directly
          // above is `--ink` too, so navy here put two dark surfaces on one screen at
          // almost-but-not-quite the same colour, which reads as a rendering fault
          // rather than a choice.
          backgroundColor: palette.ink,
          borderRadius: radii.card,
          marginTop: spacing.xl,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <IconShieldCheck size={22} color={palette.red} strokeWidth={2.3} />
      <View style={styles.body}>
        <Text style={styles.title}>Réparateurs vérifiés</Text>
        <Text style={styles.copy}>
          Identité et entreprise contrôlées. Ici, la réputation compte plus que le statut.
        </Text>
      </View>
      <IconChevronRight size={18} color="rgba(255,255,255,0.6)" strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  body: { flex: 1 },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14, color: '#ffffff' },
  copy: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    color: 'rgba(255,255,255,0.7)',
  },
});
