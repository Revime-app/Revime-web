import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  delayLabel,
  hasWarranty,
  euros,
  partitionOffers,
  pastSectionHeading,
  VERIFIED_BADGE_LABEL,
  type OfferDto,
} from '@revime/shared';
import { useTheme } from '../../../src/theme';
import { Card } from '../../../src/components/Card';
import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import {
  useDemande,
  useDemandeOffers,
  useOpenConversation,
  useCancelDemande,
  useCancelQuote,
  useDeclineOffer,
} from '../../../src/lib/queries';
import { useSessionContext } from '../../../src/lib/session';
import { ApiError } from '../../../src/lib/api';
import { useState } from 'react';
import { RevimeLoader } from '../../../src/components/lottie/RevimeLoader';
import { RevimeRefreshScrollView } from '../../../src/components/RevimeRefreshScrollView';
import { isPrivateDemandeItem } from '../../../src/components/demande/demande-filter';

/**
 * Total over the enum, so an offer can never render with no badge. Only SENT and
 * WITHDRAWN are reachable today - no route sets ACCEPTED or REJECTED until the
 * accept étape exists - but a status that fell through this map would put an
 * unlabelled card in the past section.
 */
const PAST_STATUS_LABEL: Record<OfferDto['status'], string> = {
  SENT: 'Envoyée',
  ACCEPTED: 'Acceptée',
  REJECTED: 'Non retenue',
  WITHDRAWN: 'Offre retirée',
};

export default function Offres() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const demandeId = id ?? '';
  const { palette, spacing, type, accent } = useTheme();
  const router = useRouter();
  const demande = useDemande(demandeId);
  const offers = useDemandeOffers(demandeId);
  const { me } = useSessionContext();
  const openConversation = useOpenConversation();
  const cancelDemande = useCancelDemande(demandeId);
  const cancelQuote = useCancelQuote(demandeId);
  const declineOffer = useDeclineOffer(demandeId);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = demande.data?.author === null;
  const isPrivate = demande.data ? isPrivateDemandeItem(demande.data) : false;
  // A private request must use the quote endpoint (the demande one answers QUOTE_USE_CANCEL).
  const cancel = isPrivate ? cancelQuote : cancelDemande;

  const all = offers.data ?? [];
  // Three mutually exclusive buckets, in render order. `past` is the complement
  // of the other two, so an accepted offer can never be badged « Acceptée »
  // beneath an « Offres retirées » heading - it is removed before that section
  // exists rather than special-cased inside it.
  const { accepted, live, past } = partitionOffers(all);
  const count = live.length;

  const onContact = (offer: OfferDto) => {
    if (openConversation.isPending) return;
    setError(null);
    openConversation.mutate(
      { demandeId, repairerUserId: offer.repairerUserId },
      {
        onSuccess: ({ id }) => router.push(`/conversation/${id}`),
        // Same reasoning as the composer: a button that silently does nothing reads
        // as broken. The 422 and the offer-gate refusal both carry authored French.
        onError: (e) => setError(e instanceof ApiError ? e.message : "La conversation n'a pas pu être ouverte."),
      },
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <RevimeRefreshScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        onRefresh={() => offers.refetch()}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: spacing.md }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.muted }}>
            Retour
          </Text>
        </Pressable>

        <Text
          style={{
            fontFamily: 'GoogleSansFlex_700Bold',
            fontSize: type.screenTitle.size,
            color: palette.ink,
          }}
        >
          Offres reçues
        </Text>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13.5,
            color: palette.muted,
            marginBottom: spacing.lg,
          }}
          numberOfLines={2}
        >
          {demande.data?.title ?? ''}
          {count > 0 ? ` · ${headline(count)}` : ''}
        </Text>

        <Pressable
          onPress={() => router.push(`/demande/${demandeId}`)}
          style={{ marginBottom: spacing.md }}
        >
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_600SemiBold',
              fontSize: 13,
              color: accent.accent,
            }}
          >
            Voir les détails de l&apos;annonce →
          </Text>
        </Pressable>

        {/* CF4-27, CF6-12. Gated on OPEN and at least one offer: without an offer there is nobody
            to inform, and a failed cancel shows the server's reason instead of pre-filtering it. */}
        {demande.data?.status === 'OPEN' && count > 0 && (
          <Pressable
            onPress={() => {
              Alert.alert(
                'Annuler la demande ?',
                'Les réparateurs ayant fait une offre seront informés. Cette action est définitive.',
                [
                  { text: 'Annuler', style: 'cancel' },
                  {
                    text: 'Confirmer',
                    style: 'destructive',
                    onPress: () => {
                      cancel.mutate(undefined, {
                        onSuccess: () => router.replace('/mes-demandes'),
                        onError: (e) =>
                          setError(e instanceof ApiError ? e.message : "L'annulation n'a pas pu être effectuée."),
                      });
                    },
                  },
                ],
              );
            }}
            disabled={cancel.isPending}
            style={{ marginBottom: spacing.lg }}
          >
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_600SemiBold',
                fontSize: 13,
                color: palette.red,
              }}
            >
              Annuler la demande
            </Text>
          </Pressable>
        )}

        {offers.isPending && (
          <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
            <RevimeLoader variant="fill" size={72} />
          </View>
        )}

        {offers.isError && (
          <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', color: palette.red }}>
            Impossible de charger les offres. Tirez vers le bas pour réessayer.
          </Text>
        )}

        {error && (
          <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', color: palette.red, marginBottom: spacing.md }}>
            {error}
          </Text>
        )}

        {!offers.isPending && !offers.isError && !accepted && count === 0 && (
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              {past.length === 0 ? 'Aucune offre pour le moment' : 'Aucune offre active'}
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              {past.length === 0
                ? 'Les réparateurs intéressés vous proposeront un prix ici.'
                : past.some((o) => o.status === 'REJECTED')
                  ? 'Vous avez retenu une offre.'
                  : 'Les offres reçues ont toutes été retirées. Elles restent visibles ci-dessous.'}
            </Text>
          </Card>
        )}

        {accepted && (
          <View style={{ marginBottom: spacing.xl }}>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_700Bold',
                fontSize: type.section.size,
                color: palette.ink,
                marginBottom: spacing.md,
              }}
            >
              Offre retenue
            </Text>
            <OfferCard
              offer={accepted}
              onProfile={() =>
                // Do not pass offerId for an already-accepted offer: the profile's bar
                // would offer « Choisir cette offre » for an offer already accepted,
                // which this very file withholds on that card and which the comment below
                // argues against for withdrawn offers.
                router.push(`/reparateur/${accepted.repairerUserId}?demandeId=${demandeId}`)
              }
            />
          </View>
        )}

        {!offers.isError && (
          <View style={{ gap: spacing.md }}>
            {live.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                onChoose={
                  me?.paymentsEnabled
                    ? () => router.push(`/demande/${demandeId}/paiement?offerId=${o.id}`)
                    : undefined
                }
                onContact={
                  me?.messagingEnabled
                    ? () => onContact(o)
                    : undefined
                }
                onProfile={() =>
                  router.push(
                    `/reparateur/${o.repairerUserId}?demandeId=${demandeId}&offerId=${o.id}`,
                  )
                }
                onDecline={
                  isAuthor && demande.data?.status === 'OPEN'
                    ? () => {
                        Alert.alert(
                          isPrivate ? 'Refuser le devis ?' : "Décliner l'offre ?",
                          isPrivate
                            ? 'Le réparateur sera informé de votre refus. Cette demande de devis sera clôturée.'
                            : 'Le réparateur sera informé que son offre n’a pas été retenue.',
                          [
                            { text: 'Annuler', style: 'cancel' },
                            {
                              text: isPrivate ? 'Refuser le devis' : "Décliner l'offre",
                              style: 'destructive',
                              onPress: () => {
                                setError(null);
                                declineOffer.mutate(o.id, {
                                  onError: (e) =>
                                    setError(
                                      e instanceof ApiError
                                        ? e.message
                                        : "L'offre n'a pas pu être déclinée.",
                                    ),
                                });
                              },
                            },
                          ],
                        );
                      }
                    : undefined
                }
                declineLabel={isPrivate ? 'Refuser le devis' : "Décliner l'offre"}
                declineLoading={declineOffer.isPending}
              />
            ))}
          </View>
        )}

        {/* Comparing one offer is meaningless, so the entry point only exists at two. */}
        {count >= 2 && (
          <View style={{ marginTop: spacing.xl }}>
            <Button
              label={`Comparer les ${count} offres`}
              onPress={() => router.push(`/demande/${demandeId}/comparaison`)}
            />
          </View>
        )}

        {!offers.isError && past.length > 0 && (
          <View style={{ marginTop: spacing.xl }}>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_700Bold',
                fontSize: type.section.size,
                color: palette.ink,
              }}
            >
              {pastSectionHeading(past)}
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
                marginBottom: spacing.md,
              }}
            >
              {past.some((o) => o.status === 'REJECTED')
                ? 'Vous avez retenu une autre offre.'
                : 'Un réparateur qui change son prix retire son offre et en propose une nouvelle.'}
            </Text>
            <View style={{ gap: spacing.md }}>
              {/* No onProfile here, deliberately. A withdrawn or rejected offer cannot be
                  chosen on this demande, so the profile would render « Choisir cette
                  offre » for an offer that no longer exists. Reached from a live or
                  accepted card instead. */}
              {past.map((o) => (
                <OfferCard key={o.id} offer={o} past />
              ))}
            </View>
          </View>
        )}
      </RevimeRefreshScrollView>
    </SafeAreaView>
  );
}

/**
 * One offer, live or past.
 *
 * A past offer is recessed rather than dimmed: it sits flat on `mist` while a
 * live offer floats on `paper` with the card shadow, so elevation reads as
 * "you can act on this" before any label is read. Its price is struck through,
 * which is the one signal that needs no explanation - that figure is void.
 * Nothing is hidden, because the point is the record.
 */
function OfferCard({
  offer: o,
  past = false,
  onChoose,
  onContact,
  onProfile,
  onDecline,
  declineLabel = "Décliner l'offre",
  declineLoading = false,
}: {
  offer: OfferDto;
  past?: boolean;
  onChoose?: () => void;
  onContact?: () => void;
  onProfile?: () => void;
  onDecline?: () => void;
  declineLabel?: string;
  declineLoading?: boolean;
}) {
  const { palette, spacing } = useTheme();

  return (
    <Card
      style={
        past && {
          backgroundColor: palette.mist,
          shadowOpacity: 0,
          elevation: 0,
        }
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_600SemiBold',
            fontSize: 15,
            color: past ? palette.muted : palette.ink,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {o.repairerName}
        </Text>
        {past && <Badge label={PAST_STATUS_LABEL[o.status]} tone="neutral" />}
      </View>

      {/* Its own line rather than beside the name, because « Professionnel
          vérifié » is nearly three times the width of the « Vérifié » that used
          to sit there and would truncate the réparateur's name. The prototype
          does the same with this exact label on its réparateur profile
          (`RepairerProfile.tsx:49`): name, then the badge beneath it.

          One tone for both, deliberately. Green is what the prototype's own offer
          card uses for this signal, and red is this app's warranty tone - but the
          load-bearing reason is that the two badges are ranked equal, so giving
          either its own colour would rank them by colour. */}
      {!past && o.verifiedBadge && (
        <Badge
          label={VERIFIED_BADGE_LABEL[o.verifiedBadge]}
          tone="verified"
          style={{ marginTop: 6 }}
        />
      )}

      <Text
        style={{
          fontFamily: 'GoogleSansFlex_700Bold',
          fontSize: 20,
          color: past ? palette.muted : palette.ink,
          marginTop: 4,
          textDecorationLine: past ? 'line-through' : 'none',
        }}
      >
        {euros(o.priceCents)}
      </Text>

      <Text
        style={{
          fontFamily: 'GoogleSansFlex_500Medium',
          fontSize: 13,
          // Past offers use muted rather than faint for contrast: faint measures
          // ~2.33:1 on mist, below the 4.5:1 WCAG AA threshold
          color: palette.muted,
          marginTop: 4,
        }}
      >
        {/* CF-31: the garantie clause DROPS OUT when there is none, rather than
            rendering « Garantie Aucune ». That is now the ordinary case, not an edge
            one - the server suppresses the label for every réparateur below BUSINESS,
            which is 44 of the 47 offers that exist. An absent warranty needs no words
            on a card whose whole job is comparison. */}
        {delayLabel(o.delayHours)} ·{' '}
        {hasWarranty(o.warrantyLabel) ? `Garantie ${o.warrantyLabel} · ` : ''}
        {o.travel === 'HOME' ? 'À domicile' : 'En atelier'}
        {o.distanceKm !== null ? ` · ${String(o.distanceKm).replace('.', ',')} km` : ''}
      </Text>

      {/* 🛑 `partsLabel` - its OWN line, and until 2026-08-25 it was not rendered at all.
          Found by `CF-30`'s audit: the field is on the model (`schema.prisma:250`), in
          `createOfferSchema`, on `OfferDto` (`offer.schemas.ts:119`) and presented by
          `offers.service.ts:319`, and the réparateur picks it from three chips at
          `offre.tsx:218` - but every one of its references in `apps/mobile` was in the form
          that WRITES it. Nothing ever read it, so the client chose between offers without
          being told whether the parts were original, compatible or his own. No rationale for
          the omission exists anywhere in the specs or plans, unlike every deliberate
          exclusion in `compare-criteria.ts`, which documents each one in place.

          A second line rather than a fifth item on the line above, deliberately: that line
          already carries délai · garantie · déplacement · distance, and at 13pt a fifth
          dot-separated clause wraps mid-phrase on a 390pt screen. This is the same treatment
          `o.comment` gets directly below. The three enum values all begin with « Pièce », so
          the value carries its own label and no « Pièces : » prefix is needed.

          NOT added to `visibleCriteria` in the same change - that is the Comparaison screen
          and the product's named differentiator, and parts type is unrankable in exactly the
          way `Déplacement` is. Recorded against `CF-30` for the owner rather than decided
          here. */}
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_500Medium',
          fontSize: 13,
          color: palette.muted,
          marginTop: 2,
        }}
      >
        {o.partsLabel}
      </Text>

      {o.comment && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13,
            color: past ? palette.muted : palette.ink2,
            marginTop: spacing.sm,
          }}
        >
          {o.comment}
        </Text>
      )}

      {(onChoose || onContact || onProfile || onDecline) && (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {onChoose && <Button label="Choisir" onPress={onChoose} />}
          {onContact && <Button label="Contacter" onPress={onContact} variant="secondary" />}
          {/* Unlike the other two this needs NO flag: reading a réparateur's reputation
              before choosing is the whole point of the directory, and nothing about it
              waits on payments or messaging. In production today it is the ONLY button
              on this card. */}
          {onProfile && <Button label="Voir le profil" onPress={onProfile} variant="text" />}
          {onDecline && (
            <Pressable
              onPress={onDecline}
              disabled={declineLoading}
              accessibilityRole="button"
              accessibilityLabel={declineLabel}
              hitSlop={8}
              style={({ pressed }) => [
                {
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: declineLoading ? 0.4 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_600SemiBold',
                  fontSize: 13.5,
                  color: palette.red,
                }}
              >
                {declineLabel}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </Card>
  );
}

function headline(count: number): string {
  return count === 1 ? '1 offre reçue' : `${count} offres reçues`;
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
