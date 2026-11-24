import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../src/theme';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';

/**
 * `CF-40`. The payment result page for the unhappy path.
 *
 * 🛑 THE HEADING IS THE CLIENT'S OWN WORDS, « Le paiement n'a pas abouti », and that is
 * deliberate rather than lazy. This account's Checkout is `['card']` only; cards are
 * synchronous, so `checkout.session.async_payment_failed` can never fire, and a DECLINED
 * card never leaves Stripe's page at all - Stripe retries in-session. The only signals
 * that reach us are abandonment (`cancel_url`) and an expired session.
 *
 * So a screen headed « Paiement refusé » would assert something we cannot observe. His
 * phrasing is true for both cases and claims neither, which is why it is used verbatim.
 */
export default function EchecPaiement() {
  const { id, offerId } = useLocalSearchParams<{ id: string; offerId?: string }>();
  const { palette, spacing } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Card>
          <Text style={[styles.title, { color: palette.ink }]}>Le paiement n'a pas abouti</Text>
          <Text style={[styles.body, { color: palette.muted }]}>
            Aucun montant n'a été prélevé. L'offre que vous avez choisie est toujours
            disponible, vous pouvez réessayer quand vous le souhaitez.
          </Text>
        </Card>

        <View style={{ gap: spacing.sm }}>
          {offerId && (
            // `resolvePending` reuses the live Stripe session for this same offer, so a
            // retry costs no new session and cannot double-charge: it refuses outright if
            // the client has already paid and the webhook has simply not landed.
            <Button
              label="Réessayer"
              onPress={() => router.replace(`/demande/${id}/paiement?offerId=${offerId}`)}
            />
          )}
          <Button
            label="Retour à ma demande"
            variant={offerId ? 'secondary' : 'primary'}
            onPress={() => router.replace(`/demande/${id}/offres`)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 18 },
  body: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, marginTop: 6, lineHeight: 20 },
});
