import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { api, ApiError } from '../../src/lib/api';
import { signOutAndLeave } from '../../src/lib/sign-out';
import { useSessionContext } from '../../src/lib/session';
import { isStaffRole, ADMIN_ROLE_LABEL } from '@revime/shared';
import { useTheme } from '../../src/theme';
import { useStepUp } from '../../src/lib/step-up-context';
import { KeyboardAvoider } from '../../src/components/KeyboardAvoider';

/**
 * `CF-47` task 14. Account deletion confirmation screen.
 *
 * 🛑 THE COPY AGREES WITH THE PRIVACY POLICY. Both live in the same app; a user is entitled
 * to the truth in both places. What is said here is consistent with what
 * `src/lib/privacy-policy.ts`'s deletion section documents: the account is closed and PII
 * is erased from the profile, but demandes and their photos, conversations and messages,
 * completed repairs and reviews (with name → « Utilisateur supprimé »), the postal code on
 * past demandes, the delivery address on past commandes, and company verification data all
 * survive. The screen states the key items plainly and points to the full policy.
 *
 * 🛑 TYPED CONFIRMATION, NOT PASSWORD RE-ENTRY. A social-only account has no password, so a
 * uniform confirmation (type "SUPPRIMER" exactly) works for every account. The comparison
 * is EXACT: no trim, no case-insensitive - the user must type the literal word.
 *
 * 🛑 THE CONFLICT CASE IS RENDERED, NOT SWALLOWED. 409 means a repair is in escrow (a PAID
 * commande not yet RELEASED). The server's French message already says what to do, and
 * `ApiError.message` from our API is French by contract. Surface it and keep the user on
 * the screen so they can see it.
 */
export default function SupprimerScreen() {
  const { palette, spacing, radii, type } = useTheme();
  const queryClient = useQueryClient();
  const { me } = useSessionContext();

  const withStepUp = useStepUp();
  const isStaff = isStaffRole(me?.role);
  const roleLabel = me?.role && isStaffRole(me.role) ? ADMIN_ROLE_LABEL[me.role] : null;

  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  /**
   * Button is enabled only when the user has typed exactly "SUPPRIMER". No trim, no
   * case-folding - the explicit word is required.
   */
  const canDelete = confirmation === 'SUPPRIMER';

  const onDelete = async () => {
    if (!canDelete || deleting) return;
    setError(null);
    setDeleting(true);
    try {
      /**
       * `api.del('/users/me')` returns 204 on success and is idempotent. It throws ApiError
       * on 409 CONFLICT (a PAID commande not yet RELEASED, i.e. money in escrow) or any
       * other failure. The 409 case is load-bearing: the server's French message already
       * says what to do, so render it rather than replacing it.
       */
      /**
       * V7 A11 (U2b, Q9): « SUPPRIMER » confirms the intent, and once the server asks
       * (`STEP_UP_REQUIRED`) the password or a code confirms the identity. Closing the sheet
       * cancels quietly: nothing was deleted, so there is nothing to report.
       */
      const done = await withStepUp(() => api.del('/users/me'), 'DELETE');
      if (!done.ok) return;

      /**
       * 🛑 The session is already invalid server-side, so `signOutAndLeave`'s best-effort
       * revoke failing is the EXPECTED path, not an error. Its four internal steps handle
       * that gracefully. The method is `router.replace` and the route exactly
       * `/(auth)/login` - both were the fix for a real redirect ping-pong (see
       * `src/lib/sign-out.ts`).
       */
      await signOutAndLeave({
        queryClient,
        router,
      });
    } catch (e) {
      /**
       * 🛑 ApiError.message is guaranteed French, so surface it as-is for the CONFLICT case
       * (« Terminez votre réparation en cours ou demandez un remboursement avant de
       * supprimer votre compte »). Log and fall back to a French generic for anything else.
       */
      console.error('[supprimer] delete account failed', e);
      setError(
        e instanceof ApiError
          ? e.message
          : "Votre compte n'a pas pu être supprimé. Veuillez réessayer.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={['top']}>
      <ScreenHeader title="Supprimer mon compte" onBack={() => router.back()} />
      <KeyboardAvoider>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* 🛑 Plain French explanation of what deletion does and does NOT do. Agrees with
            the privacy policy's deletion section. Lists the key survival items that would
            surprise a user: demandes and photos, conversations and messages, completed repairs
            and reviews, past postal codes and delivery addresses, and company verification data.
            Points to the full policy for the complete list. Honesty here is the whole point - a
            screen that promises total erasure and delivers a soft delete is a lie in the one
            place a user is entitled to the truth. */}
        <View
          style={{
            backgroundColor: palette.mist,
            borderRadius: radii.card,
            padding: spacing.lg,
            marginBottom: spacing.xl,
          }}
        >
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_600SemiBold',
              fontSize: type.body.size,
              color: palette.ink,
              marginBottom: spacing.md,
            }}
          >
            Que se passe-t-il lors de la suppression ?
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
              marginBottom: spacing.sm,
            }}
          >
            • Votre compte sera fermé et vous ne pourrez plus vous connecter.
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
              marginBottom: spacing.sm,
            }}
          >
            • Vos données d'identification seront effacées de votre profil : nom, prénom, pseudo,
            adresse e-mail, numéro de téléphone, photo de profil, bannière, code postal et
            coordonnées géographiques.
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
              marginBottom: spacing.sm,
            }}
          >
            • Cependant, certaines données sont conservées :
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
              marginBottom: spacing.sm,
              paddingLeft: spacing.md,
            }}
          >
            · Vos demandes de réparation et leurs photos.
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
              marginBottom: spacing.sm,
              paddingLeft: spacing.md,
            }}
          >
            · Vos conversations et les messages échangés.
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
              marginBottom: spacing.sm,
              paddingLeft: spacing.md,
            }}
          >
            · Les réparations terminées et les avis restent visibles, mais votre identité apparaît
            comme « Utilisateur supprimé ». Ces données appartiennent également à la contrepartie et
            constituent leur historique et leur réputation.
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
              marginBottom: spacing.sm,
              paddingLeft: spacing.md,
            }}
          >
            · Le code postal d'une demande passée et l'adresse de livraison d'une commande passée.
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
              marginBottom: spacing.sm,
              paddingLeft: spacing.md,
            }}
          >
            · Les données de vérification d'entreprise pour les professionnels vérifiés (SIREN,
            SIRET, dénomination sociale, adresse de l'établissement, dirigeants).
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
              marginBottom: spacing.sm,
              paddingLeft: spacing.md,
            }}
          >
            · L&apos;enregistrement de votre vérification d&apos;identité. Nous demandons à Stripe de
            supprimer votre pièce d&apos;identité et la photo de votre visage, ce qui peut prendre
            jusqu&apos;à quatre jours. Stripe peut conserver une copie : pour en demander la
            suppression complète, contactez le support Stripe sur support.stripe.com.
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
              marginBottom: spacing.sm,
              paddingLeft: spacing.md,
            }}
          >
            · Si vous avez configuré vos virements, votre compte Stripe Connect n&apos;est pas supprimé.
            Pour en demander la suppression, contactez le support Stripe sur support.stripe.com.
          </Text>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
              lineHeight: type.body.size * 1.5,
            }}
          >
            Consultez la politique de confidentialité dans les paramètres pour la liste complète.
          </Text>
        </View>

        {/* CF5-01: Warning for staff/admin members deleting their account from the consumer app */}
        {isStaff && (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{
              backgroundColor: palette.amberSoft,
              borderColor: palette.amber,
              borderWidth: 1,
              borderRadius: radii.card,
              padding: spacing.lg,
              marginBottom: spacing.lg,
            }}
          >
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_600SemiBold',
                fontSize: type.body.size,
                color: palette.amberDeep,
                marginBottom: spacing.xs,
              }}
            >
              ⚠️ Compte membre de l&apos;équipe ({roleLabel})
            </Text>
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: type.body.size,
                color: palette.amberDeep,
                lineHeight: type.body.size * 1.5,
              }}
            >
              Ce compte dispose d&apos;accès d&apos;administration sur le dashboard REVIME. La suppression de ce compte supprimera également tous vos accès au dashboard d&apos;administration.
            </Text>
          </View>
        )}

        {/* Typed confirmation field: user must type exactly "SUPPRIMER" to enable the button. */}
        <View style={{ marginBottom: spacing.lg }}>
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_600SemiBold',
              fontSize: 12.5,
              color: palette.ink,
              marginBottom: spacing.xs,
            }}
          >
            Tapez « SUPPRIMER » pour confirmer
          </Text>
          <TextInput
            value={confirmation}
            onChangeText={(t) => {
              setConfirmation(t);
              setError(null);
            }}
            placeholder="SUPPRIMER"
            placeholderTextColor={palette.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            style={{
              paddingVertical: 15,
              paddingHorizontal: 14,
              borderWidth: 1.5,
              borderColor: error ? palette.red : palette.line,
              borderRadius: radii.field,
              backgroundColor: palette.mist,
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: type.body.size,
              color: palette.ink,
            }}
          />
        </View>

        {/* 🛑 Error rendering: the CONFLICT case (409, money in escrow) renders the server's
            own French message, which already says what to do. Any other failure gets a
            generic French fallback. */}
        {error && (
          <View
            style={{
              backgroundColor: palette.redSoft,
              borderRadius: radii.card,
              padding: spacing.lg,
              marginBottom: spacing.lg,
            }}
          >
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_400Regular',
                fontSize: type.body.size,
                color: palette.redDeep,
                lineHeight: type.body.size * 1.5,
              }}
            >
              {error}
            </Text>
          </View>
        )}

        {/* Destructive button using palette.red. Disabled until the exact confirmation is typed.
            🛑 This is a custom Pressable rather than the Button component because Button uses
            accent.accent and has no variant for destructive actions. The styling mirrors
            Button's primary variant but with palette.red. */}
        <Pressable
          accessibilityRole="button"
          disabled={!canDelete || deleting}
          onPress={onDelete}
          style={({ pressed }) => ({
            height: 52,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 20,
            borderRadius: radii.field,
            backgroundColor: !canDelete || deleting ? palette.faint : pressed ? palette.redDeep : palette.red,
            opacity: !canDelete || deleting ? 0.45 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          })}
        >
          {deleting ? (
            <ActivityIndicator color={palette.paper} />
          ) : (
            <Text
              style={{
                fontFamily: 'GoogleSansFlex_600SemiBold',
                fontSize: type.body.size,
                color: palette.paper,
              }}
            >
              Supprimer définitivement mon compte
            </Text>
          )}
        </Pressable>

        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: type.caption.size,
            color: palette.muted,
            textAlign: 'center',
            marginTop: spacing.lg,
          }}
        >
          Cette action est irréversible.
        </Text>
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
