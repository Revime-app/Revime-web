import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { ScreenMotif } from '../src/components/ScreenMotif';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Card } from '../src/components/Card';
import { Badge } from '../src/components/Badge';
import { useMyDemandes } from '../src/lib/queries';
import { privateQuoteListBadge, repairStatus, offersStillMatter } from '@revime/shared';
import { IconCamera } from '../src/icons';
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

/**
 * The client's full list of demandes.
 *
 * This is the screen Accueil used to be. When Accueil became the prototype's landing
 * page on 2026-08-20 it kept only « Ma demande en cours », so the list needed somewhere
 * to live rather than being deleted - a client with four demandes must still be able to
 * reach the other three.
 *
 * 🛑 CORRECTED 2026-09-04 (`CF-35`): Accueil does NOT link here only « whenever the list
 * holds more than one ». Its condition is `total > 0 && (current === null || total > 1)`,
 * so the link also appears when no demande is ACTIVE - the state a client whose demandes
 * are all `DONE` or `CANCELLED` is in, and the one where this screen is the only way to see
 * them. Read the condition at the call site, not this sentence.
 *
 * 🛑 THE NAMING CLASH THIS COMMENT USED TO DESCRIBE IS GONE, corrected 2026-08-30 by
 * `CF-11`. It read: "Profil already has a row labelled « Mes demandes » that opens
 * `/commandes`, which lists COMMANDES - paid orders - not demandes." **No such row
 * exists, and none has for days** - the mislabelling was fixed by splitting the
 * RACCOURCIS grid into distinct « Mes demandes » and « Mes commandes » tiles, and
 * `CF-11` then renamed the client-mode one to « Mes réparations » to match both the
 * client's own word and `commandes.tsx:20`, which already titled that screen so.
 *
 * It is rewritten rather than deleted because the shape is the lesson: a present-tense
 * claim about a DIFFERENT file rots silently, since nothing here fails when that file
 * changes. This one asserted a row's existence and outlived it.
 *
 * 🛑 THERE IS NOW EXACTLY **ONE** ROUTE HERE, AND IT IS CLIENT-MODE ONLY. Verified by
 * grepping `mes-demandes` rather than reasoned about:
 *
 *   - Accueil, whose link shows whenever the client has a demande this screen is not
 *     already showing - `total > 0 && (current === null || total > 1)`, NOT « more than one »
 *     as this line said until 2026-09-04. That call sits inside `ClientHome`, and
 *     `Accueil` early-returns `RepairerHome` for the other mode, so it cannot be reached
 *     from réparateur mode at all.
 *
 * ~~The RACCOURCIS « Mes demandes » tile, which survives in `repairerShortcuts` only.~~
 * **`CF-22` DELETED THAT TILE ON 2026-08-30, so the count went from two routes to one.**
 * « Mes demandes » is not among the six réparateur rubriques the client drew in mockup
 * `01`, and it was the only réparateur-mode route to this screen - so a réparateur now
 * reaches his own demandes by switching to CLIENT mode. **That was the owner's explicit
 * call, on the grounds that one's own repair requests are client-mode content. Do not
 * restore the tile without asking him.**
 *
 * **If you change the Accueil link, check this comment again** - it is now the single
 * point of failure for this screen's reachability. Note the first draft claimed Accueil
 * was the only route when there were two; it is the only route now, for a different
 * reason, and that coincidence is exactly why the claim needs re-grepping and not
 * re-reading.
 *
 * Rows are ordered by `/demandes/mine` and not re-sorted here: the API owns that order
 * and a second sort is how two screens come to disagree about "most recent".
 */
export default function MesDemandes() {
  const { palette, spacing, radii } = useTheme();
  const router = useRouter();
  const demandes = useMyDemandes();
  const [filter, setFilter] = useState<DemandeFilter>('ALL');

  const rawDemandes = demandes.data ?? [];
  const counts = getDemandeCounts(rawDemandes);
  const displayedDemandes = filterDemandes(rawDemandes, filter);
  // « Toutes » is only offered when the list is non-empty, so only a filtered tab can be empty.
  const emptyCopy = filter === 'ALL' ? null : getEmptyStateCopy(filter);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={1} variant="accent" />
      {/* onBack is REQUIRED here, not optional polish: ScreenHeader renders an empty
          spacer without it, and this is a pushed screen, so omitting it strands the
          client with no way back but the tab bar. */}
      <ScreenHeader title="Mes demandes" onBack={() => router.back()} />
      {demandes.isPending ? (
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      ) : (
        <RevimeRefreshScrollView
          contentContainerStyle={{ padding: spacing.lg }}
          onRefresh={() => demandes.refetch()}
        >
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            Suivez toutes vos demandes de réparation
          </Text>

          {demandes.isError && (
            <Text style={[styles.bodyStrong, { color: palette.red }]}>
              Impossible de charger vos demandes. Tirez vers le bas pour réessayer.
            </Text>
          )}

          {/* CF6-14: 3-tab filter selector for Mes demandes */}
          {!demandes.isError && rawDemandes.length > 0 && (
            <DemandeFilterTabs
              activeFilter={filter}
              onChangeFilter={setFilter}
              counts={counts}
            />
          )}

          {/* Global empty state when user has 0 total requests */}
          {!demandes.isError && rawDemandes.length === 0 && (
            <Card>
              <Text style={[styles.emptyTitle, { color: palette.ink }]}>
                Aucune demande pour le moment
              </Text>
              <Text style={[styles.emptyBody, { color: palette.muted }]}>
                Appuyez sur le bouton central pour publier votre première demande.
              </Text>
            </Card>
          )}

          {/* Tab-specific empty state when filter has 0 items but user has items in other tabs */}
          {!demandes.isError && rawDemandes.length > 0 && emptyCopy !== null && displayedDemandes.length === 0 && (
            <Card>
              <Text style={[styles.emptyTitle, { color: palette.ink }]}>
                {emptyCopy.title}
              </Text>
              <Text style={[styles.emptyBody, { color: palette.muted }]}>
                {emptyCopy.subtitle}
              </Text>
            </Card>
          )}

        <View style={{ gap: spacing.md }}>
          {!demandes.isError &&
            displayedDemandes.map((d) => {
              // Forward compatibility: distinguish absent (old API) from null (no commande exists).
              // An absent key degrades to null rather than client index 0, suppressing the offer count.
              const status = repairStatus(
                { demandeStatus: d.status, offerCount: d.offerCount, commande: 'commande' in d ? d.commande : null },
                'CLIENT',
              );
              // CF4-25, CF6-15: dedicated private quote lifecycle badge (label + tone).
              const quoteRequest = d.quoteRequest ?? null;
              const isPrivateDemande = isPrivateDemandeItem(d);
              const commandeRow = 'commande' in d ? d.commande : null;
              const badge = privateQuoteListBadge({
                isPrivate: isPrivateDemande,
                quoteRequest,
                status: d.status,
                offerCount: d.offerCount,
                ladderOverrides:
                  status.disputed || status.cancellationPending || commandeRow?.status === 'REFUNDED',
              }) ?? { label: status.label, tone: status.tone };
              const target =
                isPrivateDemande && commandeRow === null
                  ? `/demande/${d.id}`
                  : (commandeRow !== null && (commandeRow.status === 'PAID' || commandeRow.status === 'REFUNDED') && commandeRow.commandeId)
                    ? `/commande/${commandeRow.commandeId}`
                    : `/demande/${d.id}/offres`;
              return (
                <Pressable key={d.id} onPress={() => router.push(target)}>
                  <Card>
                    <View style={{ flexDirection: 'row', gap: spacing.md }}>
                      {/* Thumbnail: rendered as a mist square whether or not photoUrl is present,
                          so rows keep a single alignment. When photoUrl is null, a faint camera
                          glyph is shown so the square reads as a deliberate empty state rather than
                          a failed image load. URLs are signed and expire after one hour; a screen
                          left open longer will show a blank image. Refresh is deliberately out of
                          scope. */}
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
                        {/* `cover`, corrected 2026-08-21 with the two feed cards. This box is
                            SQUARE and demande photos are landscape, so `contain` rendered a
                            letterboxed strip with most of the tile empty above and below it. */}
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
                        <Text style={[styles.title, { color: palette.ink }]} numberOfLines={2}>
                          {d.title}
                        </Text>
                        <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                          <Badge
                            label={badge.label}
                            tone={badge.tone}
                          />
                        </View>
                        <Text style={[styles.meta, { color: palette.muted }]}>
                          {d.categoryLabelFr} · {d.locationLabel}
                        </Text>
                        {!isPrivateDemande && offersStillMatter(status) && (
                          <Text style={[styles.offers, { color: palette.muted, marginTop: spacing.sm }]}>
                            {d.offerCount === 0
                              ? 'Aucune offre pour le moment'
                              : `${d.offerCount} offre${d.offerCount > 1 ? 's' : ''} reçue${d.offerCount > 1 ? 's' : ''}`}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  subtitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, marginBottom: 16 },
  title: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  meta: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },
  offers: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  bodyStrong: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
  emptyTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  emptyBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },
});
