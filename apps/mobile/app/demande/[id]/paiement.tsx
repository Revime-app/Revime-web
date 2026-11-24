import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { initStripe, isPlatformPaySupported, useStripe } from '@stripe/stripe-react-native';
import {
  computeAmounts,
  DELIVERY_OPTIONS,
  euros,
  LEGAL_WITHDRAWAL_WAIVER_TEXT,
  type DeliveryMode,
  type ExecutionDelayPreference,
} from '@revime/shared';
import { useTheme } from '../../../src/theme';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { ProtectionSheet } from '../../../src/components/ProtectionSheet';
import { ParcelStep, type ParcelQuoteState } from '../../../src/components/ParcelStep';
import { IconInfo } from '../../../src/icons';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { RevimeLoader } from '../../../src/components/lottie/RevimeLoader';
import { PaymentRepairerHeader } from '../../../src/components/payment/PaymentRepairerHeader';
import { EscrowSecurityCard } from '../../../src/components/payment/EscrowSecurityCard';
import { StripeTestModeNotice } from '../../../src/components/payment/StripeTestModeNotice';
import {
  buildPaymentSheetParams,
  resolveCheckoutTestMode,
  shouldShowTestNotice,
} from '../../../src/components/payment/payment-params';
import { WithdrawalSection } from '../../../src/components/payment/WithdrawalSection';
import {
  APPLE_PAY_MERCHANT_ID,
  applePayLine,
  merchantInBuild,
} from '../../../src/components/payment/apple-pay';
import { WithdrawalInfoSheet } from '../../../src/components/payment/WithdrawalInfoSheet';
import { StatutoryWithdrawalModal } from '../../../src/components/payment/StatutoryWithdrawalModal';
import { useCategories, useCreateCheckout, useDemande, useDemandeOffers } from '../../../src/lib/queries';
import { useSessionContext } from '../../../src/lib/session';
import { ApiError } from '../../../src/lib/api';
import { KeyboardAvoider } from '../../../src/components/KeyboardAvoider';
import { deliveryRows } from '../../../src/lib/shipping-legs-view';

export default function Paiement() {
  const { id, offerId, cancelled } = useLocalSearchParams<{
    id: string;
    offerId: string;
    cancelled?: string;
  }>();
  const demandeId = id ?? '';
  const { palette, accent, spacing, type, radii } = useTheme();
  const router = useRouter();

  const offers = useDemandeOffers(demandeId);
  const offer = useMemo(
    () => (offers.data ?? []).find((o) => o.id === offerId) ?? null,
    [offers.data, offerId],
  );

  // Preselected from the réparateur's own travel choice, as the prototype does:
  // someone who offered to come to you should not have to re-say so.
  const [delivery, setDelivery] = useState<DeliveryMode | null>(null);
  const chosen: DeliveryMode = delivery ?? (offer?.travel === 'HOME' ? 'HOME' : 'WORKSHOP');

  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  // V7 U11 (A12, `DEC7-27` Q5): « Carte bancaire ou Apple Pay » under the pay button. Asked once;
  // a failed check leaves the line off, never on.
  const [applePaySupported, setApplePaySupported] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let alive = true;
    isPlatformPaySupported()
      .then((supported) => {
        if (alive) setApplePaySupported(supported);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const walletLine = applePayLine({
    os: Platform.OS,
    merchantInBuild: merchantInBuild(Constants.expoConfig?.extra),
    deviceSupported: applePaySupported,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Legal compliance: right of withdrawal (droit de rétractation) per French Consumer Code
  const isPro = offer?.verifiedBadge === 'BUSINESS';
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [delayPreference, setDelayPreference] = useState<ExecutionDelayPreference>('IMMEDIATE');
  const [infoSheetOpen, setInfoSheetOpen] = useState(false);
  const [withdrawalFormOpen, setWithdrawalFormOpen] = useState(false);
  const payGated = Boolean(isPro && delayPreference === 'IMMEDIATE' && !waiverAccepted);

  const handleOpenWithdrawalForm = () => {
    // Dismiss info sheet first, then open modal with delay to avoid iOS modal collision
    setInfoSheetOpen(false);
    setTimeout(() => {
      setWithdrawalFormOpen(true);
    }, Platform.OS === 'ios' ? 250 : 50);
  };

  // Livraison Boxtal (spec §9.1). The gate is the SERVER's flag: under the manual driver, or on
  // an old binary, `quoting` is false and this screen renders the flat flow exactly as before.
  const { me } = useSessionContext();
  const quoting = Boolean(me?.shippingQuotesEnabled);
  const demande = useDemande(demandeId);
  const categories = useCategories();
  // `DemandeDto.category` carries the slug but not the parent's; the category list does.
  const demandeCategory = useMemo(() => {
    const slug = demande.data?.category.slug;
    if (!slug) return null;
    const cat = (categories.data ?? []).find((c) => c.slug === slug);
    const parent = cat?.parentId ? (categories.data ?? []).find((c) => c.id === cat.parentId) : undefined;
    return { slug, parentSlug: parent?.slug ?? null };
  }, [demande.data, categories.data]);
  const [parcelQuote, setParcelQuote] = useState<ParcelQuoteState | null>(null);
  const quotedParcel = chosen === 'PARCEL' && quoting;

  const cancelledMessage =
    cancelled === '1' ? 'Le paiement a été annulé. Vous pouvez réessayer.' : null;

  const checkout = useCreateCheckout(offerId ?? '');
  // CF6-07. The SERVER says whether Stripe is in test mode, from the session (known before the
  // first tap) and then from each checkout response. Never from a build-time `EXPO_PUBLIC_*` key:
  // that is frozen in the binary and would keep promising « aucun débit réel » after the live switch.
  // Both are read `?? null` once, because an older API omits them (apps/mobile/AGENTS.md).
  const isTestModeActive = shouldShowTestNotice({
    meFlag: me?.stripeTestMode ?? null,
    checkoutFlag: checkout.data?.isTestMode ?? null,
  });
  // With a quote the two quoted figures replace the flat fee - the same call the server makes
  // from the ShippingQuote row, so the total shown is the total charged.
  const amounts = computeAmounts(offer?.priceCents ?? 0, chosen, quotedParcel && parcelQuote ? parcelQuote.quoted : undefined);

  async function pay() {
    if (!offer || payGated) return;
    setError(null);
    setLoading(true);
    try {
      const session = await checkout.mutateAsync(
        quotedParcel && parcelQuote
          ? {
              delivery: 'PARCEL',
              quoteId: parcelQuote.quoteId,
              parcelOption: parcelQuote.parcelOption,
              insured: parcelQuote.insured,
              delayPreference,
              withdrawalWaiver:
                isPro && delayPreference === 'IMMEDIATE'
                  ? {
                      accepted: true,
                      acceptedAt: new Date().toISOString(),
                      acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
                    }
                  : null,
            }
          : {
              delivery: chosen,
              delayPreference,
              withdrawalWaiver:
                isPro && delayPreference === 'IMMEDIATE'
                  ? {
                      accepted: true,
                      acceptedAt: new Date().toISOString(),
                      acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
                    }
                  : null,
            },
      );

      // If backend returned publishableKey, ensure Stripe native SDK is dynamically initialized
      if (session.publishableKey) {
        await initStripe({
          publishableKey: session.publishableKey,
          // V7 U11 (A12): the same merchant as `StripeProvider`. It enables Apple Pay only in a build
          // whose `app.json` carries it too (the entitlement), see `apple-pay.ts`.
          merchantIdentifier: APPLE_PAY_MERCHANT_ID,
          urlScheme: 'revime',
        });
      }

      const paymentSheetParams = buildPaymentSheetParams({
        clientSecret: session.paymentIntentClientSecret,
        accentColor: accent.accent,
        palette,
        radii,
        isTestMode: resolveCheckoutTestMode(session),
      });

      const { error: initError } = await initPaymentSheet(paymentSheetParams);

      if (initError) {
        if (__DEV__) {
          console.warn('[Stripe PaymentSheet initError]', initError);
        }
        setError(
          initError.message.includes('API key') || initError.message.includes('apiKey')
            ? 'Configuration de paiement incomplète. Contactez le support REVIME.'
            : initError.message,
        );
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          setError(presentError.message);
        }
        return;
      }

      router.replace(`/demande/${demandeId}/acceptee?c=${session.commandeId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Le paiement a échoué. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  if (offers.isPending) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <ScreenHeader title="Paiement" onBack={() => router.back()} />
        <View style={styles.loaderContainer}>
          <RevimeLoader variant="fill" size={72} />
        </View>
      </SafeAreaView>
    );
  }

  if (!offer || offer.status !== 'SENT') {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <View style={{ padding: spacing.lg }}>
          <Card>
            <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}>
              Cette offre n'est plus disponible
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 13,
                color: palette.muted,
                marginTop: 4,
              }}
            >
              Retournez aux offres reçues pour en choisir une autre.
            </Text>
          </Card>
          <View style={{ marginTop: spacing.lg }}>
            <Button label="Retour aux offres" onPress={() => router.back()} variant="secondary" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      {/* Livraison Boxtal: the parcel step brings the screen's first text fields, so the keyboard
          must push the content up and a tap outside a field must still land. */}
      <KeyboardAvoider>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
      >
        <Pressable onPress={() => router.back()} style={{ marginBottom: spacing.md }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.muted }}>
            Retour
          </Text>
        </Pressable>

        <Text
          style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: type.screenTitle.size, color: palette.ink }}
        >
          Paiement sécurisé
        </Text>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13.5,
            color: palette.muted,
            marginBottom: spacing.lg,
          }}
        >
          Réglez en toute confiance.
        </Text>

        <PaymentRepairerHeader offer={offer} />

        <Text
          style={{
            fontFamily: 'GoogleSansFlex_700Bold',
            fontSize: type.section.size,
            color: palette.ink,
            marginTop: spacing.xl,
            marginBottom: spacing.md,
          }}
        >
          Livraison
        </Text>

        <View style={{ gap: spacing.sm }}>
          {DELIVERY_OPTIONS.filter(
            (option) => option.id !== 'PARCEL' || offer?.acceptsParcel === true,
          ).map((option) => {
            const active = option.id === chosen;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setDelivery(option.id);
                  // Leaving the parcel card forgets its quote: the total must not carry a
                  // shipping figure the chosen mode does not have.
                  if (option.id !== 'PARCEL') setParcelQuote(null);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderRadius: radii.field,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? accent.accent : palette.line,
                  backgroundColor: palette.paper,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.ink }}>
                    {option.label}
                  </Text>
                  <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12.5, color: palette.muted }}>
                    {option.sub}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_700Bold',
                    fontSize: 13,
                    color: palette.ink,
                  }}
                >
                  {/* Under the Boxtal driver the parcel price is the QUOTE's, not the flat fee:
                      unknown until « Calculer le prix », then the chosen option's figure. */}
                  {quoting && option.id === 'PARCEL'
                    ? parcelQuote
                      ? `+${euros(parcelQuote.quoted.shippingCents)}`
                      : 'Prix selon l’objet'
                    : option.feeCents > 0
                      ? `+${euros(option.feeCents)}`
                      : 'Gratuit'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {quotedParcel && (
          <ParcelStep offerId={offerId ?? ''} demandeCategory={demandeCategory} onQuote={setParcelQuote} />
        )}

        <EscrowSecurityCard style={{ marginTop: spacing.lg }} />

        {isTestModeActive && <StripeTestModeNotice />}

        <Card style={{ marginTop: spacing.lg }}>
          <Row label="Réparation" value={euros(amounts.repairCents)} />
          {/* V7 A9: one row per leg with its carrier once a parcel option is chosen, else the one row.
              `amounts.shippingCents` is that option's price, which the split adds up to. */}
          {deliveryRows(
            amounts.shippingCents,
            chosen === 'PARCEL' ? parcelQuote?.legPrices : null,
            chosen === 'PARCEL' ? 'Livraison aller-retour' : 'Livraison',
          ).map((row) => (
            <Row key={row.label} label={row.label} value={row.value} />
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setSheetOpen(true)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}
          >
            {/* `CF-45`. The « ⓘ » this row carried since P1 was U+24D8, a codepoint Google Sans
                Flex does not have (PIL: the 7.50pt .notdef advance, same as a CJK control), so
                every device drew it from a fallback font. A 14pt glyph in the label's own colour
                replaces it. Row budget on a 375pt SE: label 112.2 + 4 + 14 + amount 55.2 (999,99 €)
                = 185.5pt in the card's 311pt. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, color: palette.muted }}>
                Protection Revime
              </Text>
              <IconInfo size={14} color={palette.muted} strokeWidth={2} />
            </View>
            <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 13.5, color: accent.accent }}>
              {euros(amounts.protectionCents)}
            </Text>
          </Pressable>
          {amounts.insuranceCents > 0 && <Row label="Assurance transport" value={euros(amounts.insuranceCents)} />}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: 12,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: palette.line,
            }}
          >
            <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 16, color: palette.ink }}>Total</Text>
            <Text style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 16, color: palette.ink }}>
              {euros(amounts.totalCents)}
            </Text>
          </View>
        </Card>

        {(error ?? cancelledMessage) && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_500Medium',
              fontSize: 13,
              color: palette.red,
              marginTop: spacing.md,
            }}
          >
            {error ?? cancelledMessage}
          </Text>
        )}

        <WithdrawalSection
          style={{ marginTop: spacing.lg }}
          isPro={isPro}
          waiverAccepted={waiverAccepted}
          onToggleWaiver={() => setWaiverAccepted((v) => !v)}
          delayPreference={delayPreference}
          onSelectDelayPreference={setDelayPreference}
          onOpenInfoSheet={() => setInfoSheetOpen(true)}
          showFootnote={false}
        />

        <View style={{ marginTop: spacing.md }}>
          <Button
            label={`🔒 Payer ${euros(amounts.totalCents)} en toute sécurité`}
            onPress={() => void pay()}
            loading={loading || checkout.isPending}
            // A parcel under the Boxtal driver has no total until its quote lands.
            disabled={Boolean(quotedParcel && !parcelQuote) || payGated}
          />
          {walletLine && (
            // 160.0pt at 12.5/400 (PIL, the shipped TTF) in the 343pt row (375pt phone minus
            // `spacing.lg` each side): one line.
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 12.5,
                color: palette.muted,
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              {walletLine}
            </Text>
          )}
          {payGated && (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: 12.5,
                color: palette.muted,
                textAlign: 'center',
                marginTop: 10,
              }}
            >
              Cochez la case ou choisissez d'attendre 14 jours pour continuer.
            </Text>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoider>

      <ProtectionSheet
        visible={sheetOpen}
        onDismiss={() => setSheetOpen(false)}
        protectionCents={amounts.protectionCents}
      />

      <WithdrawalInfoSheet
        visible={infoSheetOpen}
        onDismiss={() => setInfoSheetOpen(false)}
        isPro={isPro}
        onOpenWithdrawalForm={handleOpenWithdrawalForm}
      />

      <StatutoryWithdrawalModal
        visible={withdrawalFormOpen}
        onDismiss={() => setWithdrawalFormOpen(false)}
        orderReference={demandeId}
        clientName={me?.name ?? null}
        clientEmail={me?.email ?? null}
        repairerName={offer?.repairerName ?? null}
        orderDate={new Date()}
      />
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13.5, color: palette.muted }}>
        {label}
      </Text>
      <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13.5, color: palette.ink }}>
        {value}
      </Text>
    </View>
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
