import { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
// `edges={['top']}` like every other `ScreenHeader` screen (e.g. `tableau-de-bord.tsx`): this
// route has no native header, so without it the header drew under the status bar (CF4-46).
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_SPECIALITIES, type CategoryNode } from '@revime/shared';
import { useTheme } from '../src/theme';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Button';
import { useSessionContext } from '../src/lib/session';
import { useCategories, useSetCategories } from '../src/lib/queries';
import { pickerGroups } from '../src/lib/category-picker-rows';
import { iconForCategory } from '../src/lib/category-icons';
import { ApiError } from '../src/lib/api';
import { IconSearch } from '../src/icons';
import { CheckIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { RevimeLoader } from '../src/components/lottie/RevimeLoader';
import { KeyboardAvoider } from '../src/components/KeyboardAvoider';

/**
 * `CF-25`. The speciality picker - a réparateur declares which repair categories he offers.
 *
 * MEASUREMENT, iPhone SE 375pt - TWO row variants with different available widths:
 * - ScrollView: 16pt padding each side (spacing.lg)
 * - Card: 16pt padding each side
 * - Row layout: icon 24pt, gap 12pt, label flex, gap 12pt, checkbox 24pt = 72pt consumed
 *
 * ROOT rows (no indent):
 *   Available: 375 - 32 (scroll) - 32 (card) - 72 (controls) = **239pt**
 *   Longest: « Tout Mode & accessoires » measures 170.2pt at 15pt 400Regular - fits
 *
 * CHILD rows (`paddingLeft: 36`):
 *   Available: 375 - 32 (scroll) - 32 (card) - 36 (indent) - 72 (controls) = **203pt**
 *   Longest: « Autres appareils électroniques » measures 207.5pt at 15pt 400Regular - overflows 4.5pt
 *   Solution: `numberOfLines={2}` on label, preserving the indent rather than trading hierarchy for 4.5pt
 */
export default function MesCategories() {
  const { palette, spacing, accent } = useTheme();
  const router = useRouter();
  const { me, refresh } = useSessionContext();
  const categories = useCategories();
  const setCategories = useSetCategories();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const seededRef = useRef(false);

  // Seed the form once when me first loads, then never again. After the initial seed, the form
  // is the source of truth. This prevents data loss: if the user typed after a save's mutation
  // resolved but before the session refetch landed, a continuous-sync effect would reset the
  // fields and destroy their work. One-shot seeding eliminates the window entirely.
  useEffect(() => {
    if (!seededRef.current && me?.repairer) {
      // 🛑 `?? []` is mandatory - an app newer than the API receives the field as undefined, and
      // `.length` on it throws during render, unwinding the entire app through the global handler.
      setSelected(new Set(me.repairer.categoryIds ?? []));
      seededRef.current = true;
    }
  }, [me]);

  const initial = useMemo(() => new Set(me?.repairer?.categoryIds ?? []), [me]);
  const groups = pickerGroups(categories.data, q);
  const changed = selected.size !== initial.size || ![...selected].every((id) => initial.has(id));
  const exceedsCap = selected.size > MAX_SPECIALITIES;

  const handleSave = () => {
    setCategories.mutate(
      { categoryIds: [...selected] },
      {
        onSuccess: async () => {
          await refresh();
          router.back();
        },
      },
    );
  };

  // Gate: the route is only reachable from a gated section, but a screen must not depend on
  // its caller for a rule the server enforces.
  if (me === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
        <ScreenHeader title="Catégories" onBack={() => router.back()} />
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      </SafeAreaView>
    );
  }

  if (me.profile.repairerEnabled !== true) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
        <ScreenHeader title="Catégories" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg }}>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_500Medium',
              fontSize: 14,
              color: palette.muted,
              textAlign: 'center',
            }}
          >
            Cette fonctionnalité est réservée aux réparateurs.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
      <ScreenHeader
        title="Catégories"
        subtitle="Sélectionnez vos spécialités"
        onBack={() => router.back()}
      />

      <KeyboardAvoider>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search field, styled like RepairerDirectory's */}
        <View
          style={[
            styles.searchField,
            {
              backgroundColor: palette.mist,
              borderColor: palette.line,
              marginBottom: spacing.md,
            },
          ]}
        >
          <IconSearch size={18} color={palette.faint} strokeWidth={2} />
          <TextInput
            style={[
              styles.searchInput,
              {
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 14,
                color: palette.ink,
              },
            ]}
            placeholder="Catégorie, type d'appareil…"
            placeholderTextColor={palette.faint}
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
            autoCorrect={false}
          />
          {q.length > 0 && (
            <Pressable onPress={() => setQ('')} accessibilityLabel="Effacer la recherche">
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_600SemiBold',
                  fontSize: 16,
                  color: palette.faint,
                }}
              >
                ×
              </Text>
            </Pressable>
          )}
        </View>

        <Card>
          {categories.isPending ? (
            <View style={{ paddingVertical: 32, alignItems: 'center', justifyContent: 'center' }}>
              <RevimeLoader variant="fill" size={72} />
            </View>
          ) : categories.isError ? (
            <View style={{ paddingVertical: 24, alignItems: 'center', gap: spacing.sm }}>
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_400Regular',
                  fontSize: 14,
                  color: palette.red,
                  textAlign: 'center',
                }}
              >
                Impossible de charger les catégories.
              </Text>
              <Pressable onPress={() => void categories.refetch()}>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_600SemiBold',
                    fontSize: 13,
                    color: accent.accent,
                  }}
                >
                  Réessayer
                </Text>
              </Pressable>
            </View>
          ) : groups.length === 0 ? (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 14,
                color: palette.muted,
                textAlign: 'center',
                paddingVertical: 24,
              }}
            >
              Aucune catégorie trouvée.
            </Text>
          ) : (
            groups.map((group, groupIdx) => (
              <View key={group.root.id}>
                {groupIdx > 0 && (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: palette.line,
                      marginVertical: spacing.sm,
                    }}
                  />
                )}

                {/* Root row */}
                <CategoryRow
                  label={`Tout ${group.root.labelFr}`}
                  slug={group.root.slug}
                  rootSlug={group.root.slug}
                  checked={selected.has(group.root.id)}
                  onPress={() => setSelected(toggleRoot(selected, group.root))}
                />

                {/* Child rows */}
                {group.children.map((child) => {
                  // A child renders as checked when it is selected OR its root is - a root claim
                  // covers it. Tapping it in that inherited state narrows the family-wide claim
                  // to that one child.
                  const checked = selected.has(child.id) || selected.has(group.root.id);
                  return (
                    <CategoryRow
                      key={child.id}
                      label={child.labelFr}
                      slug={child.slug}
                      rootSlug={group.root.slug}
                      checked={checked}
                      onPress={() => setSelected(toggleChild(selected, group.root, child.id))}
                      indent
                    />
                  );
                })}
              </View>
            ))
          )}
        </Card>

        {/* Footer: count and save button */}
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_500Medium',
              fontSize: 13,
              color: exceedsCap ? palette.red : palette.muted,
              textAlign: 'center',
            }}
          >
            {selected.size} / {MAX_SPECIALITIES}
          </Text>

          {exceedsCap && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.red,
                textAlign: 'center',
              }}
            >
              Vous pouvez sélectionner jusqu'à {MAX_SPECIALITIES} catégories.
            </Text>
          )}

          {setCategories.error && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_500Medium',
                fontSize: 13,
                color: palette.red,
                textAlign: 'center',
              }}
            >
              {setCategories.error instanceof ApiError
                ? setCategories.error.message
                : 'Une erreur est survenue. Réessayez.'}
            </Text>
          )}

          <Button
            label="Enregistrer"
            onPress={handleSave}
            disabled={!changed || exceedsCap}
            loading={setCategories.isPending}
          />
        </View>
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

type CategoryRowProps = {
  label: string;
  slug: string;
  rootSlug: string;
  checked: boolean;
  onPress: () => void;
  indent?: boolean;
};

function CategoryRow({ label, slug, rootSlug, checked, onPress, indent }: CategoryRowProps) {
  const { palette, accent } = useTheme();
  const Icon = iconForCategory(slug, rootSlug);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={({ pressed }) => [
        styles.row,
        { opacity: pressed ? 0.6 : 1 },
        indent && { paddingLeft: 36 },
      ]}
    >
      <Icon size={24} color={palette.ink} strokeWidth={2} />
      <Text
        numberOfLines={2}
        style={{
          flex: 1,
          fontFamily: 'GoogleSansFlex_400Regular',
          fontSize: 15,
          color: palette.ink,
        }}
      >
        {label}
      </Text>
      <View
        style={[
          styles.checkbox,
          {
            borderColor: checked ? accent.accent : palette.line,
            backgroundColor: checked ? accent.accent : 'transparent',
          },
        ]}
      >
        {checked && (
          <HugeiconsIcon icon={CheckIcon} size={14} color={palette.paper} strokeWidth={3} />
        )}
      </View>
    </Pressable>
  );
}

/**
 * `CF-25`. Selecting a root ABSORBS its children; selecting a child RELEASES its root.
 *
 * The server normalises the same way (`normaliseSpecialities`), so this is not the guard - it is
 * what stops our own client ever sending a set the server is about to rewrite. Without it he
 * checks « Tout Électronique » and « Smartphones », saves, and comes back to one chip: correct,
 * and indistinguishable from the app losing his tap.
 *
 * Both directions are needed. Absorbing alone would leave a child checked underneath a checked
 * root; releasing alone would let the pair coexist.
 */
function toggleRoot(selected: Set<string>, root: CategoryNode): Set<string> {
  const next = new Set(selected);
  if (next.has(root.id)) {
    next.delete(root.id);
    return next;
  }
  for (const child of root.children) next.delete(child.id);
  next.add(root.id);
  return next;
}

function toggleChild(selected: Set<string>, root: CategoryNode, childId: string): Set<string> {
  const next = new Set(selected);
  if (next.has(childId)) {
    next.delete(childId);
    return next;
  }
  // Releasing the root keeps his OTHER children of that family untouched - only the family-wide
  // claim goes, replaced by the specific one he just made.
  next.delete(root.id);
  next.add(childId);
  return next;
}

const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
