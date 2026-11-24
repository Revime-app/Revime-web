import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { ScreenMotif } from '../src/components/ScreenMotif';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Card } from '../src/components/Card';
import { Chip } from '../src/components/Chip';
import { Initials } from '../src/components/Initials';
import { Badge } from '../src/components/Badge';
import { FavoriteHeart } from '../src/components/FavoriteHeart';
import { DemandeCard } from '../src/components/DemandeCard';
import {
  useFavoriteRepairers,
  useFavoriteDemandes,
  useToggleFavoriteRepairer,
  useToggleFavoriteDemande,
} from '../src/lib/queries';
import { useSessionContext } from '../src/lib/session';
import { RevimeRefreshScrollView } from '../src/components/RevimeRefreshScrollView';
import { ApiError } from '../src/lib/api';
import { ratingLabel, VERIFIED_BADGE_LABEL } from '@revime/shared';
import type { RepairerCardDto } from '@revime/shared';
import { RevimeLoader } from '../src/components/lottie/RevimeLoader';

/**
 * `CF-20`. « Retrouver facilement ses favoris ».
 *
 * MODE-AWARE, and the test is `activeMode` and NOT `repairerEnabled`: this is « what is he
 * looking at right now », and every live account is a réparateur sitting in CLIENT mode, so
 * `repairerEnabled` here would show the two-list version to everybody. `AGENTS.md` records
 * this distinction twice. `notifications.tsx` filters by active mode for the same reason.
 *
 * Client mode: two Chips, Réparateurs / Annonces - the client's own words, « favoris
 * réparateurs ; favoris annonces ».
 * Réparateur mode: the Annonces list alone, no chip row, because « côté réparateur : favoris
 * annonces/demandes » is his whole ask for that side.
 *
 * 🛑 Chips, NOT a segmented control: this app HAS no segmented control component, and
 * `CF-47` replaced mockup 01's Client/Réparateur toggle with SettingsRows. The in-repo
 * precedent for a mutually exclusive horizontal set is `DemandeFeed`'s sort chips -
 * `CategorySearch.tsx:146` names it « DemandeFeed already establishes sort-as-chips ».
 *
 * MEASURED CHIP WIDTHS - read off `Chip.tsx` rather than assumed: `:67` is
 * **GoogleSansFlex_600SemiBold at 13pt**, and `styles.base` adds 15pt padding each side with a
 * 1.5pt border each side (`:64`).
 * - Réparateurs: 76.8pt label + 30pt padding + 3pt border = 109.8pt
 * - Annonces:    62.0pt label + 30pt padding + 3pt border =  95.0pt
 * - Total with the row's 8pt gap: **212.8pt** against the **343pt** inner width of a 375pt
 *   iPhone SE (375 − 2 × `spacing.lg`), so ~130pt spare. One row at any supported width.
 *
 * 🛑 **CORRECTED 2026-08-31 by the whole-branch review. This block used to say « 700Bold, 14pt »
 * and quote 85.5 / 68.2 / 221.7pt - the right strings measured against the wrong component.**
 * `Chip` has never rendered its label at 14pt bold. The conclusion held because the real widths
 * are SMALLER, which is the direction that hides the error: an over-measurement can only ever
 * make a fitting layout look tighter than it is. Measure against the component that renders the
 * text, not against the last font size you happened to type.
 */
export default function Favoris() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const { me } = useSessionContext();
  const activeMode = me?.profile.activeMode ?? 'CLIENT';

  const [tab, setTab] = useState<'repairers' | 'demandes'>('repairers');
  /**
   * `CF-18` / `CF-19`, added 2026-08-31. ONE line for the screen, hoisted here rather than
   * duplicated in each tab: the two lists are mutually exclusive, only one heart can be in flight
   * from a tap, and a per-tab copy is how two surfaces come to word the same failure differently.
   *
   * It exists because neither toggle had an `onError`. Every heart on this screen is an
   * UNFAVOURITE, so a silent failure here is the worst case in the feature: the row disappears
   * (optimistically), the write fails, and the row comes back on the next refetch with no
   * explanation. The rollback in `queries.ts` restores the row immediately; this says why.
   */
  const [error, setError] = useState<string | null>(null);

  const repairers = useFavoriteRepairers();
  const demandes = useFavoriteDemandes();
  const toggleRepairer = useToggleFavoriteRepairer();
  const toggleDemande = useToggleFavoriteDemande();

  const now = new Date();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      {/* The motif follows the viewer, not the screen: a réparateur viewing /favoris in REPAIRER
          mode gets navy, the rest of réparateur mode's visual language. Same reasoning as
          recherche.tsx and demande/[id]/index.tsx. */}
      <ScreenMotif v={1} variant={activeMode === 'REPAIRER' ? 'navy' : 'accent'} />
      <ScreenHeader title="Mes favoris" onBack={() => router.back()} />
      <RevimeRefreshScrollView
        contentContainerStyle={{ padding: spacing.lg }}
        onRefresh={() =>
          activeMode === 'CLIENT' && tab === 'repairers' ? repairers.refetch() : demandes.refetch()
        }
      >
        {activeMode === 'CLIENT' && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
            <Chip
              label="Réparateurs"
              active={tab === 'repairers'}
              onPress={() => setTab('repairers')}
              variant="ink"
            />
            <Chip
              label="Annonces"
              active={tab === 'demandes'}
              onPress={() => setTab('demandes')}
              variant="ink"
            />
          </View>
        )}

        {error !== null && (
          <Text style={[styles.bodyStrong, { color: palette.red, marginBottom: spacing.md }]}>
            {error}
          </Text>
        )}

        {activeMode === 'CLIENT' && tab === 'repairers' && (
          <RepairersTab
            repairers={repairers}
            toggleRepairer={toggleRepairer}
            setError={setError}
            palette={palette}
            spacing={spacing}
            router={router}
          />
        )}

        {((activeMode === 'CLIENT' && tab === 'demandes') || activeMode === 'REPAIRER') && (
          <DemandesTab
            demandes={demandes}
            toggleDemande={toggleDemande}
            setError={setError}
            palette={palette}
            spacing={spacing}
            now={now}
            router={router}
          />
        )}
      </RevimeRefreshScrollView>
    </SafeAreaView>
  );
}

function RepairersTab({
  repairers,
  toggleRepairer,
  setError,
  palette,
  spacing,
  router,
}: {
  repairers: ReturnType<typeof useFavoriteRepairers>;
  toggleRepairer: ReturnType<typeof useToggleFavoriteRepairer>;
  setError: (message: string | null) => void;
  palette: any;
  spacing: any;
  router: any;
}) {
  if (repairers.isPending) {
    return (
      <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
        <RevimeLoader variant="fill" size={72} />
      </View>
    );
  }

  if (repairers.isError) {
    return (
      <Text style={[styles.bodyStrong, { color: palette.red }]}>
        Impossible de charger vos réparateurs favoris. Tirez vers le bas pour réessayer.
      </Text>
    );
  }

  if (repairers.data.length === 0) {
    return (
      <Card>
        <Text style={[styles.emptyTitle, { color: palette.ink }]}>
          Aucun réparateur favori
        </Text>
        <Text style={[styles.emptyBody, { color: palette.muted }]}>
          Ajoutez des réparateurs à vos favoris depuis leur profil pour les retrouver facilement ici.
        </Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {repairers.data.map((r) => (
        <View key={r.userId}>
          <Pressable onPress={() => router.push(`/reparateur/${r.userId}`)}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Initials name={r.displayName} uri={r.avatarUrl ?? null} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.repairerName, { color: palette.ink }]}
                    numberOfLines={1}
                  >
                    {r.displayName}
                  </Text>
                  <Text style={[styles.repairerSub, { color: palette.muted }]}>
                    {subLine(r)}
                  </Text>
                </View>
                {r.verifiedBadge !== null && (
                  <Badge tone="verified" label={VERIFIED_BADGE_LABEL[r.verifiedBadge]} />
                )}
                <FavoriteHeart
                  filled={true}
                  onToggle={() => {
                    setError(null);
                    // No `card`: this direction is a removal, and `queries.ts` filters the row out
                    // of the cache optimistically, which is what makes it leave the list at once.
                    toggleRepairer.mutate(
                      { userId: r.userId, next: false },
                      {
                        onError: (e) =>
                          setError(
                            e instanceof ApiError
                              ? e.message
                              : "Ce réparateur n'a pas pu être retiré de vos favoris.",
                          ),
                      },
                    );
                  }}
                />
              </View>
            </Card>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function DemandesTab({
  demandes,
  toggleDemande,
  setError,
  palette,
  spacing,
  now,
  router,
}: {
  demandes: ReturnType<typeof useFavoriteDemandes>;
  toggleDemande: ReturnType<typeof useToggleFavoriteDemande>;
  setError: (message: string | null) => void;
  palette: any;
  spacing: any;
  now: Date;
  router: any;
}) {
  if (demandes.isPending) {
    return (
      <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
        <RevimeLoader variant="fill" size={72} />
      </View>
    );
  }

  if (demandes.isError) {
    return (
      <Text style={[styles.bodyStrong, { color: palette.red }]}>
        Impossible de charger vos annonces favorites. Tirez vers le bas pour réessayer.
      </Text>
    );
  }

  if (demandes.data.length === 0) {
    return (
      <Card>
        <Text style={[styles.emptyTitle, { color: palette.ink }]}>
          Aucune annonce favorite
        </Text>
        <Text style={[styles.emptyBody, { color: palette.muted }]}>
          Ajoutez des annonces à vos favoris depuis le fil pour les retrouver facilement ici.
        </Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {demandes.data.map((d) => {
        // Normalise status at entry: a new field arrives `undefined` from a stale API, and
        // `undefined !== null` passes every null guard. AGENTS.md records this twice.
        const status = d.status ?? null;

        return (
          <DemandeCard
            key={d.id}
            demande={d}
            now={now}
            onPress={() => router.push(`/demande/${d.id}`)}
            status={status}
            isFavorite={true}
            onToggleFavorite={() => {
              setError(null);
              toggleDemande.mutate(
                { demandeId: d.id, next: false },
                {
                  onError: (e) =>
                    setError(
                      e instanceof ApiError
                        ? e.message
                        : "Cette annonce n'a pas pu être retirée de vos favoris.",
                    ),
                },
              );
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * 🛑 An unrated réparateur shows NO star and NO count - not « - » and not « Nouveau ».
 * A placeholder in a list row is noise, and « Nouveau » is a claim about someone we
 * would be inventing. This is the ORDINARY case in production, not an edge one.
 *
 * Copied from RepairerDirectory, kept local because this is the only other caller.
 */
function subLine(r: RepairerCardDto): string {
  const rated = r.rating !== null ? `★ ${ratingLabel(r.rating)} (${avisLine(r.reviewCount)})` : null;
  const parts = [rated, r.serviceAreaLabel].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : 'Réparateur';
}

function avisLine(count: number): string {
  return count === 1 ? '1 avis' : `${count} avis`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  bodyStrong: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
  emptyTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  emptyBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },
  repairerName: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  repairerSub: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 2 },
});
