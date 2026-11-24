import { useState } from 'react';
import { View, Text, Pressable, TextInput, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { BROWSE_PAGE_SIZE, euros, type PublicDemandeView } from '@revime/shared';
import { useTheme } from '../theme';
import { Card } from './Card';
import { Badge } from './Badge';
import { useBrowseDemandes } from '../lib/queries';
import { useTabBarSpace } from '../lib/use-tab-bar-space';
import { useDebounced } from '../lib/use-debounced';
import { IconCamera, IconLocation } from '../icons';
import { RevimeLoader } from './lottie/RevimeLoader';
import { RevimeRefreshScrollView } from './RevimeRefreshScrollView';

/**
 * CF4-24 (spec §4.3). The client's « Demandes » search tab: other clients' OPEN public demandes.
 * Mirrors the inspiration the client asked for - « voir ce que les autres demandent ».
 *
 * Tapping a row navigates to `/demande/[id]`, where the client can view the full request details
 * in read-only mode (with favorite and share controls, but without offer actions).
 *
 * Paging: one `BrowsePage` per page, each its own query, so « Voir plus » appends without
 * refetching what is already on screen. A page shorter than `BROWSE_PAGE_SIZE` is the last one.
 */
export function DemandeBrowse() {
  const { palette, spacing } = useTheme();
  const tabBarSpace = useTabBarSpace();
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q).trim();
  const [pages, setPages] = useState(1);
  // A new search starts again at page 1. Keyed on the debounced value, so a keystroke does
  // not collapse the list before the new results exist.
  const [pagesFor, setPagesFor] = useState(debouncedQ);
  if (pagesFor !== debouncedQ) {
    setPagesFor(debouncedQ);
    setPages(1);
  }
  const first = useBrowseDemandes(debouncedQ ? { q: debouncedQ } : {});

  return (
    <RevimeRefreshScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: tabBarSpace }}
      keyboardShouldPersistTaps="handled"
      onRefresh={() => first.refetch()}
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
          placeholder="Rechercher une demande…"
          placeholderTextColor={palette.faint}
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          autoCorrect={false}
          // `feedQuerySchema.q`'s cap, which `browseQuerySchema` reuses. Same reasoning as
          // `RepairerDirectory`: a 121st character would 400 with a message nothing prints.
          maxLength={120}
        />
      </View>

      <Text
        style={{
          fontFamily: 'GoogleSansFlex_400Regular',
          fontSize: 13,
          color: palette.muted,
          marginBottom: spacing.md,
        }}
      >
        Les demandes publiées par d&apos;autres clients, pour vous inspirer.
      </Text>

      {Array.from({ length: pages }, (_, i) => (
        <BrowsePage
          key={`${debouncedQ}-${i + 1}`}
          q={debouncedQ}
          page={i + 1}
          isLast={i + 1 === pages}
          onMore={() => setPages((p) => p + 1)}
        />
      ))}
    </RevimeRefreshScrollView>
  );
}

function BrowsePage({
  q,
  page,
  isLast,
  onMore,
}: {
  q: string;
  page: number;
  isLast: boolean;
  onMore: () => void;
}) {
  const { palette, spacing } = useTheme();
  const query = useBrowseDemandes({ ...(q ? { q } : {}), ...(page > 1 ? { page } : {}) });

  if (query.isPending) {
    if (page === 1) {
      return (
        <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
          <RevimeLoader variant="fill" size={80} text="Recherche des demandes…" />
        </View>
      );
    }
    return (
      <View style={{ paddingVertical: 16, alignItems: 'center', justifyContent: 'center' }}>
        <RevimeLoader variant="fill" size={40} centered={false} />
      </View>
    );
  }
  // 🛑 An error is an error, never « aucune demande »: until the H API half is deployed this
  // route 404s, and an empty list would be a false claim about the world.
  if (query.isError) {
    return (
      <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, color: palette.red }}>
        Impossible de charger les demandes.
      </Text>
    );
  }
  const items = query.data ?? [];
  if (page === 1 && items.length === 0) {
    return (
      <Card>
        <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, color: palette.muted }}>
          {q ? 'Aucune demande ne correspond à cette recherche.' : 'Aucune demande ouverte pour le moment.'}
        </Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
      {items.map((d) => (
        <BrowseRow key={d.id} demande={d} />
      ))}
      {isLast && items.length === BROWSE_PAGE_SIZE && page < 1000 && (
        <Pressable onPress={onMore} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13.5, color: palette.ink2 }}>
            Voir plus
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function BrowseRow({ demande: d }: { demande: PublicDemandeView }) {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  // New DTO: normalised at entry (apps/mobile/AGENTS.md).
  const photos = d.photos ?? [];
  const cover = photos[0] ?? null;

  return (
    <Pressable
      onPress={() => router.push(`/demande/${d.id}`)}
      accessibilityRole="button"
      accessibilityLabel={d.title}
    >
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
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
            {cover ? (
              <Image source={{ uri: cover }} style={{ width: 54, height: 54 }} resizeMode="cover" />
            ) : (
              <IconCamera size={20} color={palette.faint} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 14.5, color: palette.ink }}
              numberOfLines={2}
            >
              {d.title}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <Badge tone="neutral" label={d.category.labelFr} />
              {d.budgetCents !== null && <Badge tone="dark" label={`Budget ${euros(d.budgetCents)}`} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <IconLocation size={12} color={palette.muted} strokeWidth={2.4} />
                <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, color: palette.muted }}>
                  {d.locationLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13.5,
            lineHeight: 20,
            color: palette.ink,
            marginTop: spacing.md,
          }}
          numberOfLines={2}
        >
          {d.description}
        </Text>
      </Card>
    </Pressable>
  );
}
