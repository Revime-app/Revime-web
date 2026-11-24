import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { ScreenMotif } from '../src/components/ScreenMotif';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { Card } from '../src/components/Card';
import { Badge } from '../src/components/Badge';
import { Button } from '../src/components/Button';
import { VerificationBanner } from '../src/components/VerificationBanner';
import { useMyOffers, useWithdrawOffer } from '../src/lib/queries';
import { delayLabel, euros, OFFER_STATUS_LABEL, OFFER_STATUS_TONE, type OfferListItem } from '@revime/shared';
import { RevimeLoader } from '../src/components/lottie/RevimeLoader';
import { RevimeRefreshScrollView } from '../src/components/RevimeRefreshScrollView';
import { useTourPage, useTourTarget } from '../src/tour/use-tour';

/**
 * The réparateur's full list of offers sent.
 *
 * This is the screen the réparateur's Accueil used to BE. When Accueil became the
 * prototype's dashboard (`repareme-web/src/screens/AccueilPro.tsx`) the list needed
 * somewhere to live rather than being deleted - exactly the move `/mes-demandes` made for
 * the client one day earlier, and for the same reason: the prototype's AccueilPro has no
 * offers section at all, while its Profil carries a « Mes propositions » row
 * (`repareme-web/src/screens/Profil.tsx:46`). Reached from that row and from the activity
 * card on Accueil.
 *
 * Rows are ordered by `/offers/mine` and not re-sorted here, so this screen cannot come
 * to disagree with the API about "most recent".
 */

export default function MesPropositions() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const offers = useMyOffers();
  // V8 E2: the subtitle renders once the list has loaded (a loader stands in before).
  useTourPage('propositions', !offers.isPending);
  const subtitleTarget = useTourTarget('propositionsSubtitle');
  const withdraw = useWithdrawOffer();

  const confirmWithdraw = (offer: OfferListItem) => {
    Alert.alert(
      'Retirer cette offre ?',
      'Le client ne la verra plus. Vous pourrez en proposer une nouvelle.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => {
            withdraw.mutate(offer.id, {
              onError: () =>
                Alert.alert('Impossible de retirer cette offre', 'Merci de réessayer.'),
            });
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenMotif v={1} variant="navy" />
      {/* onBack is REQUIRED, not optional polish: this is a pushed screen and ScreenHeader
          renders an empty spacer without it, which would strand the réparateur. */}
      <ScreenHeader title="Mes propositions" onBack={() => router.back()} />
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
            Les offres que vous avez envoyées
          </Text>

          <VerificationBanner />

          {offers.isError && (
            <Text style={[styles.bodyStrong, { color: palette.red }]}>
              Impossible de charger vos offres. Tirez vers le bas pour réessayer.
            </Text>
          )}

        {!offers.isError && offers.data?.length === 0 && (
          <Card>
            <Text style={[styles.emptyTitle, { color: palette.ink }]}>Aucune offre envoyée</Text>
            {/* « l'onglet Recherche » and not the centre button, deliberately: both open a
                demande feed, but only Recherche's is searchable, which is what somebody
                looking for work to quote actually wants. Copy unchanged from when this
                list was Accueil. */}
            <Text style={[styles.emptyBody, { color: palette.muted }]}>
              Ouvrez l&apos;onglet Recherche pour parcourir les demandes à chiffrer.
            </Text>
          </Card>
        )}

        <View style={{ gap: spacing.md }}>
          {!offers.isError &&
            (offers.data ?? []).map((o) => (
              <Card key={o.id}>
                <View style={styles.row}>
                  <Text style={[styles.title, { color: palette.ink }]} numberOfLines={2}>
                    {o.demandeTitle}
                  </Text>
                  <Badge label={OFFER_STATUS_LABEL[o.status]} tone={OFFER_STATUS_TONE[o.status]} />
                </View>
                <Text style={[styles.meta, { color: palette.muted }]}>
                  {euros(o.priceCents)} · {delayLabel(o.delayHours)}
                </Text>

                {o.status === 'SENT' && (
                  <View style={{ marginTop: spacing.md }}>
                    <Button
                      label="Retirer mon offre"
                      variant="secondary"
                      loading={withdraw.isPending}
                      onPress={() => confirmWithdraw(o)}
                    />
                  </View>
                )}
              </Card>
            ))}
        </View>
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  subtitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, marginBottom: 16 },
  title: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, flex: 1 },
  meta: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, marginTop: 4 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
  bodyStrong: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
  emptyTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
  emptyBody: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 4 },
});
