import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { IconPadlock } from '../../icons';

/**
 * Spec §4.4 item 7 - the REVIME-dispute banner: red card, lock icon,
 * « Les fonds sont conservés par REVIME jusqu'à la résolution du litige. » (CF4-14).
 * Rendered instead of `CommandeBanner` while `data.disputeOpen`.
 */
export function DisputeBanner() {
  const { palette, spacing } = useTheme();

  return (
    <View
      style={{
        backgroundColor: palette.redSoft,
        borderWidth: 1,
        borderColor: palette.red,
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: spacing.md,
      }}
    >
      <IconPadlock size={20} color={palette.redDeep} strokeWidth={1.8} />
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_500Medium',
          fontSize: 12.5,
          lineHeight: 18,
          color: palette.redDeep,
          flex: 1,
        }}
      >
        <Text style={{ fontFamily: 'GoogleSansFlex_700Bold' }}>Commande suspendue.</Text> Aucun changement de statut n'est possible pendant le litige. Les fonds sont conservés par REVIME.
      </Text>
    </View>
  );
}
