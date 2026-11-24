import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { euros, isActiveCommande, privateQuoteListBadge, repairStatus, offersStillMatter } from '@revime/shared';
import { useTheme } from '../src/theme';
import { ScreenMotif } from '../src/components/ScreenMotif';
import { Card } from '../src/components/Card';
import { Badge } from '../src/components/Badge';
import { Button } from '../src/components/Button';
import { payoutHoldView, payoutsDoneFrom } from '../src/lib/fiscal-hold';
import { useRepairerJourney } from '../src/lib/use-repairer-journey';
import { useMyDemandes, useCommandes } from '../src/lib/queries';
import { useSessionContext } from '../src/lib/session';
import { IconArrowRight, IconCamera } from '../src/icons';
import { RevimeLoader } from '../src/components/lottie/RevimeLoader';
import { RevimeRefreshScrollView } from '../src/components/RevimeRefreshScrollView';
import { DemandeFilterTabs } from '../src/components/demande/DemandeFilterTabs';
import {
  filterDemandes,
  getDemandeCounts,
  getEmptyStateCopy,
  isPrivateDemandeItem,
  type DemandeFilter,
} from '../src/components/demande/demande-filter';
import { useTourPage, useTourTarget } from '../src/tour/use-tour';

/**
 * « Mes réparations » (CF4-12, design §4.3) - every client demande from creation, with
 * his status ladder, in both modes.
 *
 * 🛑 REBUILT (Task 4). It used to be `useCommandes(role)` in BOTH modes - a client saw
 * only his PAID/REFUNDED orders here, with nothing for a demande still awaiting offers,
 * even though the title already promised « Suivez toutes vos demandes de réparation ».
 * That is `CF4-12`'s whole point: the client view is now `useMyDemandes()`, the same
 * source `mes-demandes.tsx` and Accueil's « MA DEMANDE EN COURS » read, so a demande
 * appears here from the moment it is published. Réparateur mode is unchanged in its data
 * source (`useCommandes('repairer')`) - he has no demande in this list, only his orders.
 *
 * `role` is still read from `activeMode`, because that question - which rows the API
 * returns - is a different one from which QUERY this screen calls per mode.
 */
export default function Commandes() {
  const { palette } = useTheme();
  const { me } = useSessionContext();
  const activeMode = me?.profile.activeMode ?? 'CLIENT';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={2} variant={activeMode === 'REPAIRER' ? 'navy' : 'accent'} />
      {activeMode === 'REPAIRER' ? <RepairerCommandes /> : <ClientCommandes />}
    </SafeAreaView>
  );
}

/**
 * Title stays « Mes réparations » in both modes - `CF-22`'s fix, unchanged by this task:
 * mockup `01`'s réparateur panel and mockup `04`'s « Mon activité » list both use the
 * client's own word for his orders too, so there is nothing left for a ternary to choose
 * between.
 */
function ClientCommandes() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const demandes = useMyDemandes();
  const [filter, setFilter] = useState<DemandeFilter>('ALL');

  const rawDemandes = demandes.data ?? [];
  const counts = getDemandeCounts(rawDemandes);
  const displayedDemandes = filterDemandes(rawDemandes, filter);
  // « Toutes » is only offered when the list is non-empty, so only a filtered tab can be empty.
  const emptyCopy = filter === 'ALL' ? null : getEmptyStateCopy(filter);
  // V8 E2: the filter tabs exist only with at least one demande; absent, their bubble is skipped.
  useTourPage('reparations', !demandes.isPending);
  const titleTarget = useTourTarget('reparationsTitle');
  const filtersTarget = useTourTarget('reparationsFilters');

  return (
    <>
      <View {...titleTarget} style={[styles.header, { borderBottomColor: palette.line }]}>
        <Text style={[styles.title, { color: palette.ink }]}>Mes réparations</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          Suivez toutes vos demandes de réparation
        </Text>
      </View>
      {demandes.isPending ? (
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      ) : (
        <RevimeRefreshScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          onRefresh={() => demandes.refetch()}
        >

        {demandes.isError && (
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              Impossible de charger vos réparations
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              Tirez vers le bas pour réessayer.
            </Text>
          </Card>
        )}

        {/* CF6-14: 3-tab filter selector for Mes réparations */}
        {!demandes.isError && rawDemandes.length > 0 && (
          <View {...filtersTarget}>
            <DemandeFilterTabs
              activeFilter={filter}
              onChangeFilter={setFilter}
              counts={counts}
            />
          </View>
        )}

        {/* Global empty state when user has 0 total requests */}
        {!demandes.isError && rawDemandes.length === 0 && (
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              Aucune réparation pour le moment.
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              Publiez une demande avec le bouton central pour commencer.
            </Text>
          </Card>
        )}

        {/* Tab-specific empty state when filter has 0 items but user has items in other tabs */}
        {!demandes.isError && rawDemandes.length > 0 && emptyCopy !== null && displayedDemandes.length === 0 && (
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              {emptyCopy.title}
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              {emptyCopy.subtitle}
            </Text>
          </Card>
        )}

        <View style={{ gap: spacing.md }}>
          {!demandes.isError &&
            displayedDemandes.map((d) => {
              // Forward compatibility: distinguish absent (old API) from null (no commande
              // exists). An absent key degrades to null rather than client index 0,
              // suppressing the offer count - the existing pattern this screen and
              // `mes-demandes.tsx` both use.
              const commande = 'commande' in d ? d.commande : null;
              const status = repairStatus(
                { demandeStatus: d.status, offerCount: d.offerCount, commande },
                'CLIENT',
              );
              // CF4-25, CF6-15: dedicated private quote lifecycle badge (label + tone).
              const quoteRequest = d.quoteRequest ?? null;
              const isPrivateDemande = isPrivateDemandeItem(d);
              const badge = privateQuoteListBadge({
                isPrivate: isPrivateDemande,
                quoteRequest,
                status: d.status,
                offerCount: d.offerCount,
                ladderOverrides:
                  status.disputed || status.cancellationPending || commande?.status === 'REFUNDED',
              }) ?? { label: status.label, tone: status.tone };

              const handlePress = () => {
                // A private request without a commande opens its own screen, which carries the
                // quote actions (Refuser / Annuler). Once a commande exists it is ordinary.
                if (isPrivateDemande && commande === null) {
                  router.push(`/demande/${d.id}`);
                  return;
                }
                // Design §4.3 tap rule: no commande, ABANDONED or PENDING_PAYMENT -> the
                // offres screen; PAID or REFUNDED -> the commande screen. `commandeId` falls
                // back to the offres route too, per the ruling, since a null id there means
                // an old API row that cannot address a commande screen at all.
                if (
                  commande === null ||
                  commande.status === 'ABANDONED' ||
                  commande.status === 'PENDING_PAYMENT'
                ) {
                  router.push(`/demande/${d.id}/offres`);
                  return;
                }
                // PAID or REFUNDED from here.
                const commandeId = commande.commandeId ?? null;
                if (commandeId === null) {
                  router.push(`/demande/${d.id}/offres`);
                  return;
                }
                router.push(`/commande/${commandeId}`);
              };

              return (
                <Pressable key={d.id} onPress={handlePress}>
                  <Card>
                    <View style={{ flexDirection: 'row', gap: spacing.md }}>
                      {/* 54pt thumbnail, as `mes-demandes.tsx`: a mist square whether or not
                          photoUrl is present, so rows keep a single alignment. */}
                      <View
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: 12,
                          borderCurve: 'continuous',
                          backgroundColor: palette.mist,
                          overflow: 'hidden',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        {d.photoUrl ? (
                          <Image
                            source={{ uri: d.photoUrl }}
                            style={{ width: 54, height: 54 }}
                            resizeMode="cover"
                          />
                        ) : (
                          <IconCamera size={20} color={palette.faint} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.cardTitle, { color: palette.ink }]} numberOfLines={2}>
                          {d.title}
                        </Text>
                        <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                          <Badge label={badge.label} tone={badge.tone} />
                        </View>
                        <Text style={[styles.meta, { color: palette.muted }]}>
                          {d.categoryLabelFr} · {d.locationLabel}
                        </Text>
                        {!isPrivateDemande && offersStillMatter(status) && (
                          <Text style={[styles.offers, { color: palette.muted, marginTop: spacing.sm }]}>
                            {d.offerCount === 0
                              ? 'Aucune offre pour le moment'
                              : d.offerCount === 1
                                ? '1 offre reçue'
                                : `${d.offerCount} offres reçues`}
                          </Text>
                        )}
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
        </View>
      </RevimeRefreshScrollView>
      )}
    </>
  );
}

function formatFrDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '';
  }
}

function RepairerCommandes() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const { me } = useSessionContext();
  const commandes = useCommandes('repairer');
  // V8 `ISS8-020` (d): the held card names the fiscal step only when « Virements » is done.
  const repairerJourney = useRepairerJourney();
  const payoutsDone = payoutsDoneFrom(repairerJourney.journey, repairerJourney.identityError || repairerJourney.connectError);

  // Design §4.3: « N en cours » counts `isActiveCommande` rows only, not the full list -
  // a RELEASED or REFUNDED order sitting in the list must not inflate this count.
  const activeCount = (commandes.data ?? []).filter(isActiveCommande).length;
  // V8 E2: the repairer's « Mes réparations » bubble points at this header.
  useTourPage('reparations', !commandes.isPending);
  const headerTarget = useTourTarget('reparationsHeader');

  return (
    <>
      <View {...headerTarget} style={[styles.header, { borderBottomColor: palette.line }]}>
        <Text style={[styles.title, { color: palette.ink }]}>Mes réparations</Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>{`${activeCount} en cours`}</Text>
      </View>
      {commandes.isPending ? (
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      ) : (
        <RevimeRefreshScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          onRefresh={() => commandes.refetch()}
        >

        {commandes.isError && (
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              Impossible de charger vos réparations
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              Tirez vers le bas pour réessayer.
            </Text>
          </Card>
        )}

        {!commandes.isError && commandes.data?.length === 0 && (
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              Aucune réparation en cours.
            </Text>
          </Card>
        )}

        <View style={{ gap: spacing.md }}>
          {!commandes.isError &&
            (commandes.data ?? []).map((c) => {
              // Réparateur rows carry no demande in this list and no offer count of their
              // own - `demandeStatus: null, offerCount: 0`, per design §4.3's call shape.
              const status = repairStatus(
                {
                  demandeStatus: null,
                  offerCount: 0,
                  // CF4-15 / spec §6 (fix round 1, controller ruling R7). `?? false`: an
                  // older API sends no `partialRefund` field, same reasoning as the order
                  // details badge in `CommandeHeaderCard`.
                  commande: {
                    status: c.status,
                    step: c.step,
                    disputeOpen: c.disputeOpen,
                    partialRefund: c.partialRefund ?? false,
                    // CF4-27. `?? false`: an older API sends no field at all.
                    cancellationPending: c.cancellationPending ?? false,
                    // V8 `Q8-08`: a held payout reads « Paiement en attente ». Passed raw: only
                    // `false` means held, so an older API (no field) reads as before.
                    hasStripeTransfer: c.hasStripeTransfer,
                  },
                },
                'REPAIRER',
              );

              // CMP-D3, widened by V8 B2: the amber « paiement en attente » card for every held payout,
              // see payoutHoldView.
              const hold = payoutHoldView(c, me?.repairer, payoutsDone);
              if (hold) {
                const validatedDate = formatFrDate(c.releasedAt);
                return (
                  <Card key={c.id}>
                    <Pressable onPress={() => router.push(`/commande/${c.id}`)}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, paddingRight: spacing.sm }}>
                          <Text
                            style={{
                              fontFamily: 'GoogleSansFlex_700Bold',
                              fontSize: 15,
                              color: palette.ink,
                            }}
                            numberOfLines={2}
                          >
                            {c.demandeTitle}
                          </Text>
                          <Text
                            style={{
                              fontFamily: 'GoogleSansFlex_400Regular',
                              fontSize: 13,
                              color: palette.muted,
                              marginTop: 3,
                            }}
                          >
                            {validatedDate ? `Validée par le client le ${validatedDate}` : 'Validée par le client'}
                          </Text>
                        </View>
                        {/* V8 `ISS8-020` (c): `Q8-08`'s amber « Paiement en attente », as on the order page
                            (was CMP-D3's hard-coded green « Validée »; the line beside it already says so). */}
                        <Badge label={status.label} tone={status.tone} />
                      </View>
                    </Pressable>

                    <View
                      style={{
                        marginTop: 14,
                        backgroundColor: '#fffbeb',
                        borderWidth: 1,
                        borderColor: '#fef3c7',
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: 'GoogleSansFlex_700Bold',
                          fontSize: 14,
                          color: '#b45309',
                          marginBottom: 4,
                        }}
                      >
                        {hold.title}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'GoogleSansFlex_400Regular',
                          fontSize: 12.5,
                          lineHeight: 18,
                          color: palette.ink,
                        }}
                      >
                        {hold.body}
                      </Text>
                    </View>

                    <View style={{ marginTop: 10 }}>
                      <Button label={hold.cta} onPress={() => router.push(hold.route)} />
                    </View>
                  </Card>
                );
              }

              return (
                <Pressable key={c.id} onPress={() => router.push(`/commande/${c.id}`)}>
                  <Card>
                    <View style={styles.cardContent}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: 'GoogleSansFlex_700Bold',
                            fontSize: 14,
                            color: palette.ink,
                          }}
                          numberOfLines={2}
                        >
                          {c.demandeTitle}
                        </Text>
                        <View style={{ marginTop: 4 }}>
                          <Badge label={status.label} tone={status.tone} />
                        </View>
                      </View>
                      <View style={styles.rightContent}>
                        <Text
                          style={{
                            fontFamily: 'GoogleSansFlex_700Bold',
                            fontSize: 15,
                            color: palette.ink,
                          }}
                        >
                          {euros(c.payoutCents)}
                        </Text>
                        <IconArrowRight size={18} color={palette.muted} strokeWidth={2.2} />
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
        </View>
      </RevimeRefreshScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 24,
  },
  subtitle: {
    fontFamily: 'GoogleSansFlex_400Regular',
    fontSize: 13.5,
    marginTop: 2,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  meta: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },
  offers: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5 },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
