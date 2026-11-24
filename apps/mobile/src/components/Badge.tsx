import { View, Text, StyleSheet, type ViewProps } from 'react-native';
import { useTheme } from '../theme';

type Props = ViewProps & {
  /**
   * `dark` is the prototype's filled `var(--ink)` badge, used where a value must read as the
   * demande's HEADLINE fact rather than as one more attribute - « Budget 120 € » or
   * « Recherche d'offres » beside a neutral category chip (`DemandeDetail.tsx:57-60`). It is
   * the only tone with a filled dark ground, so it stays rare on purpose.
   *
   * `danger` (CF4-12/13/14) is the ladder's dispute colour - `repairStatus()`'s `tone: 'danger'`
   * for « Litige en cours » and the current dot on `DemandeProgressChain` while `disputed`.
   * Derived in-family from the charte's red rather than a new hue, per `AGENTS.md`'s rule
   * against inventing colours: `redSoft`/`redDeep`, the same pair `warranty` already uses,
   * so a dispute and a warranty chip share one visual language for "red, but not the accent".
   */
  tone: 'verified' | 'neutral' | 'warranty' | 'amber' | 'dark' | 'danger';
  label: string;
};

export function Badge({ tone, label, style, ...props }: Props) {
  const { palette } = useTheme();

  const colors = {
    verified: { bg: palette.greenSoft, text: palette.greenDeep },
    neutral: { bg: palette.mist, text: palette.muted },
    warranty: { bg: palette.redSoft, text: palette.redDeep },
    amber: { bg: palette.amberSoft, text: palette.amberDeep },
    dark: { bg: palette.ink, text: palette.paper },
    danger: { bg: palette.redSoft, text: palette.redDeep },
  };

  const { bg, text } = colors[tone];

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: bg,
        },
        style,
      ]}
      {...props}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: 'GoogleSansFlex_700Bold',
          fontSize: 11,
          color: text,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 8,
    alignSelf: 'flex-start',
    flexShrink: 0,
    maxWidth: '100%',
  },
});
