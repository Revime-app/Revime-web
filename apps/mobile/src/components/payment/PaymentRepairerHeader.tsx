import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { euros, delayLabel, ratingLabel, type OfferDto } from '@revime/shared';
import { useTheme } from '../../theme';
import { Card } from '../Card';
import { Badge } from '../Badge';
import { Initials } from '../Initials';

type Props = {
  offer: OfferDto;
  style?: StyleProp<ViewStyle>;
};

export function PaymentRepairerHeader({ offer, style }: Props) {
  const { palette } = useTheme();
  const isPro = offer.verifiedBadge === 'BUSINESS';
  const username = offer.repairerName.startsWith('@')
    ? offer.repairerName
    : `@${offer.repairerName}`;
  const reviewCount = offer.reviewCount ?? 0;
  const ratingText =
    offer.rating !== null
      ? `★ ${ratingLabel(offer.rating)} (${reviewCount} avis)`
      : null;

  return (
    <Card style={style}>
      <View style={styles.container}>
        <Initials
          name={offer.repairerName}
          uri={(offer as { avatarUrl?: string | null }).avatarUrl ?? null}
          size={48}
        />
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text
              numberOfLines={1}
              style={[styles.username, { color: palette.ink }]}
            >
              {username}
            </Text>
            <Text style={[styles.price, { color: palette.ink }]}>
              {euros(offer.priceCents)}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Badge
              tone={isPro ? 'dark' : 'neutral'}
              label={isPro ? '🛡️ Professionnel vérifié' : '👤 Réparateur particulier'}
            />
            {ratingText && (
              <Text style={[styles.rating, { color: palette.muted }]}>
                {ratingText}
              </Text>
            )}
          </View>

          <Text style={[styles.delay, { color: palette.muted }]}>
            Réparation en {delayLabel(offer.delayHours)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  username: {
    fontFamily: 'GoogleSansFlex_600SemiBold',
    fontSize: 15.5,
    flexShrink: 1,
  },
  price: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 16,
    marginLeft: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  rating: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 12.5,
  },
  delay: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13,
  },
});
