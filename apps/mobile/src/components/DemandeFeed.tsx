import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../theme';
import { Card } from './Card';
import { Badge } from './Badge';
import { Chip } from './Chip';
import { ResultRow } from './ResultRow';
import { DemandeCard } from './DemandeCard';
import { FavoriteHeart } from './FavoriteHeart';
import { useSessionContext } from '../lib/session';
import { useFeed, useCategories } from '../lib/queries';
import { useTabBarSpace } from '../lib/use-tab-bar-space';
import { useDebounced } from '../lib/use-debounced';
import { IconCamera, IconCancel, IconSearch } from '../icons';
import { euros, categoryTree, todoCopy } from '@revime/shared';
import type { FeedItem, FeedQuery } from '@revime/shared';
import { RevimeLoader } from './lottie/RevimeLoader';
import { RevimeRefreshScrollView } from './RevimeRefreshScrollView';
import { useTourTarget } from '../tour/use-tour';

// Derived from the schema rather than retyped, so the two cannot drift apart.
type Sort = NonNullable<FeedQuery['sort']>;

/**
 * The réparateur's list of open demandes. Lives here rather than in a route file because two
 * entry points render it: the FAB, via `(tabs)/publier`, and the Recherche tab.
 *
 * 🛑 **THE TWO HALVES ARE DELIBERATELY DIFFERENT SCREENS**, both rebuilt on 2026-08-20 against
 * their own prototype: `searchable` follows `RecherchePro.tsx` (flat `.result-row`s for
 * scanning), and the FAB half follows `FilDemandes.tsx` (photo-led `DemandeCard`s for browsing).
 * They share this component only for the query, the filters and the states. **Both briefly shared
 * the flat row the same day, which is how the browse tab came to look wrong** - the Recherche
 * rebuild landed first and changed the rows for both callers.
 *
 * The BROWSE half's title and subtitle both switch on data rather than being fixed:
 * « près de chez vous » only when distances exist, and never the prototype's « N correspondant à
 * vos compétences », which claims a skill filter this feed does not apply - see `browseSubtitle`.
 *
 * What changed in the `searchable` half, and why:
 *
 * - **The chips scroll horizontally instead of wrapping.** `.chips` is `overflow-x: auto` in
 *   the prototype, and with nine roots the wrapping version filled four rows - half the
 *   screen above the first result.
 * - **Active chips are `variant="accent"`**, the prototype's `.chip--accent.chip--active`.
 *   `Chip`'s own doc already names this as Recherche's filter treatment; this caller had never
 *   opted in.
 * - **The count and the sort control share one row**, as the prototype does. That also settles
 *   a note this file used to carry - the three sort chips had been moved to a row of their own
 *   because « Distance » wrapped alone and read as a separate control. One control cannot wrap.
 * - **Results are flat `.result-row`s, not `Card`s.** A scan-and-pick list is a list. `Card` is
 *   for something that stands alone.
 *
 * 🛑 **THE PROTOTYPE'S CHIPS ARE NOT THESE CHIPS, AND ITS ROW CANNOT BE BUILT.** It filters on
 * « Tous / Dépôt / Déplacement / Colis » - DELIVERY MODES, the same field the demande detail
 * screen's absent badges wanted. `Demande` has no such column and the publish wizard never
 * asks, because delivery is chosen at PAYMENT time (`Commande.delivery`, picked in
 * `paiement.tsx` from the accepted offer's `travel` and `acceptsParcel`). The category filter
 * kept here is real, server-backed via the feed's `categoryId`, and more useful; it is a
 * substitution, not an approximation.
 */
export function DemandeFeed({
  searchable = false,
  matchingRequest = false,
}: {
  searchable?: boolean;
  /**
   * CF4-26 / G8. True when the screen was opened by the dashboard's « Voir les demandes → »
   * (`/publier?matching=1`): turns « Pour moi » ON when the request arrives. A request, not the
   * state - the réparateur can switch it off again on the chip.
   */
  matchingRequest?: boolean;
}) {
  const { palette, spacing, type, accent, radii } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const { me } = useSessionContext();
  const router = useRouter();

  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [openParentId, setOpenParentId] = useState<string | null>(null);

  // The picker opens on the ordering the réparateur is actually getting, which
  // is proximity once they have a postal code. Same behaviour as before, now
  // stated rather than implied.
  const located = me?.repairer?.postalCode != null;
  const [sort, setSort] = useState<Sort>(located ? 'distance' : 'recentes');

  const debouncedQ = useDebounced(q);

  // CF4-26 « Pour moi ». Browse feed only (the dashboard's CTA lands here; Recherche has its
  // own filters). Keyed on the boolean VALUE: the tab stays mounted and `useLocalSearchParams`
  // hands a new object every render (same rule as `publier.tsx`'s category preselect).
  const [matching, setMatching] = useState(matchingRequest);
  useEffect(() => {
    if (matchingRequest) setMatching(true);
  }, [matchingRequest]);
  const showMatchingChip = !searchable && me?.profile.repairerEnabled === true;
  // V8 E2: the repairer's « Demandes » (title, « Pour moi ») and « Recherche » (search field) bubbles.
  const titleTarget = useTourTarget('feedTitle');
  const pourMoiTarget = useTourTarget('pourMoiChip');
  const searchTarget = useTourTarget('feedSearch');
  const matchingOn = showMatchingChip && matching;

  const feed = useFeed(
    searchable
      ? { q: debouncedQ.trim() || undefined, categoryId: categoryId ?? undefined, sort }
      : matchingOn
        ? { matching: '1' }
        : {},
  );

  const categories = useCategories();
  const tree = useMemo(() => categoryTree(categories.data ?? []), [categories.data]);
  const openParent = useMemo(
    () => tree.find((p) => p.id === openParentId) ?? null,
    [tree, openParentId],
  );

  const filtering = searchable && (debouncedQ.trim().length > 0 || categoryId !== null);
  const rows = feed.data ?? [];

  /**
   * ONE `now` per render, passed to every card, so two cards in the same frame cannot format the
   * same timestamp against different instants. Not state: this screen has no ticking clock, and a
   * pull-to-refresh re-renders with a fresh one, which is when the ages should move.
   */
  const now = new Date();

  return (
    <View style={{ flex: 1 }}>
      {/* The title sits OUTSIDE the scroll on the Recherche tab, matching the prototype's topbar
          and `ClientSearch`, so it stays put while results scroll under it. The BROWSE tab keeps
          its header inside the scroll instead, because the prototype's `FilDemandes` topbar
          carries a subtitle and a filter button and scrolls away with the list. */}
      {searchable && (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_700Bold',
              fontSize: type.screenTitle.size,
              color: palette.ink,
            }}
          >
            Recherche
          </Text>
          {/* 🛑 CF-27. THIS IS NOT THE FILTER BUTTON THAT WAS REMOVED FROM THIS HEADER ON
              2026-08-20, and the comment below at line 134 explains that removal, so read this
              before acting on it.

              That button duplicated the RECHERCHE TAB sitting directly below it in the tab bar: it
              threw the réparateur out of his screen to reach a place he could already reach in one
              tap. This heart pushes `/favoris`, which in réparateur mode has NO other entry point -
              mockup `01`'s réparateur grid has six tiles and none of them is Favoris, which is the
              entire premise of the owner's Q1 answer (design §3). Removing this on the strength of
              the comment below would make the réparateur half of `CF-27` write-only. */}
          <FavoriteHeart
            filled={false}
            onToggle={() => router.push('/favoris')}
            accessibilityLabel="Voir mes favoris"
          />
        </View>
      )}

      <RevimeRefreshScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: tabBarSpace }}
        onRefresh={() => feed.refetch()}
        keyboardShouldPersistTaps="handled"
      >
        {/* 🛑 NO FILTER BUTTON on this header, and its absence is a decision rather than an
            omission. The prototype's `FilDemandes` carries one (`SlidersHorizontal` →
            `/pro/recherche`) because ITS browse screen has no other route to search. This app has
            Recherche in the tab bar directly below, so the button duplicated a tab - and it
            "worked" by throwing the réparateur out of the screen he was on. Verified against
            expo-router's own source rather than assumed: `PUSH` on a tabs navigator is downgraded
            to `NAVIGATE` and then `JUMP_TO`, so the navigation was never broken, only the idea
            was. A control that leaves the screen is the wrong answer to a filter icon, and the
            tab bar already answers it. Removed 2026-08-20 on the owner's call. */}
        {!searchable && (
          <View style={{ marginBottom: spacing.lg }}>
            {/* « près de chez vous » is a DISTANCE PROMISE, so it appears only when there are
                distances to show - the same switch the réparateur Accueil's heading makes.
                Without a postal code every `distanceKm` is null and the server orders by
                recency instead. */}
            <Text
              {...titleTarget}
              style={{
                fontFamily: 'GoogleSansFlex_700Bold',
                fontSize: type.screenTitle.size,
                color: palette.ink,
              }}
            >
              {located ? 'Demandes près de chez vous' : 'Demandes'}
            </Text>
            {/* 🛑 NOT the prototype's « N correspondant à vos compétences ». That claims the list
                is FILTERED BY SKILL, and it is not: `DemandesService.feed` returns every OPEN
                demande. Nor is there a skills model to filter by - piece C established that
                `categoriesTreated` is DERIVED from offer history and never self-declared,
                precisely because a specialty is a claim a réparateur makes while this is a fact
                about what he has quoted on. Telling him the list was curated for him when it is
                everything would be the same defect class as the invented « 2× plus de missions »
                statistic. This says what the list IS. */}
            <Text
              style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, color: palette.muted }}
            >
              {matchingOn
                ? matchingSubtitle(rows.length, feed.isPending)
                : browseSubtitle(rows.length, located, feed.isPending)}
            </Text>
            {showMatchingChip && (
              <View {...pourMoiTarget} style={{ flexDirection: 'row', alignSelf: 'flex-start', marginTop: spacing.md }}>
                {/* CF4-26 / G8. The SAME where-clause as the dashboard's « N nouvelles demandes
                    correspondent à vos services » (`matchingDemandeWhere`), so the count on that
                    line and this list are one number. `accent` = narrows what you look at. */}
                <Chip
                  label="Pour moi"
                  variant="accent"
                  active={matching}
                  onPress={() => setMatching((m) => !m)}
                />
              </View>
            )}
          </View>
        )}

        {searchable && (
          <View style={{ marginBottom: spacing.md }}>
            <View
              {...searchTarget}
              style={[
                styles.field,
                {
                  backgroundColor: palette.mist,
                  borderColor: palette.line,
                  borderRadius: radii.field,
                },
              ]}
            >
              <IconSearch size={18} color={palette.faint} strokeWidth={2.2} />
              <TextInput
                style={[styles.input, { color: palette.ink }]}
                placeholder="Objet, catégorie, ville…"
                placeholderTextColor={palette.faint}
                value={q}
                onChangeText={setQ}
                returnKeyType="search"
                autoCorrect={false}
              />
              {q.length > 0 && (
                <Pressable
                  onPress={() => setQ('')}
                  accessibilityRole="button"
                  accessibilityLabel="Effacer la recherche"
                  hitSlop={8}
                >
                  <IconCancel size={16} color={palette.muted} strokeWidth={2.4} />
                </Pressable>
              )}
            </View>

            <View style={{ height: spacing.md }} />

            {/* Two-level category picker, same interaction as the publish wizard's step 1: a
                parent with children opens; a parent without is itself a valid destination,
                which is the « Autres » case. Horizontal rather than wrapping - see the file
                comment. */}
            {openParent === null ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                keyboardShouldPersistTaps="handled"
              >
                <Chip
                  label="Toutes"
                  variant="accent"
                  active={categoryId === null}
                  onPress={() => setCategoryId(null)}
                />
                {tree.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.labelFr}
                    variant="accent"
                    chevron={p.children.length > 0}
                    active={categoryId === p.id || p.children.some((c) => c.id === categoryId)}
                    onPress={() =>
                      p.children.length > 0 ? setOpenParentId(p.id) : setCategoryId(p.id)
                    }
                  />
                ))}
              </ScrollView>
            ) : (
              <View>
                <Pressable onPress={() => setOpenParentId(null)} accessibilityRole="button">
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_600SemiBold',
                      fontSize: 13,
                      color: accent.accent,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {'←'} Toutes les catégories
                  </Text>
                </Pressable>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                  keyboardShouldPersistTaps="handled"
                >
                  <Chip
                    label={openParent.labelFr}
                    variant="accent"
                    active={categoryId === openParent.id}
                    onPress={() => setCategoryId(openParent.id)}
                  />
                  {openParent.children.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.labelFr}
                      variant="accent"
                      active={categoryId === c.id}
                      onPress={() => setCategoryId(c.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={{ height: spacing.md }} />

            <View style={styles.countRow}>
              <Text style={[styles.count, { color: palette.muted }]}>{countLine(rows.length)}</Text>
              {/* The prototype uses a `<select>`; React Native has none and this app has no
                  picker, so this is the tap-to-cycle control `CategorySearch` established on
                  the client half of the same tab. Three options rather than its two, so
                  reaching one can take two taps - accepted, because the alternative was three
                  chips that did not fit beside the count on a narrow screen. The label states
                  the ACTIVE sort, so accessibilityHint has to say what the tap does. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Tri : ${SORT_LABEL[sort]}`}
                accessibilityHint="Change le tri des demandes"
                onPress={() => setSort(nextSort(sort))}
                style={[
                  styles.sort,
                  {
                    backgroundColor: palette.mist,
                    borderColor: palette.line,
                    borderRadius: radii.field,
                  },
                ]}
              >
                <Text style={[styles.sortLabel, { color: palette.ink }]}>{SORT_LABEL[sort]}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {me?.profile.repairerEnabled && me.repairer?.postalCode == null && (
          <Pressable
            onPress={() => router.push('/(tabs)/profil')}
            accessibilityRole="button"
            style={{
              backgroundColor: accent.accentSoft,
              borderColor: accent.accent,
              borderWidth: 1.5,
              borderRadius: radii.field,
              padding: 16,
              marginBottom: spacing.md,
            }}
          >
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_600SemiBold',
                fontSize: 13,
                lineHeight: 18,
                color: accent.accentDeep,
              }}
            >
              Ajoutez votre code postal pour voir les demandes les plus proches.
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_600SemiBold',
                fontSize: 13,
                color: accent.accent,
                marginTop: 8,
              }}
            >
              Ajouter →
            </Text>
          </Pressable>
        )}

        {feed.isPending && (
          <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
            <RevimeLoader variant="fill" size={80} text="Recherche des demandes…" />
          </View>
        )}

        {feed.isError && (
          <Text style={[styles.error, { color: palette.red }]}>
            Impossible de charger les demandes. Tirez vers le bas pour réessayer.
          </Text>
        )}

        {!feed.isError && rows.length === 0 && !feed.isPending && (
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              {filtering ? 'Aucune demande' : 'Aucune demande pour le moment'}
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              {filtering
                ? 'Essayez un autre mot ou modifiez les filtres.'
                : 'Les nouvelles demandes apparaîtront ici.'}
            </Text>
          </Card>
        )}

        {/* BROWSE: the prototype's photo-led `DemandeCard`s. See that component for why the two
            presentations differ rather than sharing one row. */}
        {!feed.isError && !searchable && (
          <View style={{ gap: spacing.md }}>
            {rows.map((d) => (
              <DemandeCard
                key={d.id}
                demande={d}
                now={now}
                onPress={() => router.push(`/demande/${d.id}`)}
              />
            ))}
          </View>
        )}

        {/* SEARCH: flat scannable rows. */}
        {!feed.isError &&
          searchable &&
          rows.map((d, index) => (
            <ResultRow
              key={d.id}
              title={d.title}
              tag={tagLine(d)}
              tag2={`${budgetLine(d)} · ${offerLine(d.offerCount)}`}
              badge={d.hasMyOffer ? <Badge label="Offre envoyée" tone="verified" /> : undefined}
              last={index === rows.length - 1}
              onPress={() => router.push(`/demande/${d.id}`)}
              icon={
                // The prototype's row carries a photo. `photoUrl` is null for every demande
                // until Supabase storage is provisioned, so the mist tile with a faint camera
                // glyph is the fallback - the same one `/mes-demandes` and the Accueil nearby
                // row use, so a réparateur learns it once.
                //
                // 🛑 A TRUTHY check, deliberately, NOT `!== null`. `photoUrl` was added to
                // `FeedItem` on 2026-08-20 and the DEPLOYED api does not have it, so it arrives
                // `undefined` - which `!== null` would pass straight into
                // `<Image source={{ uri: undefined }}>` and render a blank tile instead of the
                // glyph. See the AGENTS.md constraint « this app can be newer than the API it
                // talks to »; a truthy test treats absent and null alike, which is the point.
                // `cover`, corrected 2026-08-21 with the other three photo surfaces. `thumb` is
                // a 44x44 SQUARE and demande photos are landscape, so `contain` fitted the image
                // to the width and left roughly 40% of the tile empty above and below it.
                d.photoUrl ? (
                  <Image
                    source={{ uri: d.photoUrl }}
                    style={styles.thumb}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <IconCamera size={20} color={palette.faint} strokeWidth={2} />
                )
              }
            />
          ))}
      </RevimeRefreshScrollView>
    </View>
  );
}

const SORT_LABEL: Record<Sort, string> = {
  recentes: 'Plus récentes',
  prix: 'Prix croissant',
  distance: 'Distance',
};

/**
 * The cycle order matches the prototype's `<option>` order, so the control walks the list a
 * réparateur would have seen in a dropdown rather than an order invented here.
 */
const SORT_CYCLE: readonly Sort[] = ['recentes', 'prix', 'distance'];

function nextSort(current: Sort): Sort {
  const at = SORT_CYCLE.indexOf(current);
  // `?? SORT_CYCLE[0]` is unreachable while Sort and SORT_CYCLE agree, and it is here because
  // `noUncheckedIndexedAccess` is on: an index into a readonly array is possibly undefined.
  return SORT_CYCLE[(at + 1) % SORT_CYCLE.length] ?? 'recentes';
}

/**
 * What the browse feed actually is, rather than the prototype's skill-matching claim.
 *
 * Mentions proximity ONLY when located, because that is exactly when the server orders by it
 * (`demandes.service.ts` resolves an absent sort to `from ? 'distance' : 'recentes'`). While the
 * query is in flight it says neither, rather than asserting « 0 demandes » about an unknown.
 */
function browseSubtitle(count: number, located: boolean, isPending: boolean): string {
  if (isPending) return 'Chargement des demandes…';
  if (count === 0) return 'Aucune demande ouverte pour le moment';
  if (count === 1) {
    // No ordering clause for a single row. « 1 demande ouverte, les plus proches d'abord » is
    // both ungrammatical and a claim about sorting one item -- and it is the state the owner's
    // own account is in, production holding exactly one OPEN demande.
    return '1 demande ouverte';
  }
  const noun = `${count} demandes ouvertes`;
  return located ? `${noun}, les plus proches d'abord` : noun;
}

function countLine(count: number): string {
  return count === 1 ? '1 demande' : `${count} demandes`;
}

/**
 * CF4-26. The « Pour moi » list's own subtitle. For N > 0 it is the dashboard line's title
 * VERBATIM (`todoCopy`, unit-tested in the API suite), so the réparateur reads the same sentence
 * and the same number on both screens.
 */
function matchingSubtitle(count: number, isPending: boolean): string {
  if (isPending) return 'Chargement des demandes…';
  if (count === 0) return 'Aucune demande ne correspond à vos services pour le moment';
  return todoCopy({ kind: 'MATCHING', count }).title;
}

/** « Smartphone · Paris 75017 · 398,7 km », the prototype's `.result-row__tag`. */
function tagLine(d: FeedItem): string {
  const parts = [d.categoryLabelFr, d.locationLabel];
  // A French comma, matching `euros` and `ratingLabel`. Absent until the réparateur saves a
  // postal code, which is why it is appended rather than interpolated.
  if (d.distanceKm !== null) parts.push(`${String(d.distanceKm).replace('.', ',')} km`);
  return parts.join(' · ');
}

function budgetLine(d: FeedItem): string {
  if (d.mode === 'BUDGET' && d.budgetCents !== null) {
    return `Budget ${euros(d.budgetCents)}`;
  }
  return 'Ouvert aux offres';
}

function offerLine(count: number): string {
  if (count === 0) return 'aucune offre';
  return count === 1 ? '1 offre' : `${count} offres`;
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 12, fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  count: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5 },
  sort: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  sortLabel: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },
  loading: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  error: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14, marginBottom: 12 },
  /** Fills the 44pt tile `ResultRow` provides, `contain` so a tall photo is not cropped. */
  thumb: { width: 44, height: 44 },
});
