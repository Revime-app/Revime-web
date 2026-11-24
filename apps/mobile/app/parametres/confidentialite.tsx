import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../src/components/Button';
import { LegalDocumentScreen } from '../../src/components/LegalDocumentScreen';
import { PRIVACY_POLICY } from '../../src/lib/privacy-policy';
import { ApiError } from '../../src/lib/api';
import { useIdentityStatus, useRequestIdentityErasure } from '../../src/lib/queries';
import { useTheme } from '../../src/theme';

/**
 * `CF-47` task 13. The French privacy policy screen.
 *
 * Renders the structured policy from `privacy-policy.ts` (now using the official
 * text of 10 October 2026) via `LegalDocumentScreen`, plus the
 * in-app Stripe Identity erasure control as a footer.
 */
export default function ConfidentialiteScreen() {
  const { palette, spacing } = useTheme();
  const erasure = useRequestIdentityErasure();
  const [erasureError, setErasureError] = useState<string | null>(null);

  const identityStatus = useIdentityStatus(true);
  const erasureFacts = erasure.data ?? identityStatus.data ?? null;
  const erasureRequestedAt = erasureFacts?.erasureRequestedAt ?? null;
  const redactionStatus = erasureFacts?.redactionStatus ?? null;

  const erasureMessage =
    erasureRequestedAt !== null
      ? redactionStatus === 'REDACTED'
        ? 'Votre demande a été enregistrée. La suppression de vos données chez Stripe est terminée.'
        : redactionStatus !== null
          ? 'Votre demande a été enregistrée. La suppression chez Stripe est en cours.'
          : "Votre demande a été enregistrée. Nous n'avons pu supprimer aucun document chez Stripe : seul le support Stripe peut encore le faire."
      : erasure.isSuccess
        ? "Votre demande a été enregistrée. Nous ne détenons aucune vérification d'identité pour votre compte."
        : null;

  const onConfirmErasure = () => {
    Alert.alert(
      'Supprimer mes données d\'identité',
      'Nous demanderons à Stripe de supprimer votre pièce d\'identité et la photo de votre visage. Votre compte et votre niveau de vérification ne changent pas.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            setErasureError(null);
            erasure
              .mutateAsync()
              .catch((e: unknown) => {
                setErasureError(
                  e instanceof ApiError
                    ? e.message
                    : "Votre demande n'a pas pu être envoyée. Réessayez.",
                );
              });
          },
        },
      ],
    );
  };

  const footer = (
    <>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_400Regular',
          fontSize: 15,
          lineHeight: 22,
          color: palette.ink,
          marginBottom: spacing.md,
        }}
      >
        Nous ne conservons jamais votre pièce d&apos;identité : elle est traitée par Stripe. Nous
        demandons à Stripe de supprimer vos documents et la photo de votre visage. Cette
        opération peut prendre jusqu&apos;à quatre jours. Stripe peut toutefois conserver une copie
        de ces données : pour en demander la suppression complète, vous devez contacter le
        support Stripe sur support.stripe.com.
      </Text>
      {erasureMessage !== null && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_600SemiBold',
            fontSize: 13.5,
            lineHeight: 19.5,
            color: palette.greenDeep,
            marginBottom: spacing.md,
          }}
        >
          {erasureMessage}
        </Text>
      )}
      {erasureError !== null && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 13.5,
            lineHeight: 19.5,
            color: palette.redDeep,
            marginBottom: spacing.md,
          }}
        >
          {erasureError}
        </Text>
      )}
      <Button
        label="Supprimer mes données d'identité"
        variant="secondary"
        onPress={onConfirmErasure}
        loading={erasure.isPending}
      />
    </>
  );

  return (
    <LegalDocumentScreen
      document={PRIVACY_POLICY}
      headerTitle="Confidentialité"
      onBack={() => router.back()}
      footer={footer}
    />
  );
}
