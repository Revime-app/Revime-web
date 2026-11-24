import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { OfferDto } from '@revime/shared';
import { useTheme } from '../../../src/theme';
import { Chip } from '../../../src/components/Chip';
import { Card } from '../../../src/components/Card';
import { useDemandeOffers } from '../../../src/lib/queries';
import { useSessionContext } from '../../../src/lib/session';
import { liveOffers, visibleCriteria, euros, delayLabel, ratingLabel } from '@revime/shared';
import { RevimeLoader } from '../../../src/components/lottie/RevimeLoader';

const COL = 96;

export default function Comparaison() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const demandeId = id ?? '';
  const { palette, accent, spacing, type } = useTheme();
  const router = useRouter();
  const offers = useDemandeOffers(demandeId);
  const { me } = useSessionContext();

  // Withdrawn offers stay in the history on Offres, but never reach here.
  // Comparaison's whole job is to help choose, and it bolds a winner per row -
  // a withdrawn offer could otherwise be crowned the cheapest, pointing the
  // client at an offer nobody will honour.
  const live = useMemo(() => liveOffers(offers.data ?? []), [offers.data]);

  const criteria = useMemo(() => visibleCriteria(live), [live]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const active =
    activeKey === null
      ? null
      : (criteria.find((c) => c.key === activeKey) ?? criteria[0] ?? null);

  const sorted = useMemo(() => {
    const list = [...live];
    if (!active) return list;
    return list.sort((a, b) => active.rank(a) - active.rank(b));
  }, [live, active]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Pressable onPress={() => router.back()} style={{ marginBottom: spacing.md }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.muted }}>
            Retour
          </Text>
        </Pressable>

        <Text
          style={{
            fontFamily: 'GoogleSansFlex_700Bold',
            fontSize: type.screenTitle.size,
            color: palette.ink,
          }}
        >
          Comparaison
        </Text>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13.5,
            color: palette.muted,
            marginBottom: spacing.lg,
          }}
        >
          Choisissez un critère pour trier. À vous de décider.
        </Text>

        {offers.isPending && (
          <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
            <RevimeLoader variant="fill" size={72} />
          </View>
        )}

        {offers.isError && (
          <Text style={{ fontFamily: 'GoogleSansFlex_500Medium', color: palette.red }}>
            Impossible de charger les offres.
          </Text>
        )}

        {!offers.isPending && !offers.isError && criteria.length === 0 && (
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              Rien à comparer pour l'instant
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              {/* Three cases: zero, exactly one, or multiple offers. Each needs its
                  own message because the reasons differ. A réparateur can withdraw
                  while this screen is open, so a refetch can drop the list to one
                  offer or zero - saying "les mêmes conditions" about a single offer
                  or "il ne reste qu'une" when there are zero would be untrue. */}
              {live.length === 0
                ? "Toutes les offres ont été retirées. Consultez l'historique dans les offres reçues."
                : live.length === 1
                  ? "Il ne reste qu'une offre. Ouvrez les offres reçues pour la consulter en détail."
                  : 'Ces offres proposent les mêmes conditions. Consultez-les en détail pour choisir.'}
            </Text>
          </Card>
        )}

        {!offers.isError && criteria.length > 0 && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8, paddingBottom: spacing.lg }}>
                {criteria.map((c) => (
                  <Chip
                    key={c.key}
                    label={c.key}
                    active={active?.key === c.key}
                    onPress={() => setActiveKey(c.key)}
                  />
                ))}
              </View>
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.row}>
                  <View style={{ width: 104 }} />
                  {sorted.map((o) => (
                    <Text
                      key={o.id}
                      numberOfLines={1}
                      style={{
                        width: COL,
                        fontFamily: 'GoogleSansFlex_600SemiBold',
                        fontSize: 12.5,
                        color: palette.ink,
                        textAlign: 'center',
                      }}
                    >
                      {o.repairerName}
                    </Text>
                  ))}
                </View>

                {criteria.map((c) => {
                  const isActive = c.key === active?.key;
                  const ranks = sorted.map((o) => c.rank(o));
                  const best = Math.min(...ranks);
                  const allTie = ranks.every((v) => v === best);

                  return (
                    <View
                      key={c.key}
                      style={[
                        styles.row,
                        {
                          borderTopWidth: 1,
                          borderTopColor: palette.line,
                          backgroundColor: isActive ? accent.accentSoft : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          width: 104,
                          fontFamily: 'GoogleSansFlex_500Medium',
                          fontSize: 12.5,
                          color: palette.muted,
                        }}
                      >
                        {c.key}
                      </Text>
                      {sorted.map((o) => {
                        // Highlight only on the active row, and never when every
                        // offer ties - otherwise the product would appear to pick
                        // a winner, which Étape 1 §5.3 forbids.
                        const winner = isActive && !allTie && c.rank(o) === best;
                        return (
                          <Text
                            key={o.id}
                            numberOfLines={1}
                            style={{
                              width: COL,
                              textAlign: 'center',
                              fontFamily: winner ? 'GoogleSansFlex_700Bold' : 'GoogleSansFlex_500Medium',
                              fontSize: 13,
                              color: winner ? accent.accent : palette.ink,
                            }}
                          >
                            {c.get(o)}
                          </Text>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}

        {me?.paymentsEnabled && sorted.length > 0 && (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_700Bold',
                fontSize: type.section.size,
                color: palette.ink,
              }}
            >
              Choisir un réparateur
            </Text>
            {sorted.map((o) => (
              <Card key={o.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    {/* The name opens his public profile. No flag: reading a réparateur's
                        reputation before choosing is the point of this screen, and it is
                        the only tappable thing here that works in production today. */}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push(
                          `/reparateur/${o.repairerUserId}?demandeId=${demandeId}&offerId=${o.id}`,
                        )
                      }
                    >
                      <Text
                        style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.ink }}
                        numberOfLines={1}
                      >
                        {o.repairerName}
                      </Text>
                    </Pressable>
                    <Text
                      style={{ fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12.5, color: palette.muted }}
                    >
                      {euros(o.priceCents)} · {delayLabel(o.delayHours)}
                      {o.rating !== null ? ` · ★ ${ratingLabel(o.rating)} (${o.reviewCount})` : ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/demande/${demandeId}/paiement?offerId=${o.id}`)}
                    style={{
                      backgroundColor: accent.accent,
                      borderRadius: 999,
                      paddingVertical: 9,
                      paddingHorizontal: 18,
                    }}
                  >
                    <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 13, color: palette.paper }}>
                      Choisir
                    </Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
});
