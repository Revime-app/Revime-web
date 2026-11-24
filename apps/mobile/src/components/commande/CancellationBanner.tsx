import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CANCELLATION_REASON_LABEL, type CancellationRequestInfo, type CommandeRole } from '@revime/shared';
import { useTheme } from '../../theme';
import { Button } from '../Button';
import { useWithdrawCancellation } from '../../lib/queries';
import { ApiError } from '../../lib/api';

type Props = {
  commandeId: string;
  data: { cancellationRequest: CancellationRequestInfo | null };
  role: CommandeRole;
};

/**
 * CF4-27 (spec §4.6). Shown instead of `DisputeBanner` / `CommandeBanner` while the latest
 * cancellation request is PENDING or REFUSED (Task 8's `[id]/index.tsx` decides which banner
 * to render; this component only renders the two states it owns).
 *
 * Client, PENDING: « Annulation demandée. REVIME examine votre demande. » + « Retirer ma
 * demande ». Réparateur, PENDING: the reason label, no withdraw button (I7 is client-only).
 * REFUSED (either role, spec §4.6's "while the step has not moved since" is satisfied by
 * construction - the freeze guard blocks every hand-advanced step while PENDING, so the step
 * cannot have moved between the refusal and this render): REVIME's note verbatim.
 */
export function CancellationBanner({ commandeId, data, role }: Props) {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const withdraw = useWithdrawCancellation(commandeId);

  const request = data.cancellationRequest;
  if (!request) return null;

  if (request.status === 'REFUSED') {
    return (
      <View
        style={{
          backgroundColor: palette.line,
          borderWidth: 1,
          borderColor: '#d0d5dd',
          borderRadius: 14,
          padding: 14,
          marginBottom: spacing.md,
        }}
      >
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_600SemiBold',
            fontSize: 14,
            color: palette.ink,
            marginBottom: 6,
          }}
        >
          Annulation refusée
        </Text>
        {request.refusalNote && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 12,
              lineHeight: 18,
              color: palette.muted,
            }}
          >
            {request.refusalNote}
          </Text>
        )}
      </View>
    );
  }

  // PENDING from here.
  const confirmWithdraw = () => {
    Alert.alert(
      'Retirer votre demande ?',
      "Vous pourrez à nouveau demander l'annulation par la suite.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () =>
            withdraw.mutate(undefined, {
              onError: () =>
                Alert.alert('Impossible de retirer la demande', 'Merci de réessayer.'),
            }),
        },
      ],
    );
  };

  return (
    <View
      style={{
        backgroundColor: palette.redSoft,
        borderWidth: 1,
        borderColor: palette.red,
        borderRadius: 14,
        padding: 14,
        marginBottom: spacing.md,
      }}
    >
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_600SemiBold',
          fontSize: 13,
          color: palette.redDeep,
          marginBottom: 4,
        }}
      >
        Annulation demandée
      </Text>
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_400Regular',
          fontSize: 12.5,
          lineHeight: 18,
          color: palette.redDeep,
        }}
      >
        {role === 'CLIENT'
          ? 'REVIME examine votre demande.'
          : `Le client a demandé l'annulation : ${CANCELLATION_REASON_LABEL[request.reason]}. REVIME examine la demande ; les étapes sont suspendues.`}
      </Text>
      {role === 'CLIENT' && (
        <View style={{ marginTop: spacing.md }}>
          <Button
            label="Retirer ma demande"
            onPress={confirmWithdraw}
            variant="secondary"
            disabled={withdraw.isPending}
            loading={withdraw.isPending}
          />
        </View>
      )}
      {withdraw.error && (
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 12.5,
            color: palette.red,
            marginTop: spacing.sm,
          }}
        >
          {withdraw.error instanceof ApiError
            ? withdraw.error.message
            : 'Une erreur est survenue. Réessayez.'}
        </Text>
      )}
    </View>
  );
}
