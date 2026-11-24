import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { StarIcon } from '@hugeicons/core-free-icons';
import { useTheme } from '../../src/theme';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useCommande, useCreateReview } from '../../src/lib/queries';
import { ApiError } from '../../src/lib/api';
import { RevimeLoader } from '../../src/components/lottie/RevimeLoader';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

const MAX_COMMENT = 500;

/**
 * Five taps. `fill` is passed straight to `HugeiconsIcon` rather than through the
 * `IconStar` wrapper, because `make` in `src/icons.ts` forwards only size, color and
 * strokeWidth.
 *
 * `HugeiconsProps extends SvgProps`, and the renderer spreads the caller's remaining
 * props onto the `<Svg>` AFTER its own `fill: 'none'` default, while `StarIcon`'s path
 * declares a stroke and no fill of its own - so the path inherits this fill. Read from
 * the compiled renderer rather than assumed. The stroke colour changes too, so the
 * control still reads correctly even if a future version stops forwarding fill.
 */
function StarRow({
  value,
  onChange,
  size,
}: {
  value: number;
  onChange: (n: number) => void;
  size: number;
}) {
  const { palette, accent } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((s) => {
        const on = s <= value;
        return (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`${s} ${s === 1 ? 'étoile' : 'étoiles'}`}
            onPress={() => onChange(s)}
            hitSlop={6}
          >
            <HugeiconsIcon
              icon={StarIcon}
              size={size}
              color={on ? accent.accent : palette.line}
              fill={on ? accent.accent : 'none'}
              strokeWidth={1.8}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function LaisserAvis() {
  const { commandeId: raw } = useLocalSearchParams<{ commandeId: string }>();
  const commandeId = raw ?? '';
  const { palette, spacing, type, radii } = useTheme();
  const router = useRouter();

  const commande = useCommande(commandeId);
  const createReview = useCreateReview(commandeId);

  const [rating, setRating] = useState(0);
  const [quality, setQuality] = useState(0);
  const [delay, setDelay] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);

  const submit = (): void => {
    createReview.mutate(
      {
        rating,
        // 0 means « not chosen » in this UI and is not a legal rating, so it becomes
        // undefined rather than being sent. The schema refuses 0, so sending it would
        // turn a skipped optional into a 422.
        qualityRating: quality === 0 ? undefined : quality,
        delayRating: delay === 0 ? undefined : delay,
        communicationRating: communication === 0 ? undefined : communication,
        // An empty comment is undefined, not '', so « no comment » has one
        // representation in the column.
        comment: comment.trim() === '' ? undefined : comment.trim(),
      },
      { onSuccess: () => setSent(true) },
    );
  };

  if (sent) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md }}>
          <HugeiconsIcon icon={StarIcon} size={48} color={palette.green} fill={palette.green} strokeWidth={1.8} />
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_700Bold',
              fontSize: type.section.size,
              color: palette.ink,
              textAlign: 'center',
            }}
          >
            Merci pour votre avis !
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              lineHeight: type.body.lineHeight,
              color: palette.muted,
              textAlign: 'center',
            }}
          >
            Votre retour aide les autres clients à choisir en confiance.
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: spacing.md }}>
            <Button label="Retour à l'accueil" onPress={() => router.replace('/(tabs)')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Eligibility: the commande must be the caller's own, RELEASED, not REFUNDED,
  // not under payment review, and not already reviewed. This mirrors the API's own
  // checks in reviews.service.ts, so the screen's gate and the endpoint's cannot drift.
  const eligible =
    commande.data &&
    commande.data.viewerRole === 'CLIENT' &&
    commande.data.step === 'RELEASED' &&
    commande.data.status !== 'REFUNDED' &&
    !commande.data.paymentUnderReview &&
    !commande.data.reviewed;

  // Determine the refusal reason when not eligible. Check in the same order as the API
  // so the French matches what a tap would have discovered.
  const refusalReason = (() => {
    if (!commande.data) return null;
    if (commande.data.viewerRole !== 'CLIENT') return 'Seul le client peut laisser un avis.';
    if (commande.data.step !== 'RELEASED')
      return 'Vous pourrez laisser un avis lorsque les fonds auront été débloqués.';
    if (commande.data.status === 'REFUNDED') return 'Cette commande a été remboursée.';
    if (commande.data.paymentUnderReview)
      return "Ce paiement fait l'objet d'une vérification.";
    if (commande.data.reviewed) return 'Vous avez déjà laissé un avis pour cette commande.';
    return null;
  })();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenHeader title="Laisser un avis" onBack={() => router.back()} />
      <KeyboardAvoider>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}
          // Without this the first tap on « Publier mon avis » is eaten dismissing the
          // keyboard. Piece 4's device pass found the keyboard covering inputs on four
          // of seven form screens, and the consequence there was not cosmetic.
          keyboardShouldPersistTaps="handled"
        >
          {commande.isPending && (
            <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
              <RevimeLoader variant="fill" size={72} />
            </View>
          )}

          {commande.isError && (
            <View style={{ marginTop: spacing.xl }}>
              <Card>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_600SemiBold',
                    fontSize: type.body.size,
                    color: palette.red,
                  }}
                >
                  Impossible de charger la commande.
                </Text>
              </Card>
            </View>
          )}

          {refusalReason && (
            <View style={{ marginTop: spacing.xl }}>
              <Card>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_600SemiBold',
                    fontSize: type.body.size,
                    color: palette.ink,
                    marginBottom: spacing.xs,
                  }}
                >
                  Avis non disponible
                </Text>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: type.body.size,
                    color: palette.muted,
                  }}
                >
                  {refusalReason}
                </Text>
              </Card>
              <View style={{ marginTop: spacing.lg }}>
                <Button label="Retour" onPress={() => router.back()} />
              </View>
            </View>
          )}

          {eligible && (
            <>
              <View style={{ alignItems: 'center', gap: spacing.sm }}>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_700Bold',
                    fontSize: type.section.size,
                    color: palette.ink,
                    textAlign: 'center',
                  }}
                >
                  Réparation terminée
                </Text>
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: type.caption.size,
                    lineHeight: 18,
                    color: palette.muted,
                    textAlign: 'center',
                  }}
                >
                  {/* V8 ISS8-009: « débloqué pour », not « versé au ». Revime may be holding the
                      réparateur's payout until he finishes his setup (V8 B2), so « versé » could be
                      false; same wording as the client's « Fonds débloqués » notification (Q8-08). */}
                  Votre paiement a été débloqué pour le réparateur. Partagez votre expérience pour
                  aider les prochains utilisateurs.
                </Text>
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <Card>
                  <Text
                    style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: palette.ink }}
                    numberOfLines={1}
                  >
                    {commande.data.demandeTitle}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'GoogleSansFlex_500Medium',
                      fontSize: type.caption.size,
                      color: palette.muted,
                      marginTop: 4,
                    }}
                  >
                    Réparé par {commande.data.repairerName}
                  </Text>
                </Card>
              </View>

              <View style={{ alignItems: 'center', marginTop: spacing.xl, gap: spacing.md }}>
                <Text
                  style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.ink }}
                >
                  Êtes-vous satisfait de la réparation ?
                </Text>
                <StarRow value={rating} onChange={setRating} size={34} />
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_400Regular',
                    fontSize: type.caption.size,
                    color: palette.muted,
                  }}
                >
                  Sélectionnez une note globale
                </Text>
              </View>

              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_600SemiBold',
                  fontSize: 12,
                  color: palette.muted,
                  marginTop: spacing.xl,
                  marginBottom: spacing.sm,
                }}
              >
                DONNEZ VOTRE AVIS EN DÉTAIL (FACULTATIF)
              </Text>
              <View style={{ gap: spacing.sm }}>
                {(
                  [
                    ['Qualité de la réparation', quality, setQuality],
                    ['Respect des délais', delay, setDelay],
                    ['Communication', communication, setCommunication],
                  ] as const
                ).map(([label, value, set]) => (
                  <Card key={label}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: 'GoogleSansFlex_600SemiBold',
                          fontSize: 13.5,
                          color: palette.ink,
                          flex: 1,
                        }}
                      >
                        {label}
                      </Text>
                      <StarRow value={value} onChange={set} size={18} />
                    </View>
                  </Card>
                ))}
              </View>

              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_600SemiBold',
                  fontSize: 12,
                  color: palette.muted,
                  marginTop: spacing.xl,
                  marginBottom: spacing.sm,
                }}
              >
                UN COMMENTAIRE (FACULTATIF)
              </Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                maxLength={MAX_COMMENT}
                multiline
                placeholder="Partagez votre expérience avec ce réparateur…"
                placeholderTextColor={palette.faint}
                style={{
                  minHeight: 110,
                  textAlignVertical: 'top',
                  paddingVertical: 15,
                  paddingHorizontal: 14,
                  borderWidth: 1.5,
                  borderColor: palette.line,
                  borderRadius: radii.field,
                  backgroundColor: palette.mist,
                  fontFamily: 'GoogleSansFlex_500Medium',
                  fontSize: type.body.size,
                  color: palette.ink,
                }}
              />
              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_400Regular',
                  fontSize: 11,
                  color: palette.muted,
                  textAlign: 'right',
                  marginTop: 4,
                }}
              >
                {comment.length}/{MAX_COMMENT}
              </Text>

              {createReview.error && (
                <Text
                  style={{
                    fontFamily: 'GoogleSansFlex_500Medium',
                    fontSize: 13,
                    color: palette.red,
                    marginTop: spacing.md,
                  }}
                >
                  {createReview.error instanceof ApiError
                    ? createReview.error.message
                    : 'Une erreur est survenue. Réessayez.'}
                </Text>
              )}

              <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
                <Button
                  label="Publier mon avis"
                  onPress={submit}
                  disabled={rating === 0 || createReview.isPending}
                  loading={createReview.isPending}
                />
                <Button label="Plus tard" variant="text" onPress={() => router.back()} />
              </View>

              <Text
                style={{
                  fontFamily: 'GoogleSansFlex_400Regular',
                  fontSize: 11.5,
                  color: palette.muted,
                  textAlign: 'center',
                  marginTop: spacing.md,
                }}
              >
                Votre avis sera publié publiquement sur le profil du réparateur.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
