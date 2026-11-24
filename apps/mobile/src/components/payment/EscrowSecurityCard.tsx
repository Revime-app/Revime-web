import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { IconPadlock } from '../../icons';

type Props = {
  style?: StyleProp<ViewStyle>;
};

export function EscrowSecurityCard({ style }: Props) {
  const { palette, radii, spacing } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.navy,
          borderRadius: radii.card,
          padding: spacing.lg,
        },
        style,
      ]}
      accessibilityRole="summary"
    >
      <View style={styles.iconDisc} accessibilityLabel="Cadenas" accessibilityRole="image">
        <IconPadlock size={20} color={palette.paper} strokeWidth={2} />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: palette.paper }]}>
          Votre argent est protégé
        </Text>
        <Text style={[styles.copy, { color: palette.platinum }]}>
          Le réparateur n'est payé qu'une fois que vous avez validé la réparation. En cas de problème, REVIME intervient.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 15,
    marginBottom: 4,
  },
  copy: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 12.5,
    lineHeight: 18,
  },
});
