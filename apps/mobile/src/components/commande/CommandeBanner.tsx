import { Text, View } from 'react-native';
import { euros, type CommandeDto } from '@revime/shared';
import { useTheme } from '../../theme';

type Props = {
  data: CommandeDto;
};

/**
 * REFUNDED / payment-review / escrow banner, unchanged from `commande/[id].tsx`
 * (extraction only - Task 5 commit 1). During a Stripe review, release is blocked
 * and the funds may be reversed, so the escrow promise would be false - the same
 * reasoning that makes REFUNDED replace it.
 *
 * The REVIME-dispute banner (spec §4.4 item 7) is a SEPARATE component
 * (`DisputeBanner`, Task 5 commit 2): `paymentUnderReview` is false while a REVIME
 * dispute is open, so this component's own conditions are unaffected by that case.
 *
 * V7 A7: the refund sentence names who got the money, and stops saying « intégralement » after a
 * partial refund. V7 A8: the device line follows the delivery mode, at the steps where the device
 * has left the client. Parcel keeps the transit sentence, for both parties as before. Workshop:
 * the client is told « Récupérez votre appareil à l'atelier » (the client's words, `DEC7-05`);
 * the repairer, who is holding the device, gets no line. Home: no line, the device never moved.
 */
const DEVICE_AWAY_STEPS: readonly string[] = ['PARCEL_SENT', 'PARCEL_RECEIVED', 'REPAIR_STARTED', 'REPAIR_DONE', 'RETURN_SENT'];

function refundSentence(isRepairer: boolean, partial: boolean): string {
  if (isRepairer) {
    return partial ? 'Le paiement a été remboursé partiellement au client.' : 'Le paiement a été remboursé au client.';
  }
  return partial ? 'Le paiement a été remboursé partiellement.' : 'Le paiement a été remboursé intégralement.';
}

function deviceLine(data: CommandeDto): string | null {
  if (!data.step || !DEVICE_AWAY_STEPS.includes(data.step)) return null;
  if (data.delivery === 'PARCEL') {
    return "Votre appareil est en cours d'acheminement. Notre équipe vous contacte pour organiser son retour.";
  }
  if (data.delivery === 'WORKSHOP' && data.viewerRole !== 'REPAIRER') {
    return "Récupérez votre appareil à l'atelier.";
  }
  return null;
}

export function CommandeBanner({ data }: Props) {
  const { palette, spacing } = useTheme();

  if (data.status === 'REFUNDED') {
    const device = deviceLine(data);
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
          Commande annulée
        </Text>
        <Text
          style={{
            fontFamily: 'GoogleSansFlex_400Regular',
            fontSize: 12,
            lineHeight: 18,
            color: palette.muted,
          }}
        >
          {refundSentence(data.viewerRole === 'REPAIRER', data.partialRefund ?? false)}
        </Text>
        {device !== null && (
          <Text
            style={{
              fontFamily: 'GoogleSansFlex_400Regular',
              fontSize: 12,
              lineHeight: 18,
              color: palette.muted,
              marginTop: 6,
            }}
          >
            {device}
          </Text>
        )}
      </View>
    );
  }

  if (data.paymentUnderReview) {
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
            fontFamily: 'GoogleSansFlex_500Medium',
            fontSize: 13,
            color: palette.muted,
            textAlign: 'center',
          }}
        >
          Paiement en cours de vérification.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: palette.greenSoft,
        borderWidth: 1,
        borderColor: '#cfe9d6',
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        gap: 10,
        marginBottom: spacing.md,
      }}
    >
      <Text
        style={{
          fontFamily: 'GoogleSansFlex_400Regular',
          fontSize: 12,
          lineHeight: 18,
          color: '#3a5a44',
          flex: 1,
        }}
      >
        {data.viewerRole === 'CLIENT'
          ? `Vos ${euros(data.totalCents)} sont sécurisés par Revime. Le montant de la réparation, ${euros(data.payoutCents)}, est versé au réparateur après votre validation.`
          : `${euros(data.payoutCents)} en séquestre, débloqués après validation du client.`}
      </Text>
    </View>
  );
}
