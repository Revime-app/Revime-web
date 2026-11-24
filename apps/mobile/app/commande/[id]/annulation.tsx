import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CANCELLATION_REASON_LABEL,
  createCancellationRequestSchema,
  type CancellationReason,
} from '@revime/shared';
import { useTheme } from '../../../src/theme';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { Chip } from '../../../src/components/Chip';
import { Field } from '../../../src/components/Field';
import { Button } from '../../../src/components/Button';
import { useRequestCancellation } from '../../../src/lib/queries';
import { ApiError } from '../../../src/lib/api';
import { KeyboardAvoider } from '../../../src/components/KeyboardAvoider';

const REASON_ORDER: CancellationReason[] = [
  'NO_LONGER_NEEDED',
  'TOO_SLOW',
  'REPAIRER_UNRESPONSIVE',
  'OTHER_SOLUTION',
  'OTHER',
];

/**
 * CF4-27 (spec §4.6). The post-payment cancellation request form: reason chips, an optional
 * comment (required for « Autre »), « REVIME examinera votre demande. Aucun remboursement
 * n'est automatique : le montant dépend de l'état de la réparation. », « Envoyer la demande ».
 *
 * Validated with `createCancellationRequestSchema` before the request leaves the device -
 * same reasoning as every other form in this app - and `ApiError.fields` is mapped back onto
 * the comment field on a server-side rejection (a race with another guard, or a stale
 * client validation).
 */
export default function DemanderAnnulation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const commandeId = id ?? '';
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const request = useRequestCancellation(commandeId);

  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [comment, setComment] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!reason) {
      setFieldErrors({ reason: 'Choisissez une raison.' });
      return;
    }
    const parsed = createCancellationRequestSchema.safeParse({
      reason,
      comment: comment.trim().length > 0 ? comment.trim() : undefined,
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string') errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    request.mutate(parsed.data, {
      onSuccess: () => router.back(),
      onError: (error) => {
        if (error instanceof ApiError && error.fields) {
          setFieldErrors(error.fields);
          return;
        }
        setFormError(error instanceof ApiError ? error.message : 'Une erreur est survenue. Réessayez.');
      },
    });
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={['top']}>
      <ScreenHeader title="Demander l'annulation" onBack={() => router.back()} />
      <KeyboardAvoider>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_600SemiBold',
            fontSize: 14,
            color: palette.ink,
            marginBottom: spacing.sm,
          }}
        >
          Pourquoi souhaitez-vous annuler ?
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
          {REASON_ORDER.map((r) => (
            <Chip
              key={r}
              label={CANCELLATION_REASON_LABEL[r]}
              active={reason === r}
              onPress={() => {
                setReason(r);
                setFieldErrors({});
              }}
            />
          ))}
        </View>
        {fieldErrors.reason && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_500Medium',
              fontSize: 12.5,
              color: palette.red,
              marginBottom: spacing.md,
            }}
          >
            {fieldErrors.reason}
          </Text>
        )}

        <Field
          label={reason === 'OTHER' ? 'Précisez la raison' : 'Commentaire (optionnel)'}
          value={comment}
          onChangeText={setComment}
          multiline
          minHeight={80}
          maxLength={500}
          error={fieldErrors.comment}
        />

        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 12.5,
            lineHeight: 18,
            color: palette.muted,
            marginTop: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          REVIME examinera votre demande. Aucun remboursement n'est automatique : le montant
          dépend de l'état de la réparation.
        </Text>

        {formError && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_500Medium',
              fontSize: 13,
              color: palette.red,
              marginBottom: spacing.md,
            }}
          >
            {formError}
          </Text>
        )}

        <Button
          label="Envoyer la demande"
          onPress={handleSubmit}
          disabled={request.isPending}
          loading={request.isPending}
        />
      </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
