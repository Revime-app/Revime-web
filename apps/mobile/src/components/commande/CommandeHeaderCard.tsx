import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { euros, repairStatus, type CommandeDto } from '@revime/shared';
import { useTheme } from '../../theme';
import { Card } from '../Card';
import { Badge } from '../Badge';
import { IconPackage } from '../../icons';

type Props = {
  data: CommandeDto;
};

const CAROUSEL_HEIGHT = 200;
const DESCRIPTION_LINES = 3;

/**
 * Spec §4.4 item 1 - photo carousel with dots (placeholder tile when no photo), title,
 * order number, status badge (from `repairStatus`), price, and an expandable description.
 *
 * The status badge reflects `disputeOpen` (CF5-12, mockups 12-1 and 12-2): when
 * a REVIME dispute is open the label is « Suspendue — litige » with tone danger.
 * When refunded, reads « Clôturée — remboursée » (or part.) with tone neutral.
 */
export function CommandeHeaderCard({ data }: Props) {
  const { palette, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);

  // Card padding is 0; outer ScrollView padding is spacing.lg on both sides. Carousel spans the card's full width.
  const carouselWidth = width - spacing.lg * 2;

  const photos = data.photoUrls;
  const status = repairStatus(
    {
      demandeStatus: null,
      offerCount: 0,
      // CF4-15 / spec §6 (fix round 1, controller ruling R7). `?? false`: an older
      // API sends no `partialRefund` field at all, and this badge is the order
      // details page - the most-visible surface for a client or réparateur to
      // notice « Remboursée partiellement » on after a flexible partial refund.
      commande: {
        status: data.status,
        step: data.step,
        disputeOpen: data.disputeOpen,
        partialRefund: data.partialRefund ?? false,
        // V8 `Q8-08`: a held payout reads « Terminée » (client) / « Paiement en attente »
        // (réparateur). Raw: only `false` means held, so an older API (no field) reads as before.
        hasStripeTransfer: data.hasStripeTransfer,
      },
    },
    data.viewerRole,
  );
  const disputeOpen = data.disputeOpen;
  const isRefunded = data.status === 'REFUNDED';
  const badgeLabel = disputeOpen
    ? 'Suspendue — litige'
    : isRefunded
      ? data.partialRefund
        ? 'Clôturée — remboursée part.'
        : 'Clôturée — remboursée'
      : status.label;
  const badgeTone = disputeOpen ? 'danger' : isRefunded ? 'neutral' : status.tone;

  const priceCents = data.viewerRole === 'CLIENT' ? data.totalCents : data.payoutCents;
  const description = data.demandeDescription;

  return (
    <Card style={{ marginBottom: spacing.md, padding: 0, overflow: 'hidden' }}>
      {photos.length > 0 ? (
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / carouselWidth);
              setPhotoIndex(idx);
            }}
          >
            {photos.map((uri, idx) => (
              <Image
                key={`${uri}-${idx}`}
                source={{ uri }}
                style={{ width: carouselWidth, height: CAROUSEL_HEIGHT }}
                resizeMode="cover"
                accessible
                accessibilityRole="image"
                accessibilityLabel={`Photo ${idx + 1} sur ${photos.length}`}
              />
            ))}
          </ScrollView>
          {photos.length > 1 && (
            <View
              style={{
                position: 'absolute',
                bottom: spacing.sm,
                left: 0,
                right: 0,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {photos.map((_, idx) => (
                <View
                  key={idx}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: idx === photoIndex ? palette.paper : 'rgba(255,255,255,0.5)',
                  }}
                />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View
          style={{
            width: carouselWidth,
            height: CAROUSEL_HEIGHT,
            backgroundColor: palette.mist,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconPackage size={40} color={palette.faint} strokeWidth={1.5} />
        </View>
      )}

      <View style={{ padding: spacing.lg }}>
        {/* CF5-13: Meta row with order number and status badge on top to give title full width */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: spacing.sm,
            marginBottom: spacing.xs,
          }}
        >
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_500Medium',
              fontSize: 12.5,
              color: palette.muted,
              flexShrink: 0,
            }}
          >
            {data.orderNumber}
          </Text>
          <Badge tone={badgeTone} label={badgeLabel} style={{ flexShrink: 1 }} />
        </View>

        <Text
          style={{
            fontFamily: 'GoogleSansFlex_700Bold',
            fontSize: 18,
            lineHeight: 24,
            color: palette.ink,
            marginTop: 2,
          }}
        >
          {data.demandeTitle}
        </Text>

        <Text
          style={{
            fontFamily: 'GoogleSansFlex_700Bold',
            fontSize: 22,
            color: palette.ink,
            marginTop: spacing.sm,
          }}
        >
          {euros(priceCents)}
        </Text>

        {description && (
          <Pressable onPress={() => setDescExpanded((v) => !v)} accessibilityRole="button">
            <Text
              numberOfLines={descExpanded ? undefined : DESCRIPTION_LINES}
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                lineHeight: 19,
                color: palette.muted,
                marginTop: spacing.sm,
              }}
            >
              {description}
            </Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}
