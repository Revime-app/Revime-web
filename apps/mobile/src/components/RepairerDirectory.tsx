import { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { isCompletePostalCode, ratingLabel, VERIFIED_BADGE_LABEL } from '@revime/shared';
import type { DirectoryCardDto, CategoryDto } from '@revime/shared';
import { useTheme } from '../theme';
import { Card } from './Card';
import { Badge } from './Badge';
import { Chip } from './Chip';
import { Initials } from './Initials';
import { FavoriteHeart } from './FavoriteHeart';
import { RevimeLoader } from './lottie/RevimeLoader';
import { RevimeRefreshScrollView } from './RevimeRefreshScrollView';
import {
  DirectoryFilterSheet,
  NO_FILTERS,
  activeFilterCount,
  type DirectoryFilters,
} from './DirectoryFilterSheet';
import {
  useRepairers,
  useFavoriteRepairers,
  useToggleFavoriteRepairer,
  useCategories,
} from '../lib/queries';
import { useTabBarSpace } from '../lib/use-tab-bar-space';
import { useDebounced } from '../lib/use-debounced';
import { useSessionContext } from '../lib/session';
import { ApiError } from '../lib/api';

/**
 * The réparateur directory - spec §7.2.
 *
 * The sort opens on « A → Z » and sends NOTHING until the user picks, because absent
 * and `az` are the same order on the server (§6.3). So the control is honest without
 * the client having to send a value it did not choose.
 *
 * 🆕 `CF-34` moved the CONTROL into `DirectoryFilterSheet`, which owns the three sort labels
 * now - this file's `SORT_LABEL` map and its `Sort` alias are gone. The RULE above did not move:
 * it is enforced in the `useRepairers` call below, where `sort === 'az'` becomes `undefined`.
 * `DirectoryFilters['sort']` is hand-written in the sheet rather than derived from
 * `DirectoryQuery`, and that call site is what keeps the two from drifting - a member the schema
 * drops stops being assignable there.
 */
/**
 * 🛑 `CF-18` / `CF-27`: where the heart goes on a directory row, and the arithmetic that
 * actually supports it.
 *
 * 🛑 **CORRECTED 2026-08-31 by the whole-branch review. This block used to read « 197.0pt at 15pt
 * bold » against a « 128.8pt inner width », and BOTH figures were wrong** - the row name is
 * `600SemiBold` (`:170`), not `700Bold`, and **128.8pt is the two-column `ShortcutGrid` TILE
 * width, imported from a different component's comment.** A full-width row is far wider. So the
 * old conclusion - « total 221pt does NOT fit beside the displayName » - was arithmetic that did
 * not hold, and the name would in fact have fitted.
 *
 * The row, re-derived on a 375pt iPhone SE: the `ScrollView` takes `spacing.lg` (16) each side and
 * `Card` another 16, leaving **311pt** of row. Its children are `Initials` (44pt), the flexed name
 * column, an optional verified `Badge`, and the 24pt heart, with a 12pt `gap` between each.
 *
 *   name column, heart and no badge:      311 − 44 − 24 − 24 (2 gaps) = **219pt**
 *   heart + « Réparateur vérifié »:        311 − 44 − 120.3 − 24 − 36  = **86.7pt**
 *   heart + « Professionnel vérifié »:     311 − 44 − 133.4 − 24 − 36  = **73.6pt**
 *
 * Measured with PIL against the shipped TTFs at the sizes this file renders, at `700Bold` 11pt
 * plus `letterSpacing: 0.2` and `Badge.tsx`'s 9pt padding each side: « Réparateur vérifié » is
 * 98.8 + 3.6 + 18 = **120.3pt**, « Professionnel vérifié » is 111.2 + 4.2 + 18 = **133.4pt**.
 *
 * 🛑 **CORRECTED 2026-09-02 by `CF-34`, and BOTH halves of the badge line were wrong.** This block
 * used to give one badge figure, « Professionnel vérifié » at **129.2pt**, leaving **77.8pt** - the
 * label measurement OMITTED `letterSpacing: 0.2`, which `Badge.tsx` does render, so it was 4.2pt
 * short. And it measured the badge NOBODY HOLDS: of the 12 listable réparateurs, exactly one is
 * badged and he is at `verificationLevel = IDENTITY` (checked in the live DB), which renders the
 * NARROWER « Réparateur vérifié ». So the case that is live was not the case that was measured.
 *
 * **The trailing-edge column is still the right arrangement, for a reason that is structural
 * rather than arithmetical:** the name column is `flex: 1` with `numberOfLines={1}`, so a heart in
 * its own column takes a fixed 36pt off that flex basis and the name absorbs the rest by
 * truncating itself. Putting the heart inside the name column would instead let a long name push
 * the control off the row. Do not re-litigate the placement - but do not restate the old numbers
 * either.
 *
 * **The honest residual, RE-MEASURED 2026-09-02 against the accounts that exist:** the widest live
 * `displayName` is « @reparation_croixrous » at **166.5pt** (`600SemiBold` 15pt), which clears the
 * 219pt unbadged case with 52pt to spare. 🛑 This block used to cite « Réparateur Test Long Nom »
 * at 192.8pt as « the longest seeded name » - that figure reproduces exactly, but **no such account
 * is in the database**, so it was an assertion about a row nobody renders.
 *
 * 🛑 **And the badged case is no longer hypothetical.** The one IDENTITY réparateur is
 * a long username at **89.0pt** against the **86.7pt** his badge leaves, so his name is AT or just
 * OVER the edge and `numberOfLines={1}` may already be ellipsising it on the client's phone. 2.3pt
 * is inside this method's error bars, so that is « at the edge », not a proven ellipsis - but the
 * old sentence « nothing truncates for the 11 live réparateurs, none of whom carries that badge »
 * is false twice over: there are 12, and one of them is badged. Not fixed here: `CF-34` changes the
 * SUB-line, and this is the name row. `typecheck` cannot see any of it - the measurement is the test.
 */
export function RepairerDirectory({
  selectedCategoryId,
  onClearCategory,
}: {
  selectedCategoryId?: string | null;
  onClearCategory?: () => void;
} = {}) {
  const { palette, spacing } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const { me } = useSessionContext();
  const favoriteRepairers = useFavoriteRepairers();
  const toggleFavoriteRepairer = useToggleFavoriteRepairer();

  const [q, setQ] = useState('');
  /**
   * `CF-18`, added 2026-08-31. ONE line for the whole list rather than one per row: only one heart
   * can be in flight from a tap, the message is about that tap, and a per-row slot would reflow
   * every card. Cleared on the next tap, so it never outlives the action it describes.
   *
   * It exists because the toggle had no `onError` at all: every French refusal the server authored
   * was discarded, and against the deployed API - where `/favorites/*` 404s - each heart was a dead
   * control. `apps/mobile/AGENTS.md`: a button that silently does nothing reads as broken.
   */
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  /**
   * 🆕 `CF-34`. ONE object for all five facets rather than five `useState`s, because the sheet
   * hands back a whole draft on « Appliquer » - five separate setters would let one facet land
   * without the others, and `near`/`radiusKm` are not independent (a radius with no postal code
   * is a 400).
   */
  const [filters, setFilters] = useState<DirectoryFilters>(() => ({
    ...NO_FILTERS,
    categoryId: selectedCategoryId ?? null,
  }));

  useEffect(() => {
    if (selectedCategoryId !== undefined) {
      setFilters((f) => ({ ...f, categoryId: selectedCategoryId }));
    }
  }, [selectedCategoryId]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const debouncedQ = useDebounced(q);

  const categories = useCategories();

  /**
   * 🆕 `CF-34`. ONE derived origin that every distance-dependent member reads, so the three cannot
   * disagree about whether there is a location to measure from.
   *
   * 🛑 « No location » is `isCompletePostalCode`, NOT `near.length > 0`, and that difference was a real
   * user-facing defect. The schema's `near` is `.trim().regex(/^\d{5}$/)`, so « 750 » is not an
   * absent filter - it is a **400**, and `ZodValidationPipe` files the specific « Code postal
   * invalide. » under `AppException.fields` while the top-level message stays the generic
   * « Les informations envoyées sont invalides. ». Nothing on this screen prints `fields`, so a
   * length test emptied the directory behind a sentence that named nothing.
   *
   * The sheet already refuses to hand one over (`normalisedForApply`). This is the second guard, at
   * the only place that builds a URL, because the invariant should not have to be trusted here.
   *
   * 🆕 `isCompletePostalCode` comes from `@revime/shared` and is the SAME rule the schema's
   * `.regex(FR_POSTAL_CODE)` applies - corrected 2026-09-02, when it was a regex hand-copied into
   * `DirectoryFilterSheet.tsx`. `apps/api/test/postal-code-predicate.spec.ts` asserts they agree.
   */
  const near = isCompletePostalCode(filters.near) ? filters.near.trim() : undefined;

  /**
   * 🛑 The schema can refuse this query THREE ways, and all three are made unreachable by
   * construction here rather than argued to be unlikely - an earlier version of this reasoning
   * enumerated the two `.refine` rules and missed the field's own regex:
   *
   *   1. `near` not five digits              → handled by `near` above.
   *   2. `radiusKm` present with no `near`   → `radiusKm` is sent only when `near` is defined.
   *   3. `sort: 'distance'` with no `near`   → demoted to absent here, i.e. server default order.
   *
   * 'az' is the server's default order, so sending it would be noise. Only 'note' and 'distance'
   * change anything, which keeps the absent-sort path the one normally exercised.
   */
  const sort =
    filters.sort === 'az' || (filters.sort === 'distance' && near === undefined)
      ? undefined
      : filters.sort;

  const directory = useRepairers({
    q: debouncedQ.trim() || undefined,
    sort,
    // `null` means « Toutes », and the query must send NOTHING for it rather than a sentinel:
    // absent is the unfiltered path, which is the one that stays at three server queries.
    categoryId: filters.categoryId ?? undefined,
    near,
    radiusKm: near === undefined ? undefined : (filters.radiusKm ?? undefined),
    // Independent of `near` on purpose: a rating is not geographic, so the schema puts no
    // postal-code requirement on it and neither does this.
    minRating: filters.minRating ?? undefined,
  });

  const searching = debouncedQ.trim().length > 0;
  const activeCount = activeFilterCount(filters);

  return (
    <RevimeRefreshScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: tabBarSpace }}
      onRefresh={() => directory.refetch()}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: palette.mist,
          borderColor: palette.line,
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 12,
          marginBottom: spacing.md,
        }}
      >
        <TextInput
          style={{
            flex: 1,
            paddingVertical: 12,
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 14,
            color: palette.ink,
          }}
          placeholder="Nom du réparateur…"
          placeholderTextColor={palette.faint}
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          autoCorrect={false}
          /* 🆕 2026-09-02. 120 IS THE SCHEMA'S CAP, NOT A ROUND NUMBER:
             `directoryQuerySchema.q` is `.max(120, { message: 'Recherche trop longue.' })`, and
             that message lands in `AppException.fields`, which this screen never prints - so a
             121st character produced a 400 whose visible text named nothing at all. Capping the
             input makes the state unreachable instead of unexplained, which is the same move as
             the postal field's own `maxLength={5}` in `DirectoryFilterSheet`. 🛑 Change this only
             with the schema; the two numbers are one decision. */
          maxLength={120}
        />
        {q.length > 0 && (
          <Pressable onPress={() => setQ('')} accessibilityLabel="Effacer la recherche">
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16, color: palette.muted }}>
              ×
            </Text>
          </Pressable>
        )}
      </View>

      {/* 🆕 `CF-34`. One entry point for five facets. The count deliberately EXCLUDES `sort`:
          a list is always in some order, so « A → Z » is not a filter the user applied.

          🛑 `CF-33`'s drill-in category chips WERE here and now live in `DirectoryFilterSheet`,
          which carries their measurements and the reason they are still not extracted into a
          shared component. This row has no `!categories.isError` gate, where that block did: the
          gate existed so a failed refetch could not render stale chips, and the button no longer
          renders any - the sheet receives `categories.data ?? []`, so a category outage degrades
          to a sheet whose CATÉGORIE group offers « Toutes » alone, with the other four facets
          untouched. That is strictly more than the old block, which vanished entirely. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
        <Chip
          label={activeCount > 0 ? `Filtres · ${activeCount}` : 'Filtres'}
          active={activeCount > 0}
          onPress={() => setSheetOpen(true)}
        />
      </View>

      {/* Each active facet is its own removable chip. This REPLACES the « Filtré par X » prose
          line, which could name exactly one facet and would have been silent about the other
          three - an empty result with an invisible cause is how `CF-33`'s filter reads today.

          🛑 THE CATEGORY CHIP IS THE WIDEST ELEMENT THIS SCREEN CAN RENDER, and `Chip` has no
          `numberOfLines`, no `maxWidth` and no `flexShrink`, so nothing would catch an overflow.
          `activeCategoryLabel` composes « Parent · Child », and measured with PIL at 13pt
          `600SemiBold` against the 343pt row (375pt screen − 16pt of `ScrollView` padding each
          side), the worst case the taxonomy can compose is:

            « Électronique · Autres appareils électroniques  × »  293.0pt label / **326.0pt chip**
            « Maison & Jardin · Autres objets de la maison  × »   286.2pt label / 319.2pt chip
            « Mode & accessoires · Sacs & maroquinerie  × »       275.5pt label / 308.5pt chip

          326.0pt against 343pt is **17pt of margin, 5.0%** - the tightest in this change, and the
          reason the figure is written down. `flexWrap` puts it on its own line beside anything
          else, so the risk is a single chip exceeding the row, not the row filling up. The other
          new chips are far from the limit: « Filtres · 4 » 88.8pt, « Autour de 69003  × » 150.5pt,
          « ★3 et plus  × » 105.8pt, « 50 km  × » 84.8pt, and « Réinitialiser les filtres » at
          166.0pt inside the empty-state `Card`'s narrower 311pt. 🛑 A longer parent or child label
          added to the taxonomy is what breaks this, not a UI change here. */}
      {activeCount > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md }}>
          {isCompletePostalCode(filters.near) && (
            <Chip
              label={`Autour de ${filters.near}  ×`}
              accessibilityLabel={`Retirer le filtre autour de ${filters.near}`}
              active
              onPress={() =>
                // Clearing the location clears what depends on it, exactly as the sheet does,
                // so the next request cannot carry a radiusKm with no near.
                setFilters((f) => ({
                  ...f,
                  near: '',
                  radiusKm: null,
                  sort: f.sort === 'distance' ? 'az' : f.sort,
                }))
              }
            />
          )}
          {filters.radiusKm !== null && (
            <Chip
              label={`${filters.radiusKm} km  ×`}
              accessibilityLabel={`Retirer le rayon de ${filters.radiusKm} km`}
              active
              onPress={() => setFilters((f) => ({ ...f, radiusKm: null }))}
            />
          )}
          {filters.minRating !== null && (
            <Chip
              label={`★${filters.minRating} et plus  ×`}
              accessibilityLabel={`Retirer le filtre note ${filters.minRating} et plus`}
              active
              onPress={() => setFilters((f) => ({ ...f, minRating: null }))}
            />
          )}
          {filters.categoryId !== null && (
            <Chip
              label={`${activeCategoryLabel(categories.data, filters.categoryId)}  ×`}
              accessibilityLabel={`Retirer le filtre ${activeCategoryLabel(categories.data, filters.categoryId)}`}
              active
              onPress={() => {
                setFilters((f) => ({ ...f, categoryId: null }));
                onClearCategory?.();
              }}
            />
          )}
        </View>
      )}

      {/* 🛑 GATED ON `!isError && data != null` (CF6 D1). A pending query has no `data`, so `data != null` is also the
          « loaded » test.
          On error `data` is `undefined`, so this line printed « 0 réparateurs »
          DIRECTLY ABOVE the server's 422 - and during initial loading `directory.isPending`
          caused `countLine(0)` to render « 0 réparateurs » directly above the loading spinner.
          Gating on loaded data ensures the count is shown strictly once data has arrived.

          🆕 It also carries the APPLIED SORT. `activeFilterCount` deliberately excludes `sort`
          and the chip row has no sort chip, so after `CF-34` a client who picked « Mieux notés »
          or « Distance » had NO trace of it on screen - the pre-branch UI had an always-visible
          two-chip sort row, so that was a regression in information the old screen carried.
          Appending it here rather than adding a control is deliberate: the owner approved this
          layout from previews, and adding a control is his call. */}
      {!directory.isError && directory.data != null && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 12.5,
            color: palette.muted,
            marginBottom: spacing.sm,
          }}
        >
          {/* `sort`, not `filters.sort`: the DERIVED value is the one actually sent, so this line
              cannot name an order the request did not ask for. */}
          {countLine(directory.data.length, sort)}
        </Text>
      )}

      {directory.isPending && (
        <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
          <RevimeLoader variant="fill" text="Recherche des réparateurs à proximité…" size={80} />
        </View>
      )}

      {directory.isError && (
        <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', color: palette.red }}>
          {/* 🆕 `CF-34`. The server's own French message when it could not situate the postal code
              - which is NOT the same fact as « aucun réparateur ne correspond ». Design §6.2. The
              sentence is `repairers.service.ts`'s « Nous n'avons pas pu situer ce code postal. »,
              which assigns no blame on purpose: an unknown code and an unreachable BAN are not
              distinguishable from there, so it must not be re-worded here either.

              🛑 « Tirez vers le bas pour réessayer » stays on the GENERIC branch ALONE, and that
              is the reason for the split rather than a detail. A 422 is a verdict on the postal
              code that was typed, so pulling to refresh repeats it forever; its remedy is the
              « Autour de » chip above, which removes the input the server refused. Same shape as
              the favourites failure below, `e instanceof ApiError ? e.message : …`, and it also
              carries the category 422 (« Cette catégorie est introuvable. »). */}
          {directory.error instanceof ApiError
            ? directory.error.message
            : 'Impossible de charger les réparateurs. Tirez vers le bas pour réessayer.'}
        </Text>
      )}

      {!directory.isError && !directory.isPending && (directory.data ?? []).length === 0 && (
        <Card>
          {/* 🛑 Design §7: a réparateur who has declared NOTHING matches no category, so on the day
              this ships every live réparateur disappears the moment a filter is touched. That is
              correct behaviour and a real production effect, so the copy names the cause rather than
              letting it read as an empty database. No CTA: the client cannot fix another person's
              profile, and `AGENTS.md` forbids pointing at a place that cannot say yes.

              🆕 `CF-34` adds the ONE action that is allowed under that rule, because it lands on
              this component's own state and therefore always says yes. Three empty states stay
              distinct on purpose: an unfiltered empty directory, a filtered miss (this, now with a
              reset), and the 422 above - which is a different fact from « nobody matches » and must
              not be collapsed into it. */}
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
            Aucun réparateur{activeCount === 0 && !searching ? ' pour le moment' : ''}
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 13,
              color: palette.muted,
              marginTop: 4,
            }}
          >
            {emptyHint(filters, searching)}
          </Text>
          {activeCount > 0 && (
            // A row wrapper so the chip hugs its label: a `Card` lays its children out in a
            // column, where a bare `Pressable` would stretch to the full card width.
            <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
              <Chip
                label="Réinitialiser les filtres"
                onPress={() => {
                  setFilters(NO_FILTERS);
                  onClearCategory?.();
                }}
              />
            </View>
          )}
        </Card>
      )}

      {/* Above the list, not inside a row: the failed tap has already been rolled back by the
          hook, so the list below is truthful and this line is the only thing left to say. */}
      {favoriteError !== null && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 13,
            color: palette.red,
            marginBottom: spacing.sm,
          }}
        >
          {favoriteError}
        </Text>
      )}

      <View style={{ gap: spacing.md }}>
        {!directory.isError &&
          (directory.data ?? []).map((r) => {
            const isFavorited = favoriteRepairers.data?.some((fav) => fav.userId === r.userId) ?? false;
            const canFavorite = r.userId !== me?.id;

            return (
              <Pressable key={r.userId} onPress={() => router.push(`/reparateur/${r.userId}`)}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {/* `?? null` at entry: a new DTO field arrives `undefined` from a stale API. */}
                    <Initials name={r.displayName} uri={r.avatarUrl ?? null} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: 'GoogleSansFlex_600SemiBold',
                          fontSize: 15,
                          color: palette.ink,
                        }}
                        numberOfLines={1}
                      >
                        {r.displayName}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'GoogleSansFlex_400Regular',
                          fontSize: 13,
                          color: palette.muted,
                          marginTop: 2,
                        }}
                      >
                        {subLine(r)}
                      </Text>
                    </View>
                    {r.verifiedBadge !== null && (
                      <Badge tone="verified" label={VERIFIED_BADGE_LABEL[r.verifiedBadge]} />
                    )}
                    {canFavorite && (
                      <View
                        onStartShouldSetResponder={() => true}
                        onResponderRelease={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <FavoriteHeart
                          filled={isFavorited}
                          onToggle={() => {
                            setFavoriteError(null);
                            toggleFavoriteRepairer.mutate(
                              // `card: r` is the row's own card, so the optimistic insert in
                              // `queries.ts` uses real data rather than a placeholder.
                              // 🛑 `CF-34` made this row a `DirectoryCardDto`, which is a SUPERSET
                              // of the `RepairerCardDto` the mutation takes, so it stays assignable
                              // and needs no change. Do NOT "tidy" the mutation's type to match:
                              // `useFavoriteRepairers` is deliberately on the narrower type,
                              // because a favourites row is read with no `near` and has no distance.
                              { userId: r.userId, next: !isFavorited, card: r },
                              {
                                onError: (e) =>
                                  setFavoriteError(
                                    e instanceof ApiError
                                      ? e.message
                                      : "Ce favori n'a pas pu être enregistré.",
                                  ),
                              },
                            );
                          }}
                        />
                      </View>
                    )}
                  </View>
                </Card>
              </Pressable>
            );
          })}
      </View>

      {/* 🆕 `CF-34`. The sheet holds a DRAFT and hands it back only from « Appliquer », so a
          dismissed sheet changes nothing and no single chip tap refetches. It re-seeds from
          `initial` on every open, so reopening after applying shows the applied state rather than
          an abandoned draft - see its own `useEffect`, keyed on `visible`. */}
      <DirectoryFilterSheet
        visible={sheetOpen}
        onDismiss={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
          if (next.categoryId === null) {
            onClearCategory?.();
          }
        }}
        initial={filters}
        categories={categories.data ?? []}
      />
    </RevimeRefreshScrollView>
  );
}

/**
 * 🛑 An unrated réparateur shows NO star and NO count - not « - » and not « Nouveau ».
 * A placeholder in a list row is noise, and « Nouveau » is a claim about someone we
 * would be inventing. **3 of the 12 listable réparateurs are unrated** (checked in the live DB
 * 2026-09-02), so this branch is ordinary - but it is no longer the majority case, which is what
 * this comment used to claim. `repairer.schemas.ts` corrected the same overstatement.
 *
 * 🆕 `CF-34`: when the client has given a location, the DISTANCE REPLACES `serviceAreaLabel`
 * rather than joining it. Both answer « où est-il », and once the client has said where HE is the
 * distance answers it better. Measured with PIL at 13pt `400Regular` against the **219pt** text
 * column on a 375pt screen (311pt card − 44pt `Initials` − two 12pt gaps − 24pt heart), over the
 * sub-lines the 12 live rows ACTUALLY render:
 *
 *   « ★ 4,5 (4 avis) · Paris 17e Arrondissement · 12,4 km »  283.2pt - WRAPS (appending)
 *   « ★ 4,5 (4 avis) · Paris 17e Arrondissement »            230.5pt - WRAPS TODAY ALREADY
 *   « ★ 4,5 (4 avis) · 12,4 km »                             126.8pt - fits (what this returns)
 *   « ★ 4,5 (4 avis) · Moins d'1 km »                        157.8pt - fits; see `distanceLabel`,
 *                                                            which is the ONE distance string this
 *                                                            does not derive from the number
 *
 * 🛑 Do NOT re-derive the middle figure from « ★ 4,8 (8 avis) · Marseille 7e Arrondissement »
 * (248.5pt). Nobody renders that string: the Marseille réparateur has ZERO reviews, so his row is
 * « Marseille 7e Arrondissement » at 166.2pt and it fits. The conclusion survives on the real
 * rows - THREE of the 12 exceed 219pt today (230.5, 228.0, 226.5pt). That wrap is PRE-EXISTING and
 * is not what this change is for; the distance happens to remove it for those three.
 *
 * 🛑 The badged row is the honest residual. It has only **86.7pt** of text column
 * (311 − 44 − 120.3 − 24 − three 12pt gaps), because « Réparateur vérifié » is a **120.3pt** badge
 * (`Badge.tsx` renders `700Bold` 11pt with `letterSpacing: 0.2` and 9pt padding each side: 98.8 +
 * 3.6 + 18). Exactly **1 of the 12 is badged** - `verificationLevel = IDENTITY`, so it is that
 * label and not the wider « Professionnel vérifié », which nobody holds. His row measures 226.0pt
 * today and 126.5pt with a distance, so it wraps either way, less far. Nothing TRUNCATES anywhere:
 * this `Text` carries no `numberOfLines`, so it wraps and the row grows.
 *
 * `favoris.tsx` keeps its own copy of this function and deliberately does NOT gain the distance
 * branch: a favourites row is read with no `near` context, so `useFavoriteRepairers` stays on
 * `RepairerCardDto`, which has no `distanceKm` to render.
 */
function subLine(r: DirectoryCardDto): string {
  const rated = r.rating !== null ? `★ ${ratingLabel(r.rating)} (${avisLine(r.reviewCount)})` : null;
  // `?? null` at entry: a NEW DTO field arrives `undefined` from an API older than this build,
  // and `undefined !== null` passes every null guard. This app has already shipped
  // « Paris 75017 · undefined km » from exactly this mistake on this field name.
  const distanceKm = r.distanceKm ?? null;
  // 🛑 CORRECTED 2026-09-02: this comment used to justify itself with « `Intl` is used NOWHERE in
  // this app », which is FALSE - `lib/when.ts:21` and `app/commande/[id].tsx:27` both call
  // `toLocaleDateString('fr-FR', { … })`, so the app already depends on locale data on device.
  // Two reasons that are true. `String(x).replace('.', ',')` is what `ratingLabel` in
  // `packages/shared` and all three other distance call sites do (`DemandeCard.tsx:267`,
  // `DemandeFeed.tsx:507`, `demande/[id]/offres.tsx:340`), so this row cannot disagree with the
  // rating beside it. And `relative-time.ts` already records WHY locale output is not trusted here:
  // « Hermes ships a cut-down ICU and its locale output is not guaranteed to be the same on device
  // as it is in this test suite », which is why it assembles French dates by hand. `toLocaleString`
  // would also group at ≥ 1000 km with a separator no other distance on this screen has. The
  // server already rounds to one decimal, so there is nothing left for a formatter to do.
  const where = distanceKm !== null ? distanceLabel(distanceKm) : r.serviceAreaLabel;
  const parts = [rated, where].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : 'Réparateur';
}

/**
 * 🆕 2026-09-02, from the whole-branch review. **A DISTANCE THAT ROUNDS TO ZERO IS FLOORED AT
 * « Moins d'1 km », because « 0 km » IS A LIE THIS SCREEN WOULD OTHERWISE TELL.**
 *
 * Both endpoints are **commune centroids** - `GeocodeService` asks BAN for `type=municipality`, and
 * a réparateur's stored `lat`/`lng` come from the same call on his own postal code. So a client who
 * types a réparateur's own postal code gets a haversine distance of literally 0, which the server
 * rounds to `0` and `String(0)` renders as « 0 km » **in place of the commune label**. « 0 km »
 * reads as « at your address ». What it actually means is « same commune », which for 75001 is a
 * square kilometre and for a rural code can be twenty.
 *
 * It is a FLOOR, not a bucket: 0,4 km still renders « 0,4 km ». The test is `< 0.05` rather than
 * `=== 0` only because that is the interval the server's `Math.round(km * 10) / 10` collapses to
 * zero - so an API that ever stopped rounding could not reintroduce « 0 km » here. In practice
 * today the two are the same test.
 *
 * Measured with PIL at 13pt `400Regular` against the row's **219pt** text column: the worst case
 * this string can make is « ★ 4,5 (4 avis) · Moins d'1 km » at **157.8pt** against « ★ 4,5 (4 avis)
 * · 12,4 km » at 126.8pt - so it is 31.0pt longer and still fits the unbadged row with 61pt spare.
 * A BADGED row has 86.7pt and wraps either way, which is the pre-existing residual the header
 * records. (Both figures contain « ★ », which Google Sans Flex does not have - see
 * `DirectoryFilterSheet.tsx` - so both are floors, and the +31.0pt DELTA is exact.)
 */
function distanceLabel(km: number): string {
  if (km < 0.05) return "Moins d'1 km";
  // A French comma, matching `ratingLabel` in `packages/shared` and the three other distance call
  // sites. See `subLine` above for why this is not `toLocaleString`.
  return `${String(km).replace('.', ',')} km`;
}

function avisLine(count: number): string {
  return count === 1 ? '1 avis' : `${count} avis`;
}

/**
 * The count, and - 🆕 2026-09-02 - the ORDER the server actually used, as one sentence.
 *
 * 🛑 WHY THE SORT IS HERE AND NOT IN A CHIP. `activeFilterCount` excludes `sort` on purpose (a
 * list is always in some order, so « A → Z » is not a filter), and the active-filter chip row is
 * built out of REMOVABLE chips - a sort has nothing to remove to, only another sort. So after
 * `CF-34` folded the two sort chips into the sheet, the applied order became invisible: no badge on
 * « Filtres », no chip, and reopening the sheet was the only way to learn it. That is strictly less
 * than the pre-branch screen showed. One clause on a line that is already on screen restores it
 * without adding a control the owner did not approve.
 *
 * 🛑 **« A → Z » IS DELIBERATELY UNNAMED, and this is the silent default this comment exists to
 * declare: an ABSENT clause here means A → Z.** Three reasons, in the order that decided it.
 * `RepairerDirectory` sends NOTHING for `az` because absent and `az` are the same order on the
 * server, so there is no chosen value to report. Alphabetical order is self-evident from reading
 * the rows, where « nearest first » and « best rated first » are not. And this line renders on
 * EVERY load, so a permanent « de A à Z » would be chatter on the one state that is not news.
 * `DemandeFeed.tsx`'s `browseSubtitle` is the local precedent and does exactly this - it names
 * proximity only when located and says nothing otherwise.
 *
 * **No clause for 0 or 1 row**, also `browseSubtitle`'s rule and for its stated reason: « 1
 * réparateur, les mieux notés d'abord » is ungrammatical AND a claim about sorting one item.
 * Measured with PIL at 12.5pt `400Regular` against this `ScrollView`'s 343pt inner width on a
 * 375pt SE: the longest string this can produce is « 12 réparateurs, les plus proches d'abord » at
 * **222.5pt**, and « …les mieux notés d'abord » is 219.2pt. Both are one line with 120.5pt spare,
 * so the missing `numberOfLines` costs nothing. A three-digit count adds **4.8pt** (measured, not
 * estimated: « 112 réparateurs, … » is 227.2pt).
 */
function countLine(count: number, sort: DirectoryFilters['sort'] | undefined): string {
  const noun = count === 1 ? '1 réparateur' : `${count} réparateurs`;
  if (count < 2) return noun;
  if (sort === 'distance') return `${noun}, les plus proches d'abord`;
  if (sort === 'note') return `${noun}, les mieux notés d'abord`;
  // `'az'` and `undefined` both land here. See the header: absence means A → Z.
  return noun;
}

/**
 * The empty state's SECOND line, which names the cause the title cannot.
 *
 * 🛑 The two category sentences are `CF-33`'s and are preserved word for word, because they carry
 * a live production fact rather than a pleasantry: `RepairerCategory` holds **0 rows** (counted in
 * the live DB 2026-09-02, not taken from `repairers.service.ts`'s comment), so all 12 listable
 * réparateurs vanish the moment a category is picked. « Essayez une catégorie plus large » is the
 * only honest advice on that screen.
 *
 * 🆕 `CF-34`: four facets can now combine, and no single sentence can name a cause built out of
 * several. So the category wording is kept for the case it was written for - the category ALONE -
 * and any other combination defers to the two things that DO enumerate: the active-filter chip row
 * above, which shows every applied facet, and « Réinitialiser les filtres » below. `radiusKm`
 * needs no clause of its own; it cannot be set without `near`, which the first test covers.
 *
 * 🛑 **`!isCompletePostalCode`, NOT `near.length === 0`** - corrected 2026-09-02 by the whole-branch
 * review, and it was the last length test left in this file. It was never WRONG: `normalisedForApply`
 * guarantees a `near` leaving the sheet is either `''` or five digits, so the two agreed. But it
 * agreed only because ANOTHER file maintains the invariant, in a file whose own comment 400 lines
 * up calls a length test « a real user-facing defect ». One rule with one exception is a rule
 * nobody can apply; the shared predicate leaves it none.
 */
function emptyHint(filters: DirectoryFilters, searching: boolean): string {
  const onlyCategory =
    filters.categoryId !== null &&
    !isCompletePostalCode(filters.near) &&
    filters.minRating === null;
  if (onlyCategory && searching) {
    return 'Aucun réparateur ne correspond à cette catégorie et à ce nom. Essayez une catégorie plus large ou un autre nom.';
  }
  if (onlyCategory) {
    return "Aucun réparateur n'a encore indiqué cette catégorie. Essayez une catégorie plus large ou retirez le filtre.";
  }
  if (activeFilterCount(filters) > 0) {
    return 'Essayez des filtres plus larges, ou réinitialisez-les.';
  }
  if (searching) return 'Essayez un autre nom.';
  return 'Les réparateurs inscrits apparaîtront ici.';
}

/**
 * Composes « Électronique · Smartphones » from the flat list, for the active-filter CHIP. (It fed
 * the « Filtré par X » prose LINE until `CF-34` deleted that line; the composed label is now the
 * widest thing this screen renders, which the chip row's own comment measures.)
 *
 * Copied from `publier.tsx`'s `categoryLabel` rather than importing - it is local to a screen this
 * slice deliberately does not touch (design §15), and reaching into it would be the extraction that
 * section rejects. With 36 leaves and two near-duplicates across parents, a bare leaf label is
 * ambiguous.
 */
function activeCategoryLabel(categories: CategoryDto[] | undefined, id: string): string {
  const found = categories?.find((c) => c.id === id);
  if (!found) return 'Catégorie inconnue';
  if (found.parentId === null) return found.labelFr;
  const parent = categories?.find((c) => c.id === found.parentId);
  return parent ? `${parent.labelFr} · ${found.labelFr}` : found.labelFr;
}
