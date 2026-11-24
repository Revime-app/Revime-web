import { Text, View } from 'react-native';
import type { CommandeDto } from '@revime/shared';
import { useTheme } from '../../theme';
import { Card } from '../Card';

type Props = {
  data: CommandeDto;
};

/**
 * Post-payment counterpart address (CF3-05), unchanged from `commande/[id].tsx`
 * (extraction only - Task 5 commit 1). Renders only when `data.counterpartAddress`
 * is set - revealed strictly when necessary (HOME: client address to the
 * repairer; WORKSHOP: workshop address to the client).
 */
export function CounterpartAddressCard({ data }: Props) {
  const { palette, spacing, radii } = useTheme();

  if (!data.counterpartAddress) return null;

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
        {data.delivery === 'HOME'
          ? "Adresse d'intervention à domicile"
          : "Adresse de l'atelier"}
      </Text>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_400Regular',
          fontSize: 13,
          color: palette.muted,
          marginTop: 4,
          marginBottom: 8,
        }}
      >
        {data.delivery === 'HOME'
          ? "Rendez-vous à cette adresse pour réaliser l'intervention chez le client."
          : "Déposez votre appareil à cette adresse pour la réparation."}
      </Text>
      <View
        style={{
          backgroundColor: palette.mist,
          padding: 12,
          borderRadius: radii.card,
          borderWidth: 1,
          borderColor: palette.line,
        }}
      >
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 14,
            color: palette.ink,
          }}
        >
          {data.counterpartAddress}
        </Text>
      </View>
    </Card>
  );
}
