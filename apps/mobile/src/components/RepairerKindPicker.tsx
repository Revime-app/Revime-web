import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { IconArrowRight, IconBriefcase, IconUser } from '../icons';
import { Card } from './Card';

type Kind = 'INDIVIDUAL' | 'PRO';

type Props = {
  onChoose: (kind: Kind) => void;
  disabled: boolean;
};

/**
 * The two Particulier / Professionnel option cards.
 *
 * Extracted from `mode-reparateur.tsx`'s local `option()` renderer (CF4-01) so
 * `type-reparateur.tsx` (CF4-06) can render the exact same cards for a new
 * signup. Copy, icons and layout are unchanged from that screen; only the
 * choice callback and disabled flag are now props instead of a closure.
 */
export function RepairerKindPicker({ onChoose, disabled }: Props) {
  const { palette, accent, spacing } = useTheme();

  const option = (kind: Kind, title: string, meta: string) => {
    const Icon = kind === 'PRO' ? IconBriefcase : IconUser;
    return (
      <Pressable
        key={kind}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${meta.replace('\n', ' ')}`}
        disabled={disabled}
        onPress={() => onChoose(kind)}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, marginBottom: spacing.md })}
      >
        <Card>
          <View style={styles.optionHeader}>
            <View style={[styles.iconBox, { backgroundColor: accent.accentSoft }]}>
              <Icon size={18} color={accent.accent} strokeWidth={2.2} />
            </View>
            <Text style={[styles.optionTitle, { color: palette.ink }]}>{title}</Text>
            <IconArrowRight size={18} color={palette.faint} strokeWidth={2.2} />
          </View>
          <Text style={[styles.optionMeta, { color: palette.muted }]}>{meta}</Text>
        </Card>
      </Pressable>
    );
  };

  return (
    <>
      {option('INDIVIDUAL', 'Particulier', 'Réparations occasionnelles.\nVérification CNI requise.')}
      {option('PRO', 'Professionnel', 'Entreprise / Auto-ent.\nSIRET + CNI requis.')}
    </>
  );
}

const styles = StyleSheet.create({
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { flex: 1, fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  optionMeta: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12.5,
    lineHeight: 17.4,
    marginTop: 8,
  },
});
