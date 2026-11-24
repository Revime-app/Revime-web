import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { parcelStage, euros, type CommandeRole } from '@revime/shared';
import { useTheme } from '../../../src/theme';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { payoutHoldView, payoutsDoneFrom } from '../../../src/lib/fiscal-hold';
import { useRepairerJourney } from '../../../src/lib/use-repairer-journey';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { useCommande } from '../../../src/lib/queries';
import { useSessionContext } from '../../../src/lib/session';
import { ApiError } from '../../../src/lib/api';
import { CommandeHeaderCard } from '../../../src/components/commande/CommandeHeaderCard';
import { CommandePartiesCard } from '../../../src/components/commande/CommandePartiesCard';
import { CommandeTimelineCard } from '../../../src/components/commande/CommandeTimelineCard';
import { CommandeDeliveryCard } from '../../../src/components/commande/CommandeDeliveryCard';
import { CommandePaymentCard } from '../../../src/components/commande/CommandePaymentCard';
import { CommandeBanner } from '../../../src/components/commande/CommandeBanner';
import { DisputeBanner } from '../../../src/components/commande/DisputeBanner';
import { CancellationBanner } from '../../../src/components/commande/CancellationBanner';
import { CommandeActions } from '../../../src/components/commande/CommandeActions';
import { CounterpartAddressCard } from '../../../src/components/commande/CounterpartAddressCard';
import { ShippingAddressCard } from '../../../src/components/commande/ShippingAddressCard';
import { AwaitingOtherAddressCard } from '../../../src/components/commande/AwaitingOtherAddressCard';
import { ShippingLabelCard } from '../../../src/components/commande/ShippingLabelCard';
import { RevimeLoader } from '../../../src/components/lottie/RevimeLoader';
import { RevimeRefreshScrollView } from '../../../src/components/RevimeRefreshScrollView';
import { KeyboardAvoider } from '../../../src/components/KeyboardAvoider';
import { PayoutSetupGate } from '../../../src/components/PayoutSetupGate';

export default function CommandeTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const commandeId = id ?? '';
  const { palette, spacing } = useTheme();
  const router = useRouter();

  const commande = useCommande(commandeId);

  // Livraison Boxtal (spec §9.2). The server's flag gates every Boxtal surface on this screen;
  // under the manual driver, or on an old binary, the copy below is exactly P4's.
  const { me } = useSessionContext();
  // V8 `ISS8-020` (d): the held card names the fiscal step only when « Virements » is done.
  const repairerJourney = useRepairerJourney();
  const payoutsDone = payoutsDoneFrom(repairerJourney.journey, repairerJourney.identityError || repairerJourney.connectError);
  const quoting = Boolean(me?.shippingQuotesEnabled);

  if (commande.isPending) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenHeader title="Détails de la commande" onBack={() => router.back()} />
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      </SafeAreaView>
    );
  }

  if (commande.isError || !commande.data) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenHeader title="Détails de la commande" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg }}>
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              Impossible de charger la commande
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              {commande.error instanceof ApiError
                ? commande.error.message
                : 'Une erreur est survenue. Réessayez.'}
            </Text>
          </Card>
          <View style={{ marginTop: spacing.lg }}>
            <Button label="Retour" onPress={() => router.back()} variant="secondary" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Every new DTO field normalised once, here, at entry (AGENTS.md: an API older than
  // the app sends a new field as `undefined`, never `null`).
  const raw = commande.data;
  const data = {
    ...raw,
    demandeDescription: raw.demandeDescription ?? null,
    photoUrls: raw.photoUrls ?? [],
    disputeOpen: raw.disputeOpen ?? false,
    disputeOpenedAt: raw.disputeOpenedAt ?? null,
    stepEvents: raw.stepEvents ?? [],
    conversationId: raw.conversationId ?? null,
    // CF4-27. An old API (no field at all) reads as "no request ever made" / "not frozen".
    cancellationRequest: raw.cancellationRequest ?? null,
    // CF4-28/31. Order-level dispute summary.
    dispute: raw.dispute ?? null,
  };
  const role: CommandeRole = data.viewerRole;
  // CMP-D3, widened by V8 B2: every held payout, not only a missing fiscal declaration.
  const hold = role === 'REPAIRER' ? payoutHoldView(data, me?.repairer, payoutsDone) : null;
  const step = data.step;

  // If not yet paid, show an empty state pointing back to payment
  if (step === null) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenHeader title="Détails de la commande" onBack={() => router.back()} />
        <View style={{ padding: spacing.lg }}>
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              Commande en attente de paiement
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              Cette commande n'a pas encore été payée.
            </Text>
          </Card>
          <View style={{ marginTop: spacing.lg }}>
            <Button
              label="Voir la demande"
              onPress={() => router.push(`/demande/${data.demandeId}`)}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const stage = parcelStage(data);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenHeader title="Détails de la commande" onBack={() => router.back()} />
      <KeyboardAvoider>
        <RevimeRefreshScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
          onRefresh={() => commande.refetch()}
        >
          {/* Spec §4.4: eight cards in the client's order. */}
          <CommandeHeaderCard data={data} />

          {data.disputeOpen && <DisputeBanner />}

          <CommandePartiesCard data={data} />

          <CommandeTimelineCard data={data} />

          <CounterpartAddressCard data={data} />

          {stage === 'AWAITING_YOUR_ADDRESS' && (
            <ShippingAddressCard commandeId={commandeId} data={data} quoting={quoting} />
          )}

          {stage === 'AWAITING_OTHER_ADDRESS' && <AwaitingOtherAddressCard role={role} />}

          <ShippingLabelCard commandeId={commandeId} data={data} role={role} quoting={quoting} stage={stage} />

          <CommandeDeliveryCard data={data} />

          <CommandePaymentCard data={data} />

          {/* CF4-27 (spec §4.6). A pending or refused cancellation takes precedence over the
              dispute/escrow banners: while a request is pending the order is frozen for that
              reason, not for a dispute (I12 makes the two mutually exclusive) or for its normal
              escrow state. */}
          {data.cancellationRequest?.status === 'PENDING' || data.cancellationRequest?.status === 'REFUSED' ? (
            <CancellationBanner commandeId={commandeId} data={data} role={role} />
          ) : data.disputeOpen ? null : hold ? (
            <View
              style={{
                backgroundColor: '#fffbeb',
                borderWidth: 1,
                borderColor: '#fef3c7',
                borderRadius: 14,
                padding: spacing.md,
                marginBottom: spacing.md,
              }}
            >
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_700Bold',
                  fontSize: 14,
                  color: '#b45309',
                  marginBottom: 4,
                }}
              >
                {hold.title}
              </Text>
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_400Regular',
                  fontSize: 13,
                  lineHeight: 18,
                  color: palette.ink,
                  marginBottom: spacing.md,
                }}
              >
                {hold.body}
              </Text>
              <Button label={hold.cta} onPress={() => router.push(hold.route)} />
            </View>
          ) : (
            <CommandeBanner data={data} />
          )}

          <CommandeActions commandeId={commandeId} data={data} />
        </RevimeRefreshScrollView>
      </KeyboardAvoider>
      {/* V8 E1, mockup 4: once per order, when an accepted order still needs « Virements » or the fiscal step. */}
      {role === 'REPAIRER' && <PayoutSetupGate commande={data} />}
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
});
