import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IconSmartphone, IconLaptop, IconWatch, IconConsole, IconBike } from '../icons';
import { resolveCategoryTiles, type CategoryTileSlug } from '../lib/category-tiles';
import type { CategoryDto } from '@revime/shared';

/**
 * The five shortcut tiles under « Catégories » (`Accueil.tsx:6-12, 89-98`).
 *
 * The slug-to-category mapping and its reasoning live in `src/lib/category-tiles.ts`; this
 * file only draws it. The icons stay here because they are presentation, and keeping them
 * out of the resolver is what lets the resolver be tested without React Native.
 */
const ICON_BY_SLUG: Record<CategoryTileSlug, typeof IconSmartphone> = {
  smartphone: IconSmartphone,
  ordinateur: IconLaptop,
  'montres-bijoux': IconWatch,
  console: IconConsole,
  velos: IconBike,
};

/**
 * The tile row's exact height: a 58pt icon square, the 7pt gap, and the 11pt label's line
 * box. Hardcoded rather than measured because it must be known BEFORE the data arrives -
 * reserving it is the entire point.
 */
const ROW_H = 58 + 7 + 14;

type Props = {
  /** The flat list from `GET /categories`. `undefined` while the query is pending. */
  categories: CategoryDto[] | undefined;
  isError?: boolean;
  /** Opens the publish wizard with this category preselected. */
  onPickCategory: (categoryId: string) => void;
  onSeeAll: () => void;
};

export function CategoryTiles({ categories, isError = false, onPickCategory, onSeeAll }: Props) {
  const { palette, accent, spacing } = useTheme();
  const state = resolveCategoryTiles(categories, isError);

  // Only a definitive "there is nothing to show" removes the section. While the query is
  // pending the heading and the row's height are held, so the content below does not shift
  // when the tiles arrive - the bug this component had on 2026-08-20.
  if (state.status === 'empty') return null;

  return (
    <View>
      <View style={[styles.sectionRow, { marginTop: spacing.xl, marginBottom: spacing.md }]}>
        <Text style={[styles.eyebrow, { color: palette.faint }]}>CATÉGORIES</Text>
        <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={8}>
          <Text style={[styles.seeAll, { color: accent.accent }]}>Voir tout</Text>
        </Pressable>
      </View>

      {state.status === 'loading' ? (
        // « Chargement… » inside a box of the row's exact height. The wording matches
        // CategorySearch, RepairerDirectory and DemandeFeed, so this reads as the same
        // loading state the rest of the app uses rather than a bespoke skeleton.
        <View style={{ height: ROW_H, justifyContent: 'center' }}>
          <Text style={[styles.loading, { color: palette.muted }]}>Chargement…</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.md }}
          style={{ height: ROW_H }}
        >
          {state.tiles.map(({ slug, label, id }) => {
            const Icon = ICON_BY_SLUG[slug];
            return (
              <Pressable
                key={slug}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => onPickCategory(id)}
                style={({ pressed }) => [
                  styles.tile,
                  { transform: [{ scale: pressed ? 0.94 : 1 }] },
                ]}
              >
                <View
                  style={[
                    styles.tileIcon,
                    {
                      backgroundColor: palette.mist,
                      borderColor: palette.line,
                      borderCurve: 'continuous',
                    },
                  ]}
                >
                  <Icon size={22} color={palette.ink} strokeWidth={2} />
                </View>
                <Text style={[styles.tileLabel, { color: palette.muted }]} numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  eyebrow: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 11, letterSpacing: 1.6 },
  seeAll: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12.5 },
  loading: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  tile: { alignItems: 'center', gap: 7, width: 66 },
  tileIcon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 11 },
});
