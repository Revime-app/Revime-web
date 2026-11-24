import { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { euros, repairStatus } from '@revime/shared';
import { useTheme } from '../../../src/theme';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { DemandeProgressChain } from '../../../src/components/DemandeProgressChain';
import { useCommande } from '../../../src/lib/queries';
import { RevimeLoader } from '../../../src/components/lottie/RevimeLoader';
import { RevimeRefreshScrollView } from '../../../src/components/RevimeRefreshScrollView';
import { pendingRefetchInterval, usePendingCeiling } from '../../../src/lib/pending-confirmation';
import { SUPPORT_EMAIL } from '../../../src/lib/support';
import { deliveryRows } from '../../../src/lib/shipping-legs-view';

// CF6-05. The client asked why a payment « déjà accepté » still reads as pending. The honest answer
// is that WE have not finalised the order yet, not that the bank has not accepted: the screen is
// reached once the payment sheet has closed, and the API settles the order within one poll (CF6-04).
// So the copy says what is happening on our side and never asserts what the bank did.
const PENDING_TEXT =
  'Nous finalisons votre commande. Cela prend en général quelques secondes et cette page se met à jour toute seule.';
const PENDING_SLOW_TEXT = `La confirmation prend plus de temps que prévu. Vous pouvez actualiser, ou revenir plus tard : l'état de votre commande se mettra à jour. Si rien ne change, écrivez-nous à ${SUPPORT_EMAIL}.`;

export default function Acceptee() {
  const { c } = useLocalSearchParams<{ id: string; c: string }>();
  const { palette, spacing, type } = useTheme();
  const router = useRouter();

  // Reached by deep link from the browser, so state comes from the server rather
  // than from navigation params. The query string says which commande, nothing more.
  // When reached via PaymentSheet while webhook is landing, poll every 2s until finalized,
  // but not forever: after PENDING_POLL_CEILING_MS polling stops and the screen says so.
  //
  // The interval callback is created once and reads the ceiling through a ref, because `expired`
  // is derived from the order this very query returns. After the ceiling at most one more poll
  // fires (the one already scheduled), then none.
  const expiredRef = useRef(false);
  const refetchInterval = useCallback(
    (query: { state: { data?: { status: string } } }) =>
      pendingRefetchInterval(query.state.data?.status, expiredRef.current),
    [],
  );
  const commande = useCommande(c ?? '', { refetchInterval });
  const { expired, restart } = usePendingCeiling(commande.data?.status === 'PENDING_PAYMENT');
  expiredRef.current = expired;

  // CF6-05: the 2 s background poll must never drive the pull-to-refresh spinner. That is
  // RevimeRefreshScrollView's rule now (it has no `refreshing` prop); this screen only hands it
  // the refetch to run when the user pulls.
  const { refetch } = commande;

  // « Actualiser » after the ceiling: look now, and give polling a fresh window.
  const handleRetry = useCallback(async () => {
    restart();
    await refetch();
  }, [refetch, restart]);

  const refunded = commande.data?.status === 'REFUNDED';
  const paid = commande.data?.status === 'PAID';
  const abandoned = commande.data?.status === 'ABANDONED';

  const confirmationText = refunded
    ? "Le paiement a été remboursé sur votre moyen de paiement d'origine."
    : abandoned
      ? "Aucun montant n'a été prélevé."
      : paid
        ? "Votre paiement est sécurisé par Revime. Le montant de la réparation ne sera versé au réparateur qu'après votre validation."
        : expired
          ? PENDING_SLOW_TEXT
          : PENDING_TEXT;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <RevimeRefreshScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
        onRefresh={() => refetch()}
      >
        {/* No `c` means the query is disabled and `isPending` stays true forever: say so instead of spinning. */}
        {c && commande.isPending && (
          <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
            <RevimeLoader variant="fill" size={72} />
          </View>
        )}

        {(!c || commande.isError) && (
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              Impossible de confirmer le paiement
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              Ouvrez les offres reçues pour vérifier l'état de votre demande.
            </Text>
          </Card>
        )}

        {commande.data && (
          <>
            {!abandoned && (
              <Card>
                <DemandeProgressChain
                  status={repairStatus(
                    {
                      demandeStatus: 'IN_PROGRESS',
                      // No offer count on this screen (reached by deep link with only the
                      // commande id) - per the Task 4 ruling, pass 0 rather than a count we
                      // don't have. Harmless: an IN_PROGRESS demande with a commande is past
                      // client index 1, where `repairStatus()` never reads `offerCount`.
                      offerCount: 0,
                      commande: {
                        status: commande.data.status,
                        step: commande.data.step,
                        disputeOpen: commande.data.disputeOpen,
                        // CF4-15 / spec §6 (fix round 1, controller ruling R7). `?? false`:
                        // an older API sends no `partialRefund` field, same reasoning as
                        // `CommandeHeaderCard`'s badge.
                        partialRefund: commande.data.partialRefund ?? false,
                        // V8 `Q8-08`: a held payout reads « Terminée ». Raw: only `false` means held.
                        hasStripeTransfer: commande.data.hasStripeTransfer,
                      },
                    },
                    'CLIENT',
                  )}
                />
              </Card>
            )}

            {paid && (
              <Card>
                <Text style={styles.receiptHead}>DÉTAIL DU PAIEMENT</Text>
                <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.ink, marginBottom: 12 }}>
                  {commande.data.demandeTitle}
                </Text>
                <ReceiptRow label="Réparation" value={euros(commande.data.repairCents)} />
                {/* V7 A9: one row per leg with its carrier when the order has a quote, else the one row (Q6). */}
                {commande.data.shippingCents > 0 &&
                  deliveryRows(
                    commande.data.shippingCents,
                    commande.data.shippingLegs ?? null,
                    commande.data.delivery === 'PARCEL' ? 'Livraison aller-retour' : 'Livraison',
                  ).map((row) => <ReceiptRow key={row.label} label={row.label} value={row.value} />)}
                <ReceiptRow label="Protection Revime" value={euros(commande.data.protectionCents)} />
                {/* Livraison Boxtal: the transport insurance the client chose, 0 otherwise and hidden. */}
                {commande.data.insuranceCents > 0 && (
                  <ReceiptRow label="Assurance transport" value={euros(commande.data.insuranceCents)} />
                )}
                <ReceiptRow label="Total payé" value={euros(commande.data.totalCents)} strong />
                <Text style={styles.repairer}>Réparateur : {commande.data.repairerName}</Text>
              </Card>
            )}

            <Text
              style={{
                fontFamily: 'GoogleSansFlex_700Bold',
                fontSize: type.screenTitle.size,
                color: palette.ink,
                marginTop: spacing.lg,
              }}
            >
              {refunded
                ? 'Paiement remboursé'
                : abandoned
                  ? "Le paiement n'a pas abouti"
                  : paid
                    ? 'Paiement effectué'
                    : 'Paiement en cours de confirmation'}
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 14,
                lineHeight: 21,
                color: palette.muted,
                marginTop: spacing.sm,
                marginBottom: spacing.lg,
              }}
            >
              {confirmationText}
            </Text>

            <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
              {expired && !paid && !refunded && !abandoned && (
                <Button label="Actualiser" onPress={handleRetry} />
              )}
              {paid && (
                <>
                  {/* His own « organiser la suite ». CF-41 has just created this thread,
                      so it is the most useful next action rather than a nicety. */}
                  <Button
                    label="Ouvrir la conversation"
                    onPress={() => router.replace('/(tabs)/messages')}
                  />
                  <Button
                    label="Suivre ma réparation"
                    variant="secondary"
                    onPress={() => router.replace(`/commande/${commande.data!.id}`)}
                  />
                </>
              )}
              <Button
                label="Retour à l'accueil"
                variant="secondary"
                onPress={() => router.replace('/(tabs)')}
              />
            </View>
          </>
        )}
      </RevimeRefreshScrollView>
    </SafeAreaView>
  );
}

function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={styles.receiptRow}>
      <Text
        style={{
          fontFamily: strong ? 'GoogleSansFlex_600SemiBold' : 'GoogleSansFlex_400Regular',
          fontSize: 14,
          color: palette.ink,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: strong ? 'GoogleSansFlex_700Bold' : 'GoogleSansFlex_600SemiBold',
          fontSize: 14,
          color: palette.ink,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  receiptHead: {
    fontFamily: 'GoogleSansFlex_700Bold',
    fontSize: 11,
    letterSpacing: 0.5,
    color: '#6B7280',
    marginBottom: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  repairer: {
    fontFamily: 'GoogleSansFlex_500Medium',
    fontSize: 13,
    color: '#6B7280',
    marginTop: 8,
  },
});
