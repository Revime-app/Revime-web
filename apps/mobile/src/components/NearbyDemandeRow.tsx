import { View, Text, Pressable, ScrollView, StyleSheet, Image } from 'react-native';
import { useTheme } from '../theme';
import { IconCamera, IconLocation } from '../icons';
import { euros, timeAgoLabel, type FeedItem } from '@revime/shared';

/**
 * « Dernières demandes près de vous » - the horizontal row of demande cards on the
 * réparateur's Accueil (`repareme-web/src/screens/AccueilPro.tsx:49-70`, `.nearby-row`
 * and `.nearby-card` at `styles.css:1615-1618`).
 *
 * 🛑 THE HEADING SWITCHES ON DATA, and this is the whole reason this component takes
 * `located` rather than reading a flag. `distanceKm` is null for every row until the
 * réparateur saves a postal code, which is the state EVERY live account is in today.
 * « près de vous » with no distances is a promise the screen cannot keep, so the heading
 * drops those three words and the cards drop the distance line until there is one.
 *
 * Capped at `MAX_CARDS`, which is a real cap and therefore stated: this is a shortcut to
 * the feed, not the feed. « Voir tout » opens the full one.
 */

/** Six is two and a half cards' worth of scroll - enough to read as a row that continues. */
const MAX_CARDS = 6;

const CARD_W = 150;
const IMAGE_H = 90;

/**
 * The row's exact height, reserved BEFORE the query resolves so the activity card below
 * does not jump when it lands. Same technique and same reason as `CategoryTiles.ROW_H`:
 * every query on this screen round-trips to Postgres in Paris.
 *
 * Image, then the 10/12/12 padding box holding a 13.5pt title, a 12pt sub-line, a 15pt
 * price and an 11pt meta line with their margins.
 */
const ROW_H = IMAGE_H + 10 + 19 + 2 + 17 + 6 + 21 + 4 + 15 + 12;

/**
 * The price line, and the card's spoken label with it. « Ouverte » for a demande with no budget (an
 * OFFERS-mode demande has no fixed price yet): « Recherche d'offres » truncated to « Recherche d'o… » on
 * the 150pt card (CF6-D3).
 */
function priceLabel(budgetCents: number | null): string {
  return budgetCents === null ? 'Ouverte' : euros(budgetCents);
}

/**
 * « 4 km · il y a 5 min », or whichever halves exist. Null when neither does, so the caller
 * omits the row instead of rendering an empty one.
 *
 * `distanceKm` is null until the réparateur has a postal code, and `timeAgoLabel` is null for
 * a date it cannot parse, so BOTH halves are independently optional - which is why this joins
 * a filtered list rather than concatenating with a literal separator.
 */
function metaLine(d: FeedItem, now: Date): string | null {
  const parts = [
    d.distanceKm === null ? null : `${d.distanceKm} km`,
    timeAgoLabel(d.createdAt, now),
  ].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

type Props = {
  items: FeedItem[] | undefined;
  isPending: boolean;
  isError: boolean;
  /** True once the réparateur has a postal code, so distances are real. */
  located: boolean;
  /** Rendered against a single `now`, passed in so every card in one frame agrees. */
  now: Date;
  onOpenDemande: (id: string) => void;
  onSeeAll: () => void;
};

export function NearbyDemandeRow({
  items,
  isPending,
  isError,
  located,
  now,
  onOpenDemande,
  onSeeAll,
}: Props) {
  const { palette, accent, spacing, radii } = useTheme();

  const cards = (items ?? []).slice(0, MAX_CARDS);

  // Only a definitive "there is nothing" removes the section - an empty feed is a real
  // state for a réparateur and saying so beats a heading over blank space.
  const isEmpty = !isPending && !isError && cards.length === 0;

  return (
    <View>
      <View style={[styles.sectionRow, { marginTop: spacing.xl, marginBottom: spacing.md }]}>
        {/* `flex: 1` plus a two-line cap: the located heading is 31 characters at 11pt with
            1.6 of tracking, which is close enough to the width of a small phone that
            « Voir tout » would otherwise be pushed off the right edge. Wrapping is the right
            failure here - truncating a heading loses meaning, a second line costs 14pt. */}
        <Text style={[styles.eyebrow, { color: palette.faint }]} numberOfLines={2}>
          {located ? 'DERNIÈRES DEMANDES PRÈS DE VOUS' : 'DERNIÈRES DEMANDES'}
        </Text>
        <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={8}>
          <Text style={[styles.seeAll, { color: accent.accent }]}>Voir tout</Text>
        </Pressable>
      </View>

      {isPending && (
        <View style={{ height: ROW_H, justifyContent: 'center' }}>
          <Text style={[styles.body, { color: palette.muted }]}>Chargement…</Text>
        </View>
      )}

      {isError && (
        <Text style={[styles.bodyStrong, { color: palette.red }]}>
          Impossible de charger les demandes. Tirez vers le bas pour réessayer.
        </Text>
      )}

      {isEmpty && (
        <Text style={[styles.body, { color: palette.muted }]}>
          Aucune demande ouverte pour le moment.
        </Text>
      )}

      {!isPending && !isError && cards.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.md }}
        >
          {cards.map((d) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              accessibilityLabel={`${d.title}, ${priceLabel(d.budgetCents)}`}
              onPress={() => onOpenDemande(d.id)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: palette.paper,
                  borderColor: palette.line,
                  borderRadius: radii.card,
                  borderCurve: 'continuous',
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              {/* The mist square with a faint camera glyph is `/mes-demandes`'s fallback,
                  reused rather than reinvented. One fallback in the app means a réparateur
                  learns it once. **No longer the ordinary case, corrected 2026-08-21:** storage
                  is provisioned and every seeded demande carries a photo, so the fallback is
                  now the edge case it reads as.

                  `cover`, and the container carries NO padding. Both were `contain` + `padding: 8`
                  and the owner reported the result from his phone: a gap on all four sides of
                  every photo. The padding was the bulk of it and the letterbox the rest. `cover`
                  is also what the prototype specifies. The cost is real and accepted: a portrait
                  upload gets cropped through its subject in a 150x90 box, which is the tradeoff
                  the prototype already made and which no amount of fitting avoids in a landscape
                  tile. */}
              <View style={[styles.image, { backgroundColor: palette.mist }]}>
                {d.photoUrl ? (
                  <Image source={{ uri: d.photoUrl }} style={styles.imageFill} resizeMode="cover" />
                ) : (
                  <IconCamera size={22} color={palette.faint} />
                )}
              </View>

              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: palette.ink }]} numberOfLines={1}>
                  {d.title}
                </Text>
                {/* The prototype's second line is the problem description, which the feed
                    does not carry - brand/model is the closest true thing, falling back to
                    the category rather than leaving the line empty and the cards ragged. */}
                <Text style={[styles.cardSub, { color: palette.muted }]} numberOfLines={1}>
                  {[d.brand, d.model].filter(Boolean).join(' ') || d.categoryLabelFr}
                </Text>
                {/* CF6-D3: « Ouverte » when there is no budget: an OFFERS-mode demande has no
                    fixed price yet, which is an invitation to quote. The label was shortened from
                    « Recherche d'offres » so it never truncates into « Recherche d'o… » on the 150pt card. */}
                <Text style={[styles.cardPrice, { color: palette.navy }]} numberOfLines={2}>
                  {priceLabel(d.budgetCents)}
                </Text>
                {/* The separator is JOINED rather than appended to the distance, so a null
                    age (an unparseable date) cannot leave « 4 km · » trailing into nothing.
                    Same defect class as a dangling « Bonjour, ». When both parts are absent
                    the line is not rendered at all, rather than an empty row holding space. */}
                {metaLine(d, now) !== null && (
                  <View style={styles.cardMeta}>
                    {d.distanceKm !== null && (
                      <IconLocation size={11} color={palette.muted} strokeWidth={2.4} />
                    )}
                    <Text
                      style={[styles.cardMetaText, { color: palette.muted }]}
                      numberOfLines={1}
                    >
                      {metaLine(d, now)}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  eyebrow: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 11, letterSpacing: 1.6, flex: 1 },
  seeAll: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12.5 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  bodyStrong: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
  card: { width: CARD_W, borderWidth: 1, overflow: 'hidden' },
  /** `object-fit: contain` over `--mist` with 8px of padding, per `.nearby-card img`. */
  // No padding, deliberately: it inset every photo by 8pt on all four sides, which is the
  // gap the owner reported. `alignItems`/`justifyContent` still centre the fallback glyph -
  // that is what they were for; the padding was never load-bearing for it.
  image: { height: IMAGE_H, alignItems: 'center', justifyContent: 'center' },
  imageFill: { width: '100%', height: '100%' },
  cardBody: { paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 },
  cardTitle: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 13.5 },
  cardSub: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, marginTop: 2 },
  cardPrice: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 15, marginTop: 6 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardMetaText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 11 },
});
