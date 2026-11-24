import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { ScreenMotif } from '../src/components/ScreenMotif';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Card } from '../src/components/Card';
import { RevimeLoader } from '../src/components/lottie/RevimeLoader';
import { useReceivedOffers } from '../src/lib/queries';
import { delayLabel, euros } from '@revime/shared';
import { IconChevronRight } from '../src/icons';
import { RevimeRefreshScrollView } from '../src/components/RevimeRefreshScrollView';
import { useTourPage, useTourTarget } from '../src/tour/use-tour';

/**
 * `CF-11`'s « Mes offres reçues » - every offer the client has been sent, across every demande.
 *
 * 🛑 WHY THIS IS OFFER-CENTRIC AND NOT A FILTERED `mes-demandes.tsx`. The cheap version of this
 * screen lists the client's demandes that happen to have offers, and it is one filter away from
 * `mes-demandes.tsx`, which already shows every demande with its offer count and already routes
 * its rows to `/demande/[id]/offres`. Two screens differing by a `where` is « des écrans qui font
 * doublon » in the client's own words. His rubrique is called « Offres reçues » with the subtitle
 * « Offres des réparateurs », so the row is an OFFER: who, how much, how long, on which demande.
 *
 * The server decides which offers still matter - see `offers.service.ts`'s `listReceived`, which
 * applies the shared `offersStillMatter` predicate so this screen cannot show an offer beside a
 * demande the client has already paid for. Nothing is re-filtered here, and nothing is re-sorted:
 * the API orders newest-first and a second sort is how two screens come to disagree about
 * « most recent ».
 *
 * 🛑 THE ROW IS A ROUTE TO THE OFFER, NOT A SECOND RENDERING OF IT. No rating, no « vérifié », no
 * garantie, no distance. Each of those is governed by a rule with its own history - `CF-31`'s
 * garantie suppression, the fail-closed trust badge, the per-list stats aggregate - and a compact
 * row restating one incorrectly would contradict the screen it taps through to. Tapping opens the
 * demande's own offers screen, which owns all of them.
 *
 * On staleness: `query.tsx` sets `staleTime: 30s` with refetch-on-focus driven from `AppState`,
 * which is this app's whole freshness mechanism. Paying for an offer flips its siblings to
 * REJECTED server-side, so this list shrinks on the next focus. No bespoke invalidation is added,
 * because none of the existing mutations declares any for the equivalent lists either.
 *
 * On the API being older than the app: unlike a FIELD added to an existing DTO - the case
 * `AGENTS.md` warns about, where a stale server sends `undefined` and every `!== null` guard
 * passes - this is a whole new ROUTE. It either exists and returns the full shape, or it 404s and
 * `isError` is true. There is no intermediate shape to normalise, so the error state is the guard.
 */
export default function OffresRecues() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const offers = useReceivedOffers();
  // V8 E2: the subtitle renders once the list has loaded (a loader stands in before).
  useTourPage('offres', !offers.isPending);
  const subtitleTarget = useTourTarget('offresSubtitle');

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={1} variant="accent" />
      {/* onBack is REQUIRED, not optional polish: ScreenHeader renders an empty spacer without
          it, and this is a pushed screen, so omitting it strands the client with no way back
          but the tab bar. Same reasoning as `mes-demandes.tsx`. */}
      <ScreenHeader title="Mes offres reçues" onBack={() => router.back()} />
      {offers.isPending ? (
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      ) : (
        <RevimeRefreshScrollView
          contentContainerStyle={{ padding: spacing.lg }}
          onRefresh={() => offers.refetch()}
        >
          <Text {...subtitleTarget} style={[styles.subtitle, { color: palette.muted }]}>
            Les offres des réparateurs sur vos demandes
          </Text>

        {offers.isError && (
          <Text style={[styles.bodyStrong, { color: palette.red }]}>
            Impossible de charger vos offres. Tirez vers le bas pour réessayer.
          </Text>
        )}

        {!offers.isError && offers.data?.length === 0 && (
          <Card>
            <Text style={[styles.emptyTitle, { color: palette.ink }]}>
              Aucune offre pour le moment
            </Text>
            {/* Describes the mechanism rather than asserting a fact about the world - the
                distinction `AGENTS.md` draws about prototype copy. « Les réparateurs répondent
                en moins de 30 minutes » would be an invented statistic; this is not. */}
            <Text style={[styles.emptyBody, { color: palette.muted }]}>
              Les offres reçues sur vos demandes publiques apparaîtront ici. Les devis privés se
              consultent dans Mes réparations, onglet Devis privés.
            </Text>
          </Card>
        )}

        <View style={{ gap: spacing.md }}>
          {!offers.isError &&
            (offers.data ?? []).map((o) => (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                onPress={() => router.push(`/demande/${o.demandeId}/offres`)}
              >
                <Card>
                  <View style={styles.headRow}>
                    <Text
                      style={[styles.repairer, { color: palette.ink }]}
                      numberOfLines={1}
                    >
                      {o.repairerName}
                    </Text>
                    {/* `euros` is the app's single French money formatter, so this cannot
                        disagree with the offer card the row opens. */}
                    <Text style={[styles.price, { color: palette.ink }]}>
                      {euros(o.priceCents)}
                    </Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text
                      style={[styles.meta, { color: palette.muted }]}
                      numberOfLines={1}
                    >
                      {o.demandeTitle} · {delayLabel(o.delayHours)}
                    </Text>
                    {/* A CHEVRON, not an arrow: « a screen lies behind this row », which is what
                        `src/icons.ts` records the two glyphs as meaning. */}
                    <IconChevronRight size={16} color={palette.muted} strokeWidth={2.2} />
                  </View>
                </Card>
              </Pressable>
            ))}
        </View>

        {/* Rendered only when there is something to explain, so it cannot read as a disclaimer
            on an empty screen. Two offers on one demande are adjacent rows rather than a group:
            grouping would re-create `mes-demandes.tsx`'s shape, which is the thing this screen
            exists not to be. */}
        {!offers.isError && (offers.data?.length ?? 0) > 0 && (
          <Text style={[styles.footnote, { color: palette.faint }]}>
            Appuyez sur une offre pour la comparer aux autres offres de la même demande.
          </Text>
        )}
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
  subtitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, marginBottom: 16 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  // `flex: 1` on the name and none on the price, so a long réparateur name truncates and the
  // amount is never the thing that gets cut. Money is the value being compared.
  repairer: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, flex: 1 },
  price: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 15 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  meta: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, flex: 1 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  bodyStrong: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
  emptyTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  emptyBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },
  footnote: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, marginTop: 16 },
});
