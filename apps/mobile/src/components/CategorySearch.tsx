import { useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { Chip } from './Chip';
import { ResultRow } from './ResultRow';
import { useCategories } from '../lib/queries';
import { useTabBarSpace } from '../lib/use-tab-bar-space';
import {
  rootChips,
  searchRows,
  ALL_CHIP,
  SORT_LABEL,
  type SearchSort,
} from '../lib/category-search';
import { iconForCategory } from '../lib/category-icons';
import { IconSearch } from '../icons';

/**
 * The client's half of the Recherche tab, rebuilt on 2026-08-20 to the prototype's
 * `RechercheClient.tsx`: a search field, a chip filter, a result count with a sort control,
 * and a flat list of `.result-row`s.
 *
 * It previously rendered the taxonomy as nested `Card`s with no icons, chips, count or sort.
 *
 * There is no endpoint behind this. `useCategories` is reference data at
 * `staleTime: Infinity`, so filtering and sorting happen locally and instantly - which is
 * also why the search can afford to be accent-insensitive where the server's feed cannot.
 * The logic lives in `src/lib/category-search.ts`, and the row's icon in
 * `src/lib/category-icons.ts`.
 *
 * 🛑 CORRECTED 2026-08-29 by `CF-32`. This line used to end « and is unit-checked there. »
 * It is not, and never was: `find apps/mobile -name '*.spec.ts*' -o -name '*.test.ts*'`
 * returns nothing and `package.json` has no test script - `typecheck` is the whole of CI for
 * this workspace, exactly as `apps/mobile/AGENTS.md` says. Extracting logic into `src/lib`
 * makes it testABLE, which is not the same as tested, and writing the stronger claim is how a
 * reader ends up trusting a gate that does not exist.
 *
 * The prototype's list also carried repair types (« Écran cassé », « Batterie », « Freins »).
 * Those are still not a schema concept - the taxonomy answers what kind of OBJECT, not what
 * kind of repair - so they remain dropped rather than invented, and the placeholder says
 * « type d'appareil » rather than the prototype's « marque, type de panne » for the same
 * reason: neither a brand nor a fault type is searchable here, and promising them would be a
 * lie the field cannot honour.
 *
 * The screen title and the Réparations / Réparateurs subtabs live in `ClientSearch`.
 */

export function CategorySearch({
  onSelectCategory,
}: {
  onSelectCategory?: (categoryId: string) => void;
} = {}) {
  const { palette, spacing, radii } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const categories = useCategories();

  const [q, setQ] = useState('');
  const [chipId, setChipId] = useState<string>(ALL_CHIP);
  const [sort, setSort] = useState<SearchSort>('pertinence');

  const chips = useMemo(() => rootChips(categories.data), [categories.data]);
  const rows = useMemo(
    () => searchRows(categories.data, { q, chipId, sort }),
    [categories.data, q, chipId, sort],
  );

  const open = (categoryId: string) => {
    if (onSelectCategory) {
      onSelectCategory(categoryId);
    } else {
      router.navigate({ pathname: '/(tabs)/publier', params: { categoryId } });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: tabBarSpace }}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={[
          styles.field,
          {
            backgroundColor: palette.mist,
            borderColor: palette.line,
            borderRadius: radii.field,
            marginBottom: spacing.md,
          },
        ]}
      >
        <IconSearch size={18} color={palette.faint} strokeWidth={2.2} />
        <TextInput
          style={[styles.input, { color: palette.ink }]}
          placeholder="Catégorie, type d'appareil…"
          placeholderTextColor={palette.faint}
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          autoCorrect={false}
        />
        {q.length > 0 && (
          <Pressable
            onPress={() => setQ('')}
            accessibilityLabel="Effacer la recherche"
            hitSlop={8}
          >
            <Text style={[styles.clear, { color: palette.muted }]}>×</Text>
          </Pressable>
        )}
      </View>

      {categories.isError && (
        <Text style={[styles.error, { color: palette.red }]}>
          Impossible de charger les catégories. Réessayez plus tard.
        </Text>
      )}

      {/* The chip row and the count are hidden while the query is pending rather than shown
          empty: unlike Accueil's tiles they are not a fixed-height slot, and a « 0
          résultat(s) » line that flips to 39 reads as a wrong answer rather than a loading
          one. The « Chargement… » line below holds the space instead. */}
      {!categories.isError && !categories.isPending && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 2 }}
            style={{ marginBottom: spacing.md }}
          >
            <Chip
              label="Tous"
              variant="accent"
              active={chipId === ALL_CHIP}
              onPress={() => setChipId(ALL_CHIP)}
            />
            {chips.map((c) => (
              <Chip
                key={c.id}
                label={c.label}
                variant="accent"
                active={chipId === c.id}
                onPress={() => setChipId(c.id)}
              />
            ))}
          </ScrollView>

          <View style={styles.countRow}>
            <Text style={[styles.count, { color: palette.muted }]}>
              {rows.length} résultat(s)
            </Text>
            {/* The prototype uses a `<select>`. React Native has none and this app has no
                picker, but `DemandeFeed` already establishes sort-as-chips - and with only
                two options a toggle showing the ACTIVE sort is fewer taps than a menu.
                accessibilityHint states what the tap does, since the label alone reads as a
                status rather than a control. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Tri : ${SORT_LABEL[sort]}`}
              accessibilityHint="Change le tri des résultats"
              onPress={() => setSort(sort === 'pertinence' ? 'az' : 'pertinence')}
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
        </>
      )}

      {categories.isPending && (
        <Text style={[styles.loading, { color: palette.muted }]}>Chargement…</Text>
      )}

      {!categories.isError && !categories.isPending && rows.length === 0 && (
        // `.search-empty`: centred, 48/20, muted. Copy is the prototype's, and it names the
        // filters as well as the word because either can be why nothing matched.
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: palette.ink }]}>Aucun résultat</Text>
          <Text style={[styles.emptyBody, { color: palette.muted }]}>
            Essayez un autre mot ou modifiez les filtres.
          </Text>
        </View>
      )}

      {rows.map((r, i) => {
        const Icon = iconForCategory(r.slug, r.rootSlug);
        return (
          <ResultRow
            key={r.id}
            title={r.label}
            tag={r.tag}
            icon={<Icon size={20} color={palette.ink} strokeWidth={2.1} />}
            onPress={() => open(r.id)}
            last={i === rows.length - 1}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  input: { flex: 1, paddingVertical: 12, fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  clear: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16 },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  count: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5 },
  sort: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  sortLabel: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },
  loading: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  error: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14, marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  emptyBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4, textAlign: 'center' },
});
